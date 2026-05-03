import Experience from '../Experience.js'

/**
 * FAB + modal to switch Quality high/low (persisted via Quality / localStorage).
 */
export default class QualitySettingsUI {
    constructor(experienceOverride = null) {
        this.experience = experienceOverride ?? new Experience()
        this.quality = this.experience.quality

        this.fab = document.getElementById('quality-fab-btn')
        this.overlay = document.getElementById('quality-modal-overlay')
        this.modal = document.getElementById('quality-modal')
        this.closeBtn = this.overlay?.querySelector('.quality-modal-close')
        this.cards = this.overlay?.querySelectorAll('[data-quality-level]')

        this._storedFocusEl = null
        this._onKeyDown = this._onKeyDown.bind(this)
        this._onFabClick = () => this.open()
        this._onCloseClick = () => this.close()
        this._onOverlayClick = (e) => {
            if (e.target === this.overlay) this.close()
        }

        if (!this.fab || !this.overlay || !this.modal || !this.cards?.length) {
            return
        }

        this.fab.addEventListener('click', this._onFabClick)
        this.closeBtn?.addEventListener('click', this._onCloseClick)
        this.overlay.addEventListener('click', this._onOverlayClick)

        for (const card of this.cards) {
            card.addEventListener('click', () => {
                const n = parseInt(card.getAttribute('data-quality-level'), 10)
                if (n === 0 || n === 1) {
                    this.quality.setLevel(n)
                    this._syncCards()
                    this._syncFab()
                }
                this.close()
            })
        }

        this.quality.on('change', () => {
            this._syncCards()
            this._syncFab()
        })

        this._syncCards()
        this._syncFab()
    }

    get isOpen() {
        return this.overlay?.classList.contains('is-open') ?? false
    }

    open() {
        if (!this.overlay || !this.modal) return
        this._storedFocusEl = document.activeElement
        this.overlay.classList.add('is-open')
        this.overlay.setAttribute('aria-hidden', 'false')
        this.fab?.setAttribute('aria-expanded', 'true')
        document.body.classList.add('quality-modal-open')
        window.addEventListener('keydown', this._onKeyDown)

        queueMicrotask(() => {
            this.closeBtn?.focus()
        })
    }

    close() {
        if (!this.overlay) return
        this.overlay.classList.remove('is-open')
        this.overlay.setAttribute('aria-hidden', 'true')
        this.fab?.setAttribute('aria-expanded', 'false')
        document.body.classList.remove('quality-modal-open')
        window.removeEventListener('keydown', this._onKeyDown)

        const prev = this._storedFocusEl
        this._storedFocusEl = null
        if (prev && typeof prev.focus === 'function') prev.focus()
        else this.fab?.focus()
    }

    _onKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault()
            this.close()
            return
        }
        if (e.key !== 'Tab' || !this.modal) return
        const focusables = this.modal.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        const nodes = [...focusables].filter(
            (n) => n.offsetParent !== null || n === document.activeElement
        )
        if (nodes.length === 0) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        const active = document.activeElement
        if (e.shiftKey) {
            if (active === first || !this.modal.contains(active)) {
                e.preventDefault()
                last.focus()
            }
        } else if (active === last) {
            e.preventDefault()
            first.focus()
        }
    }

    _syncFab() {
        if (!this.fab) return
        const high = this.quality.level === 0
        this.fab.dataset.qualityPreset = high ? 'high' : 'low'
        this.fab.setAttribute('aria-label', high ? 'Calidad (alta)' : 'Calidad (ligera)')
    }

    _syncCards() {
        if (!this.cards) return
        const lvl = this.quality.level
        for (const card of this.cards) {
            const n = parseInt(card.getAttribute('data-quality-level'), 10)
            const pressed = n === lvl
            card.classList.toggle('quality-card-selected', pressed)
            card.setAttribute('aria-pressed', String(pressed))
        }
    }
}
