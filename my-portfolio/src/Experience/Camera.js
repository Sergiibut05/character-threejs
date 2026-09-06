import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Experience from './Experience.js'

// Camera far plane, in world units. There is no scene fog and nothing else
// clips by distance, so this alone decides how far you can see.
const DEFAULT_RENDER_DISTANCE = 100

export default class Camera {
    constructor() {
        this.experience = new Experience()
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene
        this.canvas = this.experience.canvas
        this.debug = this.experience.debug

        // Two FOVs (hand-tuned on device): the world keeps a tight lens, while
        // the frisbee minigame goes wide on mobile so the narrow portrait screen
        // still shows the whole field.
        this.isMobile = this.checkIfMobile()
        this.baseFov = this.isMobile ? 30 : 35        // world / follow
        this.minigameFov = this.isMobile ? 59 : 35    // frisbee aim, flight & cinematics
        // Follow-mode FOV offset (e.g. SocialArea's subtle zoom-in sets −4);
        // lerped toward baseFov + offset every follow frame.
        this.zoomFovOffset = 0

        this.setInstance()
        this.setOrbitControls()

        this.mode = 'follow'
        this.frisbeeTarget = null
        this._throwYaw = 0
        // Bumped whenever a cinematic starts; running cinematics bail if their
        // captured token is stale (lets one shot cancel a previous one cleanly).
        this._cineToken = 0

        // frisbeeAim camera tuning (mobile values hand-tuned on device).
        this.aimBehindDist = this.isMobile ? 3.9 : 4.6
        this.aimHeight = this.isMobile ? 0.65 : 0.2
        this.aimLookHeight = this.isMobile ? 0.4 : 0.1
        this.aimLerp = 0.15

        // frisbeeFlight camera tuning — camera stays near character
        this.flightForwardNudge = this.isMobile ? 3.0 : 2.0
        // The forward nudge eases in after a short delay: on a fast release the
        // camera must NOT overtake the disc (it forced an ugly look-back flip).
        this.flightNudgeDelay = 0.25
        this.flightNudgeRamp = 0.6
        this.flightHeight = this.isMobile ? 1.15 : 1.6
        this.flightPosLerp = 0.06
        this.flightLookLerp = 0.1
        this.flightFovMin = 22
        this.flightFovMax = this.minigameFov
        this.flightZoomDist = 30
        this.flightExtraZoomTime = 2.0
        this.flightExtraZoomFov = 14
        this._flightTimer = 0
        this._catchSmoothLook = false

        // focus — fixed side-on framing for the beach minigame. Targets are
        // pushed in by BeachMinigame each frame; the lerp does the rest, so the
        // entry/exit transition is free.
        this.focusFov = this.isMobile ? 52 : 40
        this.focusLerp = 0.09
        this._focusPos = new THREE.Vector3()
        this._focusLook = new THREE.Vector3()
        this._hasFocusTarget = false

        // Smooth hand-back from a focused view (see beginSmoothReturn).
        this.returnLerp = 0.05
        this._returnT = 0
        this._returnDur = 1

        // ── Free-roam zoom (wheel / pinch) ──
        //
        // A SCALE on cameraOffset, not a separate distance: the camera dollies
        // along the line it already sits on, so the framing angle never
        // changes and there is no second pose to keep in sync with the first.
        //
        // 1 is the shipped framing and also the CEILING — the world is
        // composed at that distance, and letting players pull further out
        // shows the edges of it. So the wheel only ever brings you closer, and
        // not by much: minZoom 0.72 is about a quarter of the way in, enough to
        // get a proper look at the character without leaving the shot the game
        // was built around.
        this.zoom = 1
        this.zoomTarget = 1
        this.minZoom = 0.72
        this.zoomLerp = 0.14
        this.wheelZoomStep = 0.0012   // per unit of wheel deltaY (~0.12 a notch)
        this.pinchZoomGain = 0.9
        this._pinchStart = 0
        this._pinchZoom = 1
        this._setupZoomInput()

        if (this.debug.active) {
            this.setDebug()
        }
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(
            this.baseFov, this.sizes.width / this.sizes.height, 0.1, DEFAULT_RENDER_DISTANCE
        )
        this.instance.position.set(0, 8, 8)
        this.instance.lookAt(0, 0, 0)
        this.scene.add(this.instance)

        this.cameraOffset = this.isMobile
            ? new THREE.Vector3(0, 2.5, 9)
            : new THREE.Vector3(0, 2.5, 7)
        this.smoothPosition = this.instance.position.clone()
        this.smoothLookAt = new THREE.Vector3(0, 0, 0)
        this.lerpFactor = this.isMobile ? 0.78 : 0.12

        // Per-frame scratch vectors — no allocations inside update() (per-frame
        // `new Vector3()` churn caused recurring GC hitches).
        this._scratchPos = new THREE.Vector3()
        this._scratchLook = new THREE.Vector3()
    }

