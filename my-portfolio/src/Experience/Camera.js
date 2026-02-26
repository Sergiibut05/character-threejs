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
        if (this.debug.active) {
            this.setDebug()
        }
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(35, this.sizes.width / this.sizes.height, 0.1, 100)
        this.instance.position.set(0, 8, 8)
        this.instance.lookAt(0, 0, 0)
        this.scene.add(this.instance)

        // Check if mobile and adjust camera offset
        const isMobile = this.checkIfMobile()
        this.cameraOffset = isMobile
            ? new THREE.Vector3(0, 3, 7)  // Further back on mobile
            : new THREE.Vector3(0, 2, 5)  // Closer on desktop
        this.smoothPosition = this.instance.position.clone()
        this.smoothLookAt = new THREE.Vector3(0, 0, 0)
        this.lerpFactor = 0.12
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

    setMode(mode) {
        this.mode = mode
        this.controls.enabled = this.mode === 'free'

        if (this.mode === 'free') {
            this.controls.target.copy(this.smoothLookAt)
            this.controls.update()
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
