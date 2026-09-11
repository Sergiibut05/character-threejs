import './ui.css'
import { t as tr, onLocaleChange } from '../../Utils/gameText.js'

/**
 * MoveHint — the one thing a new visitor has to be told, and nothing else.
 *
 * Someone who has just watched the iris open is looking at a character standing
 * in front of a house with no instruction anywhere on screen. The first thing
 * they do is walk at the house, and the first thing that happens is a fence a
 * metre away. Testers reported exactly that: they did not know the controls.
 *
 * The temptation is a modal. A modal is a toll booth in front of the only
 * moment this page gets to impress anyone — it covers the island at the exact
 * second it appears, and people close it without reading. So this is not that.
 *
 * It is one quiet line just under the character that:
 *   - waits until the iris has finished, so it never competes with it,
 *   - says the minimum needed to be unstuck and nothing more,
 *   - LEAVES WHEN THE CHARACTER ACTUALLY MOVES, and not before.
 *
 * That last one used to be "leaves the moment any key is pressed", with a nine
 * second timeout behind it. Both were wrong for the person this exists for.
 * Pressing a key is not the same as understanding: someone hunting for the
 * controls presses something, the only instruction on screen vanishes, and
 * they are back where they started with no way to ask again. And the timeout
 * meant the tip could expire while they were still reading it -- the one
 * visitor who needed it most is the slowest one, and they were the one it
 * abandoned.
 *
 * So the exit condition is now the thing it is teaching. It goes when the
 * character has covered some ground, which cannot happen by accident and
 * cannot happen without the lesson having landed.
 *
 * Not shown on touch: the on-screen stick is already visible and says what it
 * is, and a phone screen has no room to spare.
 */
export default class MoveHint {
    /**
     * @param {object} [o]
     * @param {number} [o.delay]     ms to wait before fading in
     * @param {number} [o.distance]  metres the character must cover to dismiss it
     */
    constructor(o = {}) {
        this.delay = o.delay ?? 900
        // Far enough that settling, a nudge from a collider or the last of the
        // spawn drop cannot spend it; short enough that one step does.
        this.distance = o.distance ?? 0.6

        this.el = null
        this._timers = []
        this._dismissed = false
        this._unsubLocale = null
        this._origin = null
        this._onTick = () => this._checkMoved()
        this._onPointer = (e) => { if (e.pointerType === 'touch') this.dismiss() }
    }

    /** Fade in, unless this is a touch session. */
    show() {
        if (this._dismissed) return
        if ((window.experience?.input?.device || 'keyboard') === 'touch') return

        this.el = document.createElement('div')
        this.el.className = 'fz-movehint'
        // Decorative: it repeats what the page already offers by other means,
        // and a screen reader user is not driving a 3D character with WASD.
        this.el.setAttribute('aria-hidden', 'true')
        this._render()
        document.body.appendChild(this.el)

        this._unsubLocale = onLocaleChange(() => this._render())

        // A touch session means the on-screen stick has taken over and this
        // line is about a keyboard nobody is holding.
        window.addEventListener('pointerdown', this._onPointer)

        // Where he was standing when the tip went up, so "has he moved" is
        // measured from here rather than from wherever he happens to be.
        const character = window.experience?.world?.character
        this._origin = character ? character.position.clone() : null
        window.experience?.time?.on('tick', this._onTick)

        this._timers.push(setTimeout(() => this.el?.classList.add('is-visible'), this.delay))
    }

    /** Gone once he has actually walked somewhere. */
    _checkMoved() {
        const character = window.experience?.world?.character
        if (!character) return
        // Physics starts after this can be built, so the first position worth
        // measuring from may not have existed yet.
        if (!this._origin) { this._origin = character.position.clone(); return }
        if (this._origin.distanceTo(character.position) >= this.distance) this.dismiss()
    }

    _render() {
        if (this.el) this.el.textContent = tr('hint.move')
    }

    /** Fade out and never come back. */
    dismiss() {
        if (this._dismissed) return
        this._dismissed = true

        window.experience?.time?.off('tick', this._onTick)
        window.removeEventListener('pointerdown', this._onPointer)
        this._unsubLocale?.()
        this._unsubLocale = null

        const el = this.el
        this.el = null
        if (!el) return
        el.classList.remove('is-visible')
        // Outlives the CSS transition, then goes for good.
        this._timers.push(setTimeout(() => el.remove(), 600))
    }

    destroy() {
        for (const id of this._timers) clearTimeout(id)
        this._timers.length = 0
        this.dismiss()
    }
}
