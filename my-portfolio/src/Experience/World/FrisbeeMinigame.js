import * as THREE from 'three'
import Experience from '../Experience.js'
import FrisbeeFlightController from './FrisbeeFlightController.js'

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
        this.launchUpAngle = 0.25

        // Runtime
        this.aimYaw = 0
        this.power = 0
        this.isCharging = false
        this.chargeStartTime = 0
        this.enterHeld = false
        this.endTimer = 0

        this.flightController = new FrisbeeFlightController()
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

        this.powerBarContainer.appendChild(this.powerBarSweet)
        this.powerBarContainer.appendChild(this.powerBarFill)
        document.body.appendChild(this.powerBarContainer)
        this.powerBarContainer.style.display = 'none'
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

        // Store initial aim yaw from character's current facing
        this.aimYaw = character.container.rotation.y
        this.power = 0
        this.isCharging = false
        this.enterHeld = false

        // Hide activity prompt
        const prompt = this.experience.world.activityPrompt
        if (prompt?.el) prompt.el.style.display = 'none'

        // Black screen via iris
        const renderer = this.experience.renderer
        renderer.setIrisTransitionEnabled(true)
        renderer.setIrisTransitionSize(0.0)

        await this.experience.waitMs(350)

        // Snap camera behind character immediately (hidden behind black)
        this._snapCameraBehindCharacter()
        this.experience.camera.setMode('frisbeeAim')

        await this.experience.waitMs(150)

        // Open iris
        await this.experience.animateValue(
            0.0, 1.35, 800,
            (v) => renderer.setIrisTransitionSize(v)
        )
        renderer.setIrisTransitionEnabled(false)

        // Start wind-up animation
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

        if (this.state === 'windUp') {
            this.updateAim(dt, character)
            if (character.throwPaused) {
                this.state = 'charge'
                this.powerBarContainer.style.display = 'flex'
            }
            return
        }

        if (this.state === 'charge') {
            this.updateAim(dt, character)
            this.updateCharge()
            return
        }

        if (this.state === 'flight') {
            this.flightController.update(dt)
            this.experience.camera.frisbeeTarget = this.flightController.getPosition()

            if (!this.flightController.active) {
                this.state = 'ending'
                this.endTimer = 0
            }
            return
        }

        if (this.state === 'ending') {
            this.endTimer += dt
            if (this.endTimer > 1.5) {
                this.exitMinigame()
            }
            return
        }
    }

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

    updateCharge() {
        const holding = this.enterHeld || this._isMobileHolding()

        if (holding && !this.isCharging) {
            this.isCharging = true
            this.chargeStartTime = performance.now()
        }

        if (this.isCharging && holding) {
            const elapsed = performance.now() - this.chargeStartTime
            this.power = Math.min(elapsed / this.powerHoldMaxMs, 1)
            this.powerBarFill.style.width = `${this.power * 100}%`
        }

        // Mobile release detection via hold→release edge
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

        const launchPos = character.position.clone()
        launchPos.y += 1.2
        launchPos.x += Math.sin(yaw) * 0.5
        launchPos.z += Math.cos(yaw) * 0.5

        this.flightController.launch(launchPos, direction, speed)

        this.powerBarContainer.style.display = 'none'

        this.experience.camera.frisbeeTarget = this.flightController.getPosition()
        this.experience.camera.setMode('frisbeeFlight')
    }

    // ─── Exit ────────────────────────────────────────────────────────────

    async exitMinigame() {
        if (this.state === 'idle') return
        this.state = 'exiting'

        const renderer = this.experience.renderer

        // Close iris
        renderer.setIrisTransitionEnabled(true)
        await this.experience.animateValue(
            1.35, 0.0, 600,
            (v) => renderer.setIrisTransitionSize(v)
        )

        // Reset everything behind black
        const character = this.experience.world.character
        character.resetAfterThrow()
        this.flightController.reset()
        this.experience.camera.setMode('follow')
        this.experience.camera.frisbeeTarget = null

        // Show activity prompt again
        const prompt = this.experience.world.activityPrompt
        if (prompt?.el) prompt.el.style.display = ''

        this.powerBarFill.style.width = '0%'
        this.aimYaw = 0
        this.power = 0
        this.isCharging = false
        this.enterHeld = false

        await this.experience.waitMs(300)

        // Open iris
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
        this.powerBarContainer?.remove()
    }
}
