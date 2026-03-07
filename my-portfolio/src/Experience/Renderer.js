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
        this.instance.shadowMap.enabled = true
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

        // Outline pass
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

        if (this.quality.isLow) {
            this.renderPipeline.outputNode = composited
            return
        }

        // Tilt-Shift Blur (desktop only — too expensive on mobile)
        const blurredScene = gaussianBlur(composited, vec2(1), 6, { resolutionScale: 0.5 })

        const centerY = float(0.5)
        const distFromCenter = abs(screenUV.y.sub(centerY))
        const distFromCenterX = abs(screenUV.x.sub(0.5))
        const radialDist = max(distFromCenter, distFromCenterX.mul(0.5))
        const blurFactor = smoothstep(0.15, 0.45, radialDist)

        const finalOutput = mix(composited, blurredScene, blurFactor)

        this.renderPipeline.outputNode = finalOutput
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
        } else {
            this.instance.render(this.scene, this.camera.instance)
        }
    }
}
