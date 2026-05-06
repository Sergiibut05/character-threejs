import * as THREE from 'three'
import Experience from '../Experience.js'

/**
 * AI-driven dog companion for the frisbee minigame.
 * Mimics Wii Sports Resort behaviour:
 *   idle → chase (curved path) → arrive → catch (jump) → return to player
 */
export default class DogCompanion {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        // States: hidden | idle | chasing | arriving | catching | caught | returning | done
        this.state = 'hidden'

        this.container = null
        this.model = null
        this.mixer = null
        this.actions = {}
        this._currentAction = null
        this._headBone = null

        this.position = new THREE.Vector3()
        this._groundY = 0  // world-space Y of the ground; set in showAtAnchor / show

        // ─── Chase tuning ─────────────────────────────────────
        this.maxRunSpeed = 8
        this.minRunSpeed = 3
        this.walkSpeed = 2.5
        this.rotationSpeed = 8
        this.chaseSteerSpeed = 4.5
        this.arrivalMargin = 0.97

        // ─── Chase runtime ────────────────────────────────────
        this.landingPoint = new THREE.Vector3()
        this.flightDuration = 0
        this.chaseElapsed = 0
        this.chaseSpeed = 0

        // ─── Catch tuning ─────────────────────────────────────
        this._jumpAscentDur = 0.35
        this._jumpDescentDur = 0.35
        this._jumpSettleDur = 0.5
        this._jumpHeight = 0.9

        // ─── Catch runtime ────────────────────────────────────
        this._catchTimer = 0
        this._frisbeeAttached = false
        this._jumpEndPlayed = false
        this._frisbeeRef = null

        // ─── Return runtime ───────────────────────────────────
        this.returnTarget = new THREE.Vector3()

