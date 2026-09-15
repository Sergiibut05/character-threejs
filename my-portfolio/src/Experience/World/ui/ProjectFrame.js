/**
 * ProjectFrame — ONE picture surface for the whole Projects section.
 *
 * The section is an index now: three names in a column, and this, the single
 * frame beside them. Point at a name and the frame becomes that project;
 * stay on it and the still gives way to the product actually running.
 *
 * ── Why one surface and not one per project ──────────────────────────────
 *
 * The version this replaces gave every project its own canvas, its own
 * <video> and its own pair of textures, all stacked inside a carousel. Three
 * of everything to show one thing at a time, and the moment two of them were
 * on screen at once the section stopped reading as a composition and started
 * reading as a widget. One surface is not only lighter, it is the design: the
 * frame is a window, and what changes is what is behind it.
 *
 * ── The two-canvas trick ─────────────────────────────────────────────────
 *
 * The shader samples exactly two textures, `from` and `to`. A window onto
 * three projects has to point those at different pictures over time, and
 * swapping which THREE.Texture a node is bound to means rebuilding the bind
 * group underneath it. So the two texture objects are created once and never
 * change: each wraps a 2D canvas, and "loading" a picture into a slot is a
 * drawImage plus needsUpdate. The GPU side stays put and only the bytes move,
 * which is also exactly what a video needs, frame after frame.
 *
 * ── The shader, and where it comes from ──────────────────────────────────
 *
 * Not written from memory. Checked against two implementations:
 *
 *   gl-transitions/displacement.glsl (MIT)
 *     float d = texture2D(displacementMap, uv).r * strength;
 *     vec2 uvFrom = vec2(uv.x + progress * d, uv.y);
 *     vec2 uvTo   = vec2(uv.x - (1.0 - progress) * d, uv.y);
 *     mix(getFromColor(uvFrom), getToColor(uvTo), progress);
 *
 *   robin-dela/hover-effect (MIT), the same idea tuned for hover:
 *     vec2 p1 = myUV + getRotM(angle1) * dispVec * intensity1 * dispFactor;
 *     vec2 p2 = myUV + getRotM(angle2) * dispVec * intensity2 * (1.0 - dispFactor);
 *     mix(texture2D(texture1, p1), texture2D(texture2, p2), dispFactor);
 *
 * This follows the second: a two-channel displacement rotated by opposing
 * angles, so the layers part rather than both shearing along x. Either way the
 * property that matters is that whichever layer is on screen at the ends of
 * the travel is the undistorted one, and the smear only lives in the middle.
 *
 * Two departures. TSL instead of GLSL, because this project aliases `three` to
 * the WebGPU build and has a standing rule against shader strings. And no
 * displacement map file: both references ship a PNG of noise, this reaches for
 * the fBm node the world's water and grass already use, which costs no request
 * and nothing to keep in sync.
 *
 * ── When it does nothing ─────────────────────────────────────────────────
 *
 * Under `prefers-reduced-motion`, without WebGPU, or if anything at all throws
 * on the way up, this never starts and the <img> underneath is what the reader
 * sees. That image is the real still at the real size; nothing is lost but the
 * morph. Every method below is safe to call in that state.
 */
import * as THREE from 'three'
import { Fn, uv, uniform, texture, vec2, vec3, vec4, mix, smoothstep, float } from 'three/tsl'
import { fbm } from '../TSL/NoiseNodes.js'

/** The buffer everything renders through, in device pixels. 3:2, like the
 *  sources, so nothing is cropped before object-fit gets a say. */
const W = 1200
const H = 800

/**
 * ── Which transition ─────────────────────────────────────────────────────
 *
 * Two are built. Change this line to swap them; nothing else knows which is
 * running.
 *
 *   'dissolve'  the new one. The picture is EATEN rather than smeared: a
 *               ragged frontier crosses the frame and the project appears
 *               behind it, with a thin bright edge riding the boundary. The
 *               shape of the frontier is the same fBm the smear used, mixed
 *               with a near-horizontal ramp, so it has a direction and still
 *               has no straight edge anywhere on it.
 *
 *   'displace'  the original. Both layers slide along opposing diagonals,
 *               pushed by a two-channel noise field, and cross in the middle.
 *
 * They cost the same: one fBm, two texture samples, no extra buffer. The
 * difference is entirely in what the eye is told. The smear says the picture
 * is made of liquid; the dissolve says it is being uncovered, which is closer
 * to what the section is actually doing -- the frame is a window and the
 * project is what is behind it.
 */
