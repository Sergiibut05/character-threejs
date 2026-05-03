/**
 * GrassBorders — perimeter cliffs/borders around the patio. Uses the same
 * grass palette as the Floor's grass region so the seam between borders and
 * grass-floor stays invisible.
 */
import * as THREE from 'three'
import Experience from '../../Experience.js'
import { createFloorColorNode } from '../TSL/FloorShader.js'

export default class GrassBorders {
    constructor(gltf, sharedUniforms) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.isLow = this.experience.quality.isLow

        if (!gltf || !gltf.scene) {
            console.warn('GrassBorders: missing gltf.scene')
            return
        }

        this.root = gltf.scene
        this.root.name = 'GrassBorders'

        const material = new THREE.MeshLambertNodeMaterial({
            side: THREE.DoubleSide,
            depthWrite: true
        })
        material.colorNode = createFloorColorNode(sharedUniforms, { mode: 'grass' })

        this.root.traverse((child) => {
            if (!child.isMesh) return
            child.material?.dispose?.()
            child.material = material
            child.castShadow = !this.isLow
            child.receiveShadow = !this.isLow
        })

        this.scene.add(this.root)
    }
}
