import * as THREE from 'three'
import Experience from '../Experience.js'
import WindLines from './WindLines.js'
import CourtBounds from './CourtBounds.js'
import BeachBallVariants from './BeachBallVariants.js'
import { iconExit } from './ui/icons.js'
import './ui/beach.css'

/**
 * BeachMinigame — the beach volley rally: keep the ball up.
 *
 * This class owns ONLY the rally (ball flight, contact, camera, court, wind).
 * Modes, menus, results and the ranking live in BeachSession, which drives it.
 *
 * Design notes worth keeping:
 *  - The ball runs on its OWN 2-axis integrator (X horizontal / Y vertical, Z
 *    pinned). Rapier is deliberately avoided here: restitution and CCD would
 *    fight every difficulty knob and let the ball drift off the play plane.
 *  - WHERE the ball meets the player decides where it flies. Dead-centre sends
 *    it straight up (safe, repeatable), off-centre sends it sideways. That one
 *    rule is what turns "stand under the ball" into an actual skill.
 *  - The decorative beach ball IS the game ball: it lifts off the sand on start
 *    and returns to its resting spot on exit, so nothing is duplicated.
 */
export default class BeachMinigame {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.time = this.experience.time
        this.debug = this.experience.debug

        // ── Court (defaults follow the decorative ball's authored spot) ──
        // NOTE: the character is only ~1.0 unit tall (chibi proportions: head is
        // half of it, shoulders at 0.51, hands at 0.47). Every distance here is
        // sized against THAT, not a realistic 1.7 m human.
        this.courtCenter = new THREE.Vector3(0.95, 0.18, 41.76)
        this.courtHalfWidth = 2.8       // how far left/right the player may run
        this.bodyRadius = 0.3           // keeps the player INSIDE the wall, not straddling it
        // Court width shuffles between these every `widthChangeEvery` touches —
        // it re-frames the rally without touching the ball's physics.
        this.widthSteps = [2.8, 4.0, 5.4]
        this.widthChangeEvery = 20
        // Timed ease rather than an exponential lerp: the walls glide over a
        // known, generous span instead of snapping most of the way instantly.
        this.widthChangeDuration = 4.0
        this.bannerDuration = 2600      // ms the resize banner stays up

        this.autoFrame = true           // derive camera distance from court width
        this.cameraMargin = 1.3         // world units of breathing room past the walls
        this.cameraDist = 6.5           // manual fallback when autoFrame is off
        this.cameraHeight = 1.6
        this.lookHeight = 1.1
        this.cameraFollow = 0.3         // 0 = locked, 1 = fully tracks the action
        this.cameraFollowNarrow = 0.82  // portrait: the camera must carry the action
        // Floor on how small the ~1-unit-tall character may get, as a fraction
        // of screen height. This is what stops a portrait screen from zooming
        // out until the game is unreadable.
        this.minCharFraction = 0.15

        // ── Ball ──
        this.ballRadius = 0.175
        this.gravity = -7.5             // floaty, like a real beach ball
        this.bounceSpeed = 5.0          // upward speed given by a hit
        this.lateralSpeed = 1.8         // sideways speed at the edge of the hit zone
        this.serveHeight = 2.5          // drop height at the start of a rally
        // Contact is a PLANE crossing, not a volume overlap: the ball connects
        // the instant its underside reaches `hitHeight`, so it always visually
        // touches at the same place. (A window instead fires on whichever frame
        // first lands inside it, which meant contact at a random height.)
        //
        // hitHeight is set just above the head on purpose. Measured on the rig:
        // the arms are ~0.14 long and top out at y≈0.63 with the head reaching
        // 1.05 — this chibi simply cannot get its hands overhead, so the ball
        // is bumped just clear of the head while the arms reach up.
        this.hitRadius = 0.45           // horizontal reach from the body
        // Measured on the rig (feet at 0): raised hands top out at 0.666 and the
        // head at 1.052. With the ball now playing IN FRONT of the body it can
        // finally sit at hand height without clipping through anyone, so this
        // is set just above the hands rather than clear of the head.
        this.hitHeight = 0.72           // where the ball's underside makes contact
        this.hitCooldown = 0.25
        // The ball plays on a plane slightly NEARER the camera than the player.
        // Without it the two share one plane, so a low contact point drives the
        // ball straight through the body (invisible head-on, awful in profile).
        // In front, it simply passes over them like a real ball would.
        this.ballDepthOffset = 0.42

        // ── Ball variants (look AND feel: each has its own gravity scale) ──
        this.variantChangeEvery = 35    // touches; staggered vs the width change
        // The swap happens at the ball's APEX and holds for a beat: a natural
        // pause where nothing is being asked of the player, so the new ball is
        // announced and understood BEFORE it starts falling.
        this.swapDuration = 1.0
        this.balls = new BeachBallVariants()