const TRANSITION = 'dissolve'

/** dissolve: half the width of the frontier, in threshold units -- NOT in
 *  pixels, which is the trap here. The threshold field crosses the frame at
 *  about 0.54 units per frame-width, so an edge of 0.17 spelled a band nearly
 *  half the picture wide and the transition read as a green fog rather than as
 *  an edge. At 0.07 the band is a hand's width of picture, which is what lets
 *  you see it as a boundary between two images. */
const EDGE = 0.07

/** dissolve: how much of the frontier is noise and how much is a straight
 *  sweep. At 0 it is a hard-edged horizontal wipe; at 1 the picture dissolves
 *  in unconnected blotches with no direction at all. */
const ROUGHNESS = 0.46

/** dissolve: a small opposing slide, so the two layers are not simply
 *  stencilled against each other. Much smaller than the smear's. */
const DRIFT = 0.03

/** dissolve: the light riding the frontier. Green rather than white, because
 *  a white rim on this palette reads as a video editor's wipe; this reads as
 *  the page's own colour catching the edge. Kept low: it should be noticed
 *  after the fact, not during. */
const RIM = 0.42
const RIM_COLOR = [0.36, 0.86, 0.6]

/** How fast the rim falls away from the frontier. This is the difference
 *  between a line and a cloud: the raw band is bright across most of its
 *  width, and only a steep exponent squeezes the light into the middle of
 *  it. */
const RIM_FALLOFF = 5.0

/** Seconds for the smear to cross. Project to project is slower than still to
 *  video: it is a bigger claim and it has further to go. */
const SWEEP_VIDEO = 0.75
const SWEEP_PROJECT = 0.95

/** How far the layers slide, in UV. Past ~0.4 the frame tears open and shows
 *  the clamped edge of the texture. */
const INTENSITY = 0.3

/** Opposing rotations, so the layers part instead of shearing together.
 *  hover-effect's own defaults are this pair. */
const ANGLE_FROM = Math.PI * 0.25
const ANGLE_TO = -Math.PI * 0.25

/** Scale of the noise. Low gives big soft lobes, which reads as a material;
 *  high looks like television static. */
const FIELD = 2.6

/** Rotate by a CONSTANT angle, so the sin and cos fold at build time rather
 *  than being computed per fragment the way getRotM() does. */
const rotate = (v, angle) => {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return vec2(v.x.mul(c).sub(v.y.mul(s)), v.x.mul(s).add(v.y.mul(c)))
}

/** A 2D canvas and the texture that wraps it: one slot of the shader. */
function makeSlot() {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return { canvas, ctx: canvas.getContext('2d'), tex }
}

export default class ProjectFrame {
    /** @param {HTMLCanvasElement} output the canvas sitting in the frame */
    constructor(output) {
        this.output = output
        this.ctx = output.getContext('2d')

        this._progress = 0
        this._target = 0
        this._sweep = SWEEP_PROJECT
        this._holding = null      // a <video> whose frames feed the `to` slot
        this._frame = null
        this._last = 0
        this._painted = false
        this._failed = false
        // Both of these exist because every public method here has an `await`
        // in it, and anything with an await can be overtaken.
        //
        // _gen counts STILL requests: the one that finishes last must be the
        // one that was asked for last, not the one whose file happened to
        // decode first.
        //
        // _wantVideo is the video's own answer to the same problem, and it has
        // to be a separate flag rather than a second use of _gen. A video is
        // asked for once and then holds for as long as the pointer stays, so
        // there is nothing to count; what matters is whether the request is
        // still wanted by the time the file is ready to play. Without this,
        // leaving the section during that window left the frame holding a
        // video that had already been paused -- a still frame, redrawn forever,
        // with the loop never stopping.
        this._gen = 0
        this._wantVideo = false
        this._done = null
        // A video that has arrived while the picture before it is still on its
        // way in. See showVideo.
        this._queued = null
        // The picture to fall back to when the video is put away. See
        // _restBehind: going straight to a video leaves the OUTGOING project
        // in the `from` slot, and that is the wrong thing to retreat to.
        this._restStill = null
        this._images = new Map()
        this._tick = this._tick.bind(this)

        this.enabled = !matchMedia('(prefers-reduced-motion: reduce)').matches
    }

