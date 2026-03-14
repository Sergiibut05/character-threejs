import * as THREE from 'three'
import Experience from '../Experience.js'
import FrisbeeFlightController from './FrisbeeFlightController.js'
import DogCompanion from './DogCompanion.js'

export default class FrisbeeMinigame {
    constructor() {
        this.experience = new Experience()
        this.state = 'idle'

        // Tuning
        this.throwReleaseTime = 32 / 24
        this.powerHoldMaxMs = 1200
        this.launchSpeedMin = 8
        this.launchSpeedMax = 18
        this.aimSensitivity = 1.5
        this.tiltSensitivity = 2.5
        this.launchUpAngle = 0.25
        this.catchTriggerHeight = 1.8
        this.catchTriggerRadius = 2.5
        this.catchMinFlightTime = 1.5

        // Runtime
        this.aimYaw = 0
        this.tiltAngle = 0
        this.power = 0
        this.isCharging = false
        this.chargeStartTime = 0
        this.enterHeld = false
        this.endTimer = 0

        this.flightController = new FrisbeeFlightController()
        this.dog = new DogCompanion()
        this.setupUI()
        this.setupInput()
    }

    // ─── UI ──────────────────────────────────────────────────────────────

    setupUI() {
        this.powerBarContainer = document.createElement('div')
        this.powerBarContainer.className = 'frisbee-power-bar'

        this.powerBarFill = document.createElement('div')
        this.powerBarFill.className = 'frisbee-power-fill'

        this.powerBarSweet = document.createElement('div')
        this.powerBarSweet.className = 'frisbee-power-sweet'

        this.tiltIndicator = document.createElement('div')
        this.tiltIndicator.className = 'frisbee-tilt-indicator'
        this.tiltArrowL = document.createElement('span')
        this.tiltArrowL.className = 'frisbee-tilt-arrow left'
        this.tiltArrowL.textContent = '◀'
        this.tiltArrowR = document.createElement('span')
        this.tiltArrowR.className = 'frisbee-tilt-arrow right'
        this.tiltArrowR.textContent = '▶'

        this.powerBarContainer.appendChild(this.powerBarSweet)
        this.powerBarContainer.appendChild(this.powerBarFill)
        this.powerBarContainer.appendChild(this.tiltIndicator)
        this.powerBarContainer.appendChild(this.tiltArrowL)
        this.powerBarContainer.appendChild(this.tiltArrowR)
        document.body.appendChild(this.powerBarContainer)
        this.powerBarContainer.style.display = 'none'
    }

    _updateTiltUI() {
        const pct = this.tiltAngle * 50
        this.tiltIndicator.style.left = `${50 + pct}%`

        const absT = Math.abs(this.tiltAngle)
        this.tiltArrowL.style.opacity = this.tiltAngle < -0.05 ? `${absT}` : '0.15'
        this.tiltArrowR.style.opacity = this.tiltAngle > 0.05 ? `${absT}` : '0.15'
    }

    // ─── Input ───────────────────────────────────────────────────────────

    setupInput() {
        this._onKeyDown = (e) => {
            if (e.key === 'Enter') this.enterHeld = true
        }
        this._onKeyUp = (e) => {
            if (e.key === 'Enter') {
                if (this.isCharging && this.state === 'charge') {
                    this.releaseThrow()
                }
                this.enterHeld = false
            }
        }
        window.addEventListener('keydown', this._onKeyDown)
        window.addEventListener('keyup', this._onKeyUp)
    }

    _isMobileHolding() {
        const actions = this.experience.mobileControls?.getActions?.()
        return actions?.button2 === true
    }

    // ─── Start ───────────────────────────────────────────────────────────

    async start() {
        if (this.state !== 'idle') return

        const character = this.experience.world.character
        if (!character) return

        character.movementLocked = true
        this.state = 'intro'

        this.aimYaw = character.container.rotation.y
        this.tiltAngle = 0
        this.power = 0
        this.isCharging = false
        this.enterHeld = false

        const prompt = this.experience.world.activityPrompt
        if (prompt?.el) prompt.el.style.display = 'none'

        const handBone = character.getRightHandBone()
        if (handBone) {
            this.flightController.attachToHand(handBone)
        }

        // Show dog next to the player before the iris opens
        this.dog.show(character.position, this.aimYaw)

        const renderer = this.experience.renderer
        renderer.setIrisTransitionEnabled(true)
        renderer.setIrisTransitionSize(0.0)

        await this.experience.waitMs(350)

        this._snapCameraBehindCharacter()
        this.experience.camera.setMode('frisbeeAim')

        await this.experience.waitMs(150)

        await this.experience.animateValue(
            0.0, 1.35, 800,
            (v) => renderer.setIrisTransitionSize(v)
        )
        renderer.setIrisTransitionEnabled(false)

        this.state = 'windUp'
        character.startThrowAnimation(this.throwReleaseTime)
    }