        // ── Escalation ──
        // Fall speed is NOT part of it: each ball drops at its own fixed rate,
        // so the coconut always feels like the coconut whether it shows up on
        // touch 2 or touch 200. What still grows with the streak is the sideways
        // spread — the thing that actually makes you run.
        this.spreadGain = 0.03
        this.spreadCap = 2.0

        // ── Wind ──
        // It HOLDS a direction for a long stretch and then eases into a new
        // one, rather than oscillating: a constantly turning wind is unreadable
        // and stops the player from ever planning around it.
        this.windEnabled = true
        this.windStrength = 0.55        // max sideways acceleration
        this.windHoldMin = 13           // seconds a gust keeps its direction
        this.windHoldMax = 22
        this.windTransition = 3.4       // seconds to swing to the new direction
        // Calm start: the wind fades IN over the first rallies instead of
        // shoving the very first ball, so the opening never feels unfair.
        this.windRampTouches = 12

        // ── Day/night ──
        // The rally drives the clock: noon → sunset → night as the streak
        // grows. The world's own hour is saved on start and put back on exit,
        // so a long rally never leaves the rest of the portfolio at midnight.
        this.dayEnabled = true
        this.dayStart = 0.5             // Environment.timeOfDay for noon
        this.dayFullAt = 80             // touches to reach midnight
        this.dayLerp = 0.9              // how fast the sky CHASES that target (per second)

        // ── State ──
        this.state = 'idle'             // 'idle' | 'playing' | 'missed' | 'over'
        this.mode = 'libre'             // 'libre' | 'competitivo'
        this.onRallyEnd = null          // set by BeachSession
        this.touches = 0
        this.best = 0
        this._ballPos = new THREE.Vector3()
        this._ballVel = new THREE.Vector3()
        this._cooldown = 0
        this._missTimer = 0
        this._prevUnderside = Infinity
        this._targetHalfWidth = this.courtHalfWidth
        this._widthFrom = this.courtHalfWidth
        this._widthT = 1
        this._wind = 0
        this._windFrom = 0
        this._windTo = 0
        this._windBlend = 1
        this._windTimer = 0
        this._ready = false
        // Reused every frame — this codebase keeps the render loop free of
        // per-frame allocations (they were a source of stutter before).
        this._scratch = new THREE.Vector3()
        this._camPos = new THREE.Vector3()
        this._camLook = new THREE.Vector3()

        this._buildHud()

        this.windLines = new WindLines({
            center: this.courtCenter,
            radius: 7,
            count: 5,
            length: 3.2,
            thickness: 0.05,
            height: 2.6,
            heightSpread: 2.4,
            zBehind: 9,
            zFront: 0.5
        })