    /**
     * Show a project's still.
     *
     * @param {string} src     the image to move to
     * @param {boolean} first  paint it with no travel, for the first frame
     * @param {boolean} back   true when moving UP the list, which runs the
     *                         frontier in the opposite direction
     */
    async showStill(src, first = false, back = false) {
        const gen = ++this._gen
        this._wantVideo = false
        this._queued = null
        if (!(await this._ready())) return false
        const image = await this._image(src)
        if (!image || this._stale(gen)) return false
        // After the boot, not before it: on the very first call the uniform
        // does not exist yet.
        this._flipU.value = back ? 1 : 0

        this._holding = null
        this._finish()

        if (first || !this._painted) {
            this._draw(this._from, image)
            this._draw(this._to, image)
            this._progress = this._target = 0
            this._painted = true
            this._render()
            return true
        }

        this._settleFrom()
        this._draw(this._to, image)
        this._progress = 0
        this._target = 1
        this._sweep = SWEEP_PROJECT
        this._start()
        return true
    }

    /**
     * Wipe from whatever is showing straight to a playing video, and hold.
     *
     * @param {HTMLVideoElement} video
     * @param {boolean} back   run the frontier the other way, as showStill
     * @param {number}  sweep  seconds. A video arriving as the ANSWER to a
     *                         project being chosen is a project change and
     *                         takes the project time; one arriving on its own
     *                         takes the shorter one.
     * @param {string}  still  this project's own still. Not shown now -- the
     *                         whole point is that it is not -- but parked
     *                         behind the video so there is something correct
     *                         to retreat to. See _restBehind.
     */
    async showVideo(video, { back = false, sweep = SWEEP_PROJECT, still = null } = {}) {
        this._wantVideo = true
        // Decoding starts now, so it is ready long before the wipe ends.
        if (still) this._image(still)
        if (!this._painted || !(await this._ready())) return false
        // Asked for and then un-asked for while the renderer was coming up.
        if (!this._wantVideo || !video || video.readyState < 2) return false

        /*
         * If the picture is still arriving, QUEUE, do not cut in.
         *
         * The project wipe takes 0.95s and the video is asked for after 280ms
         * of dwell, so the still was being interrupted at about a third of its
         * travel, every single time: the frontier set off across the frame,
         * stopped dead, and a second transition started from zero. Two clean
         * transitions back to back read as one broken one, and that is exactly
         * what it looked like.
         *
         * The dwell still does its real job -- it is what stops three video
         * files being fetched while the pointer runs down the list -- but the
         * handover now happens where it belongs, at the end of the first
         * travel. _tick picks this up the moment the still lands.
         */
        if (this._progress !== this._target) {
            this._queued = video
            this._queuedSweep = sweep
            this._queuedStill = still
            this._start()
            return true
        }

        this._flipU.value = back ? 1 : 0
        this._restStill = still
        this._toVideo(video, sweep)
        return true
    }

    /**
     * Let go of the video WITHOUT moving the picture.
     *
     * The difference from hideVideo is the whole reason both exist. Leaving
     * the section is a retreat: the video has to travel back to the still,
     * because the still is what should be sitting there afterwards. Choosing
     * another project is not a retreat -- the picture is about to be replaced
     * anyway, and travelling back to the old still first would be a wipe
     * nobody asked for, in the wrong direction, immediately undone.
     *
     * So this stops the hold and leaves the frame showing exactly what it was
     * showing. The next wipe reads that off the output canvas and carries on
     * from it.
     */
    releaseVideo(onDone = null) {
        this._wantVideo = false
        this._queued = null
        this._restStill = null
        this._holding = null
        this._finish()
        onDone?.()
    }

