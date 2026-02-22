import * as THREE from 'three'
import { pass, uniform, float } from 'three/tsl'
import { outline } from 'three/examples/jsm/tsl/display/OutlineNode.js'
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
        this.instance.shadowMap.type = THREE.PCFSoftShadowMap
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

        // Outline pass — TSL version
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

        // Final output: scene + outline overlay
        this.renderPipeline.outputNode = outlineColor.add(scenePass)
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
