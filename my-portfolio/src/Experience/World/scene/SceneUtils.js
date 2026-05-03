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
    _euler.set(rx, ry, rz, 'XYZ')
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
 * Replace the material of every mesh inside a scene/group with a
 * MeshLambertMaterial that reuses the provided map. Convenient for atlas-based
 * decorative pieces where lighting comes from ambient + directional only.
 */
export function applyAtlasMaterial(root, map, options = {}) {
    const {
        flatShading = false,
        castShadow = true,
        receiveShadow = true
    } = options

    const material = new THREE.MeshLambertMaterial({
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