    /**
     * Park this project's still in the outgoing slot, once it cannot be seen.
     *
     * Going straight to a video means the wipe runs FROM the previous project,
     * so when it lands the `from` slot still holds that previous project. Put
     * the video away later and the frame would retreat to the wrong picture
     * entirely: the one from two selections ago.
     *
     * At progress 1 the mask is 1 across the whole frame, so `from` is
     * contributing nothing and can be overwritten without a flicker. That was
     * measured, not assumed: at both ends of the travel the output is
     * pixel-identical to the slot that owns it.
     */
    _restBehind() {
        const src = this._restStill
        if (!src) return
        this._restStill = null
        this._image(src).then((img) => {
            // The retreat may have started while this decoded. If it has,
            // `from` is on screen and must not be touched.
            if (img && this._holding && this._target === 1 && this._progress === 1) {
                this._draw(this._from, img)
            }
        })
    }

    /** Start the wipe from whatever is showing to this video. */
    _toVideo(video, sweep = SWEEP_VIDEO) {
        this._settleFrom()
        this._draw(this._to, video)
        this._holding = video
        this._progress = 0
        this._target = 1
        this._sweep = sweep
        this._start()
    }

    /**
     * Back to the still the `from` slot is already holding.
     *
     * `onDone` is the important half. The caller's real intent is "stop the
     * video", and doing that the obvious way -- pausing it and then asking for
     * the wipe -- froze the picture on its last frame and then spent three
     * quarters of a second smearing that frozen frame off the screen. Which is
     * precisely what it looked like: a video stuck mid-transition.
     *
     * So the video keeps running for as long as it is on screen, and the
     * callback fires at the far end of the travel, when the still is what is
     * showing and pausing costs nothing to look at.
     *
     * `instant` is for when the frame has left the viewport outright: there is
     * nobody to show the travel to, so it snaps and the callback runs now.
     */
    hideVideo({ instant = false, onDone = null } = {}) {
        // Cancels a request that is still in flight as well as one that has
        // landed. NOT a bump of _gen: a still on its way in is a different
        // question and must survive this.
        this._wantVideo = false
        this._queued = null
        this._restStill = null
        if (!this._renderer || !this._holding) {
            onDone?.()
            return
        }
        this._done = onDone
        if (instant) {
            this._progress = this._target = 0
            this._holding = null
            this._render()
            this._finish()
            return
        }
        this._target = 0
        this._sweep = SWEEP_VIDEO
        this._start()
    }

    /** Whether the shader is actually the thing on screen. */
    get live() { return this._painted && !!this._renderer }

    // ─── Internals ───────────────────────────────────────────────────────

    /** True when a newer request has been made since this one started. */
    _stale(gen) { return this._gen !== gen }

    /** Run and clear whatever was waiting for the travel to finish. */
    _finish() {
        const done = this._done
        this._done = null
        done?.()
    }

    async _ready() {
        if (!this.enabled || this._failed) return false
        if (this._renderer) return true
        if (this._booting) return this._booting
        this._booting = this._boot()
        return this._booting
    }

    async _boot() {
        try {
            const canvas = document.createElement('canvas')
            canvas.width = W
            canvas.height = H
            const renderer = new THREE.WebGPURenderer({
                canvas,
                // A full-frame quad has no edges to soften.
                antialias: false,
                powerPreference: 'low-power'
            })
            renderer.setSize(W, H, false)
            renderer.outputColorSpace = THREE.SRGBColorSpace
            await renderer.init()

            this._from = makeSlot()
            this._to = makeSlot()

            const progress = uniform(0)
            // 0 forward, 1 reversed. Going back up the list runs the same
            // frontier the other way, which is the difference between a list
            // you can move around in and a slideshow that only goes one way.
            const flip = uniform(0)
            const material = new THREE.MeshBasicNodeMaterial()
            material.colorNode = TRANSITION === 'dissolve'
                ? this._dissolveNode(progress, flip)
                : this._displaceNode(progress)

            this._progressU = progress
            this._flipU = flip
            this._scene = new THREE.Scene()
            // A quad seen through an orthographic box is the cheapest way to
            // say "this pixel is that texel".
            this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
            this._geometry = new THREE.PlaneGeometry(2, 2)
            this._material = material
            this._scene.add(new THREE.Mesh(this._geometry, material))
            this._renderer = renderer
            return true
        } catch (err) {
            // Never at the cost of the picture: the <img> is already correct.
            console.warn('ProjectFrame: no renderer, the stills carry it', err)
            this._failed = true
            return false
        }
    }

