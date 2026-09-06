import * as THREE from 'three'
import { uniform } from 'three/tsl'
import Foliage from './Foliage.js'
import CanopyShadow from './CanopyShadow.js'
import Experience from '../Experience.js'
import { createStylizedPropNodeMaterial } from './scene/StylizedPropMaterial.js'

/**
 * Parse a hex color string as raw linear floats — bypasses sRGB→linear
 * conversion so that the value stored in the uniform matches digit-for-digit
 * what lil-gui shows (lil-gui reads .r/.g/.b directly as hex digits).
 */
function hexToColor(hex) {
    const n = parseInt(hex.replace('#', ''), 16)
    return new THREE.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _identityScale = new THREE.Vector3(1, 1, 1)
const _zero = new THREE.Vector3(0, 0, 0)
const _matrix = new THREE.Matrix4()

export default class Trees {
    constructor(name, visual, references, colorA, colorB, foliageOpts = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.physics = this.experience.world.physics

        this.name = name
        this.visual = visual
        this.references = references
        this.colorA = colorA
        this.colorB = colorB
        this.foliageOpts = foliageOpts

        this.leavesColorANode = uniform(hexToColor(this.colorA))
        this.leavesColorBNode = uniform(hexToColor(this.colorB))

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

    /** The trunk node's rotation+scale, with its translation dropped. */
    _bodyRotScale() {
        const out = new THREE.Matrix4()
        const body = this.modelParts.body
        if (!body) return out
        body.updateMatrix()
        body.matrix.decompose(_pos, _quat, _scale)
        return out.compose(_zero, _quat, _scale)
    }

    _cleanRefMatrix(ref) {
        ref.updateWorldMatrix(true, false)
        ref.matrixWorld.decompose(_pos, _quat, _scale)
        return new THREE.Matrix4().compose(_pos, _quat, _identityScale)
    }

    setBodies() {
        if (!this.modelParts.body) return

        const body = this.modelParts.body
        const oldMat = body.material
        const mat = createStylizedPropNodeMaterial({
            map: oldMat?.map || null,
            color: oldMat?.color || 0x8B6914
        })

        this.bodies = new THREE.InstancedMesh(
            body.geometry,
            mat,
            this.references.length
        )
        this.bodies.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        this.bodies.castShadow = true
        this.bodies.receiveShadow = true

        // Honour the trunk node's own rotation/scale (NOT its translation — the
        // reference is what says where the tree goes). Skipping it rendered the
        // raw geometry at full size, so an Old-tree authored at 0.682 came out
        // ~47% too big. Identity node ⇒ unchanged (Abedul / Normal).
        const bodyRS = this._bodyRotScale()
        for (let i = 0; i < this.references.length; i++) {
            _matrix.copy(this.references[i].matrix).multiply(bodyRS)
            this.bodies.setMatrixAt(i, _matrix)
        }
        this.bodies.instanceMatrix.needsUpdate = true

        this.scene.add(this.bodies)
    }

    setLeaves() {
        this.visual.updateMatrixWorld(true)
        const references = []

        // Foliage is authored ABSOLUTELY inside the GLB, so only the trunk's
        // TRANSLATION has to go: the reference decides where the tree stands,
        // while the trunk keeps its own rotation/scale (see setBodies). What
        // remains is each cluster's authored offset and size relative to it —
        // so the template can sit anywhere in Blender and still assemble.
        const body = this.modelParts.body
        const unshift = new THREE.Matrix4()
        if (body) {
            body.updateMatrix()
            unshift.makeTranslation(-body.position.x, -body.position.y, -body.position.z)
        }

        for (let t = 0; t < this.references.length; t++) {
            const treeRef = this.references[t]
            treeRef.updateWorldMatrix(true, false)
            // One stable random per TREE — every foliage cluster of the same
            // tree shares it, so the tonal variation shifts the WHOLE tree.
            const treeSeed = (((Math.sin((t + 1) * 12.9898) * 43758.5453) % 1) + 1) % 1
            for (const leaves of this.modelParts.leaves) {
                const finalMatrix = leaves.matrix.clone()
                    .premultiply(unshift)
                    .premultiply(treeRef.matrixWorld)
                const reference = new THREE.Object3D()
                reference.applyMatrix4(finalMatrix)
                reference.userData.treeSeed = treeSeed
                references.push(reference)
            }
        }

        this.setCanopyShadow(unshift)

        if (references.length > 0) {
            this.leaves = new Foliage(
                references,
                this.leavesColorANode,
                this.leavesColorBNode,
                true,
                // The canopy does not cast: CanopyShadow draws its shade
                // instead. The trunk still casts, and it is what anchors the
                // pool to the tree. See CanopyShadow.js.
                false
            )
            const m = this.leaves.material
            const o = this.foliageOpts
            if (o.shadowOffset !== undefined) m.shadowOffset.value = o.shadowOffset
            if (o.threshold !== undefined) m.threshold.value = o.threshold
            if (o.seeThroughEdgeMin !== undefined) m.seeThroughEdgeMin.value = o.seeThroughEdgeMin
            if (o.seeThroughEdgeMax !== undefined) m.seeThroughEdgeMax.value = o.seeThroughEdgeMax
            if (o.colorAPresence !== undefined) m.colorAPresence.value = o.colorAPresence
            if (o.toneVariation !== undefined) m.toneVariation.value = o.toneVariation
        }
    }

    /**
     * The soft pool of shade under each tree, sized from the leaves themselves.
     *
     * Measured in the trunk-relative frame the clusters are already assembled
     * in (see setLeaves), so it is the authored canopy that decides how wide
     * the shadow is -- not a number typed here that a re-export would silently
     * invalidate.
     */
    setCanopyShadow(unshift) {
        if (!this.modelParts.leaves.length || !this.references.length) return
        // High tier only, for now. On low the sun casts nothing at all
        // (Quality.sunShadows), so there would be no shadow-pass work to trade
        // away -- the pools would be pure added fill rate on exactly the
        // devices with the least of it. Low keeps FakeShadow's blobs.
        if (!this.experience.quality.isHigh) return

        const box = new THREE.Box3()
        const clusterBox = new THREE.Box3()
        const m = new THREE.Matrix4()
        for (const leaves of this.modelParts.leaves) {
            if (!leaves.geometry.boundingBox) leaves.geometry.computeBoundingBox()
            clusterBox.copy(leaves.geometry.boundingBox)
            clusterBox.applyMatrix4(m.copy(leaves.matrix).premultiply(unshift))
            box.union(clusterBox)
        }
        if (box.isEmpty()) return

        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)

        this.canopyShadow = new CanopyShadow(
            this.references,
            Math.max(size.x, size.z) * 0.5,
            Math.max(center.y, 0.1)
        )
    }

    setPhysical() {
        if (!this.physics || !this.physics.world || !this.physics.RAPIER) return

        const RAPIER = this.physics.RAPIER
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
        if (this.canopyShadow) {
            this.canopyShadow.update()
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
            this.debugFolder.add(mat.toneVariation, 'value', 0, 0.35, 0.005).name('Tone Variation (± tree)')
        }
    }
}