    _snapCameraBehindCharacter() {
        const cam = this.experience.camera
        const character = this.experience.world.character
        if (!character) return

        const yaw = this.aimYaw
        const pos = character.position.clone()
        pos.x -= Math.sin(yaw) * cam.aimBehindDist
        pos.y += cam.aimHeight
        pos.z -= Math.cos(yaw) * cam.aimBehindDist

        cam.smoothPosition.copy(pos)
        cam.instance.position.copy(pos)

        const lookTarget = character.position.clone()
        lookTarget.y += cam.aimLookHeight
        cam.smoothLookAt.copy(lookTarget)
        cam.instance.lookAt(lookTarget)
    }

    // ─── Per-frame ───────────────────────────────────────────────────────

    update() {
        if (this.state === 'idle' || this.state === 'intro') return

        const dt = this.experience.time.delta * 0.001
        const character = this.experience.world.character
        if (!character) return

        // Dog mixer ticks in every active state
        if (this.state !== 'flight' && this.state !== 'dogChasing' &&
            this.state !== 'dogCatch' && this.state !== 'dogReturn') {
            // In these states the dog update is called explicitly below;
            // for others just tick the mixer so idle animation plays
            if (this.dog && this.dog.state !== 'hidden') {
                this.dog.update(dt)
            }
        }

        if (this.state === 'windUp') {
            this.updateAim(dt, character)
            if (character.throwPaused) {
                this.state = 'charge'
                this.powerBarContainer.style.display = 'flex'
                this._updateTiltUI()
            }
            return
        }

        if (this.state === 'charge') {
            this.updateCharge(dt, character)
            return
        }

        if (this.state === 'flight') {
            this._updateFlight(dt)
            return
        }

        if (this.state === 'dogChasing') {
            this._updateDogChasing(dt)
            return
        }

        if (this.state === 'dogCatch') {
            this._updateDogCatch(dt)
            return
        }

        if (this.state === 'dogReturn') {
            this._updateDogReturn(dt)
            return
        }

        if (this.state === 'ending') {
            this.endTimer += dt
            if (this.endTimer > 1.0) {
                this.exitMinigame()
            }
            return
        }
    }

    // ─── Flight + dog chase ─────────────────────────────────────────────

    _updateFlight(dt) {
        this.flightController.update(dt)
        this.dog.update(dt)

        const frisbeePos = this.flightController.getPosition()
        this.experience.camera.frisbeeTarget = frisbeePos

        // Check catch trigger only after minimum flight time
        const flightTime = this.flightController.flightTime
        if (flightTime > this.catchMinFlightTime &&
            (this.dog.state === 'chasing' || this.dog.state === 'arriving')) {
            const dogPos = this.dog.position
            const hDist = Math.sqrt(
                (frisbeePos.x - dogPos.x) ** 2 +
                (frisbeePos.z - dogPos.z) ** 2
            )

            if (frisbeePos.y < this.catchTriggerHeight && hDist < this.catchTriggerRadius) {
                this.flightController.active = false
                this.dog.triggerCatch(this.flightController.mesh, frisbeePos)
                this.state = 'dogCatch'
                return
            }
        }

        // Frisbee landed without dog catching in the air
        if (!this.flightController.active) {
            if (this.dog.state === 'arriving' || this.dog.state === 'idle') {
                this.dog.triggerCatch(this.flightController.mesh, frisbeePos)
                this.state = 'dogCatch'
            } else {
                this.state = 'dogChasing'
            }
        }
    }

    _updateDogChasing(dt) {
        this.dog.update(dt)
        this.experience.camera.frisbeeTarget = this.dog.position

        // Check catch trigger while still running
        const frisbeePos = this.flightController.getPosition()
        const dogPos = this.dog.position
        const hDist = Math.sqrt(
            (frisbeePos.x - dogPos.x) ** 2 +
            (frisbeePos.z - dogPos.z) ** 2
        )
        if (hDist < this.catchTriggerRadius * 1.5) {
            this.dog.triggerCatch(this.flightController.mesh, frisbeePos)
            this.state = 'dogCatch'
            return
        }

        if (this.dog.state === 'arriving' || this.dog.state === 'idle') {
            this.dog.triggerCatch(this.flightController.mesh, frisbeePos)
            this.state = 'dogCatch'
        }
    }

    _updateDogCatch(dt) {
        this.dog.update(dt)
        this.experience.camera.frisbeeTarget = this.dog.position
        this.experience.camera._flightTimer = 0

        if (this.dog.state === 'caught') {
            const character = this.experience.world.character
            this.dog.startReturn(character.position)
            this.state = 'dogReturn'
        }
    }

    _updateDogReturn(dt) {
        this.dog.update(dt)
        this.experience.camera.frisbeeTarget = this.dog.position

        if (this.dog.state === 'done') {
            this.state = 'ending'
            this.endTimer = 0
        }
    }