    /**
     * The smear. Two layers pushed along opposing diagonals by a two-channel
     * noise field, crossing in the middle. See the header for its sources.
     */
    _displaceNode(progress) {
        return Fn(() => {
            const st = uv()
            // Two channels of fBm stand in for the displacement PNG the
            // references load. Already centred on zero, so no -0.5.
            const field = vec2(
                fbm(st.mul(FIELD)),
                fbm(st.mul(FIELD).add(vec2(11.3, 7.1)))
            )
            const p = progress
            const a = st.add(rotate(field, ANGLE_FROM).mul(INTENSITY).mul(p))
            const b = st.add(rotate(field, ANGLE_TO).mul(INTENSITY).mul(p.oneMinus()))
            return mix(texture(this._from.tex, a), texture(this._to.tex, b), p)
        })()
    }

    /**
     * The dissolve.
     *
     * One scalar decides, per pixel, which of the two pictures is showing. Set
     * that scalar to pure noise and you get blotches; set it to the x
     * coordinate and you get a hard vertical wipe. Mixed, you get a frontier
     * that travels in a direction and is ragged all the way along it, which is
     * the whole effect.
     *
     * The threshold does not run 0 to 1 but -EDGE to 1+EDGE, so the soft band
     * is entirely OUTSIDE the frame at both ends of the travel. Without that
     * slack the transition starts and finishes with a half-mixed strip still
     * on screen, and the ends are exactly where the picture has to be clean.
     *
     * The rim is the band's own derivative, near enough: `m * (1 - m)` peaks
     * where the frontier is and is zero everywhere else, so the light exists
     * only on the edge and costs no second pass to find it.
     */
    _dissolveNode(progress, flip) {
        return Fn(() => {
            const st = uv()
            // fBm comes back centred on zero with about +-0.94 of range.
            const noise = fbm(st.mul(FIELD)).mul(0.53).add(0.5)
            // Mostly across, tilted a little, so the frontier is not a plumb
            // line -- a slight diagonal reads as deliberate where a vertical
            // reads as a slide transition.
            //
            // Mirrored when `flip` is 1, which is what makes going BACK up the
            // list read as going back: the same torn edge, travelling the
            // other way. Only the sweep is mirrored, not the noise, so the
            // material stays the same in both directions -- it is one piece of
            // paper being torn from either side, not two different papers.
            const axisF = st.x.mul(0.84).add(st.y.mul(0.16))
            // Forward, the new picture arrives from the RIGHT and the frontier
            // travels left, which is the direction anything moves when you go
            // further down a list. Backwards it is the other way round. That
            // is the whole convention, and it is worth keeping because it is
            // the one people already have.
            const axis = mix(axisF.oneMinus(), axisF, flip)
            const field = mix(axis, noise, ROUGHNESS)

            const t = progress.mul(1 + 2 * EDGE).sub(EDGE)
            // 0 where the old picture still stands, 1 where the new one has
            // taken over. oneMinus because smoothstep rises with `field`.
            const m = smoothstep(t.sub(EDGE), t.add(EDGE), field).oneMinus()

            // A small slide in opposite directions, so the frontier is not a
            // stencil laid over two motionless images. It follows the sweep:
            // a drift that kept going right while the edge travelled left
            // would fight the gesture rather than carry it.
            const push = vec2(DRIFT, 0).mul(flip.mul(2).sub(float(1)))
            const a = st.add(push.mul(m))
            const b = st.sub(push.mul(m.oneMinus()))
            const col = mix(texture(this._from.tex, a), texture(this._to.tex, b), m)

            // Peaks on the frontier, zero on both sides of it. Squared to keep
            // the light in a thin line rather than a haze.
            const rim = m.mul(m.oneMinus()).mul(4).pow(float(RIM_FALLOFF))
            const lit = col.xyz.add(vec3(...RIM_COLOR).mul(rim).mul(RIM))
            return vec4(lit, 1)
        })()
    }

