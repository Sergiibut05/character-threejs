import './ui.css'
import { inputGlyph } from './InputGlyph.js'

/**
 * Reusable modal — the base of the game's UI system (plan §5/§7).
 *
 * Variant 'clean' (glass-pastel) or 'paper' (refined letter). Holds an overlay
 * + animated panel with title/subtitle/close and a body you append components
 * (cards, buttons, steppers…) into. Input-aware (plan §2): mouse/touch click
 * directly; keyboard/gamepad navigate (arrows + confirm) with an adaptive hint
 * bar; Esc/B closes; the hint bar hides on touch.
 */
export default class Modal {
    constructor({ variant = 'clean', size = 'md', align = 'left', title = '', subtitle = '', closable = true } = {}) {
        this.closable = closable
        this._closeCb = null
        this._isOpen = false

        this.overlay = _el('div', 'fz-modal-overlay')
        const sizeClass = size === 'lg' ? ' fz-modal--lg' : ''
        const alignClass = align === 'center' ? ' fz-modal--center' : ''
        this.panel = _el('div', `fz-modal fz-modal--${variant}${sizeClass}${alignClass}`)
        this.overlay.appendChild(this.panel)

        if (closable) {
            this.closeBtn = _el('button', 'fz-modal-close')
            this.closeBtn.type = 'button'
            this.closeBtn.setAttribute('aria-label', 'Cerrar')
            this.closeBtn.textContent = '✕'
            this.closeBtn.addEventListener('click', () => this.close())
            this.panel.appendChild(this.closeBtn)
        }

        this.titleEl = _el('h2', 'fz-modal-title')
        this.titleEl.textContent = title
        if (title) this.panel.appendChild(this.titleEl)

        this.subtitleEl = _el('p', 'fz-modal-subtitle')
        this.subtitleEl.textContent = subtitle
        if (subtitle) this.panel.appendChild(this.subtitleEl)

        this.body = _el('div', 'fz-modal-body')
        this.panel.appendChild(this.body)

        // Adaptive hint bar (Seleccionar / Cerrar) — populated on open, hidden on touch.
        this.hintsEl = _el('div', 'fz-modal-hints')
        this.panel.appendChild(this.hintsEl)
        this._unsub = null

        // Click outside the panel closes (when closable).
        this._onOverlayClick = (e) => {
            if (e.target === this.overlay && this.closable) this.close()
        }
        this.overlay.addEventListener('click', this._onOverlayClick)

        // Keyboard: Esc closes; arrows move focus between cards/buttons.
        this._onKeyDown = (e) => {
            if (!this._isOpen) return
            if (e.key === 'Escape' && this.closable) {
                e.stopPropagation()
                this.close()
                return
            }
            // Don't hijack arrows/WASD while typing in a field.
            const tag = document.activeElement?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
            const k = e.key.toLowerCase()
            const prev = k === 'arrowleft' || k === 'arrowup' || k === 'a' || k === 'w'
            const next = k === 'arrowright' || k === 'arrowdown' || k === 'd' || k === 's'
            if (prev || next) {
                const items = this._focusables()
                if (items.length < 2) return
                e.preventDefault()
                const dir = next ? 1 : -1
                const i = items.indexOf(document.activeElement)
                items[i === -1 ? 0 : (i + dir + items.length) % items.length].focus()
            }
        }

        document.body.appendChild(this.overlay)
    }

    _focusables() {
        return [...this.panel.querySelectorAll('.fz-card, .fz-btn, .fz-settings-tab, a.fz-cert')].filter((el) => {
            const s = getComputedStyle(el)
            return s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled
        })
    }

    _renderHints() {
        const device = window.experience?.input?.device || 'keyboard'
        this.hintsEl.innerHTML = ''
        if (device === 'touch') { this.hintsEl.style.display = 'none'; return }
        this.hintsEl.style.display = ''
        this.hintsEl.appendChild(_hintRow(inputGlyph('confirm', device), 'Seleccionar'))
        if (this.closable) this.hintsEl.appendChild(_hintRow(inputGlyph('back', device), 'Cerrar'))
    }

    setTitle(text) { this.titleEl.textContent = text }
    setSubtitle(text) { this.subtitleEl.textContent = text }

    /** Append a component (card grid, button row, …) into the body. */
    append(node) { this.body.appendChild(node); return node }

    /** Called when the user dismisses the modal (X / Esc / outside click). */
    onClose(cb) { this._closeCb = cb }

    open() {
        if (this._isOpen) return
        this._isOpen = true
        window.addEventListener('keydown', this._onKeyDown, true)
        this._renderHints()
        this._unsub = window.experience?.input?.onChange?.(() => this._renderHints()) || null
        // next frame so the CSS transition runs from the hidden state
        requestAnimationFrame(() => this.overlay.classList.add('is-open'))
        // focus the first interactive element for keyboard/gamepad users
        requestAnimationFrame(() => {
            const first = this.panel.querySelector('.fz-card, .fz-btn')
            first?.focus?.()
        })
    }

    close() {
        if (!this._isOpen) return
        this._isOpen = false
        window.removeEventListener('keydown', this._onKeyDown, true)
        this._unsub?.()
        this._unsub = null
        this.overlay.classList.remove('is-open')
        this._closeCb?.()
    }

    isOpen() { return this._isOpen }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown, true)
        this._unsub?.()
        this.overlay.removeEventListener('click', this._onOverlayClick)
        this.overlay.remove()
    }
}

function _hintRow(glyphEl, label) {
    const row = _el('span', 'fz-modal-hint')
    row.appendChild(glyphEl)
    const t = document.createElement('span')
    t.textContent = label
    row.appendChild(t)
    return row
}

function _el(tag, className) {
    const node = document.createElement(tag)
    if (className) node.className = className
    return node
}
