import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Experience from './Experience.js'

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

        if (this.debug.active) {
            this.setDebug()
        }
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(this.baseFov, this.sizes.width / this.sizes.height, 0.1, 100)
        this.instance.position.set(0, 8, 8)
        this.instance.lookAt(0, 0, 0)
        this.scene.add(this.instance)

        this.cameraOffset = this.isMobile
            ? new THREE.Vector3(0, 2.5, 9)
            : new THREE.Vector3(0, 2.5, 7)
        this.smoothPosition = this.instance.position.clone()
        this.smoothLookAt = new THREE.Vector3(0, 0, 0)
        this.lerpFactor = this.isMobile ? 0.78 : 0.12
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

        if (this.experience.world.character) {
            const characterPosition = this.experience.world.character.position
            const desiredPosition = new THREE.Vector3()
                .copy(characterPosition)
                .add(this.cameraOffset)
            this.smoothPosition.lerp(desiredPosition, this.lerpFactor)
            this.smoothLookAt.lerp(characterPosition, this.lerpFactor)
            this.instance.position.copy(this.smoothPosition)
            this.instance.lookAt(this.smoothLookAt)
        }
    }

    updateFrisbeeAim() {
        const character = this.experience.world?.character
        if (!character) return

        const yaw = character.container.rotation.y
        const pos = character.position.clone()
        pos.x -= Math.sin(yaw) * this.aimBehindDist
        pos.y += this.aimHeight
        pos.z -= Math.cos(yaw) * this.aimBehindDist

        const lookTarget = character.position.clone()
        lookTarget.y += this.aimLookHeight

        this.smoothPosition.lerp(pos, this.aimLerp)
        this.smoothLookAt.lerp(lookTarget, this.aimLerp)
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
        const desiredPos = character.position.clone()
        desiredPos.x += Math.sin(yaw) * nudge
        desiredPos.y += this.flightHeight
        desiredPos.z += Math.cos(yaw) * nudge

        this.smoothPosition.lerp(desiredPos, this.flightPosLerp)

        const lookLerp = this._catchSmoothLook ? 0.035 : this.flightLookLerp
        this.smoothLookAt.lerp(frisbeePos, lookLerp)

        this.instance.position.copy(this.smoothPosition)
        this.instance.lookAt(this.smoothLookAt)

        // Auto-zoom: narrow FOV as frisbee gets farther away
        const dist = this.smoothPosition.distanceTo(frisbeePos)
        const t = THREE.MathUtils.clamp(dist / this.flightZoomDist, 0, 1)
        let targetFov = THREE.MathUtils.lerp(this.flightFovMax, this.flightFovMin, t)

        if (this._flightTimer >= this.flightExtraZoomTime) {
            targetFov = Math.min(targetFov, this.flightExtraZoomFov)
        }

        this.instance.fov += (targetFov - this.instance.fov) * 0.08
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
     * Entry cinematic (plan §4.E.1): a slow pan in FRONT of the character + dog
     * (right → left) with a gentle push-in. Leaves the camera held at the end
     * pose (cinematic mode) for the caller to wait on a "continue" press.
     */
    async playEntryPan(durationMs = 8000) {
        const world = this.experience.world
        const c = world?.character
        if (!c) return

        const token = ++this._cineToken
        this.setMode('cinematic')
        this.instance.fov = this.minigameFov
        this.instance.updateProjectionMatrix()

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
        target.y += 0.8

        const frontDist = 5.5
        const height = 1.0 // low, near eye level
        const side = 3.8
        const startPos = target.clone().addScaledVector(fwd, frontDist).addScaledVector(right, side)
        startPos.y += height
        const endPos = target.clone().addScaledVector(fwd, frontDist).addScaledVector(right, -side)
        endPos.y += height - 0.15

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
     * Move the camera to frame the dog from the front (for its pre-round
     * gesture). Holds at the end pose (cinematic mode).
     */
    async frameDog(durationMs = 1400) {
        const dog = this.experience.world?.frisbeeMinigame?.dog
        if (!dog?.container) return

        const token = ++this._cineToken
        this.setMode('cinematic')
        this.instance.fov = this.minigameFov
        this.instance.updateProjectionMatrix()

        const yaw = dog.container.rotation.y
        const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
        const target = dog.position.clone()
        target.y += 0.4
        const endPos = dog.position.clone().addScaledVector(fwd, 3.0)
        endPos.y += 1.4

        const startPos = this.instance.position.clone()
        const _p = new THREE.Vector3()
        await this.experience.animateValue(0, 1, durationMs, (t) => {
            if (this._cineToken !== token || this.mode !== 'cinematic') return
            const e = t * t * (3 - 2 * t)
            _p.lerpVectors(startPos, endPos, e)
            this.instance.position.copy(_p)
            this.instance.lookAt(target)
        })
    }

    setMode(mode) {
        this.mode = mode
        this.controls.enabled = this.mode === 'free'

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
                this.smoothPosition.copy(cp).add(this.cameraOffset)
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

    setDebug() {
        const folder = this.debug.ui.addFolder('Camera')
        folder.close()

        const params = { mode: this.mode }
        folder.add(params, 'mode', ['follow', 'free']).name('Mode').onChange((v) => {
            this.setMode(v)
        })
    }
}
