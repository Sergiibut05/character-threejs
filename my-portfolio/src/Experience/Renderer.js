import * as THREE from 'three'
import {
    pass, uniform, float, screenUV, screenSize, mix, smoothstep, abs,
    vec2, vec3, vec4, max, length, luminance, renderOutput
} from 'three/tsl'
import { outline } from 'three/examples/jsm/tsl/display/OutlineNode.js'
import { gaussianBlur } from 'three/examples/jsm/tsl/display/GaussianBlurNode.js'
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js'
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js'
import Experience from './Experience.js'

/**
 * Layer for additive effects that must NOT act as outline occluders.
 *
 * OutlineNode works out which parts of an outlined object are hidden by
 * rendering the rest of the scene into a depth buffer — with
 * `scene.overrideMaterial`, which REPLACES every object's material. An
 * override ignores the per-object flags that make an effect an effect, so a
 * transparent additive billboard with depthWrite: false comes out of that pass
 * as a solid, depth-writing disc.
 *
 * That is what ate the standing lamp's outline: its halo is a 0.70-wide circle
 * over a 0.48-wide lamp, so with the light on the "occluder" covered the lamp's
 * own silhouette and the pass erased the edge underneath it. With the light off
 * the halo is not visible and the outline was perfect — which is exactly how it
 * looked from the outside.
 *
 * Anything put on this layer is drawn by the scene as usual and skipped by the
 * outline camera, so it can never be mistaken for something solid in front.
 */
export const FX_NO_OCCLUDE_LAYER = 1