    /** Decode a still once and keep it. */
    _image(src) {
        if (this._images.has(src)) return this._images.get(src)
        const p = new Promise((resolve) => {
            const img = new Image()
            img.decoding = 'async'
            img.onload = () => resolve(img)
            img.onerror = () => resolve(null)
            img.src = src
        })
        this._images.set(src, p)
        return p
    }

    /** Draw a source into a slot, cover-style, and tell the GPU. */
    _draw(slot, source) {
        const sw = source.videoWidth || source.naturalWidth || source.width
        const sh = source.videoHeight || source.naturalHeight || source.height
        if (!sw || !sh) return
        const scale = Math.max(W / sw, H / sh)
        const dw = sw * scale
        const dh = sh * scale
        slot.ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh)
        slot.tex.needsUpdate = true
    }

    /**
     * Fold whatever is currently on screen into the `from` slot.
     *
     * Mid-travel the picture is a blend of both slots that exists only on the
     * GPU, so the honest source for "what is on screen" is the output canvas
     * itself. Starting a new wipe from the last presented frame is what stops
     * a fast second hover from snapping back to an older image first.
     */
    _settleFrom() {
        if (!this._painted) return
        this._from.ctx.drawImage(this.output, 0, 0, W, H)
        this._from.tex.needsUpdate = true
    }

    _start() {
        if (this._frame !== null) return
        this._last = performance.now()
        this._frame = requestAnimationFrame(this._tick)
    }

    _render() {
        if (!this._renderer) return
        this._progressU.value = this._progress
        this._renderer.render(this._scene, this._camera)
        this.ctx.drawImage(this._renderer.domElement, 0, 0, W, H)
        this.output.classList.add('is-live')
    }

    _tick(now) {
        const dt = Math.min((now - this._last) / 1000, 0.05)
        this._last = now

        // A live video is bytes that change every frame, so its slot is
        // refreshed for as long as it is the destination.
        if (this._holding && this._holding.readyState >= 2 && this._target === 1) {
            this._draw(this._to, this._holding)
        }

        const step = dt / this._sweep
        this._progress += THREE.MathUtils.clamp(this._target - this._progress, -step, step)
        if (Math.abs(this._target - this._progress) < 0.002) this._progress = this._target
        this._render()

        const settled = this._progress === this._target
        if (settled && this._target === 1 && !this._holding) {
            // Arrived at a still: fold it into `from` and reset, so the next
            // wipe always runs 0 to 1 and never has to think about direction.
            this._from.ctx.drawImage(this._to.canvas, 0, 0)
            this._from.tex.needsUpdate = true
            this._progress = this._target = 0
            this._render()
            // ...and only NOW does a video that arrived mid-travel get to go.
            if (this._queued && this._wantVideo) {
                const next = this._queued
                const sweep = this._queuedSweep
                this._restStill = this._queuedStill
                this._queued = null
                this._toVideo(next, sweep)
            }
        }
        if (settled && this._target === 1 && this._holding) this._restBehind()

        if (settled && this._target === 0) {
            this._holding = null
            // The still is on screen now, so the video can stop without
            // anybody seeing it stop.
            this._finish()
            // A video asked for while the frame was retreating waited for the
            // retreat to finish. Now it can go.
            if (this._queued && this._wantVideo) {
                const next = this._queued
                const sweep = this._queuedSweep
                this._restStill = this._queuedStill
                this._queued = null
                this._toVideo(next, sweep)
            }
        }

        const busy = !settled || (this._holding && this._target === 1)
        this._frame = busy ? requestAnimationFrame(this._tick) : null
    }

    dispose() {
        if (this._frame !== null) cancelAnimationFrame(this._frame)
        this._frame = null
        this._holding = null
        this._queued = null
        this._restStill = null
        this._gen++
        this._wantVideo = false
        this._finish()
        this._from?.tex.dispose()
        this._to?.tex.dispose()
        this._material?.dispose()
        this._geometry?.dispose()
        this._renderer?.dispose?.()
        this._renderer = null
        this._images.clear()
    }
}
