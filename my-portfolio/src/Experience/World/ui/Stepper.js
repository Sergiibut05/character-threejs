import './ui.css'
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
    constructor({ title = '', steps = [], onFinish, finishLabel = '¡Jugar!' } = {}) {
        this.steps = steps
        this.onFinish = onFinish
        this.finishLabel = finishLabel
        this.index = 0
        this._done = false
        // Re-render so device-aware step text updates when the control changes.
        this._unsub = window.experience?.input?.onChange?.(() => this._render()) || null

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

        this.dotsEl = document.createElement('div')
        this.dotsEl.className = 'fz-step-dots'
        for (let i = 0; i < steps.length; i++) {
            const dot = document.createElement('span')
            dot.className = 'fz-step-dot'
            this.dotsEl.appendChild(dot)
        }
        this.modal.append(this.dotsEl)

        const row = document.createElement('div')
        row.className = 'fz-btn-row'
        this.backBtn = document.createElement('button')
        this.backBtn.type = 'button'
        this.backBtn.className = 'fz-btn fz-btn--ghost'
        this.backBtn.textContent = 'Atrás'
        this.backBtn.addEventListener('click', () => this._back())
        this.nextBtn = document.createElement('button')
        this.nextBtn.type = 'button'
        this.nextBtn.className = 'fz-btn fz-btn--primary'
        this.nextBtn.addEventListener('click', () => this._next())
        row.appendChild(this.backBtn)
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
        this.backBtn.style.visibility = this.index === 0 ? 'hidden' : 'visible'
        this.nextBtn.textContent = isLast ? this.finishLabel : 'Siguiente'
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