        this.setupModel()
    }

    // ─── Setup ──────────────────────────────────────────────────────────

    setupModel() {
        const gltf = this.resources.items.dogModel
        if (!gltf) return
        if (this.container) return // already initialised

        this.container = new THREE.Group()
        this.container.name = 'DogCompanion'
        this.container.visible = false

        this.model = gltf.scene
        // Clear any baked root transforms from the GLB so the Box3 only sees geometry
        this.model.position.set(0, 0, 0)
        this.model.rotation.set(0, 0, 0)
        this.model.scale.set(0.0075, 0.0075, 0.0075)

        this.model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true
            }
            if (child.isBone) {
                const n = child.name.toLowerCase()
                if (n === 'head0') {
                    this._headBone = child
                } else if (!this._headBone && n === 'head') {
                    this._headBone = child
                }
            }
        })

        // Flush world matrices so Box3 reads the scaled geometry correctly
        this.model.updateMatrixWorld(true)
        const _box = new THREE.Box3().setFromObject(this.model)
        // Lift the model inside the container so its feet land exactly at Y=0
        this.model.position.y = -_box.min.y

        this.container.add(this.model)
        this.scene.add(this.container)

        // Animations
        if (gltf.animations?.length) {
            this.mixer = new THREE.AnimationMixer(this.model)
            for (const clip of gltf.animations) {
                const n = clip.name.toLowerCase()
                if (n.includes('idle')) {
                    this.actions.idle = this.mixer.clipAction(clip)
                } else if (n.includes('run')) {
                    this.actions.run = this.mixer.clipAction(clip)
                } else if (n.includes('walk')) {
                    this.actions.walk = this.mixer.clipAction(clip)
                } else if (n.includes('jump') && n.includes('start')) {
                    this.actions.jumpStart = this.mixer.clipAction(clip)
                } else if (n.includes('jump') && n.includes('end')) {
                    this.actions.jumpEnd = this.mixer.clipAction(clip)
                }
            }

            for (const [key, action] of Object.entries(this.actions)) {
                if (key === 'jumpStart' || key === 'jumpEnd') {
                    action.setLoop(THREE.LoopOnce)
                    action.clampWhenFinished = true
                } else {
                    action.setLoop(THREE.LoopRepeat)
                }
                action.play()
                action.setEffectiveWeight(0)
            }
        }
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────

    showAtAnchor(pos, yaw) {
        if (!this.container) return
        this._anchorPos = pos.clone()
        this._anchorYaw = yaw
        this._groundY = pos.y

        this.position.copy(pos)
        this.position.y = this._groundY
        this.container.position.copy(this.position)
        this.container.rotation.y = yaw
        this.container.visible = true
        this.state = 'idleAnchor'
        this._playAction('idle')
    }

    show(playerPosition, playerYaw, groundY = 0) {
        if (!this.container) return
        this._groundY = groundY

        const offset = new THREE.Vector3(
            Math.sin(playerYaw + Math.PI * 0.5) * 1.5,
            0,
            Math.cos(playerYaw + Math.PI * 0.5) * 1.5
        )
        this.position.copy(playerPosition).add(offset)
        this.position.y = this._groundY

        this.container.position.copy(this.position)
        this.container.rotation.y = playerYaw
        this.container.visible = true

        this.state = 'idle'
        this._playAction('idle')
    }

    startChase(landingPoint, flightDuration, opts) {
        this._badThrow = opts?.badThrow ?? false
        this._giveUpDist = 0

        if (this._badThrow) {
            // Stop at ~50% of the distance
            const halfway = this.position.clone().lerp(landingPoint, 0.5)
            this.landingPoint.copy(halfway)
            this._giveUpDist = this.position.distanceTo(this.landingPoint)
        } else {
            this.landingPoint.copy(landingPoint)
        }

        this.flightDuration = flightDuration
        this.chaseElapsed = 0

        const dist = this.position.distanceTo(this.landingPoint)
        const arriveTime = Math.max(flightDuration * this.arrivalMargin, 0.5)
        this.chaseSpeed = THREE.MathUtils.clamp(
            dist / arriveTime,
            this.minRunSpeed,
            this.maxRunSpeed
        )

        this.state = 'chasing'
        this._playAction('run')
    }

    triggerCatch(frisbeeMesh, frisbeePos) {
        this._frisbeeRef = frisbeeMesh
        this._frisbeeAttached = false
        this._jumpEndPlayed = false
        this._catchTimer = 0

        // Store frisbee's world position for smooth lerp to mouth
        this._frisbeeStartPos = frisbeeMesh
            ? new THREE.Vector3().copy(frisbeeMesh.position)
            : new THREE.Vector3()

        // Leap forward in the dog's current running direction (no turn-around)
        this._catchStartPos = this.position.clone()
        const yaw = this.container.rotation.y
        this._leapDir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
        this._leapDist = 2.0

        this.state = 'catching'
        this._playAction('jumpStart')
    }

    startReturn(playerPosition) {
        this.returnTarget.copy(playerPosition)
        this.returnTarget.y = 0
        this.state = 'returning'
        this._playAction('walk')
    }

    /**
     * @param {number} cameraYaw — the throw yaw so the dog walks perpendicular to the camera view
     */
    startPostCatchWalk(cameraYaw) {
        // Walk roughly perpendicular to the camera (left or right)
        // Pick the side closest to the dog's current facing
        const dogYaw = this.container.rotation.y
        const perpL = cameraYaw + Math.PI * 0.5
        const perpR = cameraYaw - Math.PI * 0.5
        const diffL = Math.abs(Math.atan2(Math.sin(perpL - dogYaw), Math.cos(perpL - dogYaw)))
        const diffR = Math.abs(Math.atan2(Math.sin(perpR - dogYaw), Math.cos(perpR - dogYaw)))
        const walkYaw = diffL < diffR ? perpL : perpR

        const dir = new THREE.Vector3(Math.sin(walkYaw), 0, Math.cos(walkYaw))
        this.returnTarget.copy(this.position).addScaledVector(dir, 2.5)
        this.returnTarget.y = 0
        this.state = 'postWalk'
        this._playAction('walk')
    }

    // ─── Per-frame ──────────────────────────────────────────────────────

    update(dt) {
        if (this.state === 'hidden' || !this.container) return
        if (this.mixer) this.mixer.update(dt)
        if (this.state === 'idleAnchor' || this.state === 'gaveUp') return

        switch (this.state) {
            case 'chasing': this._updateChasing(dt); break
            case 'catching': this._updateCatching(dt); break
            case 'returning': this._updateReturning(dt); break
            case 'postWalk': this._updatePostWalk(dt); break
        }
    }

    _updateChasing(dt) {
        this.chaseElapsed += dt

        const toTarget = _v3.subVectors(this.landingPoint, this.position)
        toTarget.y = 0
        const dist = toTarget.length()

        if (dist < 0.5) {
            this.position.x = this.landingPoint.x
            this.position.z = this.landingPoint.z
            if (this._badThrow) {
                this.state = 'gaveUp'
                this._playAction('idle')
                this.container.position.copy(this.position)
                return
            }
            this.state = 'arriving'
            this._playAction('idle')
            this.container.position.copy(this.position)
            return
        }

        // Steer toward target (slow turn → natural curved path)
        toTarget.normalize()
        this._rotateToward(toTarget, dt, this.chaseSteerSpeed)

        // Move in the dog's current facing direction, not directly at target
        const yaw = this.container.rotation.y
        _v3b.set(Math.sin(yaw), 0, Math.cos(yaw))
        this.position.addScaledVector(_v3b, this.chaseSpeed * dt)
        this.position.y = this._groundY

        this.container.position.copy(this.position)
    }

    _updateCatching(dt) {
        this._catchTimer += dt

        const ascentEnd = this._jumpAscentDur
        const jumpEnd = ascentEnd + this._jumpDescentDur
        const totalEnd = jumpEnd + this._jumpSettleDur

        // Forward displacement through the whole jump arc
        const jumpT = Math.min(this._catchTimer / jumpEnd, 1)
        const forwardProgress = jumpT * this._leapDist
        this.position.x = this._catchStartPos.x + this._leapDir.x * forwardProgress
        this.position.z = this._catchStartPos.z + this._leapDir.z * forwardProgress

        if (this._catchTimer <= ascentEnd) {
            const t = this._catchTimer / ascentEnd
            this.position.y = this._groundY + Math.sin(t * Math.PI * 0.5) * this._jumpHeight
        } else if (this._catchTimer <= jumpEnd) {
            if (!this._jumpEndPlayed) {
                this._jumpEndPlayed = true
                this._playAction('jumpEnd')
            }
            const t = (this._catchTimer - ascentEnd) / this._jumpDescentDur
            this.position.y = this._groundY + Math.cos(t * Math.PI * 0.5) * this._jumpHeight
        } else {
            this.position.y = this._groundY
        }

        // Smooth frisbee movement: lerp from frozen air position toward the head
        if (!this._frisbeeAttached && this._frisbeeRef && this._headBone) {
            const t = Math.min(this._catchTimer / ascentEnd, 1)
            this._headBone.getWorldPosition(_headWorldPos)
            this._frisbeeRef.position.lerpVectors(this._frisbeeStartPos, _headWorldPos, t * t)
            this._frisbeeRef.visible = true
        }

        // Snap to head bone at peak
        if (this._catchTimer >= ascentEnd * 0.9 && !this._frisbeeAttached && this._frisbeeRef) {
            this._frisbeeAttached = true
            this._attachFrisbeeToHead(this._frisbeeRef)
        }

        this.container.position.copy(this.position)

        if (this._catchTimer >= totalEnd) {
            this.state = 'caught'
        }
    }

    _updateReturning(dt) {
        const toTarget = _v3.subVectors(this.returnTarget, this.position)
        toTarget.y = 0
        const dist = toTarget.length()

        if (dist < 1.0) {
            this.state = 'done'
            this._playAction('idle')
            return
        }

        toTarget.normalize()
        this.position.addScaledVector(toTarget, this.walkSpeed * dt)
        this.position.y = this._groundY

        this._rotateToward(toTarget, dt)
        this.container.position.copy(this.position)
    }

    _updatePostWalk(dt) {
        const toTarget = _v3.subVectors(this.returnTarget, this.position)
        toTarget.y = 0
        const dist = toTarget.length()

        if (dist < 0.3) {
            this.state = 'done'
            this._playAction('idle')
            return
        }

        toTarget.normalize()
        this.position.addScaledVector(toTarget, this.walkSpeed * dt)
        this.position.y = this._groundY
        this._rotateToward(toTarget, dt)
        this.container.position.copy(this.position)
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    _rotateToward(direction, dt, speed) {
        const s = speed ?? this.rotationSpeed
        const targetYaw = Math.atan2(direction.x, direction.z)
        const diff = Math.atan2(
            Math.sin(targetYaw - this.container.rotation.y),
            Math.cos(targetYaw - this.container.rotation.y)
        )
        this.container.rotation.y += diff * (1 - Math.exp(-s * dt))
    }

    lookAtSmooth(target, dt) {
        const dir = _v3.subVectors(target, this.position)
        dir.y = 0
        if (dir.lengthSq() > 0.01) {
            dir.normalize()
            this._rotateToward(dir, dt)
        }
    }

    _attachFrisbeeToHead(frisbeeMesh) {
        if (!this._headBone || !frisbeeMesh) return
        frisbeeMesh.parent?.remove(frisbeeMesh)
        this._headBone.add(frisbeeMesh)
        const inv = 1 / 0.01
        frisbeeMesh.scale.set(inv, inv, inv)
        frisbeeMesh.position.set(0, 24, 14)
        frisbeeMesh.quaternion.setFromEuler(new THREE.Euler(-Math.PI * 0.35, 0, 0))
        frisbeeMesh.visible = true
    }

    detachFrisbee() {
        if (!this._frisbeeRef) return
        if (this._headBone) this._headBone.remove(this._frisbeeRef)
        this._frisbeeRef.scale.set(1, 1, 1)
        this.scene.add(this._frisbeeRef)
        this._frisbeeRef = null
        this._frisbeeAttached = false
    }

    _playAction(name) {
        const action = this.actions[name]
        if (!action || action === this._currentAction) return

        action.reset()
        action.setEffectiveWeight(1)
        action.setEffectiveTimeScale(1)
        if (this._currentAction) {
            action.crossFadeFrom(this._currentAction, 0.15, true)
        }
        this._currentAction = action
    }

    // ─── Reset / Destroy ────────────────────────────────────────────────

    reset() {
        this.detachFrisbee()
        this._catchTimer = 0
        this._jumpEndPlayed = false
        this._frisbeeAttached = false
        this._badThrow = false

        if (this._anchorPos) {
            // Reuse the physics-accurate groundY from the last activity rather than
            // the anchor's GLB Y (which may not match the visual ground).
            const anchorPos = this._anchorPos.clone()
            anchorPos.y = this._groundY
            this.showAtAnchor(anchorPos, this._anchorYaw)
        } else {
            this.state = 'hidden'
            if (this.container) this.container.visible = false
        }
    }

    destroy() {
        this.reset()
        if (this.container) {
            this.scene.remove(this.container)
            this.container = null
        }
    }
}

const _v3 = new THREE.Vector3()
const _v3b = new THREE.Vector3()
const _headWorldPos = new THREE.Vector3()
