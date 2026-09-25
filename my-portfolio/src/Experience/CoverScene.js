/**
 * The small amount of script the start screen needs, and nothing more.
 *
 * Everything that moves on the start screen is a CSS animation on `transform`
 * or `opacity`, because those keep running on the compositor while this thread
 * is busy parsing glTF. This file only writes a few custom properties and
 * toggles two classes; the easing is done by CSS transitions, so there is no
 * requestAnimationFrame here and nothing to keep in step with Time.
 *
 *   --mx, --my           pointer position (-1..1) on #cloud-transition
 *   --wave-ux, --wave-uy  px -> viewBox-unit scale for the hills (see below)
 *   --hx                 where the dog should look, on #cover-dog
 *   .is-happy    two hops and a fast wag when the dog is clicked
 *   .is-leaving  the walk into the hills on Explore (see style.css)
 *   .is-closing  the iris shutting over it, through that same walk
 */

/*
 * The shape of the exit, in one number.
 *
 * The iris does not follow the walk into the hills, it happens THROUGH it:
 * both start on the same frame and the eye finishes shutting while the ground
 * is still coming at you. Staged the other way -- zoom, and then a close --
 * it read as two separate ideas, the camera stopping and then a thing
 * happening, and it cost nearly three seconds of a load that had not started.
 *
 * The beat the zoom needs before the frame starts closing on it is bought
 * twice over, and both halves are in the stylesheet rather than here: 300ms
 * of transition-delay, and then an ease-in worth roughly another 250ms of
 * travel you cannot see. This number is the sum of the whole thing, because
 * what it is for is knowing when the picture is finally gone.
 */
const IRIS_MS = 1450

export default class CoverScene {
    constructor(root) {
        this.root = root
        this.dog = root?.querySelector('#cover-dog') ?? null
        this.waves = root?.querySelector('.loading-waves') ?? null
        this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        this._dogBox = null
        this._happyTimer = 0
        this._leaveTimer = 0

        this._onMove = this._onMove.bind(this)
        this._onResize = this._measure.bind(this)
        this._onPet = this._onPet.bind(this)

        if (!root) return
        if (!this.reduced) {
            this._measure()
            window.addEventListener('pointermove', this._onMove, { passive: true })
            window.addEventListener('resize', this._onResize, { passive: true })
        }
        this.dog?.addEventListener('click', this._onPet)
    }

    /**
     * The one measurement the parallax needs, taken here and not per move.
     *
     * The hills are three <g> inside an SVG, and a CSS length on an SVG child
     * is a USER UNIT, not a pixel: the box is 1440x320 stretched with
     * preserveAspectRatio="none" over a viewport that is neither, so the same
     * `translate: -21px` came out as -28px across and -11px down on a 1080p
     * screen -- and as three times that on a phone, where the SVG is 300%
     * wide. The near hill was travelling FURTHER than the house standing on
     * it, which is the depth cue backwards, and it changed with every resize.
     *
     * So the conversion is published as two numbers and the stylesheet
     * multiplies by them; every layer is then written in real pixels and the
     * order reads: sky < far hill < near hill < house and dog < the copy.
     */
    _measure() {
        this._dogBox = null
        const r = this.waves?.getBoundingClientRect()
        if (!r?.width || !r?.height) return
        this.root.style.setProperty('--wave-ux', (1440 / r.width).toFixed(4))
        this.root.style.setProperty('--wave-uy', (320 / r.height).toFixed(4))
    }

    _onMove(e) {
        const w = window.innerWidth, h = window.innerHeight
        this.root.style.setProperty('--mx', (e.clientX / w * 2 - 1).toFixed(3))
        this.root.style.setProperty('--my', (e.clientY / h * 2 - 1).toFixed(3))

        if (!this.dog) return
        // Measured once and on resize, not per move: reading layout right after
        // writing a custom property would force a style pass on every event.
        if (!this._dogBox) this._dogBox = this.dog.getBoundingClientRect()
        const b = this._dogBox
        const dx = e.clientX - (b.left + b.width * 0.3)
        const dy = e.clientY - (b.top + b.height * 0.25)
        // He faces left, so looking up means tipping the head back (negative),
        // and a pointer behind him tips it forward a touch.
        const hx = Math.max(-1, Math.min(1, -dy / h * 1.6 + (dx > 0 ? -0.25 : 0.1)))
        this.dog.style.setProperty('--hx', hx.toFixed(3))
    }

    _onPet() {
        if (this.dog.classList.contains('is-happy')) return
        this.dog.classList.add('is-happy')
        clearTimeout(this._happyTimer)
        this._happyTimer = setTimeout(() => this.dog?.classList.remove('is-happy'), 1400)
    }

    /**
     * Walk into the hills, shut the iris over it, then resolve. Called at the
     * top of startExperience(), before the boot screen, so it costs IRIS_MS
     * of a main thread that is otherwise idle -- the expensive part starts
     * after, and it starts behind a screen that is already covered.
     *
     * Skipped when motion is reduced, or when the start screen is not what is
     * on screen (the Quick Overview is covering it).
     */
    leave({ skip = false } = {}) {
        if (!this.root || this.reduced || skip) return Promise.resolve()
        // One frame, both classes: see the note on IRIS_MS above.
        this.root.classList.add('is-leaving', 'is-closing')
        return new Promise((resolve) => {
            this._leaveTimer = setTimeout(resolve, IRIS_MS)
        })
    }

    destroy() {
        window.removeEventListener('pointermove', this._onMove)
        window.removeEventListener('resize', this._onResize)
        this.dog?.removeEventListener('click', this._onPet)
        clearTimeout(this._happyTimer)
        clearTimeout(this._leaveTimer)
        this.root = null
        this.dog = null
        this.waves = null
    }
}
