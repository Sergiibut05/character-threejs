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
     * pixelRatio — capped at 2 on every device (matching Bruno's defaults).
     * Mobile retina screens already supersample, so a pixelRatio < 2 is
     * almost always wasteful blur. Low quality keeps the cap because the
     * cost is paid once per resize, not per frame.
     */
    get pixelRatio() {
        return Math.min(window.devicePixelRatio || 1, 2)
    }

    /**
     * antialias — only when the pixel ratio is below 2. Retina supersamples.
     */
    get antialias() {
        return this.pixelRatio < 2
    }

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

    /** Fixed to 1024. Resizing this dynamically in WebGPU causes crashes. */
    get shadowMapSize()    { return 1024 }
    /** PCF kernel half-size: 1 low (sharp, cheap) / 3 high (soft, expensive). */
    get shadowRadius()     { return this.isLow ? 1 : 3 }
    /**
     * Half-extent of the directional shadow ortho frustum (±size on left/right/top/bottom).
     * Too small → a hard “straight line” on the ground where shadow coverage ends (patio + bridge
     * extend past the old ~36–44 unit box). Larger spreads the same 1024² map over more world units
     * (softer / coarser texels — fine for this art style).
     */
    get shadowCameraSize() { return this.isLow ? 40 : 50 }

    /** Grass blade count (per spawn cluster). */
    get grassCount()      { return this.isLow ? 6000 : 10000 }
    /**
     * The visible-grass disc is shifted `grassViewAhead` metres toward where
     * the camera looks, so the character sits near its rear (south) edge and
     * no budget is wasted on grass behind the camera. That forward shift is
     * why the radius can be trimmed vs. the old character-centred values
     * (14 / 20) with MORE on-screen coverage, not less.
     */
    get grassViewRadius() { return this.isLow ? 12.5 : 18 }
    get grassViewAhead()  { return this.isLow ? 8 : 12 }
    /** Foliage SDF cubes (Bushes / dense vegetation). */
    get foliagePlanes()   { return this.isLow ? 36 : 80 }
}
