import './ui.css'

/**
 * Announce — big centered cinematic text (round start, "Start", etc.).
 * Pops in, holds, and fades out. Non-interactive overlay.
 */
export default class Announce {
    constructor() {
        this.el = document.createElement('div')
        this.el.className = 'fz-announce'
        this.textEl = document.createElement('div')
        this.textEl.className = 'fz-announce-text'
        this.el.appendChild(this.textEl)
        document.body.appendChild(this.el)
        this._timer = null
    }

    show(text, holdMs = 1100) {
        this.textEl.textContent = text
        this.el.classList.remove('is-playing')
        void this.el.offsetWidth // restart the animation
        this.el.classList.add('is-playing')
        if (this._timer) clearTimeout(this._timer)
        this._timer = setTimeout(() => this.el.classList.remove('is-playing'), holdMs)
    }

    hide() {
        this.el.classList.remove('is-playing')
        if (this._timer) { clearTimeout(this._timer); this._timer = null }
    }

    destroy() {
        if (this._timer) clearTimeout(this._timer)
        this.el?.remove()
    }
}
