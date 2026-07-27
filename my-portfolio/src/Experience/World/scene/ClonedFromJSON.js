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
     * @param {boolean} [options.castShadow]
     * @param {boolean} [options.receiveShadow]
     */
    constructor(name, gltf, instances, options = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.isLow = this.experience.quality.isLow

        this.name = name
        this.roots = []

        const data = instances?.instances || []
        if (!gltf?.scene) { console.warn(`${name}: missing gltf.scene`); return }
        if (!data.length) { console.warn(`${name}: no instances in JSON`); return }

        const {
            rotationMode = undefined,
            castShadow = !this.isLow,
            receiveShadow = !this.isLow
        } = options

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

        // Which instance is the model itself already placed at? Compare the
        // assembled bounding-box centre against each instance position (XZ; Y
        // differs because the centre sits mid-trunk, not at the origin).
        const centre = new THREE.Box3().setFromObject(source).getCenter(new THREE.Vector3())
        let refIndex = 0
        let bestDist = Infinity
        const _p = new THREE.Vector3()
        matrices.forEach((m, i) => {
            _p.setFromMatrixPosition(m)
            const d = Math.hypot(_p.x - centre.x, _p.z - centre.z)
            if (d < bestDist) { bestDist = d; refIndex = i }
        })
        const invRef = matrices[refIndex].clone().invert()

        for (let i = 0; i < data.length; i++) {
            const root = source.clone(true)
            root.name = `${name}:${i}`
            // Relative placement; exact (uniform scales ⇒ no shear, so the
            // decompose below is lossless).
            matrices[i].clone().multiply(invRef)
                .decompose(root.position, root.quaternion, root.scale)
            this.roots.push(root)
            this.scene.add(root)
        }

        console.log(`✅ ${name}: ${data.length} clones (ref instance #${refIndex})`)
    }

    dispose() {
        for (const root of this.roots) {
            this.scene.remove(root)
        }
        this.roots = []
    }
}
