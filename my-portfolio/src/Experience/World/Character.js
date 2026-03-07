import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Character {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.physics = this.experience.world.physics
        this.debug = this.experience.debug

        // Capsule dimensions
        this.capsuleHalfHeight = 0.5
        this.capsuleRadius = 0.32
        this.capsuleCenterY = this.capsuleHalfHeight + this.capsuleRadius
        this.spawnOffsetY = 0.15

        // Position & velocity
        this.position = new THREE.Vector3(0, this.capsuleCenterY + this.spawnOffsetY, 0)
        this.previousPosition = this.position.clone()
        this.gravity = -9.81
        this.verticalVelocity = 0
        this.isGrounded = false

        // Movement tuning
        this.walkSpeed = 1.3
        this.runSpeed = 2.8
        this.rotationSpeed = 12.0

        // State machine: idle | walking | running | resting
        this.state = 'idle'
        this.runDuration = 0
        this.restAfterRunThreshold = 2.0
        this.isSprinting = false

        // Blinking
        this.blinkTimer = 0
        this.nextBlinkTime = this._randomBlinkInterval()
        this.isBlinking = false
        this.blinkDuration = 0.12

        // Atlas UV offsets (2x2 grid)
        this._uvOpen = new THREE.Vector2(0, 0)
        this._uvClosed = new THREE.Vector2(0, 0.5)
        this._uvRest = new THREE.Vector2(0.5, 0)

        // Input
        this.keys = { w: false, a: false, s: false, d: false, shift: false }

        this.setModel()
        this.setAnimation()
        this.setInput()

        setTimeout(() => this.setPhysics(), 200)

        if (this.debug.active) this.setDebug()
    }

    _randomBlinkInterval() {
        return 2.0 + Math.random() * 4.0
    }

    // ─── Model & Atlas ──────────────────────────────────────────────────

    setModel() {
        this.resource = this.resources.items.humanModel

        this.container = new THREE.Group()
        this.container.name = 'CharacterContainer'
        this.container.position.copy(this.position)

        this.model = this.resource.scene
        this.model.name = 'CharacterModel'
        this.model.scale.set(1, 1, 1)

        const box = new THREE.Box3().setFromObject(this.model)
        const modelOffsetY = -this.capsuleCenterY - box.min.y - 0.01
        this.model.position.set(0, modelOffsetY, 0)

        this._applyAtlas()

        this.container.add(this.model)
        this.scene.add(this.container)
    }

    _applyAtlas() {
        const atlas = this.resources.items.humanAtlas
        if (!atlas) return

        this.atlas = atlas
        this.atlas.repeat.set(0.5, 0.5)
        this.atlas.offset.copy(this._uvOpen)

        this.model.traverse((child) => {
            if (!child.isMesh) return
            child.castShadow = true
            child.receiveShadow = true

            if (!child.material) child.material = new THREE.MeshStandardMaterial()
            child.material.map = this.atlas
            child.material.metalness = 0
            child.material.roughness = 1
            child.material.needsUpdate = true
        })
    }

    // ─── Animations ─────────────────────────────────────────────────────

    setAnimation() {
        const clips = this.resource?.animations
        if (!clips?.length) return

        this.mixer = new THREE.AnimationMixer(this.model)
        this.actions = {}

        for (const clip of clips) {
            const n = clip.name.toLowerCase()
            if (n.includes('walk')) this.actions.walk = this.mixer.clipAction(clip)
            else if (n.includes('happy')) this.actions.happy = this.mixer.clipAction(clip)
            else if (n.includes('run')) this.actions.running = this.mixer.clipAction(clip)
            else if (n.includes('rest')) this.actions.rest = this.mixer.clipAction(clip)
        }

        for (const [key, action] of Object.entries(this.actions)) {
            if (key === 'rest') {
                action.setLoop(THREE.LoopOnce)
                action.clampWhenFinished = true
            } else {
                action.setLoop(THREE.LoopRepeat)
            }
            action.play()
            action.setEffectiveWeight(0)
        }

        this.activeAction = this.actions.happy ?? Object.values(this.actions)[0]
        if (this.activeAction) this.activeAction.setEffectiveWeight(1)

        this.mixer.addEventListener('finished', (e) => {
            if (e.action === this.actions.rest) this._transitionTo('idle')
        })
    }

    _transitionTo(newState) {
        const map = { idle: 'happy', walking: 'walk', running: 'running', resting: 'rest' }
        const newAction = this.actions?.[map[newState]]
        if (!newAction) return
        if (newAction === this.activeAction) { this.state = newState; return }

        const fade = newState === 'resting' ? 0.4 : 0.25
        newAction.reset()
        newAction.setEffectiveTimeScale(1)
        newAction.setEffectiveWeight(1)
        if (this.activeAction) newAction.crossFadeFrom(this.activeAction, fade, true)

        this.activeAction = newAction
        this.state = newState
    }

    // ─── Input ──────────────────────────────────────────────────────────

    setInput() {
        this._onKeyDownBound = (e) => this._onKeyChange(e, true)
        this._onKeyUpBound = (e) => this._onKeyChange(e, false)
        window.addEventListener('keydown', this._onKeyDownBound)
        window.addEventListener('keyup', this._onKeyUpBound)
    }

    _onKeyChange(event, pressed) {
        const key = event.key.toLowerCase()
        if (key in this.keys) this.keys[key] = pressed
    }

    // ─── Physics ────────────────────────────────────────────────────────

    setPhysics() {
        if (!this.physics.world) return
        const RAPIER = this.physics.RAPIER

        this.position.y = this.capsuleCenterY + this.spawnOffsetY

        const rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(this.position.x, this.position.y, this.position.z)
        this.rigidBody = this.physics.world.createRigidBody(rbDesc)

        const colDesc = RAPIER.ColliderDesc.capsule(this.capsuleHalfHeight, this.capsuleRadius)
            .setActiveCollisionTypes(
                RAPIER.ActiveCollisionTypes.DEFAULT |
                RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED
            )
        this.collider = this.physics.world.createCollider(colDesc, this.rigidBody)

        this.characterController = this.physics.world.createCharacterController(0.01)
        this.characterController.setApplyImpulsesToDynamicBodies(true)
        this.characterController.setMaxSlopeClimbAngle(Math.PI * 0.25)
        this.characterController.setMinSlopeSlideAngle(Math.PI * 0.3)
        this.characterController.enableAutostep(0.25, 0.2, false)
        this.characterController.enableSnapToGround(0.1)

        this.previousPosition = this.position.clone()
        this.container.position.copy(this.position)
    }

    // ─── Per-frame helpers ──────────────────────────────────────────────

    _updateState(deltaTime, isMoving) {
        const mobileActions = this.experience.mobileControls?.getActions()
        this.isSprinting = this.keys.shift || (mobileActions?.button1 ?? false)

        if (this.state === 'running') this.runDuration += deltaTime

        // Allow interrupting rest by moving
        if (this.state === 'resting') {
            if (isMoving) this._transitionTo(this.isSprinting ? 'running' : 'walking')
            return
        }

        if (isMoving) {
            if (this.isSprinting) {
                if (this.state !== 'running') this._transitionTo('running')
            } else {
                if (this.state !== 'walking') this._transitionTo('walking')
            }
        } else {
            if (this.runDuration >= this.restAfterRunThreshold) {
                this._transitionTo('resting')
            } else if (this.state !== 'idle') {
                this._transitionTo('idle')
            }
            this.runDuration = 0
        }
    }

    _updateBlinking(deltaTime) {
        if (!this.atlas) return

        if (this.state === 'resting') {
            this.atlas.offset.copy(this._uvRest)
            return
        }

        this.blinkTimer += deltaTime

        if (this.isBlinking) {
            if (this.blinkTimer >= this.blinkDuration) {
                this.isBlinking = false
                this.blinkTimer = 0
                this.nextBlinkTime = this._randomBlinkInterval()
                this.atlas.offset.copy(this._uvOpen)
            }
        } else {
            if (this.blinkTimer >= this.nextBlinkTime) {
                this.isBlinking = true
                this.blinkTimer = 0
                this.atlas.offset.copy(this._uvClosed)
            }
        }
    }

    // ─── Main update ────────────────────────────────────────────────────

    update() {
        const dt = this.time.delta * 0.001
        if (!this.container) return

        // Gather input direction
        const dir = new THREE.Vector3()
        if (this.keys.w) dir.z -= 1
        if (this.keys.s) dir.z += 1
        if (this.keys.a) dir.x -= 1
        if (this.keys.d) dir.x += 1

        if (this.experience.mobileControls?.isActive()) {
            const m = this.experience.mobileControls.getMovement()
            dir.x += m.x * m.force
            dir.z -= m.y * m.force
        }

        const isMoving = dir.lengthSq() > 0.0001

        // State machine
        this._updateState(dt, isMoving)

        // Blinking
        this._updateBlinking(dt)

        // Animation mixer
        if (this.mixer) this.mixer.update(dt)

        // Speed
        const speed = (this.isSprinting && isMoving) ? this.runSpeed : this.walkSpeed

        // Physics movement
        if (this.characterController && this.collider && this.rigidBody) {
            if (this.isGrounded && this.verticalVelocity < 0) this.verticalVelocity = 0
            this.verticalVelocity += this.gravity * dt

            if (isMoving) dir.normalize()

            const desired = {
                x: isMoving ? dir.x * speed * dt : 0,
                y: this.verticalVelocity * dt,
                z: isMoving ? dir.z * speed * dt : 0
            }

            this.characterController.computeColliderMovement(this.collider, desired)
            const corrected = this.characterController.computedMovement()

            const cur = this.rigidBody.translation()
            const next = {
                x: cur.x + corrected.x,
                y: cur.y + corrected.y,
                z: cur.z + corrected.z
            }

            this.rigidBody.setNextKinematicTranslation(next)
            this.position.set(next.x, next.y, next.z)
            this.container.position.copy(this.position)

            this.isGrounded = this.characterController.computedGrounded()
            if (this.isGrounded && this.verticalVelocity < 0) this.verticalVelocity = 0

            // Smooth rotation — exponential decay, shortest path, no overshoot
            if (isMoving) {
                const target = Math.atan2(dir.x, dir.z)
                const diff = Math.atan2(Math.sin(target - this.container.rotation.y),
                                        Math.cos(target - this.container.rotation.y))
                this.container.rotation.y += diff * (1.0 - Math.exp(-this.rotationSpeed * dt))
            }
        } else {
            if (this.rigidBody) {
                const t = this.rigidBody.translation()
                this.position.set(t.x, t.y, t.z)
            }
            this.container.position.copy(this.position)
        }
    }

    // ─── Debug GUI ──────────────────────────────────────────────────────

    setDebug() {
        const f = this.debug.ui.addFolder('Character')
        f.close()

        f.add(this, 'walkSpeed', 0.5, 3.0, 0.1).name('Walk Speed')
        f.add(this, 'runSpeed', 1.5, 5.0, 0.1).name('Run Speed')
        f.add(this, 'rotationSpeed', 2.0, 30.0, 0.5).name('Rotation Smoothing')
        f.add(this, 'restAfterRunThreshold', 0.5, 5.0, 0.1).name('Rest After Run (s)')
        f.add(this, 'blinkDuration', 0.05, 0.5, 0.01).name('Blink Duration')
    }
}
