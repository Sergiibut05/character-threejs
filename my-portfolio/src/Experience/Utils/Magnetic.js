/**
 * Magnetic controls: a button leans toward the cursor as it comes near.
 *
 * The one piece of the custom-cursor vocabulary that belongs on this site.
 * The rest of that genre -- a dot, a ring trailing it, `mix-blend-mode:
 * difference` inverting whatever is behind -- is agency-portfolio language:
 * hard geometry, monochrome, and a layer of chrome sitting ON TOP of the page
 * rather than part of it. Two reasons it is not here:
 *
 *   A cursor drawn in JavaScript is the one thing on this site that cannot
 *   escape the main thread, and the main thread on this site STOPS -- that is
 *   the whole reason the boot screen exists. It would freeze solid in the one
 *   second everything else keeps moving, with the real cursor hidden
 *   underneath it.
 *
 *   And the start screen already answers the pointer better than a ring could:
 *   the hills, the house, the copy and the dog all move with it, and the dog
 *   turns to look at it.
 *
 * This survives both objections. It is the object reacting to you rather than
 * an overlay following you -- which is also exactly the idiom of the game this
 * site is dressed as -- and it is `translate` on an element that is already
 * its own layer, so it costs a composite and nothing else.
 *
 * Written as two numbers on the control (--mag-x, --mag-y) rather than as a
 * transform, so the stylesheet decides what moves and by how much: the pill
 * takes the full offset, and the label and arrow inside it take a fraction
 * more on top, which is the half of this that reads as "expensive".
 */

/* How far out the pull starts, in px from the edge of the control. */
const RADIUS = 92
/* And the furthest the control will ever go, however hard you chase it. */
const MAX = 9
/*
 * How long it takes to catch up, in seconds, as a time constant: the offset
 * closes this much of the remaining gap in that time and keeps closing the
 * rest, so there is no arrival and nothing to overshoot.
 *
 * ── Why the smoothing is here and not in a CSS transition ────────────────
 *
 * It was in CSS first, and it was in CSS on only ONE of the four controls,
 * which is how the bug announced itself. `.cloud-btn` carries
 * `transition: all 0.5s` for its ready state, so the moment `translate` came
 * along it was transitioned too -- and a transition retargeted every frame is
 * an exponential smoother, so the green pill damped and lagged while its own
 * label, which had no transition, snapped straight to the full offset. Beside
 * it, Quick overview had no `all` and so moved instantly and completely. One
 * effect, three different behaviours, and the one that looked most broken was
 * the button whose halves disagreed with each other.
 *
 * Here it is one loop, frame-rate independent, and every control and every
 * layer inside it moves off the same smoothed number -- so the label leading
 * the pill stays the fixed fraction it is meant to be instead of being an
 * accident of which element happened to inherit a transition.
 */
const TAU = 0.11

export default class Magnetic {
    /**
     * @param {Element} root   where to look for the controls
     * @param {string} selector which ones
     */
    constructor(root, selector, { radius = RADIUS, max = MAX } = {}) {
        this.root = root
        this.selector = selector
        this.radius = radius
        this.max = max
        this.els = []
        this.boxes = []
        this.at = new Map()
        this.stale = true
        this.raf = 0
        this.last = 0
        this.pointer = null

        // A finger has no hover, so there is nothing for a control to lean
        // toward; and the whole thing is decoration, which is what the
        // reduced-motion setting is for.
        this.on = !!root
            && window.matchMedia('(pointer: fine)').matches
            && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (!this.on) return

        this._onMove = this._onMove.bind(this)
        this._tick = this._tick.bind(this)
        this._invalidate = () => { this.stale = true }
        // Pointer gone from the document: everything goes home rather than
        // freezing wherever it was abandoned.
        this._onLeave = () => { this.pointer = null; this._start() }

        window.addEventListener('pointermove', this._onMove, { passive: true })
        window.addEventListener('resize', this._invalidate, { passive: true })
        // Capturing, because the page that uses this scrolls and the boxes
        // move with it. Marked dirty rather than re-measured: scrolling with
        // the pointer still costs nothing until the pointer actually moves.
        window.addEventListener('scroll', this._invalidate, { passive: true, capture: true })
        document.addEventListener('pointerleave', this._onLeave, { passive: true })
        window.addEventListener('blur', this._onLeave, { passive: true })
    }

