/**
 * BlackCave — cave entrance planes. Pure black, no lighting, no physics.
 */
import * as THREE from 'three'
import Experience from '../../Experience.js'

export default class BlackCave {
    constructor(gltf) {
        this.experience = new Experience()
        this.scene = this.experience.scene

        if (!gltf || !gltf.scene) {
            console.warn('BlackCave: missing gltf.scene')
            return
        }

        this.root = gltf.scene
        this.root.name = 'BlackCave'

        const black = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.DoubleSide,
            depthWrite: true
        })

        this.root.traverse((child) => {
            if (!child.isMesh) return
            child.material?.dispose?.()
            child.material = black
            child.castShadow = false
            child.receiveShadow = false
            child.renderOrder = -1
        })

        this.scene.add(this.root)
    }
}