    /**
     * Frame-rate-corrected lerp factor: `f` is the per-frame factor tuned at
     * 60 fps; this returns the equivalent for the CURRENT frame time, so the
     * smoothing speed is identical at 30, 60 or 120 fps (fixed per-frame
     * factors smooth twice as hard at 120 Hz and half at 30 → jitter).
     */
    /**
     * Wheel on desktop, two fingers on a phone. Bound to the CANVAS rather than
     * the window on purpose: a wheel over an open modal has to scroll that
     * modal, and a canvas listener simply never sees those events.
     */
    _setupZoomInput() {
        const canvas = this.canvas
        if (!canvas) return

        // Follow mode only. Every other mode is a composed shot — an aim view,
        // a cinematic, the beach framing — and none of them are the player's to
        // reframe.
        const canZoom = () => this.mode === 'follow'
        const clampZoom = (v) => THREE.MathUtils.clamp(v, this.minZoom, 1)
        const spread = (t) => Math.hypot(
            t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

        this._onWheel = (e) => {
            if (!canZoom()) return
            e.preventDefault()
            // deltaY < 0 is a scroll up, which everywhere else means "closer".
            this.zoomTarget = clampZoom(this.zoomTarget + e.deltaY * this.wheelZoomStep)
        }
        canvas.addEventListener('wheel', this._onWheel, { passive: false })

        this._onTouchStart = (e) => {
            if (e.touches.length !== 2 || !canZoom()) { this._pinchStart = 0; return }
            this._pinchStart = spread(e.touches)
            this._pinchZoom = this.zoomTarget
        }
        this._onTouchMove = (e) => {
            if (!this._pinchStart || e.touches.length !== 2 || !canZoom()) return
            e.preventDefault()
            // Fingers apart = ratio above 1 = the camera comes in, which is why
            // the ratio DIVIDES: zoom is a distance scale, not a magnification.
            const ratio = spread(e.touches) / this._pinchStart
            this.zoomTarget = clampZoom(this._pinchZoom / Math.pow(ratio, this.pinchZoomGain))
        }
        this._onTouchEnd = (e) => { if (e.touches.length < 2) this._pinchStart = 0 }

        canvas.addEventListener('touchstart', this._onTouchStart, { passive: true })
        canvas.addEventListener('touchmove', this._onTouchMove, { passive: false })
        canvas.addEventListener('touchend', this._onTouchEnd, { passive: true })
        canvas.addEventListener('touchcancel', this._onTouchEnd, { passive: true })
    }

    _alpha(f) {
        const dt = Math.min(this.experience.time.delta * 0.001, 0.1)
        return 1 - Math.pow(1 - f, dt * 60)
    }

    setOrbitControls() {
        this.controls = new OrbitControls(this.instance, this.canvas)
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.05
        this.controls.target.set(0, 0, 0)
        this.controls.enabled = false
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height
        this.instance.updateProjectionMatrix()
    }

    checkIfMobile() {
        // Check for touch capability and screen size
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
        const isSmallScreen = window.innerWidth < 768 || window.innerHeight < 768

        return hasTouch && isSmallScreen
    }



    update() {
        // Cinematic shots drive instance.position/lookAt directly (round-start
        // descend, entry pan…), so update() yields the camera entirely.
        if (this.mode === 'cinematic') return

        if (this.mode === 'free') {
            this.controls.update()
            return
        }

        if (this.mode === 'frisbeeAim') {
            this.updateFrisbeeAim()
            return
        }

        if (this.mode === 'frisbeeFlight') {
            this.updateFrisbeeFlight()
            return
        }

        if (this.mode === 'focus') {
            this.updateFocusView()
            return
        }

        if (this.experience.world.character) {
            const characterPosition = this.experience.world.character.position
            // Ease the zoom here rather than on input, so a wheel notch glides
            // in instead of stepping.
            this.zoom += (this.zoomTarget - this.zoom) * this._alpha(this.zoomLerp)
            const desiredPosition = this._scratchPos
                .copy(characterPosition)
                .addScaledVector(this.cameraOffset, this.zoom)

            // Handing back from a focused view: ease in from a gentle factor to
            // the normal one. Follow is deliberately snappy (0.78 on mobile) so
            // it stays glued while you run — dropping straight into that from a
            // distant framing reads as a cut, however the mode was switched.
            let follow = this.lerpFactor
            if (this._returnT > 0) {
                const dt = Math.min(this.experience.time.delta * 0.001, 0.1)
                this._returnT = Math.max(0, this._returnT - dt)
                const k = 1 - this._returnT / this._returnDur
                follow = THREE.MathUtils.lerp(this.returnLerp, this.lerpFactor, k * k)
            }
            const a = this._alpha(follow)
            this.smoothPosition.lerp(desiredPosition, a)
            this.smoothLookAt.lerp(characterPosition, a)
            this.instance.position.copy(this.smoothPosition)
            this.instance.lookAt(this.smoothLookAt)

            const targetFov = this.baseFov + this.zoomFovOffset
            if (Math.abs(this.instance.fov - targetFov) > 0.02) {
                this.instance.fov += (targetFov - this.instance.fov) * this._alpha(0.08)
                this.instance.updateProjectionMatrix()
            }
        }
    }

    /** Give the camera back to follow mode gradually instead of cutting. */
    releaseFocus(duration = 0.9) {
        this._returnDur = Math.max(0.05, duration)
        this._returnT = this._returnDur
        this.setMode('follow', { snap: false })
    }

    /**
     * Jump to the focus framing instead of easing into it.
     *
     * updateFocusView() eases, which is right while the activity is running
     * and wrong at the moment of arrival: behind a closed iris there is
     * nothing to ease FROM that anyone can see, so the ease just spends its
     * first second after the iris opens sliding into place. Called once, in
     * the dark, so the shot is already correct on the first visible frame.
     */
    snapFocus() {
        if (!this._hasFocusTarget) return
        this.smoothPosition.copy(this._focusPos)
        this.smoothLookAt.copy(this._focusLook)
        this.instance.position.copy(this.smoothPosition)
        this.instance.lookAt(this.smoothLookAt)
        this.instance.fov = this.focusFov
        this.instance.updateProjectionMatrix()
    }

    /** Where the beach camera should sit / look (world space). */
    setFocusView(pos, look) {
        this._focusPos.copy(pos)
        this._focusLook.copy(look)
        this._hasFocusTarget = true
    }

    updateFocusView() {
        if (!this._hasFocusTarget) return
        const a = this._alpha(this.focusLerp)
        this.smoothPosition.lerp(this._focusPos, a)
        this.smoothLookAt.lerp(this._focusLook, a)
        this.instance.position.copy(this.smoothPosition)
        this.instance.lookAt(this.smoothLookAt)

        if (Math.abs(this.instance.fov - this.focusFov) > 0.02) {
            this.instance.fov += (this.focusFov - this.instance.fov) * this._alpha(0.08)
            this.instance.updateProjectionMatrix()
        }
    }

    updateFrisbeeAim() {
        const character = this.experience.world?.character
        if (!character) return

        const yaw = character.container.rotation.y
        const pos = this._scratchPos.copy(character.position)
        pos.x -= Math.sin(yaw) * this.aimBehindDist
        pos.y += this.aimHeight
        pos.z -= Math.cos(yaw) * this.aimBehindDist

        const lookTarget = this._scratchLook.copy(character.position)
        lookTarget.y += this.aimLookHeight

        const a = this._alpha(this.aimLerp)
        this.smoothPosition.lerp(pos, a)
        this.smoothLookAt.lerp(lookTarget, a)
        this.instance.position.copy(this.smoothPosition)
        this.instance.lookAt(this.smoothLookAt)
    }

    updateFrisbeeFlight() {
        const frisbeePos = this.frisbeeTarget
        const character = this.experience.world?.character
        if (!frisbeePos || !character) return

        const dt = this.experience.time.delta * 0.001
        this._flightTimer += dt

        // Delayed, eased forward nudge (see constructor note).
        const nudgeT = THREE.MathUtils.clamp(
            (this._flightTimer - this.flightNudgeDelay) / this.flightNudgeRamp, 0, 1
        )
        const nudge = this.flightForwardNudge * nudgeT * nudgeT * (3 - 2 * nudgeT)

        const yaw = this._throwYaw
        const desiredPos = this._scratchPos.copy(character.position)
        desiredPos.x += Math.sin(yaw) * nudge
        desiredPos.y += this.flightHeight
        desiredPos.z += Math.cos(yaw) * nudge

        this.smoothPosition.lerp(desiredPos, this._alpha(this.flightPosLerp))

        const lookLerp = this._catchSmoothLook ? 0.035 : this.flightLookLerp
        this.smoothLookAt.lerp(frisbeePos, this._alpha(lookLerp))

        this.instance.position.copy(this.smoothPosition)
        this.instance.lookAt(this.smoothLookAt)

        // Auto-zoom: narrow FOV as frisbee gets farther away
        const dist = this.smoothPosition.distanceTo(frisbeePos)
        const t = THREE.MathUtils.clamp(dist / this.flightZoomDist, 0, 1)
        let targetFov = THREE.MathUtils.lerp(this.flightFovMax, this.flightFovMin, t)

        if (this._flightTimer >= this.flightExtraZoomTime) {
            targetFov = Math.min(targetFov, this.flightExtraZoomFov)
        }

        this.instance.fov += (targetFov - this.instance.fov) * this._alpha(0.08)
        this.instance.updateProjectionMatrix()
    }

    // Resolve the frisbeeAim framing (pos + lookAt) for the current character.
    _aimPose(posOut, lookOut) {
        const c = this.experience.world?.character
        if (!c) return false
        const yaw = c.container.rotation.y
        posOut.set(
            c.position.x - Math.sin(yaw) * this.aimBehindDist,
            c.position.y + this.aimHeight,
            c.position.z - Math.cos(yaw) * this.aimBehindDist
        )
        lookOut.set(c.position.x, c.position.y + this.aimLookHeight, c.position.z)
        return true
    }

    // Compute the elevated/back start pose for the round-start descend.
    _descendStartPose(posOut, lookOut) {
        const c = this.experience.world?.character
        if (!c) return false
        const yaw = c.container.rotation.y
        posOut.set(
            c.position.x - Math.sin(yaw) * this.aimBehindDist * 1.5,
            c.position.y + this.aimHeight + 3.4,
            c.position.z - Math.cos(yaw) * this.aimBehindDist * 1.5
        )
        lookOut.set(c.position.x, c.position.y + this.aimLookHeight + 0.6, c.position.z)
        return true
    }

    /**
     * Snap the camera to the elevated start pose (cinematic mode) WITHOUT
     * animating. Called when arming a throw so the iris/reveal already shows the
     * high shot — the later descend then has nothing to teleport from.
     */
    primeRoundStartDescend() {
        const startPos = new THREE.Vector3()
        const startLook = new THREE.Vector3()
        if (!this._descendStartPose(startPos, startLook)) return
        ++this._cineToken // invalidate any in-flight cinematic (e.g. the pan)
        this._cineStartPos = startPos
        this._cineStartLook = startLook
        this.setMode('cinematic')
        this.instance.fov = this.minigameFov
        this.instance.updateProjectionMatrix()
        this.instance.position.copy(startPos)
        this.instance.lookAt(startLook)
    }

    /**
     * Round-start cinematic (plan §4.E): descend from the elevated pose (set by
     * primeRoundStartDescend, or computed now) into the aim framing, then hand
     * over to frisbeeAim. Yields if a throw switches the camera mode mid-descend.
     */
    async playRoundStartDescend(durationMs = 1700) {
        const c = this.experience.world?.character
        if (!c) return

        const token = ++this._cineToken
        const aimPos = new THREE.Vector3()
        const aimLook = new THREE.Vector3()
        this._aimPose(aimPos, aimLook)

        const startPos = this._cineStartPos || this.instance.position.clone()
        const startLook = this._cineStartLook || aimLook.clone().setY(aimLook.y + 0.6)
        this._cineStartPos = null
        this._cineStartLook = null

        this.setMode('cinematic')
        this.instance.fov = this.minigameFov
        this.instance.updateProjectionMatrix()

        const _p = new THREE.Vector3()
        const _l = new THREE.Vector3()
        await this.experience.animateValue(0, 1, durationMs, (t) => {
            if (this._cineToken !== token || this.mode !== 'cinematic') return // bailed
            const e = 1 - Math.pow(1 - t, 3) // easeOutCubic
            _p.lerpVectors(startPos, aimPos, e)
            _l.lerpVectors(startLook, aimLook, e)
            this.instance.position.copy(_p)
            this.instance.lookAt(_l)
        })

        if (this._cineToken === token && this.mode === 'cinematic') {
            this.smoothPosition.copy(aimPos)
            this.smoothLookAt.copy(aimLook)
            this.setMode('frisbeeAim')
        }
    }

    /**
     * Where the entry pan runs from and to. Shared with primeEntryPan so the
     * camera can be parked on the first frame of the pan behind a closed iris
     * — recomputing it in two places is how the two silently drift apart.
     */
    _entryPanPose() {
        const world = this.experience.world
        const c = world?.character
        if (!c) return null

        // Face the pitch so "from the front" is well-defined.
        let yaw = c.container.rotation.y
        const bbox = world.getPitchBBox?.()
        if (bbox) {
            const ctr = new THREE.Vector3()
            bbox.getCenter(ctr)
            yaw = Math.atan2(ctr.x - c.position.x, ctr.z - c.position.z)
        }
        const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))

