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
        this.mode = null // 'competitivo' | 'libre' — set by FrisbeeSession

        // Session hooks (FrisbeeSession drives the rounds above a single throw).
        this.onThrowComplete = null // (result) => void; fired when a throw settles
        this.lastResult = null
        this._sessionActive = false
        this._withBalloon = true
        this._balloonPoppedThisThrow = false
        this._paused = false // frozen while the help/tutorial modal is open
        // When true, arm the throw with the camera pre-placed high (cinematic)
        // so FrisbeeSession's round-start descend has no teleport. Set by session.
        this.roundStartCinematic = false

        // Tuning
        this.throwReleaseTime = 32 / 24
        this.launchSpeedMin = 3.0
        this.launchSpeedMax = 5.5
        this.aimSensitivity = 1.5
        this.tiltSensitivity = 2.5
        // Launch elevation interpolates by power: gentle lobs loft (near), full
        // power throws flatter (far) so a hard throw doesn't shoot sky-high.
        this.launchUpAngleNear = 0.32
        this.launchUpAngleFar = 0.15
        // Catch later (disc lower + dog closer) so the throw flies most of its
        // arc instead of being snatched short — feels far more natural. Paired
        // with the dog's low hop (see DogCompanion._jumpHeight).
        this.catchTriggerHeight = 1.0
        this.catchTriggerRadius = 2.2
        this.catchMinFlightTime = 1.7
        // How far AHEAD of the dog's origin the catch is recorded — its snout,
        // not its paws (see _setCatchPosition).
        this.catchMarkerForward = 0.5
        this.aimYawCenter = 0
        this.aimYawHalfRange = THREE.MathUtils.degToRad(70)
        this.fieldMargin = 1.5
        // How strongly target placement favours the middle of the field.
        this.targetEdgeBias = 0.5
        // Out-of-bounds tolerance beyond the field edge (hand-tuned with the
        // debug frame). Separate from fieldMargin, which is auto-calibrated
        // and keeps targets/balloons AWAY from the fence.
        this.badMargin = 0.5
        this.isBadThrow = false
        // Flight time (s) at which a bad throw hands the camera to the dog.
        this._badSwitchTime = Infinity
        this._pitchBBox = null

        // Power oscillator
        this._powerPhase = 0
        this._powerDir = 1
        this._powerSpeed = 1.2
        this._chargeLocked = false
        this._prevMobileHold = false
        this._prevPadHold = false

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

    async start(mode = this.mode, withBalloon = true) {
        if (this.state !== 'idle') return
        this.mode = mode
        this._sessionActive = true

        const character = this.experience.world.character
        if (!character) return

        character.movementLocked = true
        this.state = 'intro'
        this.isBadThrow = false

        // Get pitch bounds for aim clamping & target placement. The oriented
        // bounds respect any baked Y rotation; the AABB is the fallback.
        this._pitchBBox = this.experience.world.getPitchBBox?.() ?? null
        this._fieldOriented = this.experience.world.getPitchOrientedBounds?.() ?? null

        // Aim centre toward the pitch + auto-calibrate power/aim/margins.
        if (this._pitchBBox) {
            const center = new THREE.Vector3()
            this._pitchBBox.getCenter(center)
            this.aimYawCenter = Math.atan2(
                center.x - character.position.x, center.z - character.position.z
            )
            this._calibrateForField(character)
        } else {
            this.aimYawCenter = character.container.rotation.y
        }
        this.aimYaw = this.aimYawCenter
        character.container.rotation.y = this.aimYaw

        this._resetThrowRuntime()

        const prompt = this.experience.world.activityPrompt
        if (prompt?.el) prompt.el.style.display = 'none'

        this.flightController.groundY = character.groundY
        this.objectiveMarker.createAimLine()

        // Close the iris (black) BEFORE repositioning so the dog teleport from
        // its anchor to the throw spot isn't seen (the entry cinematic leaves the
        // camera framing the dog).
        const renderer = this.experience.renderer
        renderer.setIrisTransitionEnabled(true)
        renderer.setIrisTransitionSize(0.0)

        // Place dog + frisbee + target while the iris is closed…
        this._placeThrowSubjects(character)

        await this.experience.waitMs(350)

        // With the round-start cinematic, pre-place the camera HIGH (so the iris
        // reveals the elevated shot and the descend has nothing to teleport
        // from); otherwise frame the aim directly.
        if (this.roundStartCinematic) {
            this.experience.camera.primeRoundStartDescend()
        } else {
            this._snapCameraBehindCharacter()
            this.experience.camera.setMode('frisbeeAim')
        }

        await this.experience.waitMs(150)

        // …then reveal it and begin the wind-up.
        await this.experience.animateValue(
            0.0, 1.35, 800,
            (v) => renderer.setIrisTransitionSize(v)
        )
        renderer.setIrisTransitionEnabled(false)

        this._revealThrow(character, withBalloon)
    }

    // Reset the per-throw runtime (aim/tilt/power + the power-bar UI).
    _resetThrowRuntime() {
        this.tiltAngle = 0
        this.power = 0
        this._powerPhase = 0
        this._powerDir = 1
        this._chargeLocked = false
        this.enterHeld = false
        this.isBadThrow = false
        this._badSwitchTime = Infinity
        this._throwResult = null
        this._balloonPoppedThisThrow = false
        if (this.powerBarContainer) this.powerBarContainer.style.display = 'none'
        if (this.powerBarFill) this.powerBarFill.style.left = '0%'
        if (this.tiltIndicator) this.tiltIndicator.style.left = '50%'
    }

    // Position dog + frisbee-in-hand + pick the target (before the reveal).
    _placeThrowSubjects(character) {
        this._pickTarget(character)
        const handBone = character.getRightHandBone()
        if (handBone) this.flightController.attachToHand(handBone)
        this.dog.show(character.position, this.aimYaw, character.groundY)
    }

    // Show the aim UI + balloon and start the wind-up (after the reveal).
    _revealThrow(character, withBalloon) {
        this._withBalloon = withBalloon
        this.objectiveMarker.showArrow(this.targetCenter)
        this.objectiveMarker.showAimLine()
        this._charGroundPos.set(character.container.position.x, character.groundY, character.container.position.z)
        this.objectiveMarker.updateAimLine(0, 1, this._charGroundPos, this.aimYaw)
        if (withBalloon) this._placeBalloon(character)
        else this.balloon.hide()
        this.state = 'windUp'
        character.startThrowAnimation(this.throwReleaseTime)
    }

    // Re-arm the next throw within a session — no iris, keeps play flowing.
    nextThrow(withBalloon = true) {
        if (!this._sessionActive) return
        const character = this.experience.world.character
        if (!character) return

        // Tear down the previous throw's artefacts (no camera/prompt/iris reset).
        this.dog.detachFrisbee()
        this.flightController.reset()
        this.dog.reset()
        this.objectiveMarker.reset()
        this.scoreFeedback.hide()
        this.balloon.hide()
        this._catchSequenceTimer = -1

        this._resetThrowRuntime()
        this.aimYaw = this.aimYawCenter
        character.container.rotation.y = this.aimYaw

        this._placeThrowSubjects(character)
        if (this.roundStartCinematic) {
            this.experience.camera.primeRoundStartDescend()
        } else {
            this._snapCameraBehindCharacter()
            this.experience.camera.setMode('frisbeeAim')
        }
        this._revealThrow(character, withBalloon)
    }

    // A throw's scoring has settled — hand the result to the session (or, when
    // not session-driven, exit straight back to the world).
    _finishThrow() {
        const r = this._throwResult || { zone: '', points: 0, distance: Infinity }
        r.balloonPopped = this._balloonPoppedThisThrow
        this.lastResult = r
        if (this.onThrowComplete) {
            this.state = 'roundEnd' // holding state until the session re-arms/exits
            this.onThrowComplete(r)
        } else {
            this.exitMinigame()
        }
    }

    _placeBalloon(character) {
        const groundY = character.groundY
        const F = this._field
        if (F && this._throwOrigin) {
            const baseY = this._fieldTopY ?? groundY
            const ox = this._throwOrigin.x
            const oz = this._throwOrigin.z
            const tx = this.targetCenter.x
            const tz = this.targetCenter.z

            // Place the balloon by ANGLE inside the aim cone (never at its edge)
            // so there's always room to curve enough to thread BOTH balloon and
            // target. Bow to the side that keeps the shot in-cone: toward centre
            // when the target is off-axis, random when it's roughly centred.
            const targetYaw = Math.atan2(tx - ox, tz - oz)
            const targetDist = Math.hypot(tx - ox, tz - oz) || 1
            const targetAngle = Math.atan2(
                Math.sin(targetYaw - this.aimYawCenter),
                Math.cos(targetYaw - this.aimYawCenter)
            )
            const bowSide = Math.abs(targetAngle) > THREE.MathUtils.degToRad(8)
                ? -Math.sign(targetAngle)
                : (Math.random() < 0.5 ? 1 : -1)
            const bowAngle = THREE.MathUtils.degToRad(16 + Math.random() * 8)
            const limit = this.aimYawHalfRange * 0.8
            const balloonYaw = this.aimYawCenter + THREE.MathUtils.clamp(
                targetAngle + bowSide * bowAngle, -limit, limit
            )
            const balloonDist = targetDist * (0.5 + Math.random() * 0.1)

            const w = this._clampToField(
                F,
                ox + Math.sin(balloonYaw) * balloonDist,
                oz + Math.cos(balloonYaw) * balloonDist,
                this.fieldMargin
            )
            const pos = new THREE.Vector3(w.x, baseY + 1.8 + Math.random() * 0.6, w.z)
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

    // ─── Field calibration (auto-tune for the 2× larger pitch) ───────────
    //
    // Rather than hardcode launch speed / aim range for one specific field
    // size, derive everything from the live pitch bbox so the disc always
    // reaches the far edge and the aim cone covers the whole field. Uses the
    // flight controller's own predictLanding() to solve speed→distance, so the
    // calibration stays correct if the physics tuning changes too.
    _calibrateForField(character) {
        const F = this._buildFieldFrame()
        if (!F) return
        this._field = F

        // Throw origin (~hand height) and the horizontal aim-center direction.
        const origin = new THREE.Vector3(
            character.position.x, character.groundY + 1.2, character.position.z
        )
        const dirX = Math.sin(this.aimYawCenter)
        const dirZ = Math.cos(this.aimYawCenter)
        const perpX = Math.cos(this.aimYawCenter)
        const perpZ = -Math.sin(this.aimYawCenter)

        // Depth = distance to the FAR EDGE of the (oriented) field along the aim
        // axis, NOT the far corner — calibrating to the corner would overshoot
        // when aiming straight ahead.
        const centerDepth = this._fieldRayExit(F, origin.x, origin.z, dirX, dirZ)

        // The four oriented corners drive the aim cone half-angle.
        let maxAngle = 0
        for (const [cx, cz] of this._fieldCorners(F)) {
            const dx = cx - origin.x
            const dz = cz - origin.z
            const along = dx * dirX + dz * dirZ
            if (along <= 0) continue
            const perp = dx * perpX + dz * perpZ
            maxAngle = Math.max(maxAngle, Math.atan2(Math.abs(perp), along))
        }

        if (centerDepth <= 4) return // field too small / behind — keep defaults

        // Margins scale with the field so targets/balloons stay off the fence.
        const minDim = Math.min(F.hu, F.hv) * 2
        this.fieldMargin = THREE.MathUtils.clamp(minDim * 0.06, 1.5, 4.0)

        // Aim cone: the player stands inside the diamond facing the outfield,
        // so keep a sensible forward cone (a near-90° range would let you aim
        // almost sideways into foul ground).
        this.aimYawHalfRange = THREE.MathUtils.clamp(
            maxAngle + THREE.MathUtils.degToRad(8),
            THREE.MathUtils.degToRad(40),
            THREE.MathUtils.degToRad(52)
        )

        // Stash the play-area frame for target/balloon placement.
        this._fieldDepth = centerDepth
        this._fieldTopY = F.topY
        this._throwOrigin = origin.clone()

        // Max power reaches (almost) the far edge — a full-power throw must be
        // able to hit far-corner targets; min power lofts to roughly the near
        // third. Each uses its own elevation.
        const targetMaxDist = Math.max(4, centerDepth - this.fieldMargin * 0.5)
        this.launchSpeedMax = this._solveSpeedForDistance(
            origin, dirX, dirZ, targetMaxDist, this.launchUpAngleFar
        )
        this.launchSpeedMin = this._solveSpeedForDistance(
            origin, dirX, dirZ, targetMaxDist * 0.35, this.launchUpAngleNear
        )
        // Catch radius stays modest (set in the constructor); inflating it makes
        // the dog snatch the disc too early and far from the bullseye.
    }

    // Build a rotation-aware field frame: center + two unit world axes (u,v) +
    // half-extents. Prefers the oriented bounds; falls back to the world AABB.
    _buildFieldFrame() {
        const o = this._fieldOriented
        if (o) {
            return {
                cx: o.center.x, cz: o.center.z,
                ux: o.axisX.x, uz: o.axisX.z,
                vx: o.axisZ.x, vz: o.axisZ.z,
                hu: o.halfX, hv: o.halfZ,
                topY: o.topY
            }
        }
        const bbox = this._pitchBBox
        if (!bbox) return null
        const c = bbox.getCenter(new THREE.Vector3())
        const s = bbox.getSize(new THREE.Vector3())
        return {
            cx: c.x, cz: c.z,
            ux: 1, uz: 0, vx: 0, vz: 1,
            hu: s.x * 0.5, hv: s.z * 0.5,
            topY: bbox.max.y
        }
    }

    _fieldCorners(F) {
        return [
            [F.cx + F.ux * F.hu + F.vx * F.hv, F.cz + F.uz * F.hu + F.vz * F.hv],
            [F.cx + F.ux * F.hu - F.vx * F.hv, F.cz + F.uz * F.hu - F.vz * F.hv],
            [F.cx - F.ux * F.hu + F.vx * F.hv, F.cz - F.uz * F.hu + F.vz * F.hv],
            [F.cx - F.ux * F.hu - F.vx * F.hv, F.cz - F.uz * F.hu - F.vz * F.hv]
        ]
    }

    // World (x,z) → field-local (u along axisX, v along axisZ).
    _toFieldLocal(F, x, z) {
        const dx = x - F.cx
        const dz = z - F.cz
        return { u: dx * F.ux + dz * F.uz, v: dx * F.vx + dz * F.vz }
    }

    // Field-local (u,v) → world (x,z).
    _fieldLocalToWorld(F, u, v) {
        return { x: F.cx + F.ux * u + F.vx * v, z: F.cz + F.uz * u + F.vz * v }
    }

    // Clamp a world (x,z) into the oriented rectangle, leaving `margin` off the
    // edges. Returns world coords guaranteed inside the actual play area.
    _clampToField(F, x, z, margin) {
        const loc = this._toFieldLocal(F, x, z)
        const u = THREE.MathUtils.clamp(loc.u, -F.hu + margin, F.hu - margin)
        const v = THREE.MathUtils.clamp(loc.v, -F.hv + margin, F.hv - margin)
        return this._fieldLocalToWorld(F, u, v)
    }

    // Ray exit distance from (ox,oz) along unit (dx,dz) against the oriented
    // rectangle — how far the field extends straight ahead.
    _fieldRayExit(F, ox, oz, dx, dz) {
        const o = this._toFieldLocal(F, ox, oz)
        const du = dx * F.ux + dz * F.uz
        const dv = dx * F.vx + dz * F.vz
        const exitAxis = (oo, dd, half) => {
            if (Math.abs(dd) < 1e-6) return Infinity
            return ((dd > 0 ? half : -half) - oo) / dd
        }
        const t = Math.min(exitAxis(o.u, du, F.hu), exitAxis(o.v, dv, F.hv))
        return Number.isFinite(t) ? Math.max(0, t) : 0
    }

    // Horizontal landing distance for a given launch speed + elevation, reusing
    // the real flight physics (drag + gravity).
    _simThrowDistance(origin, dirX, dirZ, speed, upAngle) {
        const direction = new THREE.Vector3(dirX, upAngle, dirZ).normalize()
        const p = this.flightController.predictLanding(origin, direction, speed, 0).point
        return Math.hypot(p.x - origin.x, p.z - origin.z)
    }

    // Binary-search the launch speed that lands at targetDist (distance grows
    // monotonically with speed, so this converges cleanly).
    _solveSpeedForDistance(origin, dirX, dirZ, targetDist, upAngle) {
        let lo = 1
        let hi = 8
        let dHi = this._simThrowDistance(origin, dirX, dirZ, hi, upAngle)
        while (dHi < targetDist && hi < 60) {
            hi *= 1.6
            dHi = this._simThrowDistance(origin, dirX, dirZ, hi, upAngle)
        }
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) * 0.5
            const d = this._simThrowDistance(origin, dirX, dirZ, mid, upAngle)
            if (d < targetDist) lo = mid
            else hi = mid
        }
        return (lo + hi) * 0.5
    }

    _pickTarget(character) {
        const groundY = character.groundY
        const F = this._field
        if (F && this._fieldDepth) {
            const depth = this._fieldDepth
            const dirX = Math.sin(this.aimYawCenter)
            const dirZ = Math.cos(this.aimYawCenter)
            const perpX = Math.cos(this.aimYawCenter)
            const perpZ = -Math.sin(this.aimYawCenter)
            const ox = this._throwOrigin.x
            const oz = this._throwOrigin.z

            // Forward distance band: never right at the player's feet, never
            // past the far edge. Lateral spread stays inside the aim cone.
            const fwd = depth * 0.45 + Math.random() * (depth * 0.47)
            const maxLat = Math.min(Math.tan(this.aimYawHalfRange * 0.7) * fwd, depth * 0.5)
            // Blend of uniform and triangular. Pure triangular thinned the outer
            // band so hard (20% → 4%) that wide targets almost vanished; mixing
            // it back with a uniform roll keeps the edges in play while still
            // favouring the middle. `targetEdgeBias` 0 = uniform, 1 = triangular.
            const bias = this.targetEdgeBias
            const uniform = Math.random() * 2 - 1
            const triangular = (Math.random() + Math.random()) - 1
            const lat = (uniform * (1 - bias) + triangular * bias) * maxLat

            // Clamp into the ORIENTED rectangle so the target never leaks past a
            // rotated edge (the world AABB is larger than the real field).
            const w = this._clampToField(
                F, ox + dirX * fwd + perpX * lat, oz + dirZ * fwd + perpZ * lat,
                this.fieldMargin
            )
            this.targetCenter.set(w.x, this._fieldTopY ?? groundY, w.z)
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
        // Frozen while the help/tutorial modal is open mid-session.
        if (this._paused) return

        const dt = this.experience.time.delta * 0.001

        // Before the activity starts the minigame sits 'idle', but the dog is
        // already waiting at the anchor — keep its idle animation ticking and,
        // once the pitch bbox is known, settle it onto the field surface (the
        // GLB anchor Y floats above the visual ground).
        if (this.state === 'idle' || this.state === 'intro') {
            const dog = this.dog
            if (dog && dog.state !== 'hidden') {
                dog.update(dt)
                if (dog.state === 'idleAnchor' && !this._anchorSettled) {
                    const bbox = this.experience.world?.getPitchBBox?.()
                    if (bbox) {
                        dog.setAnchorGroundY((bbox.min.y + bbox.max.y) * 0.5)
                        this._anchorSettled = true
                    }
                }
            }
            return
        }

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
                this._prevPadHold = false
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
            if (this._scoreShown && this.endTimer > 1.6) {
                this._finishThrow()
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

        // Balloon collision (checkCollision is false unless a live balloon is
        // hit, so this only flags a genuine pop this throw → +100).
        if (this.balloon.checkCollision(frisbeePos)) {
            this.balloon.pop()
            this._balloonPoppedThisThrow = true
        }

        // Out-of-bounds throw: no catch is possible. At mid-flight, hand the
        // camera to the dog and show BAD (the disc keeps sailing away in the
        // background — see _updateBadThrowEnding).
        if (this.isBadThrow) {
            if (this.flightController.flightTime >= this._badSwitchTime ||
                !this.flightController.active) {
                this._onBadThrowLanded()
            }
            return
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
                this._setCatchPosition(dogPos)
                this.dog.triggerCatch(this.flightController.mesh, frisbeePos)
                this.state = 'dogCatch'
                this._onDogCatchStart()
                return
            }
        }

        // Frisbee landed without dog catching in the air
        if (!this.flightController.active) {
            if (this.dog.state === 'arriving' || this.dog.state === 'idle') {
                this._setCatchPosition(this.dog.position)
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
            this._setCatchPosition(dogPos)
            this.dog.triggerCatch(this.flightController.mesh, frisbeePos)
            this.state = 'dogCatch'
            this._onDogCatchStart()
            return
        }

        if (this.dog.state === 'arriving' || this.dog.state === 'idle') {
            this._setCatchPosition(dogPos)
            this.dog.triggerCatch(this.flightController.mesh, frisbeePos)
            this.state = 'dogCatch'
            this._onDogCatchStart()
        }
    }

    /**
     * Record where the catch happened.
     *
     * `dog.position` is the dog's ORIGIN — roughly between its paws — but the
     * frisbee is caught at its snout, a good step further along. Marking the
     * origin made the tick land visibly behind the moment you just watched, so
     * the point is pushed forward along the dog's heading (it is running at the
     * disc, so its facing is the catch direction). The score reads the same
     * position, keeping the mark and the points in agreement.
     */
    _setCatchPosition(dogPos) {
        this.dogCatchPosition.copy(dogPos)
        const yaw = this.dog?.container?.rotation.y
        if (yaw === undefined) return
        this.dogCatchPosition.x += Math.sin(yaw) * this.catchMarkerForward
        this.dogCatchPosition.z += Math.cos(yaw) * this.catchMarkerForward
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
            this._throwResult = this.scoreFeedback.evaluate(this.dogCatchPosition, this.targetCenter)
        }
    }

    _onBadThrowLanded() {
        this.objectiveMarker.hideArrow()
        this.state = 'badThrowEnding'
        this.endTimer = 0
        this._badThrowShown = false
        this._throwResult = { zone: '', points: 0, distance: Infinity }
        // Soft pan from the disc to the dog + cancel the flight auto-zoom (the
        // dog is close by; staying at the long-range FOV would jump-cut).
        const camera = this.experience.camera
        camera._catchSmoothLook = true
        camera._flightTimer = -10
    }

    _updateBadThrowEnding(dt) {
        this.endTimer += dt
        // Let the disc keep sailing out of the field in the background while the
        // camera is already on the dog — freezing it mid-air looks broken.
        if (this.flightController.active) this.flightController.update(dt)
        this.dog.update(dt)
        this.experience.camera.frisbeeTarget = this.dog.position

        if (!this._badThrowShown && this.endTimer >= 0.7) {
            this._badThrowShown = true
            this.scoreFeedback.showBadThrow()
        }

        if (this._badThrowShown && this.endTimer > 2.2) {
            this._finishThrow()
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

    // Reshape the joystick X for aiming: a wider dead zone (easier to hold a
    // direction) and the remaining range rescaled so there's no jump at the edge.
    _shapeAimAxis(x) {
        const dz = 0.22
        const ax = Math.abs(x)
        if (ax < dz) return 0
        return Math.sign(x) * (ax - dz) / (1 - dz)
    }

    updateAim(dt, character) {
        // Camera still descending into place (round-start cinematic) — the
        // player shouldn't be able to turn before the shot is framed.
        if (this.experience.camera.mode === 'cinematic') return

        const keys = character.keys
        let aimDelta = 0

        if (keys.a) aimDelta += this.aimSensitivity * dt
        if (keys.d) aimDelta -= this.aimSensitivity * dt

        if (this.experience.mobileControls?.isActive()) {
            const m = this.experience.mobileControls.getMovement()
            // Slower turn on touch: fine aim adjustments are hard at full speed.
            aimDelta -= this._shapeAimAxis(m.x) * this.aimSensitivity * 0.6 * dt
        }

        if (this.experience.gamepad?.isActive()) {
            const g = this.experience.gamepad.getMovement()
            aimDelta -= g.x * g.force * this.aimSensitivity * dt
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
                tiltDelta += m.x * this.tiltSensitivity * dt
            }

            if (this.experience.gamepad?.isActive()) {
                const g = this.experience.gamepad.getMovement()
                tiltDelta += g.x * g.force * this.tiltSensitivity * dt
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

        // Gamepad A — same rising-edge two-step.
        const padNow = this.experience.gamepad?.getActions?.().button2 === true
        if (padNow && !this._prevPadHold) {
            this._handleChargePress()
        }
        this._prevPadHold = padNow
    }

    // ─── Release ─────────────────────────────────────────────────────────

    releaseThrow() {
        if (this.state !== 'charge') return
        this.state = 'flight'

        const character = this.experience.world.character
        character.continueThrowAnimation()

        const speed = this.launchSpeedMin +
            this.power * (this.launchSpeedMax - this.launchSpeedMin)

        // Flatter arc the harder you throw — keeps big throws from going sky-high.
        const upAngle = this.launchUpAngleNear +
            this.power * (this.launchUpAngleFar - this.launchUpAngleNear)

        const yaw = this.aimYaw
        const direction = new THREE.Vector3(
            Math.sin(yaw),
            upAngle,
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

        // Check if landing is outside the pitch. Uses the ORIENTED field frame
        // (the pitch is rotated in the world; the axis-aligned AABB is bigger
        // and skewed vs the real field, which made the BAD zone feel wrong).
        this.isBadThrow = false
        const F = this._field
        if (F) {
            const lp = prediction.point
            const loc = this._toFieldLocal(F, lp.x, lp.z)
            const m = this.badMargin
            if (Math.abs(loc.u) > F.hu + m || Math.abs(loc.v) > F.hv + m) {
                this.isBadThrow = true
            }
        } else if (this._pitchBBox) {
            // Fallback (dev light mode / no oriented bounds)
            const lp = prediction.point
            const m = this.badMargin
            if (lp.x < this._pitchBBox.min.x - m || lp.x > this._pitchBBox.max.x + m ||
                lp.z < this._pitchBBox.min.z - m || lp.z > this._pitchBBox.max.z + m) {
                this.isBadThrow = true
            }
        }
        // Wii-style out-of-bounds: at mid-flight the camera abandons the disc
        // and cuts to the dog (already stopped halfway) + BAD callout.
        this._badSwitchTime = this.isBadThrow
            ? Math.max(prediction.flightTime * 0.5, 0.4)
            : Infinity

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

        // Let the idle loop re-settle the dog onto the field surface (reset()
        // placed it using the activity's groundY).
        this._anchorSettled = false
        this._sessionActive = false
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
