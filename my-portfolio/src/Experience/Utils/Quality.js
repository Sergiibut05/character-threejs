/**
 * Quality — runtime quality preset.
 *
 * Inspired by Bruno Simon's `folio-2025` Quality system.
 *
 * Levels:
 *   - 0  HIGH   (desktop default; full effects + shadows + bigger pixel ratio)
 *   - 1  LOW    (mobile default; smaller shadow map, slimmer effects)
 *
 * Persistence:
 *   - User selection stored in `localStorage('portfolio.quality')`.
 *   - On first visit, the level is auto-detected from the user agent.
 *
 * Events:
 *   - 'change' → fired with the new level (0 / 1) whenever it changes.
 *
 * Subscribers (Renderer, Lighting, Floor, etc.) should listen to 'change'
 * and re-apply their quality-dependent settings without a page reload.
 */
import EventEmitter from './EventEmitter.js'
import { REAL_SHADOWS_SUPPORTED } from './DeviceCaps.js'

const STORAGE_KEY = 'portfolio.quality'
const MOBILE_REGEX = /Mobi|Android|iPhone|iPad|iPod/i

/** Floor for the device pixel ratio on high quality. See `pixelRatio`. */
const HIGH_MIN_DPR = 1.5

export default class Quality extends EventEmitter {
    constructor() {
        super()

        this.isMobile = MOBILE_REGEX.test(navigator.userAgent)

        const stored = this._readStored()
        this.level = stored !== null ? stored : (this.isMobile ? 1 : 0)
        this.userSelected = stored !== null
    }

