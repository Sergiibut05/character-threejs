import './ui.css'
import { t, onLocaleChange } from '../../Utils/gameText.js'
import Modal from './Modal.js'

/**
 * Stepper — a multi-step panel inside a Modal (tutorial / onboarding, plan §4.D).
 *
 * `steps` is an array of `{ icon, image, title, body }`. `body` may be a string
 * or a `(device) => string` so the controls adapt to keyboard/gamepad/touch and
 * update live if the device changes (plan §8). Prev/Next with a dot indicator.
 * Closing via ✕ also finishes (treated as "skip"). `onFinish` runs once.
 */
export default class Stepper {
    constructor({ title = '', steps = [], onFinish, finishLabel = null } = {}) {
        this.steps = steps
        this.onFinish = onFinish
        // null, not a literal default: a default parameter is evaluated when
        // the stepper is constructed, and _render() re-reads the catalog on
        // every step so the label follows a language switch.
        this.finishLabel = finishLabel
        this.index = 0
        this._done = false
        // Re-render so device-aware step text updates when the control changes.
        this._unsub = window.experience?.input?.onChange?.(() => this._render()) || null
        // Same reason as the device listener above: the panel stays open while
        // someone reads it, and the language can change under it.
        this._unsubLocale = onLocaleChange(() => this._render())

        this.modal = new Modal({ variant: 'paper', align: 'center', title, closable: true })

        const step = document.createElement('div')
        step.className = 'fz-step'
        step.innerHTML = `
            <div class="fz-step-media"></div>
            <h3 class="fz-step-title"></h3>
            <p class="fz-step-text"></p>
        `
        this.mediaEl = step.querySelector('.fz-step-media')
        this.titleEl = step.querySelector('.fz-step-title')
        this.textEl = step.querySelector('.fz-step-text')
        this.modal.append(step)

        // Dots only when there is somewhere to go. A lone dot is not a
        // progress indicator, it is a full stop.
        this.multi = steps.length > 1
        this.dotsEl = document.createElement('div')
        this.dotsEl.className = 'fz-step-dots'
        if (this.multi) {
            for (let i = 0; i < steps.length; i++) {
                const dot = document.createElement('span')
                dot.className = 'fz-step-dot'
                this.dotsEl.appendChild(dot)
            }
            this.modal.append(this.dotsEl)
        }

        const row = document.createElement('div')
        row.className = 'fz-btn-row'
        this.backBtn = document.createElement('button')
        this.backBtn.type = 'button'
        this.backBtn.className = 'fz-btn fz-btn--ghost'
        this.backBtn.textContent = t('common.back')
        this.backBtn.addEventListener('click', () => this._back())
        this.nextBtn = document.createElement('button')
        this.nextBtn.type = 'button'
        this.nextBtn.className = 'fz-btn fz-btn--primary'
        this.nextBtn.addEventListener('click', () => this._next())
        // Back is APPENDED only when it can ever be used.
        //
        // On a multi-step panel it stays in the layout and merely goes
        // invisible on the first step, so the primary button does not jump
        // sideways as you page through. With a single step there is no paging
        // and nothing to keep still, so reserving the space just pushes the
        // only button off-centre.
        if (this.multi) row.appendChild(this.backBtn)
        row.appendChild(this.nextBtn)
        this.modal.append(row)

        // ✕ / Esc / outside-click → treat as skip.
        this.modal.onClose(() => this._finish())

        this._render()
    }

    _render() {
        const s = this.steps[this.index] || {}
        // Hero media: a screenshot when provided, otherwise the big icon.
        if (s.image) {
            this.mediaEl.innerHTML = `<img class="fz-step-img" src="${s.image}" alt="">`
        } else {
            this.mediaEl.innerHTML = s.icon ? `<div class="fz-step-icon">${s.icon}</div>` : ''
        }
        // Title keeps a small inline icon next to the step name.
        this.titleEl.innerHTML =
            (s.icon ? `<span class="fz-step-title-icon">${s.icon}</span>` : '') + (s.title || '')
        // Body may adapt to the active input device.
        const device = window.experience?.input?.device || 'keyboard'
        this.textEl.textContent = typeof s.body === 'function' ? s.body(device) : (s.body || '')

        const dots = this.dotsEl.children
        for (let i = 0; i < dots.length; i++) {
            dots[i].classList.toggle('is-active', i === this.index)
            dots[i].classList.toggle('is-done', i < this.index)
        }

        const isLast = this.index === this.steps.length - 1
        if (this.multi) {
            this.backBtn.style.visibility = this.index === 0 ? 'hidden' : 'visible'
        }
        this.nextBtn.textContent = isLast
            ? (this.finishLabel || t('common.play'))
            : t('common.next')
    }

    _back() {
        if (this.index > 0) { this.index--; this._render() }
    }

    _next() {
        if (this.index < this.steps.length - 1) { this.index++; this._render() }
        else { this._done = true; this.modal.close() }
    }

    _finish() {
        if (this._handled) return
        this._handled = true
        this.onFinish?.()
    }

    open() { this.modal.open() }
    close() { this.modal.close() }
    destroy() { this._unsub?.(); this.modal.destroy() }
}
