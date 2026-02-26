import * as THREE from 'three'
import { pass, uniform, float, screenUV, mix, smoothstep, abs, vec2, max } from 'three/tsl'
import { outline } from 'three/examples/jsm/tsl/display/OutlineNode.js'
import { gaussianBlur } from 'three/examples/jsm/tsl/display/GaussianBlurNode.js'
import Experience from './Experience.js'

export default class Renderer {
    constructor() {
        this.experience = new Experience()
        this.canvas = this.experience.canvas
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene
        this.camera = this.experience.camera

        // Track outlined objects — shared array reference
        this.selectedObjects = []

        this.setInstance()
    }

    setInstance() {
        // WebGPURenderer automatically falls back to WebGL2
        // if WebGPU is not available in the browser
        this.instance = new THREE.WebGPURenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        })
        this.instance.outputColorSpace = THREE.SRGBColorSpace
        this.instance.toneMapping = THREE.ACESFilmicToneMapping
        this.instance.toneMappingExposure = 1.1
        this.instance.shadowMap.enabled = true
        this.instance.shadowMap.type = THREE.PCFShadowMap
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(this.sizes.pixelRatio)
    }

    /**
     * Async initialization — must be called after construction.
     * Waits for the WebGPU/WebGL backend to be ready before setting up post-processing.
     */
    async init() {
        await this.instance.init()
        this.setPostProcessing()
    }

    setPostProcessing() {
        // Use RenderPipeline (renamed from PostProcessing in r183)
        this.renderPipeline = new THREE.RenderPipeline(this.instance)

        // Scene pass — renders the main scene
        const scenePass = pass(this.scene, this.camera.instance)

        // ─── Outline pass ─────────────────────────────────────────
        const edgeStrength = uniform(2.5)
        const visibleEdgeColor = uniform(new THREE.Color('#ffffff'))
        const hiddenEdgeColor = uniform(new THREE.Color('#ffffff'))

        const outlinePass = outline(this.scene, this.camera.instance, {
            selectedObjects: this.selectedObjects,
            edgeThickness: float(1.5),
            edgeGlow: float(0.15)
        })

        // Compose: outlineColor + scenePass
        const { visibleEdge, hiddenEdge } = outlinePass
        const outlineColor = visibleEdge.mul(visibleEdgeColor)
            .add(hiddenEdge.mul(hiddenEdgeColor))
            .mul(edgeStrength)

        // Scene + outline combined
        const composited = outlineColor.add(scenePass)

        // ─── Tilt-Shift Blur (Miniature/Diorama effect) ───────────
        // Gaussian blur of the composited scene
        const blurredScene = gaussianBlur(composited, vec2(1), 6, { resolutionScale: 0.5 })

        // Tilt-shift mask: sharp in center, blurred at top/bottom edges
        // screenUV.y goes 0..1 (bottom to top)
        const centerY = float(0.5)
        const distFromCenter = abs(screenUV.y.sub(centerY))

        // Also add slight radial (vignette) blur from left/right edges
        const distFromCenterX = abs(screenUV.x.sub(0.5))
        const radialDist = max(distFromCenter, distFromCenterX.mul(0.5))

        // Blur factor: 0 in center band, ramps up toward edges
        // The "sharp zone" is roughly the central 40% of the screen
        const blurFactor = smoothstep(0.15, 0.45, radialDist)

        // Mix sharp and blurred
        const finalOutput = mix(composited, blurredScene, blurFactor)

        // Final output
        this.renderPipeline.outputNode = finalOutput
    }

    // Add a single object to outline
    addOutlinedObject(object) {
        if (!this.selectedObjects.includes(object)) {
            this.selectedObjects.push(object)
        }
    }

    // Remove a single object from outline
    removeOutlinedObject(object) {
        const index = this.selectedObjects.indexOf(object)
        if (index > -1) {
            this.selectedObjects.splice(index, 1)
        }
    }

    // Clear all outlined objects
    clearOutlinedObjects() {
        this.selectedObjects.length = 0
    }

    resize() {
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(this.sizes.pixelRatio)
    }

    update() {
        // Use RenderPipeline for render (includes scene + post-processing)
        if (this.renderPipeline) {
            this.renderPipeline.render()
        } else {
            this.instance.render(this.scene, this.camera.instance)
        }
    }
}