        const target = c.position.clone()
        const dog = world.frisbeeMinigame?.dog
        if (dog?.container?.visible) target.lerp(dog.position, 0.4)
        target.y += 0.66   // look at the pair's chests, not over their heads

        // Closer and lower than the first pass: at 5.5 back and 1.0 up the
        // shot read as "here is a field", and the pair it is actually
        // introducing sat small in the middle of it. Down at eye level and in
        // close, the same move reads as "here are you and your dog".
        const frontDist = 4.2
        const height = 0.6 // just under eye level
        const side = 2.9
        const startPos = target.clone().addScaledVector(fwd, frontDist).addScaledVector(right, side)
        startPos.y += height
        const endPos = target.clone().addScaledVector(fwd, frontDist).addScaledVector(right, -side)
        endPos.y += height - 0.15

        return { target, fwd, startPos, endPos }
    }

    /**
     * Park the camera on the entry pan's opening frame without moving it there
     * on screen. Called while the iris is shut, so the cut from gameplay to
     * cinematic happens in the dark instead of as a jump.
     */
    primeEntryPan() {
        const pose = this._entryPanPose()
        if (!pose) return
        this.setMode('cinematic')
        this.instance.fov = this.minigameFov
        this.instance.updateProjectionMatrix()
        this.instance.position.copy(pose.startPos)
        this.instance.lookAt(pose.target)
    }

    /**
     * Entry cinematic (plan §4.E.1): a slow pan in FRONT of the character + dog
     * (right → left) with a gentle push-in. Leaves the camera held at the end
     * pose (cinematic mode) for the caller to wait on a "continue" press.
     */
    async playEntryPan(durationMs = 8000) {
        const pose = this._entryPanPose()
        if (!pose) return
        const { target, fwd, startPos, endPos } = pose

        const token = ++this._cineToken
        this.setMode('cinematic')
        this.instance.fov = this.minigameFov
        this.instance.updateProjectionMatrix()

        const _p = new THREE.Vector3()
        await this.experience.animateValue(0, 1, durationMs, (t) => {
            if (this._cineToken !== token || this.mode !== 'cinematic') return
            const e = t * t * (3 - 2 * t) // smoothstep
            _p.lerpVectors(startPos, endPos, e)
            _p.addScaledVector(fwd, -Math.sin(e * Math.PI) * 0.7) // gentle push-in
            this.instance.position.copy(_p)
            this.instance.lookAt(target)
        })
    }


    /**
     * @param {string} mode
     * @param {object} [o]
     * @param {boolean} [o.snap=true] Jump straight to the new framing. Pass
     *   false to hand over from wherever the camera currently is, so the mode's
     *   own lerp eases it back — that's what makes LEAVING a focused view look
     *   like entering it, instead of cutting.
     */
    setMode(mode, { snap = true } = {}) {
        this.mode = mode
        this.controls.enabled = this.mode === 'free'

        if (!snap) return

        if (this.mode === 'free') {
            this.controls.target.copy(this.smoothLookAt)
            this.controls.update()
        }

        if (this.mode === 'follow') {
            this._catchSmoothLook = false
            this.instance.fov = this.baseFov
            this.instance.updateProjectionMatrix()
            if (this.experience.world?.character) {
                const cp = this.experience.world.character.position
                this.smoothLookAt.copy(cp)
                // Land on the zoom the player chose, not on the eased value
                // left over from wherever the camera was before.
                this.zoom = this.zoomTarget
                this.smoothPosition.copy(cp).addScaledVector(this.cameraOffset, this.zoom)
            }
        }

        if (this.mode === 'frisbeeAim') {
            // frisbeeFlight narrows the FOV (auto-zoom); reset it so re-arming a
            // throw (next round) frames the character like the first round
            // instead of staying zoomed-in/"glued" to it.
            this._catchSmoothLook = false
            this.instance.fov = this.minigameFov
            this.instance.updateProjectionMatrix()
        }

        if (this.mode === 'frisbeeFlight') {
            this._throwYaw = this.experience.world?.character?.container?.rotation.y ?? 0
            this._flightTimer = 0
        }
    }

    /**
     * How far the camera can see, in world units.
     *
     * Every other place that touches the lens changes `fov` and calls
     * updateProjectionMatrix, which leaves `far` alone — so this survives the
     * minigame FOV switches, the auto-zoom and resize without needing to be
     * re-applied.
     *
     * @param {number} far world units; clamped to stay in front of `near`.
     */
    setRenderDistance(far) {
        this.instance.far = Math.max(this.instance.near + 1, far)
        this.instance.updateProjectionMatrix()
    }

    setDebug() {
        const folder = this.debug.ui.addFolder('Camera')
        folder.close()

        const params = { mode: this.mode, renderDistance: this.instance.far }
        folder.add(params, 'mode', ['follow', 'free']).name('Mode').onChange((v) => {
            this.setMode(v)
        })

        // Depth buffer precision is a ratio of near to far, so pushing this a
        // long way out will eventually bring z-fighting with it. That is the
        // trade being made on purpose here, not a bug to go chasing.
        folder.add(params, 'renderDistance', 20, 5000, 10)
            .name('Render distance')
            .onChange((v) => this.setRenderDistance(v))
    }
}
