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
        // Singleton
        if (instance) {
            return instance
        }
        instance = this

        // Global access
        window.experience = this

        // Options
        this.canvas = canvas

        // Flag to guard rendering before everything is ready
        this.ready = false

        // Setup (synchronous parts)
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

        // Loading screen elements
        this.loadingScreen = document.getElementById('loading-screen')
        this.loadingBarFill = document.getElementById('loading-bar-fill')
        this.loadingPercentage = document.getElementById('loading-percentage')
        this.loadingEnterBtn = document.getElementById('loading-enter-btn')

        // Track loading progress
        this.resourcesReady = false
        this.rendererReady = false

        // Listen for resource loading progress
        this.resources.on('progress', (progress) => {
            this.updateLoadingBar(progress)
        })

        // Listen for resources fully loaded
        this.resources.on('ready', () => {
            this.resourcesReady = true
            this.checkAllReady()
        })

        // Async: wait for the WebGPU/WebGL backend to initialize
        this.renderer.init().then(() => {
            this.rendererReady = true
            const backendName = this.renderer.instance?.backend?.constructor?.name || 'Unknown'
            console.log('✅ Renderer backend ready:', backendName)

            // KTX2 textures need the renderer for GPU feature detection
            this.resources.setRenderer(this.renderer.instance)

            this.checkAllReady()
        })

        // Resize event
        this.sizes.on('resize', () => {
            this.resize()
        })

        // Time tick event
        this.time.on('tick', () => {
            this.update()
        })
    }

    /**
     * Update the loading bar UI
     */
    updateLoadingBar(progress) {
        const percent = Math.round(progress * 100)
        if (this.loadingBarFill) {
            this.loadingBarFill.style.width = `${percent}%`
        }
        if (this.loadingPercentage) {
            this.loadingPercentage.textContent = `${percent}%`
        }
    }

    /**
     * Check if both resources and renderer are ready
     */
    checkAllReady() {
        if (this.resourcesReady && this.rendererReady) {
            // Update bar to 100%
            this.updateLoadingBar(1)

            // Warm-up: render a few frames silently behind the loading screen
            // This forces WebGPU/TSL shader compilation so there's no delay
            // when the user clicks "Explorar"
            this.warmUpRender()
        }
    }

    /**
     * Render a few frames behind the loading screen to compile shaders
     */
    warmUpRender() {
        let warmUpFrames = 0
        const totalWarmUpFrames = 3 // a few frames to ensure all shaders compile

        const doWarmUp = () => {
            // Render the scene (this triggers shader compilation)
            this.renderer.update()
            warmUpFrames++

            if (warmUpFrames < totalWarmUpFrames) {
                requestAnimationFrame(doWarmUp)
            } else {
                // Shaders are now compiled — show the enter button
                if (this.loadingEnterBtn) {
                    this.loadingEnterBtn.classList.add('is-visible')
                    this.loadingEnterBtn.addEventListener('click', () => {
                        this.startExperience()
                    }, { once: true })
                }
            }
        }

        requestAnimationFrame(doWarmUp)
    }

    /**
     * Called when user clicks the enter button
     */
    startExperience() {
        // Enable rendering
        this.ready = true

        // Hide loading screen with fade animation
        if (this.loadingScreen) {
            this.loadingScreen.classList.add('is-hidden')
            // Remove from DOM after animation completes
            this.loadingScreen.addEventListener('transitionend', () => {
                this.loadingScreen.remove()
            }, { once: true })
        }
    }

    resize() {
        this.camera.resize()
        this.renderer.resize()
    }

    update() {
        // Don't render until user has clicked enter
        if (!this.ready) return

        this.mobileControls.update()
        this.camera.update()
        this.world.update()
        this.renderer.update()
    }
}