    // ─── Aim / Charge ───────────────────────────────────────────────────

    updateAim(dt, character) {
        const keys = character.keys
        let aimDelta = 0

        if (keys.a) aimDelta += this.aimSensitivity * dt
        if (keys.d) aimDelta -= this.aimSensitivity * dt

        if (this.experience.mobileControls?.isActive()) {
            const m = this.experience.mobileControls.getMovement()
            aimDelta += m.x * this.aimSensitivity * dt
        }

        this.aimYaw += aimDelta
        character.container.rotation.y = this.aimYaw
    }

    updateCharge(dt, character) {
        const holding = this.enterHeld || this._isMobileHolding()
        const keys = character.keys

        if (holding && !this.isCharging) {
            this.isCharging = true
            this.chargeStartTime = performance.now()
        }

        if (this.isCharging && holding) {
            const elapsed = performance.now() - this.chargeStartTime
            this.power = Math.min(elapsed / this.powerHoldMaxMs, 1)
            this.powerBarFill.style.width = `${this.power * 100}%`

            let tiltDelta = 0
            if (keys.a) tiltDelta -= this.tiltSensitivity * dt
            if (keys.d) tiltDelta += this.tiltSensitivity * dt

            if (this.experience.mobileControls?.isActive()) {
                const m = this.experience.mobileControls.getMovement()
                tiltDelta -= m.x * this.tiltSensitivity * dt
            }

            this.tiltAngle = THREE.MathUtils.clamp(this.tiltAngle + tiltDelta, -1, 1)
            this.flightController.setTilt(this.tiltAngle)
            this._updateTiltUI()
        } else if (!this.isCharging) {
            this.updateAim(dt, character)
        }

        const mobileNow = this._isMobileHolding()
        if (this.isCharging && this._prevMobileHold && !mobileNow) {
            this.releaseThrow()
        }
        this._prevMobileHold = mobileNow
    }

    // ─── Release ─────────────────────────────────────────────────────────

    releaseThrow() {
        if (this.state !== 'charge') return
        this.state = 'flight'

        const character = this.experience.world.character
        character.continueThrowAnimation()

        const speed = this.launchSpeedMin +
            this.power * (this.launchSpeedMax - this.launchSpeedMin)

        const yaw = this.aimYaw
        const direction = new THREE.Vector3(
            Math.sin(yaw),
            this.launchUpAngle,
            Math.cos(yaw)
        ).normalize()

        const handWorldPos = this.flightController.detachFromHand()
        const launchPos = handWorldPos || character.position.clone()
        if (!handWorldPos) {
            launchPos.y += 1.2
            launchPos.x += Math.sin(yaw) * 0.5
            launchPos.z += Math.cos(yaw) * 0.5
        }

        // Predict where the disc will land so the dog knows where to run
        const prediction = this.flightController.predictLanding(
            launchPos, direction, speed, this.tiltAngle
        )

        this.flightController.launch(launchPos, direction, speed, this.tiltAngle)

        this.powerBarContainer.style.display = 'none'

        this.experience.camera.frisbeeTarget = this.flightController.getPosition()
        this.experience.camera.setMode('frisbeeFlight')

        // Dog starts chasing toward the predicted landing spot
        this.dog.startChase(prediction.point, prediction.flightTime)
    }

    // ─── Exit ────────────────────────────────────────────────────────────

    async exitMinigame() {
        if (this.state === 'idle') return
        this.state = 'exiting'

        const renderer = this.experience.renderer

        renderer.setIrisTransitionEnabled(true)
        await this.experience.animateValue(
            1.35, 0.0, 600,
            (v) => renderer.setIrisTransitionSize(v)
        )

        // Detach frisbee from dog before resetting flight controller
        this.dog.detachFrisbee()

        const character = this.experience.world.character
        character.resetAfterThrow()
        this.flightController.reset()
        this.dog.reset()

        this.experience.camera.setMode('follow')
        this.experience.camera.frisbeeTarget = null

        const prompt = this.experience.world.activityPrompt
        if (prompt?.el) prompt.el.style.display = ''

        this.powerBarFill.style.width = '0%'
        this.tiltIndicator.style.left = '50%'
        this.aimYaw = 0
        this.tiltAngle = 0
        this.power = 0
        this.isCharging = false
        this.enterHeld = false

        await this.experience.waitMs(300)

        await this.experience.animateValue(
            0.0, 1.35, 800,
            (v) => renderer.setIrisTransitionSize(v)
        )
        renderer.setIrisTransitionEnabled(false)

        this.state = 'idle'
    }

    // ─── Cleanup ─────────────────────────────────────────────────────────

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown)
        window.removeEventListener('keyup', this._onKeyUp)
        this.flightController.destroy()
        this.dog.destroy()
        this.powerBarContainer?.remove()
    }
}
