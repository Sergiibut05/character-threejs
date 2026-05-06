/**
 * BaseballPitch — flat sand/dirt textured plane. The GLB already ships the
 * baked field texture embedded, so we only need to swap the GLTF default
 * MeshStandardMaterial for a Mali-friendly Lambert.
 */
import * as THREE from 'three'
import Experience from '../../Experience.js'

export default class BaseballPitch {
    constructor(gltf) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.isLow = this.experience.quality.isLow

        if (!gltf || !gltf.scene) {
            console.warn('BaseballPitch: missing gltf.scene')
            return
        }

        this.root = gltf.scene
        this.root.name = 'BaseballPitch'

        this.root.traverse((child) => {
            if (!child.isMesh) return
            const old = child.material
            child.material = new THREE.MeshLambertMaterial({
                map: old?.map || null,
                color: old?.color || 0xffffff
            })
            child.castShadow = false
            child.receiveShadow = !this.isLow
            old?.dispose?.()
        })

        this.scene.add(this.root)

        this.root.updateMatrixWorld(true)
        this.bbox = new THREE.Box3().setFromObject(this.root)
    }

    getBoundingBox() {
        return this.bbox ?? null
    }
}
