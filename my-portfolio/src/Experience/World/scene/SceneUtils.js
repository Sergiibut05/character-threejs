/**
 * SceneUtils — utilities shared by all patio sub-scenes.
 *
 * Coordinate conventions:
 *   - GLB files exported from Blender are already Y-up (the glTF exporter
 *     applies the +Y up transform automatically and bakes geometry).
 *   - The instance JSON files (coblestone_instances.json, fence_instances.json)
 *     are produced by a Python script reading `obj.matrix_world` /
 *     `obj.rotation_euler` directly from the .blend file, so positions are
 *     **Z-up** (visible in the data: |y| up to 24, z near 0.2).
 *
 * Position is converted unambiguously:  pos_three = (bx, bz, -by)
 *
 * Rotation is more subtle because the Python script may have been written in
 * different ways. We expose a few `rotationMode`s so the user can pick what
 * matches their export:
 *
 *   - 'conjugate':    q_three = Q_a · q_blender · Q_a⁻¹
 *                     Mathematically correct change-of-basis. Only correct
 *                     if the GLB geometry is authored "standing up" along +Y.
 *                     Reads the Blender Euler in three's 'ZYX' order — see the
 *                     note in rotationToQuaternion. The empirical modes below
 *                     keep 'XYZ' because the assets using them were eyeballed
 *                     against that behaviour.
 *   - 'swapYZ':       Euler [rx, ry, rz] → THREE.Euler(rx, rz, -ry, 'XYZ').
 *                     Treats Blender's heading (Z) as Three's heading (Y).
 *   - 'raw':          Use raw [rx, ry, rz] as Three.js XYZ Euler.
 *   - 'rawNegZ':      Euler [rx, ry, -rz] (default).
 *                     Works when the model in Blender was authored with its
 *                     "main forward" along Blender +Y (so after GLB Y-up
 *                     conversion it points along Three -Z). The X=π/2
 *                     baseline stands the model upright; negating the Z
 *                     yields the right horizontal heading.
 *   - 'preStandX':    Same as 'conjugate' but FIRST removes the constant
 *                     X=π/2 baseline that some exports bake in.
 *
 * Active mode can be changed at runtime via `setBlenderRotationMode(name)`
 * (typically wired to a debug GUI).
 */
import * as THREE from 'three'
import { createStylizedPropNodeMaterial } from './StylizedPropMaterial.js'

const _q = new THREE.Quaternion()
const _euler = new THREE.Euler()
const _vPos = new THREE.Vector3()
const _vScale = new THREE.Vector3()

// Quaternion that converts Blender Z-up world basis into Three.js Y-up.
const Q_BLENDER_TO_THREE = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
const Q_BLENDER_TO_THREE_INV = Q_BLENDER_TO_THREE.clone().invert()
const Q_PRE_STAND_X_INV = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)   // removes +π/2 X

const ROTATION_MODES = ['conjugate', 'swapYZ', 'raw', 'rawNegZ', 'preStandX']
let blenderRotationMode = 'rawNegZ'

export function setBlenderRotationMode(mode) {
    if (ROTATION_MODES.includes(mode)) {
        blenderRotationMode = mode
    } else {
        console.warn(`SceneUtils: unknown rotation mode "${mode}"`)
    }
}

export function getBlenderRotationModes() {
    return ROTATION_MODES.slice()
}

export function getBlenderRotationMode() {
    return blenderRotationMode
}

function rotationToQuaternion(rx, ry, rz, mode, out = _q) {
    if (mode === 'raw') {
        _euler.set(rx, ry, rz, 'XYZ')
        out.setFromEuler(_euler)
        return out
    }
    if (mode === 'rawNegZ') {
        _euler.set(rx, ry, -rz, 'XYZ')
        out.setFromEuler(_euler)
        return out
    }
    if (mode === 'swapYZ') {
        // Treat [rx, ry, rz] as Blender Z-up Euler and remap to Three Y-up
        // by swapping (and negating) Euler components instead of conjugating.
        _euler.set(rx, rz, -ry, 'XYZ')
        out.setFromEuler(_euler)
        return out
    }
    // 'conjugate' (default) and 'preStandX'
    //
    // 'ZYX', not 'XYZ': Blender's "XYZ Euler" composes as Rz·Ry·Rx, and a
    // three.js order string reads left-to-right as the matrix product, so
    // Blender XYZ *is* three ZYX. Getting this backwards leaves the yaw right
    // and swings the tilt axis around by the yaw angle — invisible on the props
    // that only spin about Z, obvious on anything both tilted and turned.
    // Verified against palm-tree_compressed.glb's baked rotation: 0.000° error
    // with 'ZYX', 7.9° with 'XYZ'.
    _euler.set(rx, ry, rz, 'ZYX')
    out.setFromEuler(_euler)
    if (mode === 'preStandX') out.multiply(Q_PRE_STAND_X_INV)
    out.premultiply(Q_BLENDER_TO_THREE)
    out.multiply(Q_BLENDER_TO_THREE_INV)
    return out
}

/**
 * Convert a Blender-space transform (position/Euler/scale) into a Three.js
 * Matrix4 expressed in Three.js Y-up world.
 *
 * `mode` overrides the global rotation mode for this call only.
 */