    /** After anything that changes the layout without resizing or scrolling. */
    refresh() { this.stale = true }

    _measure() {
        this.stale = false
        this.els = [...this.root.querySelectorAll(this.selector)]
        // Viewport boxes, not document ones, because some of these live in a
        // sticky bar: their document position moves in a way no scroll offset
        // can be added back.
        this.boxes = this.els.map((el) => el.getBoundingClientRect())
    }

    _onMove(e) {
        this.pointer = [e.clientX, e.clientY]
        this._start()
    }

    _start() {
        if (this.raf) return
        this.last = performance.now()
        this.raf = requestAnimationFrame(this._tick)
    }

    /**
     * One pass: work out where each control wants to be, then move it part of
     * the way there.
     *
     * The loop keeps itself alive while anything is still travelling and stops
     * as soon as everything has settled, so a pointer sitting still costs
     * nothing -- but letting go of the mouse mid-swing still eases out instead
     * of stopping dead on the last event that happened to arrive.
     */
    _tick(now) {
        this.raf = 0
        if (!this.root) return
        if (this.stale) this._measure()

        // Clamped, so a tab coming back from the background catches up in one
        // step rather than teleporting through the easing.
        const dt = Math.min((now - this.last) / 1000, 0.05)
        this.last = now
        const k = 1 - Math.exp(-dt / TAU)

        const p = this.pointer
        const R = this.radius
        let moving = false

        for (let i = 0; i < this.els.length; i++) {
            const el = this.els[i]
            const b = this.boxes[i]
            if (!b.width) continue

            let tx = 0
            let ty = 0
            if (p) {
                // Distance to the nearest point ON the box, not to its centre.
                // These are pills two hundred pixels wide; measured from the
                // middle, the ends of the one you are standing on read as dead.
                const dx = Math.max(b.left - p[0], 0, p[0] - b.right)
                const dy = Math.max(b.top - p[1], 0, p[1] - b.bottom)
                const d = Math.hypot(dx, dy)
                if (d < R) {
                    // Smoothstep rather than the straight 1 - d/R. Linear
                    // falloff has a corner in it at the edge of the radius, and
                    // the corner is exactly where the effect announces itself.
                    const t = 1 - d / R
                    const s = t * t * (3 - 2 * t)
                    const cx = b.left + b.width / 2
                    const cy = b.top + b.height / 2
                    // Normalised by the reach in each axis, so the pull is
                    // bounded without a second clamp and a wide pill does not
                    // slide further sideways than a round one does.
                    tx = clamp((p[0] - cx) / (b.width / 2 + R)) * this.max * s
                    ty = clamp((p[1] - cy) / (b.height / 2 + R)) * this.max * s
                }
            }

            let cur = this.at.get(el)
            if (!cur) this.at.set(el, cur = [0, 0])
            cur[0] += (tx - cur[0]) * k
            cur[1] += (ty - cur[1]) * k

            // A twentieth of a pixel is under the threshold at which a
            // composite would change anything on screen.
            if (Math.abs(tx - cur[0]) > 0.05 || Math.abs(ty - cur[1]) > 0.05) moving = true

            if (Math.abs(cur[0]) < 0.05 && Math.abs(cur[1]) < 0.05) {
                if (el.style.getPropertyValue('--mag-x')) this._clear(el)
                continue
            }
            el.style.setProperty('--mag-x', `${cur[0].toFixed(2)}px`)
            el.style.setProperty('--mag-y', `${cur[1].toFixed(2)}px`)
        }

        if (moving) this.raf = requestAnimationFrame(this._tick)
    }

    _clear(el) {
        el.style.removeProperty('--mag-x')
        el.style.removeProperty('--mag-y')
    }

    destroy() {
        if (!this.on) return
        this.on = false
        window.removeEventListener('pointermove', this._onMove)
        window.removeEventListener('resize', this._invalidate)
        window.removeEventListener('scroll', this._invalidate, { capture: true })
        document.removeEventListener('pointerleave', this._onLeave)
        window.removeEventListener('blur', this._onLeave)
        cancelAnimationFrame(this.raf)
        for (const el of this.els) this._clear(el)
        this.els = []
        this.boxes = []
        this.at.clear()
        this.root = null
    }
}

function clamp(v) { return Math.max(-1, Math.min(1, v)) }
