import './ui.css'
import { inputGlyph } from './InputGlyph.js'

/**
 * StartEmblem — the reusable leaf mark for an interactive start point (and the
 * portfolio's identity/logo). Plan §6.
 *
 * Closed (far): just the floating leaf logo. On approach it sways gently and
 * OPENS into a panel that reveals — stacked beside the leaf — the activity TITLE
 * (large) with the activation BUTTON glyph (small, for the active input device)
 * below it. Positioned by the consumer (ActivityPrompt projects a 3D anchor).
 */
// User-drawn maple leaf (vectorised). Background removed; viewBox cropped to the
// leaf's bounding box so it fills the badge.
const SVG = `
<svg class="fz-emblem-svg" viewBox="510 476 450 430" aria-hidden="true">
  <g class="fz-emblem-leaf">
    <path fill="#34a361" d="m754 488 16 7 6 4 2 6-9 13-8 16-6 18-6 31-1 7v8l8-4 5-3 21-10 12-4 19-4 9-1h30l20 3 12 3 2 2-1 4-12 13-6 7-5 5-12 12-4 4 1 4 11 6 14 9 19 14 14 12 11 9 5 5 5 6 6 5 11 14 7 11-1 3-16 4-34 8-3 1 1 6 10 24 5 16 1 10-1 3-6-1-25-12-20-10-4-1-5 21-4 7-4-1-8-12-7-10-8-11-9-12-8-10-10-12h-1v10l6 36 7 39 2 16v9l-1 1-8-1-23-7h-3l-5 12-10 20-10 15-7 9-3 4-4-1-10-13-11-18-8-16-5-12-9 2-20 6h-5l-1-1v-13l4-27 8-40 3-20 1-11-7 6-11 14-11 14-12 17-11 16-4 2-6-12-3-16-5 1-29 15-18 8-4 1-1-1 1-13 4-15 5-11 7-16v-4l-9-3-43-9-2-2 1-4 8-12 9-11 12-13 10-9 11-9 18-14 21-14 14-8-1-4-19-19-5-5-11-12-4-5 1-4 9-3 16-3 9-1h32l19 3 14 4 17 7 15 8 6 4h3l2-32 5-32 6-23 8-18 4-4Z"/>
  </g>
</svg>`

export default class StartEmblem {
    constructor() {
        this.el = document.createElement('div')
        this.el.className = 'fz-emblem'
        this.el.innerHTML = `
            <div class="fz-emblem-pill">
                <span class="fz-emblem-orbit-wrap">${SVG}</span>
                <span class="fz-emblem-reveal">
                    <span class="fz-emblem-label"></span>
                    <span class="fz-emblem-glyph"></span>
                </span>
            </div>`
        this.labelEl = this.el.querySelector('.fz-emblem-label')
        this.glyphEl = this.el.querySelector('.fz-emblem-glyph')
        document.body.appendChild(this.el)

        this._active = false
        this._renderGlyph()
        this._unsub = window.experience?.input?.onChange?.(() => this._renderGlyph()) || null
    }

    _renderGlyph() {
        this.glyphEl.innerHTML = ''
        this.glyphEl.appendChild(inputGlyph('confirm'))
    }

    /** Activity name shown when the emblem opens. */
    setLabel(text) { this.labelEl.textContent = text }

    /** 0 = far, 1 = right next to it → subtle scale/glow on the closed logo. */
    setProximity(t) { this.el.style.setProperty('--p', Math.max(0, Math.min(1, t)).toFixed(3)) }

    /** In range → the logo opens, revealing the name + button. */
    setActive(on) {
        if (on === this._active) return
        this._active = on
        this.el.classList.toggle('is-active', on)
    }

    setVisible(on) { this.el.classList.toggle('is-hidden', !on) }
    setOpacity(o) { this.el.style.opacity = `${o}` }
    setPosition(x, y) { this.el.style.transform = `translate3d(${x}px, ${y}px, 0)` }

    press() {
        this.el.classList.remove('is-pressed')
        void this.el.offsetWidth
        this.el.classList.add('is-pressed')
    }

    destroy() {
        this._unsub?.()
        this.el?.remove()
    }
}