        if (this.debug.active) this._setDebug()
    }

    // ── Lazy hookup: the beach ball is a decorative asset, so it lands late ──
    _tryInit() {
        const piece = this.experience.world?.patioScene?.pieces?.beachBall
        const root = piece?.root
        if (!root) return
        const mesh = root.getObjectByName('Sphere') || root.children[0]
        if (!mesh) return

        this.ballMesh = mesh
        this.ballRest = mesh.position.clone()

        this.balls.build(mesh, this.experience.resources?.items?.soccerBallModel || null)
        // Derive the radius from the mesh so resizing the prop can never
        // desync the collision from what you actually see.
        this.ballRadius = this.balls.radius
        // Court sits on the sand right under the ball's resting spot.
        this.courtCenter.set(this.ballRest.x, this.ballRest.y - this.ballRadius, this.ballRest.z)
        this.windLines.setCenter(this.courtCenter)

        this.bounds = new CourtBounds({
            center: this.courtCenter,
            halfWidth: this.courtHalfWidth
        })
        // The GUI folder exists from the constructor, but bounds only appear
        // once the decorative ball has streamed in — wire them up here.
        if (this.debugFolder) {
            this.debugFolder.add(this.bounds, 'idleOpacity', 0, 0.5, 0.01).name('Muro base')
            this.debugFolder.add(this.bounds, 'nearOpacity', 0, 1.5, 0.05).name('Muro cerca')
            this.debugFolder.add(this.bounds, 'impactDecay', 0.3, 5, 0.1).name('Muro fundido')
        }

        this._ready = true
    }

    // ── HUD ──
    _buildHud() {
        this.hud = document.createElement('div')
        this.hud.className = 'fz-beach-hud'
        this.hud.innerHTML =
            '<span class="fz-beach-count">0</span>' +
            '<span class="fz-beach-label">toques</span>' +
            '<span class="fz-beach-best"></span>'
        document.body.appendChild(this.hud)
        this.hudCount = this.hud.querySelector('.fz-beach-count')
        this.hudBest = this.hud.querySelector('.fz-beach-best')

        this.flash = document.createElement('div')
        this.flash.className = 'fz-beach-flash'
        document.body.appendChild(this.flash)

        // Wind gauge (Wii Sports Resort style): direction arrow + magnitude,
        // sitting under the counter so it's read at a glance before serving.
        this.windEl = document.createElement('div')
        this.windEl.className = 'fz-beach-wind'
        this.windEl.innerHTML =
            '<span class="fz-beach-wind-label">Viento</span>' +
            '<span class="fz-beach-wind-arrow">' +
            '<svg viewBox="0 0 32 16" width="34" height="17" aria-hidden="true">' +
            '<path d="M2 8h22M18 2l7 6-7 6" fill="none" stroke="currentColor" ' +
            'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</span>' +
            '<span class="fz-beach-wind-value">0.0</span>'
        document.body.appendChild(this.windEl)
        this.windArrow = this.windEl.querySelector('.fz-beach-wind-arrow')
        this.windValue = this.windEl.querySelector('.fz-beach-wind-value')

        // Visible way out — Esc / B alone is invisible to a mouse or touch
        // player. Same button and placement as the frisbee HUD.
        this.exitBtn = document.createElement('button')
        this.exitBtn.type = 'button'
        this.exitBtn.className = 'fz-hud-leave'
        this.exitBtn.setAttribute('aria-label', 'Salir del minijuego')
        this.exitBtn.innerHTML = `<span class="fz-hud-leave-icon">${iconExit}</span>`
        this.exitBtn.addEventListener('click', () => this.onExitClick?.())
        document.body.appendChild(this.exitBtn)

        // Court-resize banner (see _showCourtBanner).
        this.bannerEl = document.createElement('div')
        this.bannerEl.className = 'fz-beach-banner'
        document.body.appendChild(this.bannerEl)
    }

    _renderWind() {
        if (!this.windValue) return
        // Show the EFFECTIVE wind — what this ball actually feels, ramp
        // included. A gauge reading 0.5 while the coconut ignores it would just
        // be lying to the player.
        const effective = this._wind * (this.balls?.windScale ?? 1) * this._windRamp
        const mag = Math.abs(effective)
        const norm = Math.min(1, mag / Math.max(0.001, this.windStrength))
        this.windValue.textContent = mag.toFixed(1)
        // The arrow points where the wind blows and grows with its strength.
        this.windArrow.style.transform =
            `rotate(${effective >= 0 ? 0 : 180}deg) scale(${0.7 + norm * 0.5})`
        this.windEl.classList.toggle('is-calm', norm < 0.25)
        this.windEl.classList.toggle('is-strong', norm > 0.72)
    }

    _renderHud() {
        this.hudCount.textContent = String(this.touches)
        this.hudBest.textContent = this.best > 0 ? `récord ${this.best}` : ''
    }

    _showFlash(text, modifier = '') {
        this.flash.textContent = text
        this.flash.className = `fz-beach-flash is-visible ${modifier}`
        clearTimeout(this._flashTimer)
        this._flashTimer = setTimeout(() => {
            this.flash.className = 'fz-beach-flash'
        }, 700)
    }

    // ── Start / stop ──
    /** @param {'libre'|'competitivo'} [mode] */
    start(mode = 'libre') {
        if (this.state !== 'idle' || !this._ready) return false
        const character = this.experience.world?.character
        if (!character) return false
        // Never hijack the camera mid-cinematic (world entry, frisbee shots) —
        // stealing it there leaves the iris transition stuck half-open.
        if (this.experience.camera.mode === 'cinematic') return false

        this.mode = mode
        this.state = 'playing'
        this.touches = 0
        this._wind = 0
        this._windTimer = 0
        this._windBlend = 1
        this._windTo = 0
        this.balls.setIndex(0)
        this.balls.setScaleFactor(1)
        this._swapping = false
        this._swapPending = false
        this._swapDone = false
        this._captureDay()

        // Drop the player onto the play line, facing the camera (+Z).
        character.teleportTo(this.courtCenter.x, this.courtCenter.y, this.courtCenter.z, 0)
        character.planarLock = {
            z: this.courtCenter.z,
            // Body radius keeps the character fully inside the wall instead of
            // half-way through it.
            minX: this.courtCenter.x - (this.courtHalfWidth - this.bodyRadius),
            maxX: this.courtCenter.x + (this.courtHalfWidth - this.bodyRadius),
            faceYaw: 0,
            // With the camera on +Z looking down −Z, world +X reads as screen
            // right; from the −Z side it flips. Derive it so moving the camera
            // to the other side can't silently invert the controls.
            inputSign: Math.sign(this.cameraDist) || 1
        }

        this.experience.camera.setMode('focus')
        this.windLines.setEnabled(this.windEnabled)
        this._targetHalfWidth = this.courtHalfWidth
        this._widthFrom = this.courtHalfWidth
        this._widthT = 1
        this.bounds?.layout(this.courtHalfWidth)
        this.bounds?.setEnabled(true)
        this._serve()

        this.hud.classList.add('is-visible')
        this.exitBtn.classList.add('is-visible')
        this.windEl.classList.toggle('is-visible', this.windEnabled)
        this._renderHud()
        this._showFlash('¡A jugar!')
        return true
    }

    stop() {
        if (this.state === 'idle') return
        this.state = 'idle'

        const character = this.experience.world?.character
        if (character) character.planarLock = null

        this.experience.camera.releaseFocus()
        this.windLines.setEnabled(false)
        this.bounds?.setEnabled(false)
        clearTimeout(this._bannerTimer)
        this.bannerEl.className = 'fz-beach-banner'
        this.hud.classList.remove('is-visible')
        this.exitBtn.classList.remove('is-visible')
        this.windEl.classList.remove('is-visible')
        this._restoreDay()
        this.balls.rest()
    }

    /** Restart a rally without leaving the court (used by "Jugar otra vez"). */
    replay() {
        if (this.state === 'idle') return false
        this.state = 'playing'
        this.touches = 0
        this.balls.setIndex(0)
        this.balls.setScaleFactor(1)
        this._swapping = this._swapPending = this._swapDone = false
        this._targetHalfWidth = this.widthSteps[0] ?? this.courtHalfWidth
        this._widthFrom = this.courtHalfWidth
        this._widthT = 0
        this._renderHud()
        this._serve()
        this._showFlash('¡A jugar!')
        return true
    }

    // ── Day/night: the streak drives the clock, the world gets its hour back ──
    _captureDay() {
        const env = this.experience.world?.environment
        if (!env || !this.dayEnabled) return
        this._dayPrev = { timeOfDay: env.timeOfDay, cycling: env.cycle?.enabled }
        if (env.cycle) env.cycle.enabled = false
        env.timeOfDay = this.dayStart
        env._applyTimeOfDay?.(this.dayStart)
    }

    /** Where the sky SHOULD be for the current streak. */
    get _dayTarget() {
        const t = Math.min(1, this.touches / Math.max(1, this.dayFullAt))
        // 0.5 (noon) → 1.0 (midnight), passing afternoon and sunset on the way.
        return this.dayStart + t * (1 - this.dayStart)
    }

    /**
     * Glide toward that target instead of snapping to it on every touch. The
     * old per-hit assignment stepped the whole sky several times a second,
     * which read as flickering rather than dusk falling.
     */
    _updateDay(dt) {
        const env = this.experience.world?.environment
        if (!env || !this._dayPrev) return
        const diff = this._dayTarget - env.timeOfDay
        if (Math.abs(diff) < 0.0002) return
        env.timeOfDay += diff * (1 - Math.exp(-this.dayLerp * dt))
        env._applyTimeOfDay?.(env.timeOfDay)
    }

    _restoreDay() {
        const env = this.experience.world?.environment
        if (!env || !this._dayPrev) return
        env.timeOfDay = this._dayPrev.timeOfDay
        if (env.cycle) env.cycle.enabled = this._dayPrev.cycling
        env._applyTimeOfDay?.(env.timeOfDay)
        this._dayPrev = null
    }

    _serve() {
        const character = this.experience.world?.character
        const x = character ? character.position.x : this.courtCenter.x
        this._prevUnderside = Infinity   // fresh sweep — no stale crossing
        // ~2.5× the character's height — high enough to read, low enough to
        // stay inside the side-camera framing.
        this._ballPos.set(x, this.courtCenter.y + this.serveHeight, this._ballZ)
        this._ballVel.set(0, 0, 0)
        this._cooldown = 0
    }

    get _ballZ() { return this.courtCenter.z + this.ballDepthOffset }

    _miss() {
        this.best = Math.max(this.best, this.touches)
        this._renderHud()

        if (this.mode === 'competitivo') {
            // One miss ends it — the session takes over from here.
            this.state = 'over'
            this._showFlash(`${this.touches} toques`, 'is-miss')
            this.onRallyEnd?.(this.touches)
            return
        }

        this.state = 'missed'
        this._missTimer = 1.1
        this._showFlash(`${this.touches} toques`, 'is-miss')
    }

    /** 0 → 1 over the opening touches, so the wind arrives gradually. */
    get _windRamp() {
        return Math.min(1, this.touches / Math.max(1, this.windRampTouches))
    }

    // ── Difficulty ──
    /** Fall rate comes from the ball alone — fixed, per variant. */
    get _fallMul() {
        return this.balls.gravityScale
    }

    get _spreadMul() {
        return Math.min(1 + this.touches * this.spreadGain, this.spreadCap)
    }

    /** Is the player standing close enough to be offered the game? */
    inRange(radius = 3.2) {
        if (!this._ready) return false
        const c = this.experience.world?.character
        if (!c) return false
        return this._scratch
            .set(c.position.x - this.courtCenter.x, 0, c.position.z - this.courtCenter.z)
            .length() < radius
    }

    // ── Frame ──
    update() {
        if (!this._ready) { this._tryInit(); if (!this._ready) return }
        if (this.state === 'idle') return

        const dt = Math.min(this.time.delta * 0.001, 0.05)

        if (this.state === 'missed') {
            this._missTimer -= dt
            if (this._missTimer <= 0) {
                this.touches = 0
                this.state = 'playing'
                // A fresh rally resets the DIFFICULTY, so it has to reset the
                // ball too — otherwise you restart at zero holding a coconut,
                // which is neither what the streak says nor what you expect.
                this.balls.setIndex(0)
                this.balls.setScaleFactor(1)
                this._swapping = this._swapPending = this._swapDone = false
                this._renderHud()
                this._serve()
            }
        }

        if (this.state === 'playing') this._updateBall(dt)

        this._updateDay(dt)
        this._updateCourtWidth(dt)
        this._updateCamera(dt)
        this.windLines.update()
        this.bounds?.update(this.experience.world?.character?.position.x ?? this.courtCenter.x)
    }

    _updateBall(dt) {
        this._updateWind(dt)

        // Ball swap ceremony: hold at the apex, shrink out, swap, pop back in.
        if (this._swapping) { this._updateSwap(dt); return }
        if (this._swapPending && this._ballVel.y <= 0) {
            this._swapPending = false
            this._swapping = true
            this._swapT = 0
            this._ballVel.set(0, 0, 0)   // hover
            return
        }

        // Each ball has its own weight: the coconut really does drop harder…
        this._ballVel.y += this.gravity * this._fallMul * dt
        // …and barely feels the breeze, while the inflatable gets pushed around.
        this._ballVel.x += this._wind * this.balls.windScale * this._windRamp * dt
        this._ballPos.addScaledVector(this._ballVel, dt)
        this._ballPos.z = this._ballZ

        // Bounce off the court sides. Subtract the RADIUS so the ball rebounds
        // when its surface meets the wall — clamping the centre let half the
        // ball sit through the pane.
        const limX = this.courtHalfWidth - this.ballRadius
        const relX = this._ballPos.x - this.courtCenter.x
        if (Math.abs(relX) > limX) {
            this._ballPos.x = this.courtCenter.x + Math.sign(relX) * limX
            this._ballVel.x *= -0.7
            this.bounds?.hit(Math.sign(relX), this._ballPos.y)
        }

        this._cooldown -= dt

        const character = this.experience.world?.character
        if (character && this._cooldown <= 0 && this._ballVel.y < 0) {
            const hitY = character.groundY + this.hitHeight
            const dx = this._ballPos.x - character.position.x
            const underside = this._ballPos.y - this.ballRadius
            // SWEPT test: did the underside cross the contact plane during this
            // step? A simple "is it inside a window" check let a fast ball
            // tunnel deep past the plane before firing, so contact happened at
            // a random (often much lower) height — that is what made it look
            // like the ball was smacking into the face.
            if (Math.abs(dx) < this.hitRadius + this.ballRadius &&
                underside <= hitY && this._prevUnderside > hitY) {
                // Snap to the plane so the bounce ALWAYS starts at the same
                // visible height, whatever the frame rate.
                this._ballPos.y = hitY + this.ballRadius
                this._hit(dx, character)
            }
        }
        this._prevUnderside = this._ballPos.y - this.ballRadius

        // Missed: the ball reached the sand.
        if (this._ballPos.y - this.ballRadius <= this.courtCenter.y) {
            this._ballPos.y = this.courtCenter.y + this.ballRadius
            this._ballVel.set(0, 0, 0)
            this._miss()
        }

        this.balls.setPosition(this._ballPos)
        // Roll a little so it doesn't read as a frozen sphere.
        this.balls.spin(this._ballVel.x * dt * 2.5, this._ballVel.y * dt * 0.6)
    }

    /**
     * The swap itself: shrink the old ball away, exchange it at the midpoint,
     * pop the new one back with a little overshoot. The ball hangs still the
     * whole time, so the beat reads as anticipation instead of a stutter.
     */
    _updateSwap(dt) {
        this._swapT += dt
        const p = Math.min(1, this._swapT / Math.max(0.1, this.swapDuration))

        if (!this._swapDone && p >= 0.5) {
            this._swapDone = true
            const label = this.balls.shuffle()
            if (label) this._showFlash(`¡${label}!`, 'is-milestone')
        }

        // 1 → 0 → 1, with a springy overshoot on the way back in.
        let k
        if (p < 0.5) {
            const e = p / 0.5
            k = 1 - e * e
        } else {
            const e = (p - 0.5) / 0.5
            k = e * e * (3 - 2 * e)
            k += Math.sin(e * Math.PI) * 0.22   // pop
        }
        this.balls.setScaleFactor(Math.max(0.001, k))
        this.balls.setPosition(this._ballPos)
        this.balls.spin(0, dt * 3)              // slow tumble while it changes

        if (p >= 1) {
            this._swapping = false
            this._swapDone = false
            this.balls.setScaleFactor(1)
            this._prevUnderside = Infinity      // fresh sweep after the hold
        }
    }

    /** Pick a new court width (never the current one) and announce it. */
    _shuffleWidth() {
        const steps = this.widthSteps
        if (!steps?.length) return false

        let i = steps.indexOf(this._targetHalfWidth)
        if (i === -1) {
            // Nearest step, so a hand-tuned width still joins the rotation.
            i = steps.reduce((best, w, k) =>
                Math.abs(w - this._targetHalfWidth) < Math.abs(steps[best] - this._targetHalfWidth) ? k : best, 0)
        }
        if (steps.length < 2) return false

        let next = i
        while (next === i) next = Math.floor(Math.random() * steps.length)

        const wider = steps[next] > this._targetHalfWidth
        this._widthFrom = this.courtHalfWidth
        this._targetHalfWidth = steps[next]
        this._widthT = 0
        this._showCourtBanner(wider)
        return true
    }

    /**
     * Announce a court resize with its DIRECTION.
     *
     * On a wide screen you simply watch the walls glide. In portrait they are
     * off-shot entirely, so this banner is the only cue the player gets — hence
     * arrows that show which way it moved and a longer hold than the score
     * call-outs, which are glanceable and disposable.
     */
    _showCourtBanner(wider) {
        clearTimeout(this._bannerTimer)
        const arrows = wider
            ? '<span class="fz-beach-banner-arrow">&#8592;</span><span class="fz-beach-banner-arrow">&#8594;</span>'
            : '<span class="fz-beach-banner-arrow">&#8594;</span><span class="fz-beach-banner-arrow">&#8592;</span>'
        this.bannerEl.innerHTML =
            `<span class="fz-beach-banner-arrows">${arrows}</span>` +
            `<span class="fz-beach-banner-text">${wider ? 'Pista más ancha' : 'Pista más estrecha'}</span>`
        this.bannerEl.className =
            `fz-beach-banner is-visible ${wider ? 'is-wider' : 'is-narrower'}`
        this._bannerTimer = setTimeout(() => {
            this.bannerEl.className = 'fz-beach-banner'
        }, this.bannerDuration)
    }

    /** Ease the court toward its target width, moving walls and limits with it. */
    _updateCourtWidth(dt) {
        if (this._widthT >= 1) {
            if (this.courtHalfWidth !== this._targetHalfWidth) {
                // GUI edit (or any external change) — adopt it without a glide.
                this.courtHalfWidth = this._targetHalfWidth
                this._widthFrom = this._targetHalfWidth
                this._applyCourtWidth()
            }
            return
        }

        this._widthT = Math.min(1, this._widthT + dt / Math.max(0.1, this.widthChangeDuration))
        const t = this._widthT
        const eased = t * t * t * (t * (t * 6 - 15) + 10)   // smootherstep: no visible start/stop
        this.courtHalfWidth = THREE.MathUtils.lerp(this._widthFrom, this._targetHalfWidth, eased)
        this._applyCourtWidth()
    }

    _applyCourtWidth() {
        this.bounds?.layout(this.courtHalfWidth)
        const lock = this.experience.world?.character?.planarLock
        if (lock) {
            const inner = this.courtHalfWidth - this.bodyRadius
            lock.minX = this.courtCenter.x - inner
            lock.maxX = this.courtCenter.x + inner
        }
    }

    /** Long-held gusts easing into each other; drives ball, ribbons and gauge. */
    _updateWind(dt) {
        if (!this.windEnabled) {
            this._wind = 0
            this.windLines.setEnabled(false)
            this._renderWind()
            return
        }

        this._windTimer -= dt
        if (this._windTimer <= 0) {
            this._windFrom = this._wind
            // New gust: random strength, and usually the opposite side so the
            // change is actually noticeable.
            const magnitude = (0.35 + Math.random() * 0.65) * this.windStrength
            const flip = this._windTo === 0 ? (Math.random() < 0.5 ? -1 : 1)
                : (Math.random() < 0.75 ? -Math.sign(this._windTo) : Math.sign(this._windTo))
            this._windTo = magnitude * flip
            this._windBlend = 0
            this._windTimer = this.windHoldMin + Math.random() * (this.windHoldMax - this.windHoldMin)
        }

        if (this._windBlend < 1) {
            this._windBlend = Math.min(1, this._windBlend + dt / this.windTransition)
            const e = this._windBlend * this._windBlend * (3 - 2 * this._windBlend)
            this._wind = THREE.MathUtils.lerp(this._windFrom, this._windTo, e)
        } else {
            this._wind = this._windTo
        }

        // Ribbons blow the way the ball is being pushed.
        this.windLines.setEnabled(true)
        this.windLines.setWind(
            this._wind >= 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
            Math.abs(this._wind) / Math.max(0.001, this.windStrength)
        )
        this._renderWind()
    }

    _hit(dx, character) {
        const t = THREE.MathUtils.clamp(dx / this.hitRadius, -1, 1)
        const centred = 1 - Math.abs(t)

        this._ballVel.y = this.bounceSpeed
        this._ballVel.x = t * this.lateralSpeed * this._spreadMul
        this._cooldown = this.hitCooldown

        this.touches++
        this.best = Math.max(this.best, this.touches)
        this._renderHud()

        // (the sky follows the streak on its own, eased in _updateDay)

        // Milestones are STAGGERED (width every 20, ball every 35) so two never
        // land on the same touch — simultaneous changes read as chaos, and only
        // one call-out can be on screen at a time anyway.
        let announced = false
        if (this.touches > 0 && this.touches % this.widthChangeEvery === 0) {
            announced = this._shuffleWidth()
        } else if (this.touches > 0 && this.touches % this.variantChangeEvery === 0) {
            // Queue it — the actual swap plays out at the top of this arc.
            this._swapPending = true
            announced = true
        }

        // A clean, central touch is the skilful one — call it out.
        if (announced) { /* a milestone flash already fired */ }
        else if (centred > 0.72) this._showFlash('¡Perfecto!', 'is-perfect')
        else if (this.touches % 10 === 0) this._showFlash(`¡${this.touches}!`, 'is-milestone')

        // Arms only — the hop that used to go with it read as a weird jump.
        character.playBump?.()
    }

    /**
     * Distance needed to frame the whole court. Derived rather than fixed so a
     * width change re-frames itself, and so portrait phones (a much narrower
     * aspect) pull back instead of cropping the walls off-screen.
     */
    _frameDistance() {
        if (!this.autoFrame) return this.cameraDist
        const cam = this.experience.camera
        const halfFov = THREE.MathUtils.degToRad(cam.focusFov * 0.5)
        const tan = Math.max(0.05, Math.tan(halfFov))
        const needV = (this.serveHeight * 0.8) / tan

        const needH = (this.courtHalfWidth + this.cameraMargin) / Math.max(0.05, tan * cam.instance.aspect)

        // On a narrow (portrait) screen, insisting that BOTH walls fit pushes the
        // camera so far back the player becomes a speck. So: pull back AS FAR AS
        // the court asks, but never past the point where the character drops
        // below `minCharFraction` of the screen height. You get as much of the
        // walls as the screen can afford while the player stays readable — and
        // whatever falls outside is covered by the resize banner.
        if (this._narrowScreen) {
            const maxByChar = 1 / (2 * tan * Math.max(0.01, this.minCharFraction))
            return THREE.MathUtils.clamp(Math.min(needH, maxByChar), needV, 22)
        }

        return THREE.MathUtils.clamp(Math.max(needH, needV), 4, 22)
    }

    /** Portrait / small screens can't fit the whole court without shrinking it. */
    get _narrowScreen() {
        return (this.experience.camera.instance.aspect || 1) < 1.35
    }

    /** Tracking has to be near-total when the walls are off-screen. */
    get _followAmount() {
        return this._narrowScreen ? this.cameraFollowNarrow : this.cameraFollow
    }

    _updateCamera(dt) {
        const character = this.experience.world?.character
        // Frame between the player and the ball so both stay comfortably in
        // shot, but only partially — a fully tracking camera is nauseating.
        const focusX = character
            ? THREE.MathUtils.lerp(character.position.x, this._ballPos.x, 0.5)
            : this.courtCenter.x
        const camX = THREE.MathUtils.lerp(
            this.courtCenter.x, focusX, this._followAmount
        )

        this._camPos.set(
            camX,
            this.courtCenter.y + this.cameraHeight,
            this.courtCenter.z + this._frameDistance()
        )
        this._camLook.set(
            THREE.MathUtils.lerp(this.courtCenter.x, focusX, this._followAmount * 0.8),
            this.courtCenter.y + this.lookHeight,
            this.courtCenter.z
        )
        this.experience.camera.setFocusView(this._camPos, this._camLook)
    }

    // ── Debug ──
    _setDebug() {
        const f = this.debugFolder = this.debug.ui.addFolder('🏐 Beach Minigame')
        f.close()

        const actions = {
            jugar: () => this.start(),
            salir: () => this.stop()
        }
        f.add(actions, 'jugar').name('▶ Empezar')
        f.add(actions, 'salir').name('■ Salir')

        f.add(this, 'courtHalfWidth', 1, 10, 0.1).name('Ancho pista').listen()
            .onChange((v) => { this._targetHalfWidth = v; this._widthFrom = v; this._widthT = 1 })
        f.add(this, 'widthChangeEvery', 5, 60, 1).name('Cambiar ancho cada')
        f.add(this, 'widthChangeDuration', 0.5, 12, 0.1).name('Duración cambio')
        f.add(this, 'bodyRadius', 0, 1, 0.02).name('Radio cuerpo')
        f.add(this, 'autoFrame').name('Encuadre auto')
        f.add(this, 'cameraMargin', 0, 4, 0.1).name('Margen cámara')
        f.add(this, 'minCharFraction', 0.05, 0.4, 0.01).name('Tamaño mín. personaje')
        f.add(this, 'cameraFollowNarrow', 0, 1, 0.02).name('Seguimiento vertical')
        f.add(this, 'ballRadius', 0.05, 0.6, 0.005).name('Radio pelota').listen()
        f.add(this, 'gravity', -25, -4, 0.1).name('Gravedad base')
        f.add(this, 'bounceSpeed', 3, 14, 0.1).name('Fuerza golpe')
        f.add(this, 'lateralSpeed', 0, 8, 0.1).name('Desvío lateral')
        f.add(this, 'hitRadius', 0.1, 1.5, 0.01).name('Alcance lateral')
        // Live + wide range: this is the knob for "the ball hits too high".
        f.add(this, 'hitHeight', 0.3, 2.0, 0.01).name('Altura colisión pelota').listen()
        f.add(this, 'ballDepthOffset', 0, 1.2, 0.02).name('Pelota hacia cámara')
        f.add(this, 'variantChangeEvery', 5, 100, 1).name('Cambiar pelota cada')
        f.add(this, 'dayEnabled').name('Progresión del día')
        f.add(this, 'dayFullAt', 20, 400, 5).name('Noche a los N toques')

        f.add(this, 'cameraDist', 4, 22, 0.5).name('Cam distancia')
        f.add(this, 'cameraHeight', 0.5, 10, 0.1).name('Cam altura')
        f.add(this, 'lookHeight', 0, 5, 0.1).name('Cam mirada Y')
        f.add(this, 'cameraFollow', 0, 1, 0.05).name('Cam seguimiento')
        f.add(this.experience.camera, 'focusFov', 20, 80, 1).name('Cam FOV')

        f.add(this, 'windEnabled').name('Viento')
            .onChange((v) => this.windEl.classList.toggle('is-visible', v && this.state !== 'idle'))
        f.add(this, 'windStrength', 0, 4, 0.05).name('Fuerza viento')
        f.add(this, 'windHoldMin', 2, 40, 0.5).name('Duración mín.')
        f.add(this, 'windHoldMax', 2, 60, 0.5).name('Duración máx.')
        f.add(this, 'windTransition', 0.2, 8, 0.1).name('Transición viento')
        f.add(this.windLines, 'zFront', -4, 4, 0.1).name('Viento: límite cámara')
        f.add(this.windLines, 'zBehind', 2, 20, 0.5).name('Viento: profundidad')
    }

    destroy() {
        clearTimeout(this._flashTimer)
        clearTimeout(this._bannerTimer)
        this.hud?.remove()
        this.flash?.remove()
        this.windEl?.remove()
        this.exitBtn?.remove()
        this.bannerEl?.remove()
        this.windLines?.dispose()
        this.bounds?.dispose()
        this.balls?.dispose()
    }
}
