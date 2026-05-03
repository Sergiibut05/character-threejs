/**
 * SettingsPanel — discreet floating gear (top-right) with a quality toggle.
 *
 * Replaces the previous full-screen quality modal: the experience boots
 * straight into the loading screen with the auto-detected quality, and the
 * user can change it on the fly from the gear menu — no interrupting modal.
 *
 * Persists the user choice in `localStorage('portfolio.quality')` and
 * re-emits Quality 'change' events that the Renderer / Environment listen
 * to (so shadows and pixelRatio adjust live).
 */
export default class SettingsPanel {
    constructor(quality, { autoShowOnReady = true } = {}) {
        this.quality = quality

        this.host = document.getElementById('settings-host')
        this.gear = document.getElementById('settings-gear')
        this.panel = document.getElementById('settings-panel')
        this.hint = document.getElementById('settings-hint')
        this.toggleButtons = this.host
            ? this.host.querySelectorAll('.settings-toggle-btn')
            : []

        if (!this.host) return

        this._bindEvents()
        this._syncToggle(this.quality.level)

        // Reflect live quality changes (e.g. from the debug GUI).
        this.quality.on('change', () => this._syncToggle(this.quality.level))

        // Show the gear right away — but not until the loading overlay closes.
        // The host listens for the experience's `revealUi()` call below.
        if (autoShowOnReady) this.show()
    }

    _bindEvents() {
        this.gear.addEventListener('click', (e) => {
            e.stopPropagation()
            this._toggleOpen()
        })

        this.toggleButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const lvl = parseInt(btn.dataset.level, 10)
                if (lvl !== 0 && lvl !== 1) return
                this.quality.setLevel(lvl)
                // Keep the panel open so the user sees the toggle move.
            })
        })

        // Click outside → close.
        document.addEventListener('pointerdown', (e) => {
            if (!this.host || this.host.hidden) return
            if (this.host.contains(e.target)) return
            this._setOpen(false)
        })

        // Esc key → close.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this._setOpen(false)
        })
    }

    _toggleOpen() {
        this._setOpen(!this.host.classList.contains('is-open'))
    }

    _setOpen(open) {
        if (!this.host) return
        this.host.classList.toggle('is-open', open)
        this.gear.setAttribute('aria-expanded', open ? 'true' : 'false')
        if (this.panel) {
            // Toggling `hidden` keeps the panel out of the a11y tree when closed.
            this.panel.hidden = !open
        }
    }

    _syncToggle(level) {
        this.toggleButtons.forEach((btn) => {
            const btnLevel = parseInt(btn.dataset.level, 10)
            const active = btnLevel === level
            btn.setAttribute('aria-checked', active ? 'true' : 'false')
        })
        if (this.hint) {
            this.hint.innerHTML = level === 0
                ? 'Estás en <strong>Alta</strong>: sombras grandes y todos los efectos.'
                : 'Estás en <strong>Ligera</strong>: sombras suaves, ideal en móvil.'
        }
    }

    /** Reveal the gear (called once the loading overlay is gone). */
    show() {
        if (!this.host) return
        this.host.hidden = false
        // Force reflow so the entrance transition kicks in.
        // eslint-disable-next-line no-unused-expressions
        this.host.offsetWidth
        this.host.classList.add('is-visible')
    }

    /** Hide the gear (during the loading overlay). */
    hide() {
        if (!this.host) return
        this.host.classList.remove('is-visible', 'is-open')
        this._setOpen(false)
    }
}