export default class Renderer {
    constructor() {
        this.experience = new Experience()
        this.canvas = this.experience.canvas
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene
        this.camera = this.experience.camera
        this.quality = this.experience.quality

        this.selectedObjects = []

        
// Outline tuning (see _buildPostProcessingPipeline). Uniform-driven so
        // the debug GUI adjusts them live without rebuilding the pipeline.
        this.uEdgeThickness = uniform(2.4)
        this.uEdgeSuppress = uniform(1.6)

        // -- Final grade --
        //
        // The render was clean and a little flat: correct colours, no shaping.
        // These do what a colourist does last and cost almost nothing -- no
        // extra pass, just arithmetic on a pixel that is already fetched.
        //
        // Kept DELIBERATELY small. A vignette you can point at is too strong;
        // this one only has to stop the corners competing with the middle.
        this.uVignette = uniform(0.30)      // how dark the corners get
        this.uVignetteStart = uniform(0.55) // where it begins, in screen radii
        this.uSaturation = uniform(1.07)    // pastel palette, so barely any
        this.uContrast = uniform(1.05)

        if (this.experience.debug?.active) {
            const f = this.experience.debug.ui.addFolder('Outline')
            f.close()
            f.add(this.uEdgeThickness, 'value', 0.5, 5, 0.1).name('Grosor')
            f.add(this.uEdgeSuppress, 'value', 0, 4, 0.1).name('Recorte oclusión')

            const g = this.experience.debug.ui.addFolder('Grade')
            g.close()
            g.add(this.uVignette, 'value', 0, 1, 0.01).name('Viñeta')
            g.add(this.uVignetteStart, 'value', 0.1, 1.2, 0.01).name('Viñeta · inicio')
            g.add(this.uSaturation, 'value', 0.5, 1.6, 0.01).name('Saturación')
            g.add(this.uContrast, 'value', 0.7, 1.4, 0.01).name('Contraste')
        }

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
        // Gated by Quality: on Android the shadow pipeline must never exist
        // (broken TEXTURE_COMPARE fallback — see Utils/DeviceCaps.js).
        this.instance.shadowMap.enabled = this.quality.shadowsEnabled
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

        // 1. Outline Pass. The node's composite already clips the edge INSIDE
        // the object's own footprint (mask.r), but knows nothing about outside
        // occluders: the blur-dilated edge bled onto the character standing in
        // front. Fix: the node ALSO outputs the `hiddenEdge` field — the edge
        // where the object is depth-occluded (i.e. exactly where something like
        // the character covers it). Using that blurred field as a SUPPRESSOR on
        // the visible edge erases the outline right where an occluder overlaps
        // it, and leaves untouched edges at full strength.
        const visibleEdgeColor = uniform(new THREE.Color('#ffffff'))
        const edgeStrength = float(2.0)

        // A stand-in camera that tracks the real one but cannot see
        // FX_NO_OCCLUDE_LAYER. The outline pass gets this one; every other pass
        // keeps the real camera, so the effects still render normally.
        this.camera.instance.layers.enable(FX_NO_OCCLUDE_LAYER)
        this._outlineCamera = this.camera.instance.clone()
        this._syncOutlineCamera()

        const outlinePass = outline(this.scene, this._outlineCamera, {
            selectedObjects: this.selectedObjects,
            edgeThickness: this.uEdgeThickness,
            edgeGlow: float(0.15)
        })

        const { visibleEdge, hiddenEdge } = outlinePass
        const occluderCut = hiddenEdge.mul(this.uEdgeSuppress).oneMinus().clamp(0.0, 1.0)
        const outlineColor = visibleEdge.mul(occluderCut).mul(visibleEdgeColor).mul(edgeStrength)

        let composited = outlineColor.add(scenePass)

        // 1b. Bloom (threshold 1.0) — only HDR surfaces above 1.0 glow: fire
        // core/embers and the lamp glass. Pastel scene untouched.
        const bloomPass = bloom(scenePass.getTextureNode(), 0.5, 0.6, 1.0)
        composited = composited.add(bloomPass)

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

        // 4. Tone mapping and sRGB HERE, rather than at the output.
        //
        // Everything after this point wants perceptual pixels, not linear HDR
        // ones: FXAA weighs edges by luminance, and a contrast pivot at 0.5
        // only means "middle grey" once the image is in sRGB. This is exactly
        // what RenderOutputNode is for -- and it is why outputColorTransform
        // has to be turned off, or the renderer would do it a second time.
        this.renderPipeline.outputColorTransform = false
        let graded = renderOutput(finalOutput)

        // 5. The grade. Cheap enough for both quality levels: arithmetic on a
        // pixel that has already been fetched, not another pass.
        const rgb = graded.rgb
        const sat = mix(vec3(luminance(rgb)), rgb, this.uSaturation)
        const con = sat.sub(0.5).mul(this.uContrast).add(0.5)

        // Elliptical on purpose -- uncorrected screenUV follows the frame,
        // which is what a real lens does. Correcting for aspect would leave a
        // circle inside a wide screen with bright bands left and right.
        const vigT = smoothstep(this.uVignetteStart, float(1.05),
            length(screenUV.sub(vec2(0.5, 0.5))))
        graded = vec4(con.mul(vigT.mul(this.uVignette).oneMinus()).clamp(0.0, 1.0), 1.0)

        // 6. Antialiasing -- HIGH ONLY.
        //
        // There was none at all. MSAA is off on the renderer (it hands the
        // outline pass a multisampled depth texture it cannot read) under a
        // comment promising post-processing would handle it, and nothing ever
        // did: on a 1x monitor every low-poly silhouette and every white
        // outline was stepped. Retina hid it by supersampling, which is
        // probably how it survived this long.
        //
        // FXAA rather than SMAA: this art is big clean silhouettes with almost
        // no high-frequency detail, which is the case FXAA handles well and
        // the one where SMAA's extra cost buys least.
        if (this.quality.isHigh) graded = fxaa(graded)

        // 7. Iris last: a curtain over the finished frame, not something the
        // grade or the AA should be looking at.
        this.renderPipeline.outputNode =
            mix(graded, vec4(0.0, 0.0, 0.0, 1.0), irisAlpha)
    }

    /**
     * Keep the outline's stand-in camera on top of the real one.
     *
     * Cheap enough to do unconditionally: a handful of copies and one matrix
     * per frame. Doing it lazily on camera movement would need change tracking
     * for something that moves nearly every frame anyway.
     */
    _syncOutlineCamera() {
        const src = this.camera.instance
        const oc = this._outlineCamera
        if (!oc) return
        oc.position.copy(src.position)
        oc.quaternion.copy(src.quaternion)
        oc.scale.copy(src.scale)
        oc.fov = src.fov
        oc.aspect = src.aspect
        oc.near = src.near
        oc.far = src.far
        oc.zoom = src.zoom
        // Follow whatever the real camera can see, minus the effects layer.
        oc.layers.mask = src.layers.mask
        oc.layers.disable(FX_NO_OCCLUDE_LAYER)
        oc.updateProjectionMatrix()
        oc.updateMatrixWorld(true)
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
        this._syncOutlineCamera()
        if (this.renderPipeline) {
            this.renderPipeline.render()
        }
    }
}
