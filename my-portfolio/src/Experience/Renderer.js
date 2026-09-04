import * as THREE from 'three'
import {
    pass, uniform, float, screenUV, screenSize, mix, smoothstep, abs,
    vec2, vec3, vec4, max, length, luminance, renderOutput, mrt, output,
    rtt, uv, getNormalFromDepth, cameraProjectionMatrixInverse
} from 'three/tsl'
import { outline } from 'three/examples/jsm/tsl/display/OutlineNode.js'
import { gaussianBlur } from 'three/examples/jsm/tsl/display/GaussianBlurNode.js'
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js'
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js'
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js'
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js'
import { AO_MASK, sweepDepthlessFromAO } from './World/aoMask.js'
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

        // -- Ambient occlusion (high only) --
        //
        // Contact shadow where things meet: under the house, in the eaves,
        // where the fence enters the dirt, in the corners of the room. The
        // scene is pastel and lit flat, which is exactly what reads as "clean
        // but weightless"; AO is what sits everything ON the island instead of
        // hovering a millimetre above it.
        //
        // Radius is in WORLD units, so it is tied to how big things are here:
        // 0.5 is about a fence post, which is the scale of contact we want.
        this.uAoRadius = uniform(0.4)
        this.uAoScale = uniform(0.3)
        this.uAoThickness = uniform(0.6)

        // GTAO rotates its sample pattern with a noise texture, so what comes
        // out is a NOISE FIELD, not a smooth one — its own docs say a denoise
        // pass "might be required". It is not optional here: without it the
        // shading reads as grain rather than shadow, worst across the leaf
        // cards where every alpha edge is a cliff in the depth buffer.
        //
        // The filter is edge-aware: it blurs the occlusion while refusing to
        // blur ACROSS a change in depth, so contacts stay crisp. depthPhi is
        // how strict that refusal is.
        // Of these three only the RADIUS changes the picture much, and it is
        // the one that costs nothing: the filter always takes 16 samples, and
        // radius only scales how far apart they sit. The two phi values are
        // rejection thresholds -- how different in depth, and in brightness, a
        // neighbour is allowed to be before it stops counting -- and low is
        // strict, which is what keeps contacts crisp.
        // Off, after trying it on. Half res is much cheaper -- 75.3 ms against
        // 48.2 ms measured at a resolution high enough for the GPU to be the
        // bottleneck -- and side by side in daylight at this intensity the two
        // are hard to separate, which is why it went in.
        //
        // What that comparison missed is the low sun. A half-res occlusion
        // buffer sampled bilinearly at full res mixes, along every silhouette,
        // the texel sitting on the object with the texel sitting on the ground
        // behind it. The result is a rim one or two pixels wide that is lighter
        // than the shadow it interrupts, hugging the outline -- and against a
        // long evening shadow on flat dirt that rim reads as a glow around
        // every fence post.
        //
        // It is a real saving and it stays one switch away, but the default
        // belongs on the side of the picture.
        this._aoOptions = { halfRes: false }

        this.uAoDenoiseRadius = uniform(4)
        this.uAoDepthPhi = uniform(0.5)
        this.uAoLumaPhi = uniform(0.5)

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

            const a = this.experience.debug.ui.addFolder('Oclusion ambiental')
            a.close()
            a.add(this.uAoRadius, 'value', 0.05, 3, 0.05).name('Radio')
            a.add(this.uAoScale, 'value', 0, 2, 0.05).name('Intensidad')
            a.add(this.uAoThickness, 'value', 0.1, 4, 0.05).name('Grosor')
            a.add(this.uAoDenoiseRadius, 'value', 1, 16, 0.5).name('Suavizado · radio')
            a.add(this.uAoDepthPhi, 'value', 0.5, 15, 0.5).name('Suavizado · bordes')
            a.add(this.uAoLumaPhi, 'value', 0.5, 20, 0.5).name('Suavizado · luma')
            a.add(this._aoOptions, 'halfRes').name('Media resolución')
                .onChange((v) => {
                    if (!this._aoPass) return
                    this._aoPass.resolutionScale = v ? 0.5 : 1
                    const el = this.instance.domElement
                    this._aoPass.setSize(el.width, el.height)
                })
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

        // React to live quality changes -- but NOT here, and not now.
        //
        // This fires straight out of a click on a card in the settings modal,
        // which lands wherever the browser felt like putting it: quite possibly
        // between the renderer submitting a frame and the GPU finishing with
        // it. Swapping the whole node graph at that moment tears down render
        // targets the driver is still reading, which is what produces
        // "Destroyed texture [Texture "aoMask"] used in a submit" and the
        // invalid-pipeline errors that follow it.
        //
        // The second reason is ORDER. Two other listeners hang off this event:
        // the settings modal, and Environment, which flips the sun's castShadow
        // and so creates or destroys the shadow map. They run in registration
        // order, and that order is decided by a race -- Renderer subscribes
        // once `renderer.init()` resolves, Environment once the resources are
        // ready, and either can win on any given load. Rebuild before
        // Environment has moved the shadows and the new pass is wired to a
        // shadow map that is about to be disposed; the next frame then walks
        // into `Cannot read properties of null (reading 'depthTexture')`.
        //
        // Deferring to update() fixes both: every synchronous listener has
        // finished by then (so the shadows are always settled first, whatever
        // the registration order), and update() runs between frames rather
        // than inside one.
        this.quality.on('change', () => { this._qualityDirty = true; this._qualityWaited = 0 })
    }

    _buildPostProcessingPipeline() {
        const scenePass = pass(this.scene, this.camera.instance)

        // The pass carries a second, single-value attachment: 1 means "this
        // pixel may be shaded by ambient occlusion". Everything writes 1 unless
        // its material says otherwise — see World/aoMask.js.
        //
        // Written on BOTH quality levels even though only high reads it. Making
        // it conditional means the foliage materials have to gain and lose
        // their override as the setting changes, and rebuilding a live material
        // around a different output shape is what turned every tree into a bare
        // trunk. One ignored channel is the cheaper of the two problems.
        // The mask attachment follows each material's own blending, and that
        // is what makes abstaining possible.
        //
        // MRT attachments are NOT blended by default: every draw overwrites the
        // channel across its whole triangle. That is right for opaque geometry
        // and wrong for everything drawn on top of it -- a music note has no
        // depth of its own, so whatever it says about occlusion is a statement
        // about a surface it knows nothing about, applied over its entire quad.
        //
        // Following material blending sorts both cases out at once, because
        // opaque materials resolve to no blending and still write outright,
        // while transparent ones blend by their output alpha. So a sprite
        // writing alpha 0 into this channel contributes exactly nothing and the
        // value underneath survives. See World/aoMask.js.
        const sceneMRT = mrt({ output, [AO_MASK]: float(1) })
        sceneMRT.setBlendMode(AO_MASK, { blending: THREE.MaterialBlending })
        scenePass.setMRT(sceneMRT)
        const sceneColor = scenePass.getTextureNode('output')

        // 0. Ambient occlusion (high only) — contact shadow where things meet.
        let sceneShaded = sceneColor
        if (this.quality.isHigh) {
            // Normals RECONSTRUCTED FROM DEPTH, not written to an MRT buffer.
            //
            // The MRT route is what the docs show and it produced scattered
            // dark specks all over the ground. The reason: every transparent
            // effect here — music notes, fireflies, confetti, the water — draws
            // with depthWrite off, so it writes a NORMAL at those pixels while
            // leaving the DEPTH of the ground behind it. GTAO then compared a
            // sprite's normal against the floor's depth and shaded a little
            // rectangle under each one.
            //
            // Reconstructing from depth cannot go wrong that way: the things
            // that caused it are exactly the things absent from the depth
            // buffer. It also drops the whole normal attachment, so the scene
            // pass goes back to being a plain colour node and everything
            // downstream is untouched.
            //
            // Reconstructed ONCE, into a texture, instead of on demand.
            //
            // `normalNode = null` is what asks both nodes to rebuild the normal
            // from depth, and getNormalFromDepth is not cheap: it reads the
            // depth buffer NINE times (a five-tap cross on each axis, to pick
            // the side of an edge that is not a cliff) plus two view-space
            // unprojections. GTAO calls it once per pixel, which is fine.
            //
            // DenoiseNode calls it inside its 16-sample loop. That is 16 x 9 =
            // 144 depth reads per pixel on top of everything else, and the
            // denoise is not even a pass of its own -- it is inlined into the
            // final composite, so it runs at full screen size at whatever pixel
            // ratio the high tier is using. It was by far the most expensive
            // thing in the frame.
            //
            // Every one of those 144 reads recomputes a value that depends only
            // on the pixel, so it is pure repeated work. Doing it once into a
            // half-float target and sampling that gives the SAME normals for
            // ~1/17th of the reads. Nothing about the look is meant to change.
            //
            // Note this is not the MRT normal buffer that had to be abandoned:
            // the source is still the depth buffer, which the transparent
            // effects are absent from. It is the same reconstruction, cached.
            const depthTexture = scenePass.getTextureNode('depth')
            const viewNormal = rtt(vec4(getNormalFromDepth(
                uv(), depthTexture.value, cameraProjectionMatrixInverse
            ), 1.0))
            this._normalCache = viewNormal

            const aoPass = ao(
                depthTexture,
                viewNormal,
                this.camera.instance
            )
            aoPass.radius = this.uAoRadius
            aoPass.scale = this.uAoScale
            aoPass.thickness = this.uAoThickness
            // Full resolution by default -- see the note on _aoOptions for why
            // the cheaper setting is available but not chosen.
            aoPass.resolutionScale = this._aoOptions.halfRes ? 0.5 : 1
            this._aoPass = aoPass

            // Edge-aware smoothing of the raw occlusion, off the same cached
            // normals -- this is the call that was paying for 144 of them.
            const cleaned = denoise(
                aoPass.getTextureNode(),
                depthTexture,
                viewNormal,
                this.camera.instance
            )
            cleaned.radius = this.uAoDenoiseRadius
            cleaned.depthPhi = this.uAoDepthPhi
            cleaned.lumaPhi = this.uAoLumaPhi
            this._aoDenoise = cleaned

            // `.r`, not the whole texel. The AO target is single-channel
            // (RedFormat), so a bare multiply drives green and blue to zero and
            // the whole island comes out scarlet -- which is exactly what it
            // did. The occlusion is a scalar; treat it as one.
            // Blend the occlusion toward "none" wherever the mask says so, so
            // the foliage keeps casting AO without receiving any.
            const mask = scenePass.getTextureNode(AO_MASK).r
            sceneShaded = sceneColor.mul(mix(float(1), cleaned.r, mask))
        } else { this._aoPass = null; this._aoDenoise = null; this._normalCache = null }

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

        // The outline is UI drawn over the world, so it is added after the
        // occlusion rather than being dimmed by it.
        let composited = outlineColor.add(sceneShaded)

        // 1b. Bloom (threshold 1.0) — only HDR surfaces above 1.0 glow: fire
        // core/embers and the lamp glass. Pastel scene untouched.
        // Bloom off the RAW colour: it exists for the fire core and the lamp
        // glass, which are emissive and above 1.0 — things ambient occlusion
        // has no business dimming.
        const bloomPass = bloom(sceneColor, 0.5, 0.6, 1.0)
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

    /**
     * Whether the sun's shadow map exists if it is supposed to.
     *
     * Rebuilding the pipeline is safe on its own, and turning the sun's shadow
     * back on is safe on its own -- both were bisected. Doing BOTH inside the
     * same frame is what breaks, and only in that direction:
     *
     * three creates a light's shadow map inside ShadowNode.setup(), which runs
     * while a material compiles. A rebuild throws every shader away, so on the
     * first frame afterwards the shadow node's updateBefore() runs before
     * anything has re-entered setup() -- and reads `this.shadowMap.depthTexture`
     * off a null. The exception escapes through the middle of _renderObjects(),
     * so the renderer never gets to restore its own state; the next pipeline is
     * then compiled believing there is no MRT, comes out with one output
     * against a two-attachment target, and is rejected. That is the pair of
     * errors -- "Cannot read properties of null (reading 'depthTexture')" and
     * "targets[1] framebuffer output" -- and the black screen after them.
     *
     * So: wait. The frame that would have crashed instead renders with the
     * pipeline that is already up, which is exactly the frame during which
     * three sets the shadow map up. By the next one the dependency is real and
     * the rebuild is safe. Costs one frame at the old quality level, on an
     * action that already redraws everything.
     */
    _shadowsSettled() {
        const sun = this.experience.world?.environment?.sunLight
        if (!sun || !sun.castShadow) return true
        return sun.shadow.map !== null
    }

    update() {
        // Deferred from the quality listener -- see the comment there. Must
        // stay ahead of render() and behind every 'change' listener, which is
        // exactly where it is: Experience ticks camera, then world, then this.
        // The wait is bounded. If the shadow map never turns up -- a device
        // where the shadow pass is off entirely, or some future change that
        // stops anything receiving shadows -- the setting must still land.
        // Giving up after half a second is no worse than the old behaviour;
        // hanging on the old quality level forever would be.
        if (this._qualityDirty && (this._shadowsSettled() || ++this._qualityWaited > 30)) {
            this._qualityDirty = false
            // The high tier renders above the device pixel ratio (see
            // Quality.pixelRatio), so switching tiers has to resize as well as
            // rebuild -- otherwise the change only lands on the next resize.
            this.instance.setPixelRatio(this.quality.pixelRatio)
            this._buildPostProcessingPipeline()
        }

        // Safety net for the no-depth-write rule -- see aoMask.js. Cheap,
        // but not free, so it does not need to be every frame.
        if ((this._sweepTick = (this._sweepTick || 0) + 1) % 30 === 0) {
            sweepDepthlessFromAO(this.scene)
        }

        this._syncOutlineCamera()
        if (this.renderPipeline) {
            this.renderPipeline.render()
        }
    }
}
