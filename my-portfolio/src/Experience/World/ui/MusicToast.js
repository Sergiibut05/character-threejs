import './audio.css'
import { iconMusic } from './icons.js'
import { t, onLocaleChange } from '../../Utils/gameText.js'

/**
 * MusicToast — "Ahora suena…" notification (top-right). Slides in with the
 * track cover + title, holds, slides out. Non-interactive overlay.
 * Driven by AudioManager's 'trackchange' event.
 */
export default class MusicToast {
    constructor() {
        this.holdMs = 4500

        this.el = document.createElement('div')
        this.el.className = 'fz-toast'
        this.el.setAttribute('role', 'status')
        this.el.setAttribute('aria-live', 'polite')
        this.el.innerHTML = `
            <div class="fz-toast-cover"></div>
            <div class="fz-toast-body">
                <span class="fz-toast-kicker"></span>
                <span class="fz-toast-title"></span>
            </div>`
        document.body.appendChild(this.el)

        this.coverEl = this.el.querySelector('.fz-toast-cover')
        this.kickerEl = this.el.querySelector('.fz-toast-kicker')
        this.titleEl = this.el.querySelector('.fz-toast-title')
        this._timer = null

        // The kicker is written on every show(), not once here: the toast is
        // built at boot, and a catalog is loaded asynchronously, so a string
        // resolved in the constructor would be resolved against nothing. The
        // subscription is for the rarer case of switching language while a
        // toast is still on screen.
        this._relabel = () => { this.kickerEl.textContent = t('music.nowPlaying') }
        this._relabel()
        this._offLocale = onLocaleChange(this._relabel)
    }

    show({ title, cover } = {}) {
        this._relabel()
        this.titleEl.textContent = title || ''
        this._setCover(cover)

        this.el.classList.remove('is-visible')
        void this.el.offsetWidth // restart the slide-in
        this.el.classList.add('is-visible')

        if (this._timer) clearTimeout(this._timer)
        this._timer = setTimeout(() => this.hide(), this.holdMs)
    }

    _setCover(cover) {
        if (cover) {
            this.coverEl.style.backgroundImage = `url("${cover}")`
            this.coverEl.classList.remove('is-placeholder')
            this.coverEl.innerHTML = ''
        } else {
            this.coverEl.style.backgroundImage = ''
            this.coverEl.classList.add('is-placeholder')
            this.coverEl.innerHTML = iconMusic
        }
    }

    hide() {
        this.el.classList.remove('is-visible')
        if (this._timer) { clearTimeout(this._timer); this._timer = null }
    }

    destroy() {
        if (this._timer) clearTimeout(this._timer)
        this._offLocale?.()
        this.el?.remove()
    }
}
