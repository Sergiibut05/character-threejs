import * as THREE from 'three'
import Experience from '../Experience.js'
import FrisbeeFlightController from './FrisbeeFlightController.js'
import DogCompanion from './DogCompanion.js'
import ObjectiveMarker from './ObjectiveMarker.js'
import ScoreFeedback from './ScoreFeedback.js'
import Balloon from './Balloon.js'

const TARGET_SPOTS = [
    { forward: 15, lateral: 0 },
    { forward: 12, lateral: 4 },
    { forward: 12, lateral: -4 },
    { forward: 18, lateral: 2 },
    { forward: 18, lateral: -2 },
    { forward: 10, lateral: 0 }
]

export default class FrisbeeMinigame {
    constructor() {
        this.experience = new Experience()
        this.state = 'idle'

        // Tuning
        this.throwReleaseTime = 32 / 24
        this.launchSpeedMin = 3.0
        this.launchSpeedMax = 5.5
        this.aimSensitivity = 1.5
        this.tiltSensitivity = 2.5
        this.launchUpAngle = 0.38
        this.catchTriggerHeight = 1.8
        this.catchTriggerRadius = 2.5
        this.catchMinFlightTime = 1.5
        this.aimYawCenter = 0
        this.aimYawHalfRange = THREE.MathUtils.degToRad(70)
        this.fieldMargin = 1.5
        this.isBadThrow = false
        this._pitchBBox = null

        // Power oscillator
        this._powerPhase = 0
        this._powerDir = 1
        this._powerSpeed = 1.2
        this._chargeLocked = false
        this._prevMobileHold = false

        // Runtime
        this.aimYaw = 0
        this.tiltAngle = 0
        this.power = 0
        this.enterHeld = false
        this.endTimer = 0

        // Scoring
        this.targetCenter = new THREE.Vector3()
        this.dogCatchPosition = new THREE.Vector3()
        this._charGroundPos = new THREE.Vector3() // reusable — avoids alloc per frame
        this._catchSequenceTimer = -1
        this._bullseyeShown = false
        this._scoreShown = false

        this.flightController = new FrisbeeFlightController()
        this.dog = new DogCompanion()
        this.objectiveMarker = new ObjectiveMarker()
        this.scoreFeedback = new ScoreFeedback()
        this.balloon = new Balloon()
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
            if (e.key === 'Enter') {
                this.enterHeld = true
                if (this.state === 'charge') {
                    this._handleChargePress()
                }
            }
        }
        this._onKeyUp = (e) => {
            if (e.key === 'Enter') this.enterHeld = false
        }
        window.addEventListener('keydown', this._onKeyDown)
        window.addEventListener('keyup', this._onKeyUp)
    }

    _handleChargePress() {
        if (!this._chargeLocked) {
            this._chargeLocked = true
            this.powerBarContainer.style.display = 'flex'
            this._updateTiltUI()
        } else {
            this.releaseThrow()
        }
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
        this.isBadThrow = false

        // Get pitch bbox for aim clamping & target placement
        this._pitchBBox = this.experience.world.getPitchBBox?.() ?? null

        // Compute aim center toward pitch
        if (this._pitchBBox) {
            const center = new THREE.Vector3()
            this._pitchBBox.getCenter(center)
            const dx = center.x - character.position.x
            const dz = center.z - character.position.z
            this.aimYawCenter = Math.atan2(dx, dz)
            this.aimYaw = this.aimYawCenter
            character.container.rotation.y = this.aimYaw
        } else {
            this.aimYaw = character.container.rotation.y
            this.aimYawCenter = this.aimYaw
        }

        this.tiltAngle = 0
        this.power = 0
        this._powerPhase = 0
        this._powerDir = 1
        this._chargeLocked = false
        this.enterHeld = false

        const prompt = this.experience.world.activityPrompt
        if (prompt?.el) prompt.el.style.display = 'none'

        // Pick a semi-random target
        this._pickTarget(character)

        const handBone = character.getRightHandBone()
        if (handBone) {
            this.flightController.attachToHand(handBone)
        }

        this.dog.show(character.position, this.aimYaw, character.groundY)
        this.flightController.groundY = character.groundY

        this.objectiveMarker.createAimLine()

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

        this.objectiveMarker.showArrow(this.targetCenter)
        this.objectiveMarker.showAimLine()
        this._charGroundPos.set(character.container.position.x, character.groundY, character.container.position.z)
        this.objectiveMarker.updateAimLine(0, 1, this._charGroundPos, this.aimYaw)

        this._placeBalloon(character)

        this.state = 'windUp'
        character.startThrowAnimation(this.throwReleaseTime)
    }

    _placeBalloon(character) {
        const groundY = character.groundY
        if (this._pitchBBox) {
            const m = this.fieldMargin + 1
            const minX = this._pitchBBox.min.x + m
            const maxX = this._pitchBBox.max.x - m
            const minZ = this._pitchBBox.min.z + m
            const maxZ = this._pitchBBox.max.z - m
            const pos = new THREE.Vector3(
                minX + Math.random() * (maxX - minX),
                groundY + 2.2 + Math.random() * 1.0,
                minZ + Math.random() * (maxZ - minZ)
            )
            this.balloon.show(pos)
            return
        }

        // Fallback (dev light mode)
        const yaw = this.aimYaw
        const fw = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
        const rt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
        const side = Math.random() < 0.5 ? 1 : -1
        const pos = character.position.clone()
        pos.addScaledVector(fw, 11 + Math.random() * 4)
        pos.addScaledVector(rt, side * (5 + Math.random() * 2))
        pos.y = groundY + 2.2 + Math.random() * 1.0
        this.balloon.show(pos)
    }

    _pickTarget(character) {
        const groundY = character.groundY
        if (this._pitchBBox) {
            const m = this.fieldMargin
            const minX = this._pitchBBox.min.x + m
            const maxX = this._pitchBBox.max.x - m
            const minZ = this._pitchBBox.min.z + m
            const maxZ = this._pitchBBox.max.z - m

            this.targetCenter.set(
                minX + Math.random() * (maxX - minX),
                groundY,
                minZ + Math.random() * (maxZ - minZ)
            )
            return
        }

        // Fallback (dev light mode)
        const spot = TARGET_SPOTS[Math.floor(Math.random() * TARGET_SPOTS.length)]
        const yaw = this.aimYaw
        const fw = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
        const rt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))

        this.targetCenter.copy(character.position)
        this.targetCenter.addScaledVector(fw, spot.forward)
        this.targetCenter.addScaledVector(rt, spot.lateral)
        this.targetCenter.y = groundY
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

        // Tick objective marker and balloon every active frame
        this.objectiveMarker.update(dt)
        this.balloon.update(dt)

        if (this.state !== 'flight' && this.state !== 'dogChasing' &&
            this.state !== 'dogCatch' && this.state !== 'dogReturn') {
            if (this.dog && this.dog.state !== 'hidden') {
                this.dog.update(dt)
            }
        }

        if (this.state === 'windUp') {
            this.updateAim(dt, character)
            this._charGroundPos.set(character.container.position.x, character.groundY, character.container.position.z)
            this.objectiveMarker.updateAimLine(0, 1, this._charGroundPos, this.aimYaw)
            if (character.throwPaused) {
                this.state = 'charge'
                this._powerPhase = 0
                this._powerDir = 1
                this._chargeLocked = false
                this._prevMobileHold = false
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

        if (this.state === 'badThrowEnding') {
            this._updateBadThrowEnding(dt)
            return
        }

        if (this.state === 'ending') {
            this.endTimer += dt
            this._updateCatchSequence(dt)
            if (this.endTimer > 3.0) {
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

        // Balloon collision
        if (this.balloon.checkCollision(frisbeePos)) {
            this.balloon.pop()
        }

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
                this.dogCatchPosition.copy(dogPos)
                this.dog.triggerCatch(this.flightController.mesh, frisbeePos)
                this.state = 'dogCatch'
                this._onDogCatchStart()
                return
            }
        }

        // Frisbee landed without dog catching in the air
        if (!this.flightController.active) {
            if (this.isBadThrow) {
                this._onBadThrowLanded()
                return
            }
            if (this.dog.state === 'arriving' || this.dog.state === 'idle') {
                this.dogCatchPosition.copy(this.dog.position)
                this.dog.triggerCatch(this.flightController.mesh, frisbeePos)
                this.state = 'dogCatch'
                this._onDogCatchStart()
            } else {
                this.state = 'dogChasing'
            }
        }
    }

    _updateDogChasing(dt) {
        this.dog.update(dt)
        this.experience.camera.frisbeeTarget = this.dog.position

        const frisbeePos = this.flightController.getPosition()
        const dogPos = this.dog.position
        const hDist = Math.sqrt(
            (frisbeePos.x - dogPos.x) ** 2 +
            (frisbeePos.z - dogPos.z) ** 2
        )
        if (hDist < this.catchTriggerRadius * 1.5) {
            this.dogCatchPosition.copy(dogPos)
            this.dog.triggerCatch(this.flightController.mesh, frisbeePos)
            this.state = 'dogCatch'
            this._onDogCatchStart()
            return
        }

        if (this.dog.state === 'arriving' || this.dog.state === 'idle') {
            this.dogCatchPosition.copy(dogPos)
            this.dog.triggerCatch(this.flightController.mesh, frisbeePos)
            this.state = 'dogCatch'
            this._onDogCatchStart()
        }
    }

    _onDogCatchStart() {
        this.objectiveMarker.hideArrow()
        this.objectiveMarker.showCheck(this.dogCatchPosition)
        this._catchSequenceTimer = 0
        this._bullseyeShown = false
        this._scoreShown = false
        this.experience.camera._catchSmoothLook = true
    }

    _updateCatchSequence(dt) {
        if (this._catchSequenceTimer < 0) return
        this._catchSequenceTimer += dt

            if (!this._bullseyeShown && this._catchSequenceTimer >= 2.0) {
                this._bullseyeShown = true
                this.objectiveMarker.hideCheck()
                this.objectiveMarker.showBullseye(this.targetCenter)
            }

            if (!this._scoreShown && this._catchSequenceTimer >= 2.5) {
            this._scoreShown = true
            this.scoreFeedback.evaluate(this.dogCatchPosition, this.targetCenter)
        }
    }

    _onBadThrowLanded() {
        this.objectiveMarker.hideArrow()
        this.state = 'badThrowEnding'
        this.endTimer = 0
        this._badThrowShown = false
    }

    _updateBadThrowEnding(dt) {
        this.endTimer += dt
        this.dog.update(dt)
        this.experience.camera.frisbeeTarget = this.dog.position

        if (!this._badThrowShown && this.endTimer >= 0.8) {
            this._badThrowShown = true
            this.scoreFeedback.showBadThrow()
        }

        if (this.endTimer > 3.5) {
            this.exitMinigame()
        }
    }

    _updateDogCatch(dt) {
        this.dog.update(dt)
        this.experience.camera.frisbeeTarget = this.dog.position
        this._updateCatchSequence(dt)

        if (this.dog.state === 'caught') {
            const cameraYaw = this.experience.camera._throwYaw
            this.dog.startPostCatchWalk(cameraYaw)
            this.state = 'dogReturn'
        }
    }

    _updateDogReturn(dt) {
        this.dog.update(dt)
        this.experience.camera.frisbeeTarget = this.dog.position
        this._updateCatchSequence(dt)

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
            aimDelta -= m.x * this.aimSensitivity * dt
        }

        this.aimYaw += aimDelta

        // Clamp within ±halfRange of center (pitch-aware)
        if (this._pitchBBox) {
            const half = this.aimYawHalfRange
            const diff = Math.atan2(
                Math.sin(this.aimYaw - this.aimYawCenter),
                Math.cos(this.aimYaw - this.aimYawCenter)
            )
            const clamped = THREE.MathUtils.clamp(diff, -half, half)
            this.aimYaw = this.aimYawCenter + clamped
        }

        character.container.rotation.y = this.aimYaw
    }

    updateCharge(dt, character) {
        // Auto-oscillate the power marker (always running)
        this._powerPhase += dt * this._powerSpeed * this._powerDir
        if (this._powerPhase >= 1) { this._powerPhase = 1; this._powerDir = -1 }
        if (this._powerPhase <= 0) { this._powerPhase = 0; this._powerDir = 1 }
        this.power = this._powerPhase
        this.powerBarFill.style.left = `${this.power * 100}%`

        if (this._chargeLocked) {
            // Phase 2: tilt control (A/D or joystick)
            const keys = character.keys
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
            this._charGroundPos.set(character.container.position.x, character.groundY, character.container.position.z)
            this.objectiveMarker.updateAimLine(this.tiltAngle, 1, this._charGroundPos, this.aimYaw)
        } else {
            // Phase 1: aiming (A/D rotates character)
            this.updateAim(dt, character)
            this._charGroundPos.set(character.container.position.x, character.groundY, character.container.position.z)
            this.objectiveMarker.updateAimLine(0, 1, this._charGroundPos, this.aimYaw)
        }

        // Mobile single-press detection (mirrors keyboard two-step)
        const mobileNow = this._isMobileHolding()
        if (mobileNow && !this._prevMobileHold) {
            this._handleChargePress()
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

        // Check if landing is outside the pitch
        this.isBadThrow = false
        if (this._pitchBBox) {
            const lp = prediction.point
            const m = this.fieldMargin
            if (lp.x < this._pitchBBox.min.x - m || lp.x > this._pitchBBox.max.x + m ||
                lp.z < this._pitchBBox.min.z - m || lp.z > this._pitchBBox.max.z + m) {
                this.isBadThrow = true
            }
        }

        this.flightController.launch(launchPos, direction, speed, this.tiltAngle)

        this.powerBarContainer.style.display = 'none'
        this.objectiveMarker.hideAimLine()

        this.experience.camera.frisbeeTarget = this.flightController.getPosition()
        this.experience.camera.setMode('frisbeeFlight')

        // Dog starts chasing toward the predicted landing spot
        this.dog.startChase(prediction.point, prediction.flightTime, { badThrow: this.isBadThrow })
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

        this.dog.detachFrisbee()

        const character = this.experience.world.character
        character.resetAfterThrow()
        this.flightController.reset()
        this.dog.reset()
        this.objectiveMarker.reset()
        this.scoreFeedback.hide()
        this.balloon.hide()
        this._catchSequenceTimer = -1
        this.isBadThrow = false

        this.experience.camera.setMode('follow')
        this.experience.camera.frisbeeTarget = null

        const prompt = this.experience.world.activityPrompt
        if (prompt?.el) prompt.el.style.display = ''

        this.powerBarFill.style.left = '0%'
        this.tiltIndicator.style.left = '50%'
        this.aimYaw = 0
        this.tiltAngle = 0
        this.power = 0
        this._powerPhase = 0
        this._powerDir = 1
        this._chargeLocked = false
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
        this.objectiveMarker.destroy()
        this.scoreFeedback.destroy()
        this.balloon.destroy()
        this.powerBarContainer?.remove()
    }
}
