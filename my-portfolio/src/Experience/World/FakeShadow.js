import * as THREE from 'three'
import { ignoreAO } from './aoMask.js'

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
        this.scene.add(this.characterMesh)
    }

    createTreeShadows(treeRefs, radius = 1.0) {
        if (!treeRefs || treeRefs.length === 0) return

        const geo = new THREE.PlaneGeometry(radius * 2, radius * 2)
        geo.rotateX(-Math.PI / 2)

        const mat = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            depthWrite: false,
            opacity: 0.7
        })
        // No depth write means no say over ambient occlusion -- it abstains
        // rather than overriding what is behind it. See aoMask.js.
        ignoreAO(mat)

        const mesh = new THREE.InstancedMesh(geo, mat, treeRefs.length)
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        mesh.renderOrder = -1

        const matrix = new THREE.Matrix4()

        for (let i = 0; i < treeRefs.length; i++) {
            const ref = treeRefs[i]
            ref.updateWorldMatrix(true, false)
            ref.matrixWorld.decompose(_pos, _quat, _scale)
            matrix.makeTranslation(_pos.x, _pos.y + 0.02, _pos.z)
            mesh.setMatrixAt(i, matrix)
        }

        mesh.instanceMatrix.needsUpdate = true
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
