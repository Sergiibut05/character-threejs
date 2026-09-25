/**
 * The small amount of script the start screen needs, and nothing more.
 *
 * Everything that moves on the start screen is a CSS animation on `transform`
 * or `opacity`, because those keep running on the compositor while this thread
 * is busy parsing glTF. This file only writes a few custom properties and
 * toggles two classes; the easing is done by CSS transitions, so there is no
 * requestAnimationFrame here and nothing to keep in step with Time.
 *
 *   --mx, --my           pointer position, or phone tilt, as -1..1
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

/*
 * -- The same parallax, driven by tilting the phone --------------------------
 *
 * Nothing below this point knows the difference. The whole effect hangs off
 * two custom properties, so a second source only has to write the same two
 * numbers in the same -1..1 range and every layer, every multiplier and every
 * easing in style.css carries on exactly as it is.
 *
 * TILT_RANGE is how far you have to lean the phone to reach full deflection,
 * and TILT_GAIN is how much of "full" you then actually get. Two numbers
 * rather than one because they are not the same question: the range decides
 * how sensitive it feels, the gain decides how far the picture ever travels.
 * At 0.45 a phone leaned right over moves the house about 12px -- a scene that
 * breathes rather than one that swings, and on a 390px screen 12px is already
 * proportionally most of what 26px is on a desktop.
 */
const TILT_RANGE = 20
const TILT_GAIN = 0.45

/*
 * -- And why there is no permission call anywhere in this file ---------------
 *
 * iOS gates the motion sensors behind DeviceOrientationEvent.requestPermission,
 * which only works from inside a user gesture and puts a system dialog on
 * screen. Asking for somebody's motion sensors on the first screen they ever
 * see, before they have been given a single reason to care, is a worse trade
 * than a picture that holds still. So it is never called.
 *
 * Not calling it IS the implementation. Subscribe to `deviceorientation`
 * without permission and iOS does not prompt and does not refuse -- it simply
 * never fires the event, so the listener sits there costing nothing and the
 * scene stays exactly where it is. Android fires it, because Chromium has
 * never required the call for same-origin secure pages, and the phone tilts.
 * One code path, the right behaviour on both, and no dialog anywhere.
 *
 * The obvious-looking alternative -- feature-detect `requestPermission` and
 * treat its presence as "this platform will prompt" -- was written first and
 * is wrong. Chromium implements that method too (Chrome 153 on Windows has
 * it), so the test is true on desktop Chrome and on Chrome for Android, and
 * it would have switched the tilt off on the one platform it is here for.
 */

export default class CoverScene {
    constructor(root) {
        this.root = root
        this.dog = root?.querySelector('#cover-dog') ?? null
        this.waves = root?.querySelector('.loading-waves') ?? null
        this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        this._dogBox = null
        this._happyTimer = 0
        this._leaveTimer = 0
        this._tiltZero = null
        this._tiltAt = null
        this._tiltRaf = 0

        this._onMove = this._onMove.bind(this)
        this._onResize = this._measure.bind(this)
        this._onTilt = this._onTilt.bind(this)
        this._onTiltFrame = this._onTiltFrame.bind(this)
        this._onOrient = () => { this._tiltZero = null }
        this._onPet = this._onPet.bind(this)

        if (!root) return
        if (!this.reduced) {
            this._measure()
            window.addEventListener('resize', this._onResize, { passive: true })
            /*
             * One input or the other, never both.
             *
             * A finger produces pointermove just as a mouse does, so with the
             * pointer listener up on a touch screen the whole scene jumped to
             * wherever you last tapped and stayed there -- which on an iPhone,
             * where the tilt never arrives, was the only parallax there was:
             * a picture that does nothing until you touch it and then shifts.
             *
             * Following a pointer is a mouse idea. It needs something that
             * hovers, that is somewhere on screen without having been pressed,
             * and a finger is neither. So the coarse-pointer branch does not
             * get it, and if the tilt is refused as well -- iOS -- the right
             * answer is the one that then happens by itself: nothing moves.
             *
             * `pointer: coarse` and not a touch test, because it asks about
             * the PRIMARY pointer: a convertible laptop with an accelerometer
             * still reports fine while the mouse is the thing in use, and the
             * mouse is what the parallax should be answering there.
             */
            if (window.matchMedia('(pointer: coarse)').matches) {
                window.addEventListener('deviceorientation', this._onTilt, { passive: true })
                window.addEventListener('orientationchange', this._onOrient, { passive: true })
            } else {
                window.addEventListener('pointermove', this._onMove, { passive: true })
            }
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

    /**
     * Phone tilt, as the same -1..1 the pointer produces.
     *
     * -- Relative to where you were holding it, not to the ground ------------
     *
     * beta and gamma are absolute angles, and read raw they would peg the
     * scene the moment anybody held the phone the way people actually hold a
     * phone: somewhere around 45 degrees back, which is full deflection, and
     * it stays there. The first reading is taken as the neutral pose and
     * everything after it is a delta from that, so the effect starts centred
     * wherever your hands happen to be. Turning the device sideways throws
     * that pose away and adopts the next one.
     *
     * -- And the axes turn with the screen -----------------------------------
     *
     * beta and gamma are fixed to the DEVICE, not to what you are looking at,
     * so in landscape the axis that used to move the picture sideways is the
     * one that now moves it up and down. screen.orientation.angle is what puts
     * the two back in agreement.
     */
    _onTilt(e) {
        const { beta, gamma } = e
        // Desktop browsers and blocked sensors fire this with nulls in it.
        if (beta == null || gamma == null) return

        if (!this._tiltZero) this._tiltZero = { beta, gamma }

        const db = beta - this._tiltZero.beta
        const dg = gamma - this._tiltZero.gamma
        let x, y
        switch (window.screen?.orientation?.angle ?? 0) {
            case 90:  x = -db; y =  dg; break
            case 270: x =  db; y = -dg; break
            case 180: x = -dg; y = -db; break
            default:  x =  dg; y =  db
        }

        this._tiltAt = [clampTilt(x), clampTilt(y)]
        // The sensor is not capped to the frame rate the way pointermove is,
        // and on plenty of devices it runs well past it. Without this gate the
        // same property is written several times for one painted frame: every
        // write but the last one thrown away, and each one still paying for a
        // style invalidation.
        if (!this._tiltRaf) this._tiltRaf = requestAnimationFrame(this._onTiltFrame)
    }

    /** One write per painted frame; the CSS transitions do the smoothing. */
    _onTiltFrame() {
        this._tiltRaf = 0
        if (!this.root || !this._tiltAt) return
        this.root.style.setProperty('--mx', this._tiltAt[0].toFixed(3))
        this.root.style.setProperty('--my', this._tiltAt[1].toFixed(3))
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
        window.removeEventListener('deviceorientation', this._onTilt)
        window.removeEventListener('orientationchange', this._onOrient)
        cancelAnimationFrame(this._tiltRaf)
        this.dog?.removeEventListener('click', this._onPet)
        clearTimeout(this._happyTimer)
        clearTimeout(this._leaveTimer)
        this.root = null
        this.dog = null
        this.waves = null
    }
}

/** Degrees off the neutral pose -> the -1..1 the stylesheet expects. */
function clampTilt(deg) {
    return Math.max(-1, Math.min(1, deg / TILT_RANGE)) * TILT_GAIN
}
