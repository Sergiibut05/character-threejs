/**
 * InstancedFromJSON — shared base for every prop placed from a Blender export
 * JSON ("*-references.json" / "*_instances.json").
 *
 * All those JSONs come from the SAME export script and share one structure:
 *
 *     { "count": N, "instances": [ { "position":[x,y,z],
 *                                    "rotation":[x,y,z],   // Blender Z-up Euler
 *                                    "scale":[x,y,z] }, … ] }
 *
 * Transforms are in Blender **Z-up** space, so every instance is run through
 * `blenderTransformToMatrix()` (position → (bx, bz, -by), scale → (sx, sz, sy),
 * rotation → see SceneUtils rotation modes). This is exactly the path the Fence
 * has always used — the one prop that already placed correctly — so all props
 * now share that proven conversion.
 *
 * `inheritTemplateRotation` covers a quirk of the export: some objects were
 * authored in Blender's quaternion rotation-mode, so the script read their
 * `rotation_euler` as [0,0,0] even though the object IS rotated. The real
 * orientation survives only in the GLB node, so when this flag is on we bake
 * the template node's world quaternion onto every instance (composed with the
 * JSON rotation, which is identity in that case). Harmless for templates whose
 * node rotation is already identity.
 */
import * as THREE from 'three'
import Experience from '../../Experience.js'
import { blenderTransformToMatrix, findMesh } from './SceneUtils.js'
import { createStylizedPropNodeMaterial } from './StylizedPropMaterial.js'

const _matrix = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _identityQuat = new THREE.Quaternion()

export default class InstancedFromJSON {
    /**
     * @param {string} name              Debug/label name.
     * @param {object} gltf              Loaded GLB ({ scene }).
     * @param {object} instances         Parsed references JSON ({ instances:[…] }).
     * @param {object} [options]
     * @param {(mesh:THREE.Mesh)=>boolean} [options.meshFilter] Which meshes become templates.
     * @param {boolean} [options.singleMesh=false]   Use only the first matching mesh.
     * @param {(mesh:THREE.Mesh)=>THREE.Material} [options.materialFactory] Custom material per template.
     * @param {THREE.Texture|null} [options.map=null]  Atlas/base map for the default material.
     * @param {number|THREE.Color} [options.color=0xffffff] Tint for the default material.
     * @param {boolean} [options.castShadow]
     * @param {boolean} [options.receiveShadow]
     * @param {boolean} [options.dynamic=false]       DynamicDrawUsage (props re-placed at runtime via GUI).
     * @param {string}  [options.rotationMode]        Override the global Blender→Three rotation mode for this prop.
     * @param {boolean} [options.inheritTemplateRotation=false] Bake template node orientation (see header).
     */
    constructor(name, gltf, instances, options = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene

        this.name = name
        this.instancesData = instances?.instances || []
        this.meshes = []
        this._tplQuats = []   // parallel to this.meshes; null when identity

        if (!gltf?.scene) {
            console.warn(`${name}: missing gltf.scene`)
            return
        }
        if (this.instancesData.length === 0) {
            console.warn(`${name}: no instances in JSON`)
            return
        }

        const {
            meshFilter = null,
            singleMesh = false,
            materialFactory = null,
            map = null,
            color = 0xffffff,
            castShadow = true,
            receiveShadow = true,
            dynamic = false,
            rotationMode = undefined,
            inheritTemplateRotation = false
        } = options

        // Per-instance Blender→Three rotation mode for this prop. When set it
        // overrides the global default (used e.g. by InstancedProp which needs
        // the true change-of-basis 'conjugate', while the fence relies on the
        // global 'rawNegZ' baseline). `undefined` ⇒ follow the global mode.
        this.rotationMode = rotationMode

        const templates = this._collectTemplates(gltf.scene, meshFilter, singleMesh)
        if (templates.length === 0) {
            console.warn(`${name}: no template mesh found in glb`)
            return
        }

        const count = this.instancesData.length
        const usage = dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage

        for (const tpl of templates) {
            // Capture the template's world orientation BEFORE we replace its
            // material (the node transform is unaffected by material disposal).
            let tplQuat = null
            if (inheritTemplateRotation) {
                tpl.updateWorldMatrix(true, false)
                const q = tpl.getWorldQuaternion(new THREE.Quaternion())
                if (1 - Math.abs(q.dot(_identityQuat)) > 1e-6) tplQuat = q
            }

            const material = materialFactory
                ? materialFactory(tpl)
                : createStylizedPropNodeMaterial({ map: map || null, color })
            tpl.material?.dispose?.()

            const instanced = new THREE.InstancedMesh(tpl.geometry, material, count)
            instanced.instanceMatrix.setUsage(usage)
            instanced.castShadow = castShadow
            instanced.receiveShadow = receiveShadow
            instanced.name = `${name}:${tpl.name}`

            this.meshes.push(instanced)
            this._tplQuats.push(tplQuat)
            this.scene.add(instanced)
        }

        this.rebuildMatrices()
        console.log(`✅ ${name}: ${count} instances × ${this.meshes.length} mesh(es)`)
    }

    _collectTemplates(root, meshFilter, singleMesh) {
        if (singleMesh) {
            const m = (meshFilter && findMesh(root, meshFilter)) || findMesh(root, () => true)
            return m ? [m] : []
        }
        const out = []
        root.traverse((c) => {
            if (c.isMesh && (!meshFilter || meshFilter(c))) out.push(c)
        })
        return out
    }

    /** Re-place every instance. `rotationMode` overrides the per-prop / global Blender→Three mode. */
    rebuildMatrices(rotationMode) {
        const mode = rotationMode ?? this.rotationMode
        for (let mi = 0; mi < this.meshes.length; mi++) {
            const instanced = this.meshes[mi]
            const tplQuat = this._tplQuats[mi]

            for (let i = 0; i < this.instancesData.length; i++) {
                const inst = this.instancesData[i]
                blenderTransformToMatrix(inst.position, inst.rotation, inst.scale, _matrix, mode)

                if (tplQuat) {
                    _matrix.decompose(_p, _q, _s)
                    _q.premultiply(tplQuat)
                    _matrix.compose(_p, _q, _s)
                }

                instanced.setMatrixAt(i, _matrix)
            }
            instanced.instanceMatrix.needsUpdate = true
            instanced.computeBoundingSphere?.()
        }
    }

    dispose() {
        for (const m of this.meshes) {
            this.scene.remove(m)
            m.geometry?.dispose?.()
            m.material?.dispose?.()
        }
        this.meshes = []
        this._tplQuats = []
    }
}
