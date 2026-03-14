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

        this.setInstance()
        this.setOrbitControls()

        this.mode = 'follow'
        this.frisbeeTarget = null
        this.baseFov = 35
        this._throwYaw = 0

        // frisbeeAim camera tuning
        this.aimBehindDist = 4.6
        this.aimHeight = 0.2
        this.aimLookHeight = 0.1
        this.aimLerp = 0.15

        // frisbeeFlight camera tuning — camera stays near character
        this.flightForwardNudge = 2.0
        this.flightHeight = 1.6
        this.flightPosLerp = 0.06
        this.flightLookLerp = 0.1
        this.flightFovMin = 22
        this.flightFovMax = 35
        this.flightZoomDist = 30
        this.flightExtraZoomTime = 2.0
        this.flightExtraZoomFov = 14
        this._flightTimer = 0

        if (this.debug.active) {
            this.setDebug()
        }
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(35, this.sizes.width / this.sizes.height, 0.1, 100)
        this.instance.position.set(0, 8, 8)
        this.instance.lookAt(0, 0, 0)
        this.scene.add(this.instance)

        const isMobile = this.checkIfMobile()
        this.cameraOffset = isMobile
            ? new THREE.Vector3(0, 2.5, 9)
            : new THREE.Vector3(0, 2.5, 7)
        this.smoothPosition = this.instance.position.clone()
        this.smoothLookAt = new THREE.Vector3(0, 0, 0)
        this.lerpFactor = isMobile ? 0.78 : 0.12
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

        const yaw = this._throwYaw
        const desiredPos = character.position.clone()
        desiredPos.x += Math.sin(yaw) * this.flightForwardNudge
        desiredPos.y += this.flightHeight
        desiredPos.z += Math.cos(yaw) * this.flightForwardNudge

        this.smoothPosition.lerp(desiredPos, this.flightPosLerp)

        // LookAt tracks the frisbee
        this.smoothLookAt.lerp(frisbeePos, this.flightLookLerp)

        this.instance.position.copy(this.smoothPosition)
        this.instance.lookAt(this.smoothLookAt)

        // Auto-zoom: narrow FOV as frisbee gets farther away
        const dist = this.smoothPosition.distanceTo(frisbeePos)
        const t = THREE.MathUtils.clamp(dist / this.flightZoomDist, 0, 1)
        let targetFov = THREE.MathUtils.lerp(this.flightFovMax, this.flightFovMin, t)

        // Extra zoom kick after 2 seconds of flight
        if (this._flightTimer >= this.flightExtraZoomTime) {
            targetFov = Math.min(targetFov, this.flightExtraZoomFov)
        }

        this.instance.fov += (targetFov - this.instance.fov) * 0.08
        this.instance.updateProjectionMatrix()
    }

    setMode(mode) {
        this.mode = mode
        this.controls.enabled = this.mode === 'free'

        if (this.mode === 'free') {
            this.controls.target.copy(this.smoothLookAt)
            this.controls.update()
        }

        if (this.mode === 'follow') {
            this.instance.fov = this.baseFov
            this.instance.updateProjectionMatrix()
            if (this.experience.world?.character) {
                const cp = this.experience.world.character.position
                this.smoothLookAt.copy(cp)
                this.smoothPosition.copy(cp).add(this.cameraOffset)
            }
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