    _readStored() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw === null) return null
            const n = parseInt(raw, 10)
            return (n === 0 || n === 1) ? n : null
        } catch (e) {
            return null
        }
    }

    /** Set quality and persist. Triggers 'change' if it actually changes. */
    setLevel(level, { persist = true, silent = false } = {}) {
        if (level !== 0 && level !== 1) return
        if (level === this.level && persist === this.userSelected) return

        const changed = level !== this.level
        this.level = level
        if (persist) {
            this.userSelected = true
            try { localStorage.setItem(STORAGE_KEY, String(level)) } catch (e) { /* ignore */ }
        }
        if (changed && !silent) this.trigger('change', [level])
    }

    /** Convenience for buttons — toggle between high (0) and low (1). */
    toggle() {
        this.setLevel(this.level === 0 ? 1 : 0)
    }

    // ── derived getters ───────────────────────────────────────────────

    get isLow()  { return this.level >= 1 }
    get isHigh() { return this.level === 0 }

    /**
     * High quality on a phone, which is NOT the same thing as high quality on
     * a desktop and should never have been.
     *
     * The two levels were written as one set of numbers each, and on a desktop
     * the gap between them is a fair trade. On a mid-range Android it is not a
     * trade at all: low runs, high does not, so the level exists without being
     * usable and the phone is left with one option instead of two.
     *
     * What makes the difference there is not the same as what makes it on a
     * desktop. A phone already renders at pixel ratio 2 on BOTH levels, so
     * resolution is not the variable -- the full-screen passes on top of it
     * are, and each one costs a phone far more per pixel than it costs a GPU
     * with the bandwidth to spare. So mobile high keeps every effect that you
     * can actually see on a 6-inch screen and gives up the ones you cannot:
     * see aoHalfRes, fxaa and tiltShiftRadius below.
     *
     * The point is that High on a phone still LOOKS like High -- ambient
     * occlusion, more grass, denser foliage -- while costing something a phone
     * can pay. Half a High is worth having; a High that stutters is not.
     */
    get isMobileHigh() { return this.isHigh && this.isMobile }

    /**
     * pixelRatio — capped at 2 on every device (matching Bruno's defaults).
     * Mobile retina screens already supersample, so a pixelRatio < 2 is
     * almost always wasteful blur. Low quality keeps the cap because the
     * cost is paid once per resize, not per frame.
     */
    get pixelRatio() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        // On HIGH, never render below 1.5x.
        //
        // A retina screen supersamples for free at dpr 2; a plain 1x monitor
        // -- which is most desktops, and most people looking at this -- gets
        // no supersampling at all, and that is the single most visible
        // difference between the two. Rendering at 1.5 and letting the browser
        // downscale is the oldest and best antialiasing there is.
        //
        // It costs 2.25x the pixels, which is why it is the high tier only and
        // why HIGH_MIN_DPR is a knob: drop it to 1.25 (1.56x) if the frame
        // budget gets tight.
        return this.isHigh ? Math.max(dpr, HIGH_MIN_DPR) : dpr
    }

    /**
     * antialias — only when the pixel ratio is below 2. Retina supersamples.
     */
    get antialias() {
        return this.pixelRatio < 2
    }

    /**
     * Whether the post pipeline runs FXAA.
     *
     * Exactly the reasoning in `antialias` directly above, applied to the pass
     * that does the same job: below a pixel ratio of 2 there is no
     * supersampling and the edges need help; at 2 there already is, and a
     * full-screen dependent-texture-read pass buys nothing you can see. Every
     * phone here is at 2, so this only ever cost them frames.
     */
    get fxaa() { return this.isHigh && this.pixelRatio < 2 }

    /**
     * Ambient occlusion at half resolution.
     *
     * Occlusion is a low-frequency signal -- it is soft contact darkening, and
     * it goes through an edge-aware denoise afterwards regardless -- so
     * resolving it per pixel is the least useful place a phone can spend a
     * quarter of its frame. Both the AO pass and the denoise that follows it
     * drop to a quarter of the pixels, and what you lose is smaller than what
     * the denoise was already smoothing away.
     */
    get aoHalfRes() { return this.isMobile }

    /**
     * Tilt-shift blur radius, in taps.
     *
     * Runs on BOTH levels and over the whole frame, so it is the one
     * full-screen pass a phone cannot opt out of -- which is exactly why it
     * should not also be the widest one. The blur is a background effect at
     * the top and bottom edges of the screen; nobody is inspecting its
     * falloff on a phone.
     */
    get tiltShiftRadius() { return (this.isLow || this.isMobile) ? 2 : 3 }

    /**
     * Real shadow maps on both quality levels — EXCEPT on Android, where
     * three's WebGPU backend drops the TEXTURE_COMPARE capability (UA sniff)
     * and the fallback shadow-sampling path breaks our materials entirely
     * (missing floor/props/character). There the whole shadow-map pipeline is
     * disabled and FakeShadow blobs take over. See Utils/DeviceCaps.js.
     */
    get shadowsEnabled() { return REAL_SHADOWS_SUPPORTED }

    /**
     * Whether the sun actually casts. This is the ONE switch that turns real
     * shadows on and off — per-object castShadow/receiveShadow flags say what
     * an object WOULD do, never what the current quality level allows.
     *
     * They used to be written as `!quality.isLow` at construction time and
     * never revisited, so changing quality at runtime left them stale: coming
     * from low nothing ever started casting, and coming from high everything
     * kept casting under the low-quality shadow settings. Only a reload looked
     * right. With the decision living here instead, a quality change is one
     * assignment and both directions match a fresh load.
     */
    get sunShadows() { return REAL_SHADOWS_SUPPORTED && this.isHigh }

    /**
     * 2048, and CONSTANT.
     *
     * The constraint was never the number, it was the changing: resizing a
     * shadow map at runtime crashes the WebGPU backend, so this must return
     * the same value for every quality level and never be recomputed. It does.
     *
     * What the size buys is sharpness, because what actually matters is the
     * TEXEL -- how much world one shadow-map pixel covers. At 1024 over a
     * +-50 m box that was 9.8 cm, which is coarse enough that a low sun put
     * visible bands of self-shadowing across flat ground. Doubling the map
     * halves it to 4.9 cm.
     *
     * Everything downstream follows on its own: Environment derives both the
     * normalBias and the texel-snapping grid from this and shadowCameraSize
     * rather than from typed-in numbers, so the bias halves with the texel and
     * the shadows stop needing as much of it.
     *
     * The cost is real and worth knowing: the shadow pass rasterises four
     * times the pixels, and the map is 4x the memory. Only the sun casts, and
     * only on high quality, so nothing on a low-end device pays it.
     */
    get shadowMapSize()    { return 2048 }
    // No shadowRadius here on purpose. three takes the PCF radius in TEXELS,
    // so a number authored at this level means a different real blur width
    // every time the map or the box changes -- and it did change under us when
    // the map went to 2048, halving the softness with nobody touching a line.
    // Environment authors it in METRES and converts. See SHADOW_SOFTNESS_WORLD.
    /**
     * Half-extent of the directional shadow ortho frustum (±size on left/right/top/bottom).
     * Too small → a hard “straight line” on the ground where shadow coverage ends (patio + bridge
     * extend past the old ~36–44 unit box). Larger spreads the same 1024² map over more world units
     * (softer / coarser texels — fine for this art style).
     */
    get shadowCameraSize() { return this.isLow ? 40 : 50 }

    /**
     * Grass blades spawned across the whole patio -- so this is vertex work,
     * paid whether or not a blade survives the view cull below.
     */
    get grassCount()      { return this.isLow ? 6000 : (this.isMobileHigh ? 7500 : 10000) }
    /**
     * The visible-grass disc is shifted `grassViewAhead` metres toward where
     * the camera looks, so the character sits near its rear (south) edge and
     * no budget is wasted on grass behind the camera. That forward shift is
     * why the radius can be trimmed vs. the old character-centred values
     * (14 / 20) with MORE on-screen coverage, not less.
     */
    get grassViewRadius() { return this.isLow ? 12.5 : (this.isMobileHigh ? 14.5 : 18) }
    get grassViewAhead()  { return this.isLow ? 8 : (this.isMobileHigh ? 9.5 : 12) }
    /**
     * Foliage SDF cubes (Bushes / dense vegetation). Every one is an
     * alpha-tested plane, so these are overdrawn fill -- the cost a mobile GPU
     * feels most and the one a 6-inch screen shows least.
     */
    get foliagePlanes()   { return this.isLow ? 36 : (this.isMobileHigh ? 52 : 80) }

    /**
     * Ground positions offered to the meadow decor (flowers, clover, stones).
     * More candidates means a denser scatter of instanced quads, which is more
     * transparent overdraw over the ground -- the same fill cost as the
     * foliage above, in a different shape.
     */
    get meadowCandidates() { return this.isLow ? 2500 : (this.isMobileHigh ? 3200 : 4500) }
}
