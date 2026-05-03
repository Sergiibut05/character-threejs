import * as THREE from 'three'
import Debug from './Utils/Debug.js'
import Sizes from './Utils/Sizes.js'
import Time from './Utils/Time.js'
import Quality from './Utils/Quality.js'
import Camera from './Camera.js'
import Renderer from './Renderer.js'
import Resources from './Utils/Resources.js'
import World from './World/World.js'
import MobileControls from './Utils/MobileControls.js'
import sources from './sources.js'

let instance = null

export default class Experience {
    constructor(canvas) {
        if (instance) {
            return instance
        }
        instance = this

        window.experience = this

        this.canvas = canvas
        this.ready = false

        // Setup
        this.debug = new Debug()
        this.quality = new Quality()
        this.sizes = new Sizes()
        this.time = new Time()
        this.scene = new THREE.Scene()
        this.resources = new Resources(sources)
        this.camera = new Camera()
        this.renderer = new Renderer()
        this.world = new World()
        this.mobileControls = new MobileControls()

        // Cloud transition elements
        this.cloudTransition = document.getElementById('cloud-transition')
        this.progressFill = document.getElementById('progress-fill')
        this.progressBtnText = document.getElementById('progress-btn-text')
        this.loadingEnterBtn = document.getElementById('loading-enter-btn')
        this.initialCover = document.getElementById('initial-cover')

        // State tracking
        this.resourcesReady = false
        this.rendererReady = false
        this.allReadyHandled = false

        // Show overlay from start (skip intro scene).
        if (this.cloudTransition) {
            this.cloudTransition.style.pointerEvents = 'auto'
            this.cloudTransition.classList.add('visible')
        }

        // Resource loading progress
        this.resources.on('ready', () => {
            this.resourcesReady = true
            this.checkAllReady()
        })

        // Renderer init
        this.renderer.init().then(() => {
            this.rendererReady = true
            const backendName = this.renderer.instance?.backend?.constructor?.name || 'Unknown'
            console.log('✅ Renderer backend ready:', backendName)

            this.resources.setRenderer(this.renderer.instance)

            // Fade out the initial dark cover once renderer starts.
            setTimeout(() => {
                if (this.initialCover) {
                    this.initialCover.classList.add('fade-out')
                    setTimeout(() => this.initialCover?.remove(), 1000)
                }
            }, 80)

            this.checkAllReady()
        })

        // Resize
        this.sizes.on('resize', () => {
            this.resize()
        })

        // Tick
        this.time.on('tick', () => {
            this.update()
        })
    }

    updateLoadingBar(progress) {
        if (this.progressFill) {
            this.progressFill.style.width = `${progress * 100}%`
        }
        if (this.progressBtnText && !this.loadingEnterBtn?.classList.contains('ready')) {
            this.progressBtnText.textContent = `${Math.round(progress * 100)}%`
        }
    }

    /**
     * Show loading overlay immediately (no preloader intro scene).
     */
    showCloudOverlay() {
        if (!this.cloudTransition || !this.rendererReady) return
        this.cloudTransition.style.pointerEvents = 'auto'
        this.cloudTransition.classList.add('visible')
    }

    /**
     * Check if we can proceed to show the enter button.
     * Requires: resources loaded and renderer ready.
     */
    checkAllReady() {
        if (this.allReadyHandled) return
        if (!this.resourcesReady || !this.rendererReady) return

        this.allReadyHandled = true
        this.showCloudOverlay()
        this.warmUpRender()
    }

    /**
     * Render a few frames of the main scene behind the cloud overlay
     * to compile shaders, then reveal the enter button.
     */
    warmUpRender() {
        let frames = 0
        const totalFrames = 3

        const doWarmUp = () => {
            this.camera.update()
            this.world.update()
            this.renderer.update()
            frames++

            if (frames < totalFrames) {
                requestAnimationFrame(doWarmUp)
            } else {
                this.showEnterButton()
            }
        }

        requestAnimationFrame(doWarmUp)
    }

    showEnterButton() {
        if (this.progressFill) {
            this.progressFill.style.width = '100%'
        }
        if (this.progressBtnText) {
            this.progressBtnText.textContent = 'Explorar'
        }
        if (this.loadingEnterBtn) {
            this.loadingEnterBtn.disabled = false
            this.loadingEnterBtn.classList.add('ready')
            this.loadingEnterBtn.addEventListener('click', () => {
                this.startExperience()
            }, { once: true })
        }
    }

    /**
     * User clicked "Explorar" → slide cloud out, reveal main scene.
     */
    async startExperience() {
        if (!this.rendererReady) return
        if (this.loadingEnterBtn) {
            this.loadingEnterBtn.disabled = true
            this.loadingEnterBtn.classList.remove('ready')
        }

        // Start rendering scene immediately under the iris.
        this.ready = true

        // Start from full black instantly to avoid a visible frame leak.
        this.renderer.setIrisTransitionEnabled(true)
        this.renderer.setIrisTransitionSize(0.0)

        // Remove white UI overlay after iris is active.
        this.cloudTransition?.remove()
        this.cloudTransition = null

        // Iris transition: open to a small hole, hold, anticipation in, open fully.
        // Total ~3.2 s — shaders compile naturally in the render loop during this time.
        // On mobile, we make the hole significantly bigger because 0.075 is microscopic 
        // on a phone screen, which makes it look like a "black screen bug" to the user.
        const isMobile = this.quality.isLow
        const holeSize = isMobile ? 0.25 : 0.075
        const shrinkSize = isMobile ? 0.18 : 0.058

        await this.animateValue(0.0, holeSize, 420, (v) => this.renderer.setIrisTransitionSize(v))
        await this.waitMs(1000)
        await this.animateValue(holeSize, shrinkSize, 150, (v) => this.renderer.setIrisTransitionSize(v))
        await this.animateValue(shrinkSize, 1.35, 1650, (v) => this.renderer.setIrisTransitionSize(v))
        this.renderer.setIrisTransitionEnabled(false)
    }

    waitMs(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    animateValue(from, to, duration, onUpdate) {
        return new Promise((resolve) => {
            const start = performance.now()

            const tick = () => {
                const elapsed = performance.now() - start
                const t = Math.min(elapsed / duration, 1)
                const eased = t < 0.5
                    ? 2 * t * t
                    : 1 - Math.pow(-2 * t + 2, 2) / 2

                const value = from + (to - from) * eased
                onUpdate(value)

                if (t < 1) {
                    requestAnimationFrame(tick)
                } else {
                    resolve()
                }
            }

            requestAnimationFrame(tick)
        })
    }

    resize() {
        this.camera.resize()
        this.renderer.resize()
    }

    update() {
        // Prevent any render call before WebGPU backend init finishes.
        if (!this.rendererReady) return

        // Render main scene behind transition while locked.
        if (!this.ready) {
            this.camera.update()
            this.world.update()
            this.renderer.update()
            return
        }

        // Full interactive experience
        this.mobileControls.update()
        this.camera.update()
        this.world.update()
        this.renderer.update()
    }
}
