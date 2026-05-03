/**
 * Coblestone — single-mesh InstancedMesh placed via `coblestone_instances.json`.
 *
 * No physics, no shadows, no lighting overhead beyond Lambert. The JSON file
 * stores raw Blender Z-up matrices so we convert each transform on the fly.
 */
import * as THREE from 'three'
import Experience from '../../Experience.js'
import { blenderTransformToMatrix, findMesh } from './SceneUtils.js'

const _matrix = new THREE.Matrix4()

export default class Coblestone {
    constructor(gltf, instances) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.isLow = this.experience.quality.isLow
        this.instancesData = instances?.instances || []

        if (!gltf || !gltf.scene) {
            console.warn('Coblestone: missing gltf.scene')
            return
        }
        if (this.instancesData.length === 0) {
            console.warn('Coblestone: no instances in JSON')
            return
        }

        const sourceMesh = findMesh(gltf.scene, (m) => m.name.startsWith('cobble_stones'))
            || findMesh(gltf.scene, () => true)

        if (!sourceMesh) {
            console.warn('Coblestone: no source mesh found in glb')
            return
        }

        const oldMat = sourceMesh.material
        const baseColor = oldMat?.color?.clone?.() || new THREE.Color(0xab8268)
        oldMat?.dispose?.()

        this.material = new THREE.MeshLambertMaterial({
            color: baseColor,
            map: oldMat?.map || null
        })

        this.instanced = new THREE.InstancedMesh(
            sourceMesh.geometry,
            this.material,
            this.instancesData.length
        )
        this.instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.instanced.castShadow = false
        this.instanced.receiveShadow = !this.isLow
        this.instanced.name = 'Coblestone'

        this.rebuildMatrices()
        this.scene.add(this.instanced)
        console.log(`✅ Coblestone: ${this.instancesData.length} instances`)
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