export function blenderTransformToMatrix(position, eulerXYZ, scale, target = new THREE.Matrix4(), mode) {
    const [bx, by, bz] = position
    const [rx, ry, rz] = eulerXYZ
    const [sx, sy, sz] = scale

    rotationToQuaternion(rx, ry, rz, mode || blenderRotationMode, _q)

    target.compose(
        _vPos.set(bx, bz, -by),
        _q,
        _vScale.set(sx, sz, sy)
    )
    return target
}

/**
 * Convert a references JSON ({ instances: [{ position, rotation, scale }] }) into
 * an array of lightweight THREE.Object3D whose transform is the Blender→Three
 * converted placement. Used by reference-driven consumers (Trees, FakeShadow)
 * that expect Object3D nodes rather than raw matrices.
 *
 * Keeps `matrixAutoUpdate` on and writes position/quaternion/scale so any later
 * `updateWorldMatrix()` reproduces the exact same matrix.
 */
export function jsonInstancesToObjects(json, rotationMode) {
    const list = json?.instances || []
    const out = []
    const m = new THREE.Matrix4()
    for (const inst of list) {
        blenderTransformToMatrix(inst.position, inst.rotation, inst.scale, m, rotationMode)
        const obj = new THREE.Object3D()
        m.decompose(obj.position, obj.quaternion, obj.scale)
        obj.updateMatrix()
        obj.updateMatrixWorld(true)
        out.push(obj)
    }
    return out
}

/**
 * Replace the material of every mesh inside a scene/group with a shared
 * MeshLambertNodeMaterial (core shadow + shadow map) that reuses the provided map.
 */
export function applyAtlasMaterial(root, map, options = {}) {
    const {
        flatShading = false,
        castShadow = true,
        receiveShadow = true
    } = options

    const material = createStylizedPropNodeMaterial({
        map: map || null,
        color: 0xffffff,
        flatShading
    })

    root.traverse((child) => {
        if (!child.isMesh) return
        // Free old GLB material (we keep the geometry).
        const old = child.material
        if (Array.isArray(old)) old.forEach((m) => m?.dispose?.())
        else old?.dispose?.()

        child.material = material
        child.castShadow = castShadow
        child.receiveShadow = receiveShadow
    })

    return material
}

/**
 * De-quantize a single NORMALIZED integer BufferAttribute into a plain Float32
 * attribute (denormalized values, e.g. -1..1 or 0..1). Returns the new
 * attribute, or the original when it is already a non-normalized float.
 */
function dequantizeAttribute(attr) {
    if (!attr || !attr.normalized) return attr
    const { count, itemSize } = attr
    const out = new Float32Array(count * itemSize)
    // getX..getW denormalize internally when the attribute is normalized.
    const getters = [attr.getX, attr.getY, attr.getZ, attr.getW]
    for (let i = 0; i < count; i++) {
        for (let c = 0; c < itemSize; c++) {
            out[i * itemSize + c] = getters[c].call(attr, i)
        }
    }
    return new THREE.BufferAttribute(out, itemSize)
}

/**
 * De-quantize every NORMALIZED integer attribute of a geometry (position,
 * normal, uv, …) into plain Float32 attributes.
 *
 * GLBs exported with KHR_mesh_quantization store vertex data as NORMALIZED
 * integers (e.g. SHORT positions in ±32767, Uint16 UVs in 0..65535). The legacy
 * WebGL pipeline denormalizes those on the GPU automatically, but this project's
 * WebGPU/TSL path reads the raw integer values: UVs sample a single texel
 * (texture looks invisible), and — worse — POSITIONs land at ±32767×scale, so
 * the mesh is rendered astronomically large while its (correctly denormalized)
 * bounding sphere stays small, getting it frustum-culled → nothing shows.
 *
 * Converting once on the CPU makes the geometry behave like any non-quantized
 * model. No-op for attributes that are already non-normalized floats.
 */
export function dequantizeGeometry(geometry) {
    if (!geometry?.attributes) return
    for (const name of Object.keys(geometry.attributes)) {
        const attr = geometry.attributes[name]
        if (attr.normalized) geometry.setAttribute(name, dequantizeAttribute(attr))
    }
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
}

/**
 * Back-compat alias: de-quantize only the UV attribute.
 * @deprecated use {@link dequantizeGeometry}
 */
export function dequantizeUV(geometry) {
    const uv = geometry?.attributes?.uv
    if (uv?.normalized) geometry.setAttribute('uv', dequantizeAttribute(uv))
}

/**
 * Walk a glTF scene and return arrays of mesh names matching the given prefix.
 */
export function findMeshesByPrefix(root, prefix) {
    const out = []
    root.traverse((c) => { if (c.isMesh && c.name.startsWith(prefix)) out.push(c) })
    return out
}

/**
 * Find a single mesh by name (or first mesh that matches a predicate).
 */
export function findMesh(root, predicate) {
    let found = null
    root.traverse((c) => {
        if (found) return
        if (c.isMesh && predicate(c)) found = c
    })
    return found
}
