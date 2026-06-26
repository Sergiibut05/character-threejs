/**
 * BaseballPitch — flat baked dirt/sand field. Two gotchas about this GLB:
 *
 *  1. It was exported with KHR_mesh_quantization, so position/normal/uv arrive
 *     as NORMALIZED integers. This project's WebGPU/TSL path does NOT auto-
 *     denormalize them (unlike legacy WebGL), so raw values break the mesh:
 *     UVs collapse to a single texel and ±32767 positions blow the quad up so
 *     it gets frustum-culled. `dequantizeGeometry` converts them to float once
 *     on the CPU. After that the embedded KTX2/ETC1S map textures normally.
 *
 *  2. The field is authored a hair BELOW the grass floor (field y≈0.22 vs
 *     grass-floor y≈0.23), so the grass draws over it and it vanishes. We lift
 *     the whole piece a small epsilon so it rests just on top of the grass.
 */
import * as THREE from 'three'
import Experience from '../../Experience.js'
import { createStylizedPropNodeMaterial } from './StylizedPropMaterial.js'
import { dequantizeGeometry } from './SceneUtils.js'

// Vertical lift so the flat field clears the grass floor it sits on. The grass
// is only ~0.01 above the authored field height, so a hair is enough; the
// material's polygonOffset handles any residual z-fighting at the edges.
const GROUND_LIFT = 0.02

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
        this.root.position.y += GROUND_LIFT

        this.root.traverse((child) => {
            if (!child.isMesh) return

            // De-quantize every normalized integer attribute (see file header).
            dequantizeGeometry(child.geometry)

            const old = child.material
            child.material = createStylizedPropNodeMaterial({
                map: old?.map || null,
                color: old?.color || 0xffffff
            })
            // Decal-style overlay on the ground: bias it toward the camera so it
            // never z-fights the grass at the field edges.
            child.material.polygonOffset = true
            child.material.polygonOffsetFactor = -1
            child.material.polygonOffsetUnits = -1
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

    /**
     * Oriented (rotation-aware) bounds of the field in world space. The field
     * tile is a single quad whose node matrix bakes a 45° Y rotation (its UVs
     * are drawn diagonally), so the world AABB is a larger square with four
     * corners landing on the grass OUTSIDE the actual field. We must read the
     * orientation from the MESH's own world matrix (not the root, which is
     * unrotated) to recover the true play rectangle: center + unit world axes +
     * half-extents.
     */
    getOrientedBounds() {
        if (!this.root) return null
        this.root.updateMatrixWorld(true)

        let mesh = null
        this.root.traverse((c) => { if (!mesh && c.isMesh && c.geometry) mesh = c })
        if (!mesh) return null
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()

        const bb = mesh.geometry.boundingBox
        const lc = bb.getCenter(new THREE.Vector3())
        const ls = bb.getSize(new THREE.Vector3())
        const m = mesh.matrixWorld
        const e = m.elements

        // Matrix columns = the quad's local axes in world (length encodes scale).
        const axisX = new THREE.Vector3(e[0], e[1], e[2])
        const axisY = new THREE.Vector3(e[4], e[5], e[6])
        const axisZ = new THREE.Vector3(e[8], e[9], e[10])

        const center = lc.clone().applyMatrix4(m)
        const halfX = ls.x * 0.5 * axisX.length()
        const halfZ = ls.z * 0.5 * axisZ.length()
        const topY = center.y + ls.y * 0.5 * axisY.length()

        return {
            center,
            axisX: axisX.normalize(),
            axisZ: axisZ.normalize(),
            halfX,
            halfZ,
            topY
        }
    }
}
