/**
 * Fence — InstancedMesh of `fence_open_wide_long` placed via
 * `fence_instances.json`. Uses the shared Sushi atlas as base map.
 *
 * The source GLB ships hundreds of redundant duplicates from the Blender pack;
 * we only consume the first `fence_open_wide_long*` mesh as instance template
 * and rely on the JSON for placement.
 */
import * as THREE from 'three'
import Experience from '../../Experience.js'
import { blenderTransformToMatrix, findMesh } from './SceneUtils.js'
import { createStylizedPropNodeMaterial } from './StylizedPropMaterial.js'

const _matrix = new THREE.Matrix4()

export default class Fence {
    constructor(gltf, instances, atlasMap) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.isLow = this.experience.quality.isLow
        this.instancesData = instances?.instances || []

        if (!gltf || !gltf.scene) {
            console.warn('Fence: missing gltf.scene')
            return
        }
        if (this.instancesData.length === 0) {
            console.warn('Fence: no instances in JSON')
            return
        }

        const sourceMesh =
            findMesh(gltf.scene, (m) => m.name.startsWith('fence_open_wide_long'))
            || findMesh(gltf.scene, (m) => m.name.toLowerCase().includes('fence'))
            || findMesh(gltf.scene, () => true)

        if (!sourceMesh) {
            console.warn('Fence: no fence mesh found in glb')
            return
        }

        sourceMesh.material?.dispose?.()
        this.material = createStylizedPropNodeMaterial({
            map: atlasMap || null,
            color: 0xffffff
        })

        this.instanced = new THREE.InstancedMesh(
            sourceMesh.geometry,
            this.material,
            this.instancesData.length
        )
        this.instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.instanced.castShadow = !this.isLow
        this.instanced.receiveShadow = !this.isLow
        this.instanced.name = 'Fence'

        this.rebuildMatrices()
        this.scene.add(this.instanced)
        console.log(`✅ Fence: ${this.instancesData.length} instances`)
    }

    rebuildMatrices(rotationMode) {
        if (!this.instanced) return
        for (let i = 0; i < this.instancesData.length; i++) {
            const inst = this.instancesData[i]
            blenderTransformToMatrix(inst.position, inst.rotation, inst.scale, _matrix, rotationMode)
            this.instanced.setMatrixAt(i, _matrix)
        }
        this.instanced.instanceMatrix.needsUpdate = true
        this.instanced.computeBoundingSphere?.()
    }
}
