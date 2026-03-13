import * as THREE from 'three'
import { pass, uniform, float, screenUV, screenSize, mix, smoothstep, abs, vec2, vec4, max, length } from 'three/tsl'
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
        this.quality = this.experience.quality

        this.selectedObjects = []

        this.setInstance()
    }

    setInstance() {
        this.instance = new THREE.WebGPURenderer({
            canvas: this.canvas,
            antialias: this.quality.antialias,
            powerPreference: 'high-performance'
        })
        this.instance.outputColorSpace = THREE.SRGBColorSpace
        this.instance.toneMapping = THREE.ACESFilmicToneMapping
        this.instance.toneMappingExposure = 1.1
        this.instance.shadowMap.enabled = !this.quality.isLow
        this.instance.shadowMap.type = THREE.PCFShadowMap
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(this.quality.pixelRatio)
    }

    async init() {
        await this.instance.init()
        this.setPostProcessing()
    }

    setPostProcessing() {
        this.renderPipeline = new THREE.RenderPipeline(this.instance)
        const scenePass = pass(this.scene, this.camera.instance)
        let finalOutput = scenePass

        if (!this.quality.isLow) {
            const edgeStrength = uniform(2.5)
            const visibleEdgeColor = uniform(new THREE.Color('#ffffff'))
            const hiddenEdgeColor = uniform(new THREE.Color('#ffffff'))

            const outlinePass = outline(this.scene, this.camera.instance, {
                selectedObjects: this.selectedObjects,
                edgeThickness: float(1.5),
                edgeGlow: float(0.15)
            })

            const { visibleEdge, hiddenEdge } = outlinePass
            const outlineColor = visibleEdge.mul(visibleEdgeColor)
                .add(hiddenEdge.mul(hiddenEdgeColor))
                .mul(edgeStrength)

            const composited = outlineColor.add(scenePass)

            // Tilt-Shift Blur (desktop only)
            const blurredScene = gaussianBlur(composited, vec2(1), 6, { resolutionScale: 0.5 })

            const centerY = float(0.5)
            const distFromCenter = abs(screenUV.y.sub(centerY))
            const distFromCenterX = abs(screenUV.x.sub(0.5))
            const radialDist = max(distFromCenter, distFromCenterX.mul(0.5))
            const blurFactor = smoothstep(0.15, 0.45, radialDist)

            finalOutput = mix(composited, blurredScene, blurFactor)
        }

        // Iris transition (Godot-like):
        // alpha = step(circle_size, distance(center, aspect-corrected uv))
        this.irisEnabled = uniform(0.0)
        this.irisSize = uniform(1.35)
        this.irisEdgeSoftness = uniform(0.003)

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
        if (!this.irisEnabled) return
        this.irisEnabled.value = enabled ? 1.0 : 0.0
    }

    setIrisTransitionSize(size) {
        if (!this.irisSize) return
        this.irisSize.value = size
    }

    // Kept for compatibility with older Experience.js calls.
    setCloudTransitionFactor() {}

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
        } else {
            this.instance.render(this.scene, this.camera.instance)
        }
    }
}
