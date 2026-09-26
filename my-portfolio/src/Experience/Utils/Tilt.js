/**
 * A panel that leans, in three dimensions, toward where you are looking.
 *
 * The sibling of Magnetic.js and the same argument for being here rather than
 * a cursor: it is the object reacting to you, not an overlay following you.
 * On a page printed on paper, a photograph that tips a couple of degrees reads
 * as a hand lifting it off the table -- which is a gesture that belongs to this
 * site, where a custom cursor's inverted ring would not.
 *
 * ── The driver is not the thing that moves ───────────────────────────────
 *
 * The project preview is a sticky panel on the right and the list of projects
 * is on the left, so the pointer is almost never ON the picture: it is over
 * the list, reading. Driving the tilt from the picture's own hover would mean
 * an effect nobody ever triggers. The driver is the whole two-column block
 * instead, so the preview leans toward you while you scan the names beside it,
 * which is also the more interesting version -- the panel is watching you
 * rather than responding to being touched.
 *
 * ── Smoothing, again in one place ────────────────────────────────────────
 *
 * Same exponential follow as Magnetic, for the same reason and after the same
 * bug: a CSS transition retargeted every frame is already a smoother, and
 * having one of those AND a lerp, or one on the parent and none on the child,
 * is how an effect ends up disagreeing with itself. So nothing here is
 * transitioned in CSS; the loop owns the easing and stops as soon as it has
 * settled.
 *
 * ── And what this must never be put on ───────────────────────────────────
 *
 * The closing card at the bottom of the overview had this, and it had to be
 * taken back out: the dog standing on it is a live WebGL render whose loop
 * steps an animation mixer and calls renderer.render every frame. A canvas
 * like that is its own compositing layer, updated on the GPU and repainted by
 * nobody -- and a 3D transform on one of its ancestors ends that, because the
 * canvas then has to be composited into the ancestor's space on every one of
 * those frames. It cost seconds of lag behind the pointer. The project preview
 * runs this same code at more than twice the angle and is fine, for the one
 * reason that matters: the thing inside IT holds still.
 *
 * So: not over anything that redraws itself.
 *
 * The perspective is in the transform on the element itself rather than as
 * `perspective` on its parent, because that parent is the scroll container's
 * business: a perspective there makes it a containing block, and the panel
 * that would be tilting is `position: sticky` inside it.
 */

/* Degrees at the corner of the driver.
 *
 * This was 4.5 and it was too careful to be worth having: a lean you have to
 * be told about is a lean nobody sees. Ten reads as an object being turned.
 * The ceiling is set by what the panel is made of, not by taste -- past about
 * twelve, type lying on the surface starts to read as distorted rather than
 * as angled, so a panel with words on it wants less than one with a picture. */
const MAX = 10
/* Seconds; the time constant of the follow. Slower than the buttons': this is
   a big object, and big objects do not dart. */
const TAU = 0.16

export default class Tilt {
    /**
     * @param {HTMLElement} el      the panel that tilts
     * @param {HTMLElement} driver  the area the pointer is read against
     */
    constructor(el, driver, { max = MAX } = {}) {
        this.el = el
        this.driver = driver || el
        this.max = max
        this.cur = [0, 0]
        this.target = [0, 0]
        this.raf = 0
        this.last = 0
        this.box = null

        this.on = !!el && !!this.driver
            && window.matchMedia('(pointer: fine)').matches
            && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (!this.on) return

        this._onMove = this._onMove.bind(this)
        this._tick = this._tick.bind(this)
        this._onOut = () => { this.target = [0, 0]; this._start() }
        this._invalidate = () => { this.box = null }

        this.driver.addEventListener('pointermove', this._onMove, { passive: true })
        this.driver.addEventListener('pointerleave', this._onOut, { passive: true })
        window.addEventListener('blur', this._onOut, { passive: true })
        // The driver is tall and the page scrolls under it.
        window.addEventListener('scroll', this._invalidate, { passive: true, capture: true })
        window.addEventListener('resize', this._invalidate, { passive: true })
    }

    _onMove(e) {
        if (!this.box) this.box = this.driver.getBoundingClientRect()
        const b = this.box
        if (!b.width || !b.height) return
        const nx = clamp((e.clientX - (b.left + b.width / 2)) / (b.width / 2))
        const ny = clamp((e.clientY - (b.top + b.height / 2)) / (b.height / 2))
        // Pointer to the right tips the near edge away, which is a rotation
        // about Y; pointer low tips the bottom toward you, about X. The X sign
        // is negative so the panel leans INTO the cursor rather than away from
        // it -- the other way round reads as the page flinching.
        this.target = [-ny * this.max, nx * this.max]
        this._start()
    }

    _start() {
        if (this.raf) return
        this.last = performance.now()
        this.raf = requestAnimationFrame(this._tick)
    }

    _tick(now) {
        this.raf = 0
        if (!this.on) return
        const dt = Math.min((now - this.last) / 1000, 0.05)
        this.last = now
        const k = 1 - Math.exp(-dt / TAU)

        let moving = false
        for (let i = 0; i < 2; i++) {
            this.cur[i] += (this.target[i] - this.cur[i]) * k
            if (Math.abs(this.target[i] - this.cur[i]) > 0.01) moving = true
        }

        if (Math.abs(this.cur[0]) < 0.01 && Math.abs(this.cur[1]) < 0.01) {
            this.el.style.removeProperty('--tilt-x')
            this.el.style.removeProperty('--tilt-y')
            this.el.style.removeProperty('--tilt-nx')
            this.el.style.removeProperty('--tilt-ny')
        } else {
            this.el.style.setProperty('--tilt-x', `${this.cur[0].toFixed(3)}deg`)
            this.el.style.setProperty('--tilt-y', `${this.cur[1].toFixed(3)}deg`)
            // The same two values with the units taken off, because an angle
            // cannot be multiplied by a length or a percentage in calc(). The
            // sheen slides on these.
            this.el.style.setProperty('--tilt-nx', (this.cur[1] / this.max).toFixed(3))
            this.el.style.setProperty('--tilt-ny', (-this.cur[0] / this.max).toFixed(3))
        }

        if (moving) this.raf = requestAnimationFrame(this._tick)
    }

    destroy() {
        if (!this.on) return
        this.on = false
        this.driver.removeEventListener('pointermove', this._onMove)
        this.driver.removeEventListener('pointerleave', this._onOut)
        window.removeEventListener('blur', this._onOut)
        window.removeEventListener('scroll', this._invalidate, { capture: true })
        window.removeEventListener('resize', this._invalidate)
        cancelAnimationFrame(this.raf)
        for (const k of ['--tilt-x', '--tilt-y', '--tilt-nx', '--tilt-ny']) {
            this.el.style.removeProperty(k)
        }
        this.el = null
        this.driver = null
    }
}

function clamp(v) { return Math.max(-1, Math.min(1, v)) }
