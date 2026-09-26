/**
 * Figures that count up to themselves when they arrive.
 *
 * The three numbers under the project picture are the only quantitative claim
 * on this page -- how many chart types, how big the bundle, how many models it
 * needed -- and they were arriving as quietly as the labels under them. A
 * number that counts is a number somebody reads.
 *
 * ── What it will and will not touch ──────────────────────────────────────
 *
 * The values are authored strings, not numbers: "6", "149 KB", "0". So the
 * leading run of digits is animated and everything around it is left exactly
 * as written, punctuation and units and all. If a value does not begin with a
 * number, or its number will not parse, nothing happens to it at all -- it is
 * set and left alone. A counter that mangles the one fact it was given is
 * worse than no counter.
 *
 * ── Why an observer per element rather than one call at the right time ───
 *
 * These are repainted every time you pick a different project, and that can
 * happen while the section is off screen (the first one is chosen as the page
 * is built) or while you are looking straight at it. An IntersectionObserver
 * covers both without either case being written down: off screen it waits, on
 * screen it fires immediately, and a project switched under your nose counts
 * again because the element it is watching is a new one.
 */
const DURATION = 950

export default class CountUp {
    constructor({ duration = DURATION } = {}) {
        this.duration = duration
        this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        this.raf = 0
        this.live = new Set()

        if (this.reduced || typeof IntersectionObserver === 'undefined') return
        this._io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (!e.isIntersecting) continue
                this._io.unobserve(e.target)
                this._begin(e.target)
            }
        }, { threshold: 0.4 })
        this._tick = this._tick.bind(this)
    }

    /**
     * @param {HTMLElement} el   the cell to fill
     * @param {string} text      the value exactly as authored
     */
    watch(el, text) {
        el.textContent = text
        const m = /^(\D*?)(\d[\d .,]*)(.*)$/s.exec(text)
        const target = m ? Number(m[2].replace(/[ \s.,]/g, '')) : NaN
        // Nothing to count: no digits, an unparseable number, or a zero, which
        // would be a counter animating from zero to zero.
        if (!this._io || !m || !Number.isFinite(target) || target === 0) return

        el._cu = { pre: m[1], post: m[3], target, from: 0, t0: 0 }
        el.textContent = m[1] + '0' + m[3]
        this._io.observe(el)
    }

    _begin(el) {
        if (!el.isConnected || !el._cu) return
        el._cu.t0 = performance.now()
        this.live.add(el)
        if (!this.raf) this.raf = requestAnimationFrame(this._tick)
    }

    _tick(now) {
        this.raf = 0
        for (const el of [...this.live]) {
            const c = el._cu
            if (!el.isConnected || !c) { this.live.delete(el); continue }
            const p = Math.min((now - c.t0) / this.duration, 1)
            // Ease out, hard. A linear count reaches its last few units at the
            // same speed it left zero, and the number you are actually reading
            // is the one it lands on.
            const v = Math.round(c.target * (1 - Math.pow(1 - p, 4)))
            el.textContent = c.pre + v + c.post
            if (p >= 1) this.live.delete(el)
        }
        if (this.live.size) this.raf = requestAnimationFrame(this._tick)
    }

    destroy() {
        this._io?.disconnect()
        cancelAnimationFrame(this.raf)
        this.live.clear()
    }
}
