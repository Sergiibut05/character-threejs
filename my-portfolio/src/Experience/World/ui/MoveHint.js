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
 * It is one quiet line at the bottom of the screen that:
 *   - waits until the iris has finished, so it never competes with it,
 *   - says the minimum needed to be unstuck and nothing more,
 *   - LEAVES THE MOMENT ANY KEY IS PRESSED. If the player already knew, they
 *     never really see it; if they did not, it is there until they do,
 *   - gives up on its own after a while, so it can never become furniture.
 *
 * Not shown on touch: the on-screen stick is already visible and says what it
 * is, and a phone screen has no room to spare.
 */
export default class MoveHint {
    /**
     * @param {object} [o]
     * @param {number} [o.delay]    ms to wait before fading in
     * @param {number} [o.timeout]  ms before it gives up and leaves by itself
     */
    constructor(o = {}) {
        this.delay = o.delay ?? 900
        this.timeout = o.timeout ?? 9000

        this.el = null
        this._timers = []
        this._dismissed = false
        this._unsubLocale = null
        this._onAnyKey = () => this.dismiss()
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

        // Any key at all, not just the movement ones: pressing something and
        // watching the tip disappear is itself the confirmation that the
        // keyboard is what drives this.
        window.addEventListener('keydown', this._onAnyKey, { once: true })
        window.addEventListener('pointerdown', this._onPointer)

        this._timers.push(setTimeout(() => this.el?.classList.add('is-visible'), this.delay))
        this._timers.push(setTimeout(() => this.dismiss(), this.delay + this.timeout))
    }

    _render() {
        if (this.el) this.el.textContent = tr('hint.move')
    }

    /** Fade out and never come back. */
    dismiss() {
        if (this._dismissed) return
        this._dismissed = true

        window.removeEventListener('keydown', this._onAnyKey)
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
