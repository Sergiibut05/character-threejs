/**
 * ClonedFromJSON — places a MULTI-PART prop by cloning the whole GLB scene per
 * instance, instead of instancing each mesh separately (InstancedFromJSON).
 *
 * Use this when either is true:
 *
 *  1. The prop is several meshes that must keep their RELATIVE placement and
 *     size (palm tree = trunk + coconuts + fronds). InstancedFromJSON builds one
 *     InstancedMesh per mesh from raw geometry, dropping each node's own
 *     translation/scale — the parts then render detached and mis-sized.
 *
 *  2. The GLB uses KHR_mesh_quantization (POSITION stored as normalized int16).
 *     Then the node scales ARE the dequantization factors, and baking a matrix
 *     into the geometry is destructive: transformed floats get written back into
 *     the int16 array, so e.g. 1.615 rounds to 2 and reads back as 2/32767 ≈ 0.
 *     Cloning never touches vertex data, so quantized meshes stay intact.
 *
 * Cost: one draw call per mesh per instance. Fine for a handful of instances
 * (geometry and materials are shared between clones); prefer InstancedFromJSON
 * for anything numerous.
 *
 * Placement: the GLB is usually exported with ONE of the instances' world
 * transforms already baked into its nodes. Applying the JSON transform on top
 * would double it, so we detect which instance the model was exported at and
 * place every clone at `M_i · M_ref⁻¹`. The reference instance then lands
 * exactly where Blender had it, and the rest keep their relative offsets.
 */
import * as THREE from 'three'
import Experience from '../../Experience.js'
import { blenderTransformToMatrix } from './SceneUtils.js'
import { createStylizedPropNodeMaterial } from './StylizedPropMaterial.js'

export default class ClonedFromJSON {
    /**
     * @param {string} name
     * @param {object} gltf       Loaded GLB ({ scene }).
     * @param {object} instances  Parsed references JSON ({ instances:[…] }).
     * @param {object} [options]
     * @param {string} [options.rotationMode]  Blender→Three rotation mode.
     * @param {number} [options.yOffset]  Lift every clone by this much, on top
     *   of the JSON placement. For sinking the base into the ground (or out of
     *   it) without editing authored data that a re-export would overwrite.
     * @param {boolean} [options.castShadow]
     * @param {boolean} [options.receiveShadow]
     */
    constructor(name, gltf, instances, options = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene

        this.name = name
        this.roots = []

        const data = instances?.instances || []
        if (!gltf?.scene) { console.warn(`${name}: missing gltf.scene`); return }
        if (!data.length) { console.warn(`${name}: no instances in JSON`); return }

        const {
            rotationMode = undefined,
            yOffset = 0,
            castShadow = true,
            receiveShadow = true
        } = options
        this.yOffset = yOffset

        const source = gltf.scene
        source.updateMatrixWorld(true)

        // Re-material ONCE on the source; clones share these materials.
        source.traverse((child) => {
            if (!child.isMesh) return
            const old = child.material
            // glTF alphaMode MASK (fronds) → GLTFLoader sets alphaTest. Carry it
            // over as a CUTOUT, never as blending: a blended leaf writes no
            // depth, so leaves behind it show straight through. Solid parts
            // (trunk, coconuts) stay fully opaque.
            child.material = createStylizedPropNodeMaterial({
                map: old?.map || null,
                alphaCutoff: old?.alphaTest ?? 0
            })
            old?.dispose?.()
            child.castShadow = castShadow
            child.receiveShadow = receiveShadow
        })

        const matrices = data.map((inst) => {
            const m = new THREE.Matrix4()
            blenderTransformToMatrix(inst.position, inst.rotation, inst.scale, m, rotationMode)
            return m
        })

        // Cancel the placement the GLB was exported WITH, then apply the JSON's.
        //
        // Position and scale come from whichever instance the model was
        // exported at: the node scales are entangled with the dequantisation
        // factors, and the object origin isn't recoverable from the mesh, so
        // neither can be read back out of the GLB. The ROTATION can be, and is
        // taken from the model instead — that's the one the JSON is allowed to
        // disagree about, because editing a rotation there doesn't move the
        // tree, so the reference lookup below still resolves the same way.
        const invBaked = this._bakedTransform(source, matrices).invert()

        for (let i = 0; i < data.length; i++) {
            const root = source.clone(true)
            root.name = `${name}:${i}`
            // Uniform scales ⇒ no shear, so this decompose is lossless.
            matrices[i].clone().multiply(invBaked)
                .decompose(root.position, root.quaternion, root.scale)
            // Applied after the decompose so it's a plain world lift, never
            // spun by the instance's own rotation.
            root.userData.baseY = root.position.y
            root.position.y += yOffset
            this.roots.push(root)
            this.scene.add(root)
        }

        console.log(`✅ ${name}: ${data.length} clones`)
    }

    /** Lift (or sink) every clone relative to its JSON placement. */
    setYOffset(y) {
        this.yOffset = y
        for (const root of this.roots) root.position.y = root.userData.baseY + y
    }

    /**
     * The placement the GLB was exported at: the reference instance's position
     * and scale, but the model's OWN orientation (see the call site).
     */
    _bakedTransform(source, matrices) {
        source.updateMatrixWorld(true)

        // Which instance was it exported at? Compare the assembled bounding-box
        // centre against each instance position in XZ only — Y differs because
        // the centre sits mid-trunk, not at the object origin.
        const centre = new THREE.Box3().setFromObject(source).getCenter(new THREE.Vector3())
        let ref = matrices[0]
        let best = Infinity
        const p = new THREE.Vector3()
        for (const m of matrices) {
            p.setFromMatrixPosition(m)
            const d = Math.hypot(p.x - centre.x, p.z - centre.z)
            if (d < best) { best = d; ref = m }
        }

        const pos = new THREE.Vector3()
        const scale = new THREE.Vector3()
        ref.decompose(pos, new THREE.Quaternion(), scale)

        // The parts share one orientation; any mesh reports it.
        const quat = new THREE.Quaternion()
        let found = false
        source.traverse((c) => {
            if (found || !c.isMesh) return
            c.getWorldQuaternion(quat)
            found = true
        })

        return new THREE.Matrix4().compose(pos, quat, scale)
    }

    dispose() {
        for (const root of this.roots) {
            this.scene.remove(root)
        }
        this.roots = []
    }
}
