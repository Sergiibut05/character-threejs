import * as THREE from 'three'
import { ignoreAO } from './aoMask.js'
import { FX_NO_OCCLUDE_LAYER } from '../Renderer.js'

/**
 * A blob must never act as an outline occluder.
 *
 * The outline pass works out what is hidden by re-rendering the scene through
 * `scene.overrideMaterial`, which REPLACES every material -- so a transparent
 * quad with depthWrite:false comes out of that pass as a solid, depth-writing
 * disc. The blob under the character is 1.1 units across, so standing on the
 * house's entrance rug punched a hole in the rug's white edge far wider than
 * his feet: the outline stopped either side of him and picked up again past
 * the blob. Confirmed by hiding the blob, at which point the edge closes.
 *
 * This is the same trap the standing lamp's halo fell into, and the same fix
 * (see FX_NO_OCCLUDE_LAYER in Renderer.js): on this layer the scene still
 * draws it and the outline camera does not.
 *
 * Only bites on the tiers that HAVE blobs -- low quality, and Android, where
 * the real shadow pipeline is off entirely.
 */
const hideFromOutline = (object) => object.layers.set(FX_NO_OCCLUDE_LAYER)

function createShadowTexture(size = 64) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')

    const half = size / 2
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
    gradient.addColorStop(0.0, 'rgba(0, 0, 0, 0.38)')
    gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.25)')
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.08)')
    gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)')

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)

    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
}

const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()

export default class FakeShadow {
    constructor(scene) {
        this.scene = scene
        this.texture = createShadowTexture()
        this.characterMesh = null
        this.treeMeshes = []
    }

    createCharacterShadow(radius = 0.55) {
        const geo = new THREE.PlaneGeometry(radius * 2, radius * 2)
        geo.rotateX(-Math.PI / 2)

        const mat = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            depthWrite: false
        })
        // No depth write means no say over ambient occlusion -- it abstains
        // rather than overriding what is behind it. See aoMask.js.
        ignoreAO(mat)

        this.characterMesh = new THREE.Mesh(geo, mat)
        this.characterMesh.renderOrder = -1
        hideFromOutline(this.characterMesh)
        this.scene.add(this.characterMesh)
    }

    /**
     * @param {Array<THREE.Object3D>} treeRefs
     * @param {number} radius
     * @param {?function(number, number): (number|null)} groundYAt  world height
     *   under (x, z), or null where it cannot be found. Without it the blob
     *   lands on the tree's own origin -- see the note in the loop.
     */
    createTreeShadows(treeRefs, radius = 1.0, groundYAt = null) {
        if (!treeRefs || treeRefs.length === 0) return

        const geo = new THREE.PlaneGeometry(radius * 2, radius * 2)
        geo.rotateX(-Math.PI / 2)

        // Same settings as the character's, deliberately -- this was asked for
        // as "the shadow he has, a little bigger", and it was not: an extra
        // opacity 0.7 on top of a texture that only reaches 0.38 alpha left the
        // tree blobs at about a quarter opacity, faint enough to look like a
        // smudge on the grass rather than a shadow. Size is the only thing that
        // differs now.
        const mat = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            depthWrite: false
        })
        // No depth write means no say over ambient occlusion -- it abstains
        // rather than overriding what is behind it. See aoMask.js.
        ignoreAO(mat)

        const mesh = new THREE.InstancedMesh(geo, mat, treeRefs.length)
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        mesh.renderOrder = -1

        const matrix = new THREE.Matrix4()

        let placed = 0
        for (let i = 0; i < treeRefs.length; i++) {
            const ref = treeRefs[i]
            ref.updateWorldMatrix(true, false)
            ref.matrixWorld.decompose(_pos, _quat, _scale)

            // ON THE GROUND, not on the tree's origin.
            //
            // A tree is planted with its origin pushed INTO the terrain so the
            // trunk does not end in a visible seam -- measured between 8 and 66
            // cm below the surface. Putting the blob there buries it, and a
            // buried blob is simply never seen: which is why these existed for
            // a long time and nobody could point at one.
            //
            // Where the height is unknown (trees beyond the collider mesh) it
            // falls back to the old behaviour rather than guessing an offset.
            // Guessing would float the shadow under some of them, and a shadow
            // hovering off the ground is worse than no shadow at all.
            const ground = groundYAt ? groundYAt(_pos.x, _pos.z) : null
            if (ground != null) placed++
            matrix.makeTranslation(_pos.x, (ground ?? _pos.y) + 0.02, _pos.z)
            mesh.setMatrixAt(i, matrix)
        }
        this.treesPlacedOnGround = (this.treesPlacedOnGround || 0) + placed

        mesh.instanceMatrix.needsUpdate = true
        hideFromOutline(mesh)
        this.scene.add(mesh)
        this.treeMeshes.push(mesh)
    }

    updateCharacter(position, capsuleCenterY) {
        if (!this.characterMesh || !position) return
        const groundY = position.y - capsuleCenterY + 0.02
        this.characterMesh.position.set(position.x, groundY, position.z)
    }

    dispose() {
        if (this.characterMesh) {
            this.scene.remove(this.characterMesh)
            this.characterMesh.geometry?.dispose()
            this.characterMesh.material?.dispose()
        }
        for (const m of this.treeMeshes) {
            this.scene.remove(m)
            m.geometry?.dispose()
            m.material?.dispose()
        }
        this.texture?.dispose()
    }
}
