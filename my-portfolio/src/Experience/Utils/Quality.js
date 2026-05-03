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
     * Shadows are ALWAYS on — both quality levels cast real shadows.
     * We use a fixed 1024x1024 map to bypass Three.js WebGPU texture-resizing bugs.
     * Quality is instead controlled by PCF kernel (shadowRadius) and draw distance.
     */
    get shadowsEnabled() { return true }

    /** Fixed to 1024. Resizing this dynamically in WebGPU causes crashes. */
    get shadowMapSize()    { return 1024 }
    /** PCF kernel half-size: 1 low (sharp, cheap) / 3 high (soft, expensive). */
    get shadowRadius()     { return this.isLow ? 1 : 3 }
    /** Orthographic shadow camera frustum half-size. */
    get shadowCameraSize() { return this.isLow ? 18 : 22 }

    /** Grass blade count (per spawn cluster). */
    get grassCount()      { return this.isLow ? 6000 : 10000 }
    get grassViewRadius() { return this.isLow ? 14 : 20 }
    /** Foliage SDF cubes (Bushes / dense vegetation). */
    get foliagePlanes()   { return this.isLow ? 36 : 80 }
}
