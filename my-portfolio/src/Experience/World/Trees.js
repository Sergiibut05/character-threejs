import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { color, uniform } from 'three/tsl'
import Foliage from './Foliage.js'
import Experience from '../Experience.js'

const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _identityScale = new THREE.Vector3(1, 1, 1)

export default class Trees {
    constructor(name, visual, references, colorA, colorB) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.physics = this.experience.world.physics

        this.name = name
        this.visual = visual
        this.references = references
        this.colorA = colorA
        this.colorB = colorB

        this.leavesColorANode = uniform(color(this.colorA))
        this.leavesColorBNode = uniform(color(this.colorB))

        this.setModelParts()
        this.setBodies()
        this.setLeaves()
        this.setPhysical()

        if (this.debug.active) {
            this.setDebug()
        }
    }

    setModelParts() {
        this.modelParts = { leaves: [], body: null }

        this.visual.traverse((child) => {
            if (child.isMesh) {
                if (child.name.startsWith('treeLeaves'))
                    this.modelParts.leaves.push(child)
                else if (child.name.startsWith('treeBody'))
                    this.modelParts.body = child
            }
        })
    }

    _cleanRefMatrix(ref) {
        ref.updateWorldMatrix(true, false)
        ref.matrixWorld.decompose(_pos, _quat, _scale)
        return new THREE.Matrix4().compose(_pos, _quat, _identityScale)
    }

    setBodies() {
        if (!this.modelParts.body) return

        const body = this.modelParts.body
        this.bodies = new THREE.InstancedMesh(
            body.geometry,
            body.material,
            this.references.length
        )
        this.bodies.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        this.bodies.castShadow = true
        this.bodies.receiveShadow = true

        for (let i = 0; i < this.references.length; i++) {
            this.bodies.setMatrixAt(i, this.references[i].matrix)
        }
        this.bodies.instanceMatrix.needsUpdate = true

        this.scene.add(this.bodies)
    }

    setLeaves() {
        this.visual.updateMatrixWorld(true)
        const references = []

        for (const treeRef of this.references) {
            treeRef.updateWorldMatrix(true, false)
            for (const leaves of this.modelParts.leaves) {
                const finalMatrix = leaves.matrix.clone().premultiply(treeRef.matrixWorld)
                const reference = new THREE.Object3D()
                reference.applyMatrix4(finalMatrix)
                references.push(reference)
            }
        }

        if (references.length > 0) {
            this.leaves = new Foliage(
                references,
                this.leavesColorANode,
                this.leavesColorBNode,
                true
            )
        }
    }

    setPhysical() {
        if (!this.physics || !this.physics.world) return

        this.colliders = []
        const trunkHeight = 2.5
        const trunkRadius = 0.15

        for (const treeRef of this.references) {
            treeRef.updateWorldMatrix(true, false)
            treeRef.matrixWorld.decompose(_pos, _quat, _scale)

            const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
                .setTranslation(_pos.x, _pos.y + trunkHeight, _pos.z)
                .setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w })

            const rigidBody = this.physics.world.createRigidBody(rigidBodyDesc)

            const colliderDesc = RAPIER.ColliderDesc.cylinder(trunkHeight, trunkRadius)
                .setFriction(0.7)
                .setRestitution(0.0)
                .setActiveCollisionTypes(
                    RAPIER.ActiveCollisionTypes.DEFAULT |
                    RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED
                )

            const collider = this.physics.world.createCollider(colliderDesc, rigidBody)
            this.colliders.push({ rigidBody, collider })
        }
    }

    update() {
        if (this.leaves) {
            this.leaves.update()
        }
    }

    setDebug() {
        this.debugFolder = this.debug.ui.addFolder(`Tree: ${this.name}`)
        this.debugFolder.close()

        this.debugFolder.addColor({ value: this.leavesColorANode.value }, 'value')
            .name('Leaves Color A')
            .onChange(v => this.leavesColorANode.value.copy(v))

        this.debugFolder.addColor({ value: this.leavesColorBNode.value }, 'value')
            .name('Leaves Color B')
            .onChange(v => this.leavesColorBNode.value.copy(v))

        if (this.leaves) {
            const mat = this.leaves.material
            this.debugFolder.add(mat.shadowOffset, 'value', 0, 2, 0.001).name('Shadow Offset')
            this.debugFolder.add(mat.threshold, 'value', 0, 1, 0.001).name('Threshold')
            this.debugFolder.add(mat.seeThroughEdgeMin, 'value', 0, 1, 0.001).name('See Through Min')
            this.debugFolder.add(mat.seeThroughEdgeMax, 'value', 0, 1, 0.001).name('See Through Max')
            this.debugFolder.add(mat.colorAPresence, 'value', 0, 1, 0.001).name('Color A Presence')
        }
    }
}
