import * as THREE from 'three'
import { pass, uniform, float, screenUV, screenSize, mix, smoothstep, abs, vec2, vec4, max, length } from 'three/tsl'
import { outline } from 'three/examples/jsm/tsl/display/OutlineNode.js'
import { gaussianBlur } from 'three/examples/jsm/tsl/display/GaussianBlurNode.js'
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js'
import Experience from './Experience.js'

export default class Renderer {
    constructor() {
        this.experience = new Experience()
        this.canvas = this.experience.canvas
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene
        this.camera = this.experience.camera
        this.quality = this.experience.quality

        this.selectedObjects = []

        this.setInstance()
    }

    setInstance() {
        this.instance = new THREE.WebGPURenderer({
            canvas: this.canvas,
            // Hardware MSAA (antialias:true) in WebGPU creates a multisampled
            // shadow depth texture. The outline pass expects sample count=1.
            // Disable MSAA here — post-processing handles antialiasing.
            antialias: false,
            powerPreference: 'high-performance'
        })
        this.instance.outputColorSpace = THREE.SRGBColorSpace
        this.instance.toneMapping = THREE.ACESFilmicToneMapping
        this.instance.toneMappingExposure = 1.1

        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(this.quality.pixelRatio)
    }

    async init() {
        await this.instance.init()
        // Three r183+ unified Renderer: shadow maps default to OFF (`shadowMap.enabled === false`).
        // Only flipping `directional.castShadow` is insufficient — the LightsNode cache key skips
        // shadow passes until this is true (see three/src/renderers/common/nodes/NodeManager.js).
        this.instance.shadowMap.enabled = true
        this.instance.shadowMap.type = THREE.PCFShadowMap
        this.setPostProcessing()
    }

    setPostProcessing() {
        this.renderPipeline = new THREE.RenderPipeline(this.instance)
        
        // Iris variables
        this.irisEnabled = uniform(0.0)
        this.irisSize = uniform(1.35)
        this.irisEdgeSoftness = uniform(0.003)

        this._buildPostProcessingPipeline()

        // React to live quality changes
        this.quality.on('change', () => {
            this._buildPostProcessingPipeline()
        })
    }

    _buildPostProcessingPipeline() {
        const scenePass = pass(this.scene, this.camera.instance)
        
        // 1. Outline Pass
        const visibleEdgeColor = uniform(new THREE.Color('#ffffff'))
        const hiddenEdgeColor = uniform(new THREE.Color('#ffffff'))
        const edgeStrength = float(2.0)

        const outlinePass = outline(this.scene, this.camera.instance, {
            selectedObjects: this.selectedObjects,
            edgeThickness: float(1.5),
            edgeGlow: float(0.15)
        })

        const { visibleEdge, hiddenEdge } = outlinePass
        const outlineColor = visibleEdge.mul(visibleEdgeColor)
            .add(hiddenEdge.mul(hiddenEdgeColor))
            .mul(edgeStrength)

        let composited = outlineColor.add(scenePass)

        // 1b. Bloom (High quality only) — threshold 1.0 so ONLY HDR emissive
        // surfaces glow (fire core/embers are boosted above 1.0), the rest of
        // the pastel scene stays untouched.
        if (!this.quality.isLow) {
            const bloomPass = bloom(scenePass.getTextureNode(), 0.5, 0.4, 1.0)
            composited = composited.add(bloomPass)
        }

        // 2. Tilt-Shift Blur (Both Qualities)
        // Reduced intensity: radius 3 for High, 2 for Low to save GPU.
        // No resolutionScale to prevent fractional texture crashes on iPhone.
        const blurRadius = this.quality.isLow ? 2 : 3
        const blurredScene = gaussianBlur(composited, vec2(1), blurRadius)

        const centerY = float(0.5)
        const distFromCenter = abs(screenUV.y.sub(centerY))
        const blurFactor = smoothstep(0.15, 0.45, distFromCenter)

        let finalOutput = mix(composited, blurredScene, blurFactor)

        // 3. Iris transition (Animal Crossing Style)
        const ratio = screenSize.x.div(screenSize.y)
        const irisDist = length(vec2(
            screenUV.x.sub(0.5).mul(ratio),
            screenUV.y.sub(0.5)
        ))
        
        const irisAlpha = smoothstep(
            this.irisSize.sub(this.irisEdgeSoftness),
            this.irisSize.add(this.irisEdgeSoftness),
            irisDist
        ).mul(this.irisEnabled)

        finalOutput = mix(finalOutput, vec4(0.0, 0.0, 0.0, 1.0), irisAlpha)
        
        this.renderPipeline.outputNode = finalOutput
    }

    setIrisTransitionEnabled(enabled) {
        if (this.irisEnabled) this.irisEnabled.value = enabled ? 1.0 : 0.0
    }

    setIrisTransitionSize(size) {
        if (this.irisSize) this.irisSize.value = size
    }

    addOutlinedObject(object) {
        if (!this.selectedObjects.includes(object)) {
            this.selectedObjects.push(object)
        }
    }

    removeOutlinedObject(object) {
        const index = this.selectedObjects.indexOf(object)
        if (index > -1) {
            this.selectedObjects.splice(index, 1)
        }
    }

    clearOutlinedObjects() {
        this.selectedObjects.length = 0
    }

    resize() {
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(this.quality.pixelRatio)
    }

    update() {
        if (this.renderPipeline) {
            this.renderPipeline.render()
        }
    }
}
