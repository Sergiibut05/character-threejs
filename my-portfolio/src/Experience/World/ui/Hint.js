import './ui.css'
// `tr`, not `t`: this file already binds `t` to a local <span>.
import { t as tr, onLocaleChange } from '../../Utils/gameText.js'
import { inputGlyph } from './InputGlyph.js'

/**
 * Hint — a small bottom-centered prompt ("[A] Continuar" / "Toca para continuar").
 * Adapts to the active input device (plan §2/§3): shows the button glyph for
 * keyboard/gamepad, and plain "Toca para …" on touch. Re-renders live if the
 * device changes while shown. Non-interactive; the caller handles input.
 */
export default class Hint {
    constructor() {
        this.el = document.createElement('div')
        this.el.className = 'fz-hint'
        document.body.appendChild(this.el)

        this._verb = ''
        this._action = 'continue'
        this._unsub = null
        this._unsubLocale = onLocaleChange(() => { if (this._verb) this._render() })
    }

    /** @param verb e.g. "continuar"/"saltar"  @param action input action (default 'continue') */
    show(verb, action = 'continue') {
        this._verb = verb
        this._action = action
        this._render()
        this.el.classList.add('is-visible')

        // Live-update the glyph if the player switches input device.
        this._unsub?.()
        this._unsub = window.experience?.input?.onChange?.(() => this._render()) || null
    }

    _render() {
        const device = window.experience?.input?.device || 'keyboard'
        this.el.innerHTML = ''
        if (device === 'touch') {
            const t = document.createElement('span')
            t.className = 'fz-hint-text'
            t.textContent = tr('hint.touchTo', { verb: this._verb })
            this.el.appendChild(t)
            return
        }
        this.el.appendChild(inputGlyph(this._action, device))
        const t = document.createElement('span')
        t.className = 'fz-hint-text'
        t.textContent = this._verb.charAt(0).toUpperCase() + this._verb.slice(1)
        this.el.appendChild(t)
    }

    hide() {
        this.el.classList.remove('is-visible')
        this._unsub?.()
        this._unsub = null
    }

    destroy() {
        this._unsubLocale?.()
        this._unsub?.()
        this.el?.remove()
    }
}
