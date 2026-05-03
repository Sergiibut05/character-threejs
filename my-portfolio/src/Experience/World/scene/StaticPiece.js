/**
 * StaticPiece — drops a glTF scene into the world and re-binds its meshes to a
 * MeshLambertMaterial that uses the provided atlas/colour map.
 *
 * Used by bridge, walls, InfoBoard, social-area, social-entrance and any other
 * decorative piece that shares a single colour atlas.
 */
import * as THREE from 'three'
import Experience from '../../Experience.js'
import { applyAtlasMaterial } from './SceneUtils.js'

export default class StaticPiece {
    constructor(name, gltf, options = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.isLow = this.experience.quality.isLow

        this.name = name
        this.options = options

        if (!gltf || !gltf.scene) {
            console.warn(`StaticPiece: ${name} missing gltf.scene`)
            return
        }

        this.root = gltf.scene
        this.root.name = `StaticPiece:${name}`

        this._applyMaterial()
        this.scene.add(this.root)
    }

    _applyMaterial() {
        const {
            map = null,
            color = null,
            flatShading = false,
            preserveOwnMaps = false,
            castShadow = !this.isLow,
            receiveShadow = !this.isLow
        } = this.options

        if (map && !preserveOwnMaps) {
            this.material = applyAtlasMaterial(this.root, map, {
                flatShading,
                castShadow,
                receiveShadow
            })
            return
        }

        // Mixed mode: shared atlas where possible, but keep per-mesh maps when
        // the original GLB shipped a unique baseColor texture (e.g. signboards).
        const sharedAtlas = map ? new THREE.MeshLambertMaterial({
            map, color: 0xffffff, flatShading
        }) : null
        if (sharedAtlas) this.material = sharedAtlas

        this.root.traverse((child) => {
            if (!child.isMesh) return
            const old = child.material
            const ownMap = old?.map

            if (sharedAtlas && (!preserveOwnMaps || !ownMap)) {
                child.material = sharedAtlas
            } else {
                child.material = new THREE.MeshLambertMaterial({
                    map: ownMap || null,
                    color: color !== null ? color : (old?.color || 0xffffff),
                    flatShading
                })
            }
            child.castShadow = castShadow
            child.receiveShadow = receiveShadow
        })
    }

    dispose() {
        if (this.root) {
            this.scene.remove(this.root)
            this.root.traverse((c) => {
                if (c.isMesh) {
                    c.geometry?.dispose?.()
                    c.material?.dispose?.()
                }
            })
        }
    }
}
