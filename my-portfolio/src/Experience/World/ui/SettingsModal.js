import './ui.css'
import Modal from './Modal.js'
import { createModeCard } from './Card.js'
import { inputGlyph } from './InputGlyph.js'
import { iconScenery, iconBolt, iconKeyboard, iconGamepad, iconMobile } from './icons.js'

// Controls shown per device, grouped by context.
const CONTROL_GROUPS = [
    ['Mundo', [['Mover', 'move'], ['Correr', 'sprint'], ['Interactuar', 'interact']]],
    ['Frisbee', [['Apuntar', 'aim'], ['Curva', 'tilt'], ['Fuerza / Lanzar', 'confirm'], ['Salir', 'back']]]
]
const DEVICES = [
    ['keyboard', 'Teclado', iconKeyboard],
    ['gamepad', 'Mando', iconGamepad],
    ['touch', 'Táctil', iconMobile]
]

/**
 * SettingsModal — central settings modal with sections (plan §4/§E). Opened from
 * the gear button. Sections are registered so more can be added later (Controls,
 * audio…). Ships with the "Calidad" section migrated from the old quality FAB.
 */
export default class SettingsModal {
    constructor(experience) {
        this.experience = experience
        this.quality = experience.quality
        this.sections = []
        this.activeIndex = 0

        this.modal = new Modal({ variant: 'clean', size: 'lg', title: 'Ajustes' })
        this.nav = _el('div', 'fz-settings-nav')
        this.content = _el('div', 'fz-settings-content')
        this.modal.append(this.nav)
        this.modal.append(this.content)

        this._registerSection({ id: 'quality', label: 'Calidad', build: (c) => this._buildQuality(c) })
        this._registerSection({ id: 'controls', label: 'Controles', build: (c) => this._buildControls(c) })

        // Keep the quality cards in sync with external changes.
        this.quality?.on?.('change', () => this._syncQuality())

        // Restore character movement when the modal is dismissed.
        this.modal.onClose(() => this._onClosed())

        // Wire the existing gear button.
        this.gear = document.getElementById('quality-fab-btn')
        this._onGear = () => this.open()
        this.gear?.addEventListener('click', this._onGear)
    }

    _registerSection(section) {
        const i = this.sections.length
        this.sections.push(section)
        const tab = _el('button', 'fz-settings-tab')
        tab.type = 'button'
        tab.textContent = section.label
        tab.addEventListener('click', () => this._select(i))
        this.nav.appendChild(tab)
        this.nav.style.display = this.sections.length > 1 ? '' : 'none'
    }

    /** Public: lets later phases add sections (e.g. Controls). */
    addSection(section) { this._registerSection(section) }

    _select(i) {
        this.activeIndex = i
        const tabs = this.nav.children
        for (let k = 0; k < tabs.length; k++) tabs[k].classList.toggle('is-active', k === i)
        this.content.innerHTML = ''
        this.sections[i].build(this.content)
    }

    // ─── Calidad section ─────────────────────────────────────────────────
    _buildQuality(container) {
        const grid = _el('div', 'fz-cards')
        const make = (level, icon, title, desc) => {
            const card = createModeCard({ icon, title, desc, onSelect: () => this.quality.setLevel(level) })
            card.dataset.level = String(level)
            grid.appendChild(card)
        }
        make(0, iconScenery, 'Alta', 'Máxima calidad visual')
        make(1, iconBolt, 'Ligera', 'Mejor rendimiento')
        container.appendChild(grid)
        this._syncQuality()
    }

    _syncQuality() {
        const lvl = this.quality?.level
        for (const card of this.content.querySelectorAll('.fz-card[data-level]')) {
            card.classList.toggle('is-selected', Number(card.dataset.level) === lvl)
        }
    }

    // ─── Controles section (glyphs per device) ───────────────────────────
    _buildControls(container) {
        let current = this.experience.input?.device || 'keyboard'

        const sel = _el('div', 'fz-settings-nav')
        const list = _el('div', 'fz-ctrl-list')
        const renderList = () => {
            list.innerHTML = ''
            for (const [title, rows] of CONTROL_GROUPS) {
                const h = _el('div', 'fz-ctrl-group')
                h.textContent = title
                list.appendChild(h)
                for (const [label, action] of rows) {
                    const row = _el('div', 'fz-ctrl-row')
                    const l = _el('span', 'fz-ctrl-label')
                    l.textContent = label
                    const g = _el('span', 'fz-ctrl-glyph')
                    g.appendChild(inputGlyph(action, current))
                    row.appendChild(l)
                    row.appendChild(g)
                    list.appendChild(row)
                }
            }
        }
        for (const [id, label, icon] of DEVICES) {
            const b = _el('button', 'fz-settings-tab fz-settings-tab--icon')
            b.type = 'button'
            b.innerHTML = `<span class="fz-tab-icon">${icon}</span>${label}`
            b.classList.toggle('is-active', id === current)
            b.addEventListener('click', () => {
                current = id
                for (const c of sel.children) c.classList.toggle('is-active', c === b)
                renderList()
            })
            sel.appendChild(b)
        }
        container.appendChild(sel)
        container.appendChild(list)
        renderList()
    }

    open() {
        // Freeze the character while the settings are open (restored on close).
        const character = this.experience.world?.character
        if (character) {
            this._prevLocked = character.movementLocked
            character.movementLocked = true
        }
        this._select(this.activeIndex)
        this.modal.open()
        this.gear?.setAttribute('aria-expanded', 'true')
    }

    close() { this.modal.close() }

    _onClosed() {
        const character = this.experience.world?.character
        if (character && this._prevLocked !== undefined) {
            character.movementLocked = this._prevLocked
            this._prevLocked = undefined
        }
        this.gear?.setAttribute('aria-expanded', 'false')
    }

    isOpen() { return this.modal.isOpen() }

    destroy() {
        this.gear?.removeEventListener('click', this._onGear)
        this.modal.destroy()
    }
}

function _el(tag, className) {
    const node = document.createElement(tag)
    if (className) node.className = className
    return node
}
