import * as THREE from 'three'
import Experience from '../Experience.js'

// Small world-space lift so the dog's feet rest ON the ground instead of
// sinking a hair below it (the Character model applies the same trick). Tweak
// if the dog ever looks like it's floating or sunk.
const DOG_FOOT_LIFT = 0.06

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
        // Low hop, not a big leap — lets the disc travel more of its arc before
        // the dog snags it (reads far more naturally).
        this._jumpHeight = 0.4

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
        // Lift the model inside the container so its feet land at Y=0, plus a
        // small fudge so they don't visually sink into the ground.
        this.model.position.y = -_box.min.y + DOG_FOOT_LIFT

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

    /**
     * Re-settle the anchored idle dog onto a corrected ground height. Used once
     * the baseball-pitch bbox becomes available (the GLB anchor Y floats above
     * the visual field surface).
     */
    setAnchorGroundY(groundY) {
        if (this.state !== 'idleAnchor' || !this.container) return
        this._groundY = groundY
        if (this._anchorPos) this._anchorPos.y = groundY
        this.position.y = groundY
        this.container.position.y = groundY
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
        // Bad throw: the dog gives up at the halfway point and must already be
        // standing there when the camera cuts to it at mid-flight (Wii-style),
        // so it aims to arrive around 45% of the flight, not at the end.
        const arriveFactor = this._badThrow ? 0.45 : this.arrivalMargin
        const arriveTime = Math.max(flightDuration * arriveFactor, 0.5)
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
     * @param {number} cameraYaw — throw yaw, used as fallback when the camera is unavailable
     */
    startPostCatchWalk(cameraYaw) {
        // Wii-style presentation: after the catch the dog turns around (a natural
        // walking arc, see _updatePostWalk) and trots a few steps TOWARD the
        // camera, with a small lateral offset so it doesn't march into the lens.
        const cam = this.experience.camera?.instance
        const dir = new THREE.Vector3()
        if (cam) {
            dir.subVectors(cam.position, this.position)
            dir.y = 0
        }
        if (dir.lengthSq() < 0.01) {
            // Fallback: straight back along the throw direction.
            dir.set(Math.sin(cameraYaw + Math.PI), 0, Math.cos(cameraYaw + Math.PI))
        }
        const distToCam = dir.length()
        dir.normalize()

        // Never walk past (or into) the camera on very short catches.
        const walkDist = Math.min(3.0, Math.max(1.0, distToCam - 3.0))
        const side = new THREE.Vector3(-dir.z, 0, dir.x)
        const sideSign = Math.random() < 0.5 ? 1 : -1

        this.returnTarget.copy(this.position)
            .addScaledVector(dir, walkDist)
            .addScaledVector(side, sideSign * 0.8)
        this.returnTarget.y = 0
        this._postWalkTimer = 0
        this.state = 'postWalk'
        this._playAction('walk')
    }

    /**
     * Pre-round "gesture" placeholder (plan §4.E.2): a happy double hop with a
     * little wiggle. Composed from a transform animation over the idle clip —
     * safe because idle/idleAnchor don't drive position each frame. Resolves
     * when finished.
     */
    async playGesture() {
        if (!this.container) return
        if (this.state !== 'idle' && this.state !== 'idleAnchor') return

        const baseY = this.container.position.y
        const baseRot = this.container.rotation.y
        await this.experience.animateValue(0, 1, 1200, (t) => {
            const hop = Math.abs(Math.sin(t * Math.PI * 2)) // two bounces
            this.container.position.y = baseY + hop * 0.45
            this.container.rotation.y = baseRot + Math.sin(t * Math.PI * 6) * 0.12 // wiggle
        })
        this.container.position.y = baseY
        this.container.rotation.y = baseRot
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
        this._postWalkTimer = (this._postWalkTimer ?? 0) + dt

        const toTarget = _v3.subVectors(this.returnTarget, this.position)
        toTarget.y = 0
        const dist = toTarget.length()

        // Done on arrival — or after a safety timeout (the steering arc could
        // in theory orbit a too-tight target forever).
        if (dist < 0.5 || this._postWalkTimer > 4) {
            this.state = 'done'
            this._playAction('idle')
            return
        }

        // Natural turn: steer toward the target but MOVE along the current
        // facing (same scheme as the chase) → the ~180° turn back toward the
        // camera reads as a walking arc instead of a pivot-and-slide.
        toTarget.normalize()
        this._rotateToward(toTarget, dt, 5)
        const yaw = this.container.rotation.y
        _v3b.set(Math.sin(yaw), 0, Math.cos(yaw))
        this.position.addScaledVector(_v3b, this.walkSpeed * dt)
        this.position.y = this._groundY
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
