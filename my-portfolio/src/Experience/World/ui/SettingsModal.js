import './ui.css'
import './audio.css'
import Modal from './Modal.js'
import { createModeCard } from './Card.js'
import { inputGlyph } from './InputGlyph.js'
import {
    iconScenery, iconBolt, iconKeyboard, iconGamepad, iconMobile,
    iconMusic, iconVolume, iconMute, iconPrev, iconNext
} from './icons.js'

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

        this._registerSection({ id: 'general', label: 'General', build: (c) => this._buildGeneral(c) })
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
        this._teardownSound()
        this.activeIndex = i
        const tabs = this.nav.children
        for (let k = 0; k < tabs.length; k++) tabs[k].classList.toggle('is-active', k === i)
        this.content.innerHTML = ''
        this.sections[i].build(this.content)
    }

    // ─── General section (Calidad + Sonido) ──────────────────────────────
    _buildGeneral(container) {
        const qHead = _el('div', 'fz-sound-heading')
        qHead.textContent = 'Calidad'
        container.appendChild(qHead)
        this._buildQuality(container)
        this._buildSound(container)
    }

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

    // ─── Sonido sub-section ──────────────────────────────────────────────
    _buildSound(container) {
        const audio = this.experience.audio
        if (!audio) return

        const wrap = _el('div', 'fz-sound')
        const heading = _el('div', 'fz-sound-heading')
        heading.textContent = 'Sonido'
        wrap.appendChild(heading)

        // Now-playing preview card
        const np = _el('div', 'fz-np')
        const cover = _el('div', 'fz-np-cover')
        const info = _el('div', 'fz-np-info')
        const title = _el('div', 'fz-np-title')
        const prog = _el('div', 'fz-np-progress')
        const cur = _el('span'); cur.textContent = '0:00'
        const bar = _el('div', 'fz-np-bar')
        const fill = _el('div', 'fz-np-bar-fill'); bar.appendChild(fill)
        const dur = _el('span'); dur.textContent = '0:00'
        prog.append(cur, bar, dur)
        info.append(title, prog)
        const controls = _el('div', 'fz-np-controls')
        controls.append(
            _iconBtn(iconPrev, 'Canción anterior', () => audio.prev()),
            _iconBtn(iconNext, 'Siguiente canción', () => audio.next())
        )
        np.append(cover, info, controls)
        wrap.appendChild(np)

        // Volume row (mute toggle + slider)
        const volRow = _el('div', 'fz-vol-row')
        const muteBtn = _iconBtn(iconVolume, 'Silenciar', () => audio.toggleMute())
        const vol = document.createElement('input')
        vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.01'
        vol.className = 'fz-vol'
        vol.value = String(audio.getVolume())
        vol.addEventListener('input', () => audio.setVolume(parseFloat(vol.value)))
        volRow.append(muteBtn, vol)
        wrap.appendChild(volRow)

        container.appendChild(wrap)

        // ── Render helpers ──
        const fmt = (s) => {
            s = Math.max(0, Math.floor(s || 0))
            return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
        }
        const setCover = (url) => {
            if (url) { cover.style.backgroundImage = `url("${url}")`; cover.classList.remove('is-placeholder'); cover.innerHTML = '' }
            else { cover.style.backgroundImage = ''; cover.classList.add('is-placeholder'); cover.innerHTML = iconMusic }
        }
        const renderTrack = () => {
            const s = audio.getNowPlaying()
            if (!s) { title.textContent = 'Sin música'; setCover(null); dur.textContent = '0:00'; return }
            title.textContent = s.title || ''
            setCover(s.cover)
            dur.textContent = fmt(s.duration)
        }
        const renderProgress = () => {
            const s = audio.getNowPlaying()
            if (!s) { fill.style.width = '0%'; cur.textContent = '0:00'; return }
            fill.style.width = (s.duration ? Math.min(100, (s.position / s.duration) * 100) : 0) + '%'
            cur.textContent = fmt(s.position)
        }
        const renderControls = () => {
            const m = audio.isMuted()
            muteBtn.innerHTML = m ? iconMute : iconVolume
            muteBtn.classList.toggle('is-on', !m)
            muteBtn.setAttribute('aria-pressed', String(m))
            vol.value = String(audio.getVolume())
        }

        renderTrack(); renderProgress(); renderControls()

        // ── Live updates while the panel is open ──
        this._soundTimer = setInterval(renderProgress, 500)
        this._onTrackChange = () => { renderTrack(); renderProgress() }
        this._onMuteChange = renderControls
        this._onVolChange = renderControls
        audio.on('trackchange', this._onTrackChange)
        audio.on('mutechange', this._onMuteChange)
        audio.on('volumechange', this._onVolChange)
    }

    _teardownSound() {
        if (this._soundTimer) { clearInterval(this._soundTimer); this._soundTimer = null }
        const audio = this.experience.audio
        if (audio) {
            if (this._onTrackChange) audio.off('trackchange', this._onTrackChange)
            if (this._onMuteChange) audio.off('mutechange', this._onMuteChange)
            if (this._onVolChange) audio.off('volumechange', this._onVolChange)
        }
        this._onTrackChange = this._onMuteChange = this._onVolChange = null
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
        this._teardownSound()
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

function _iconBtn(svg, label, onClick) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'fz-icon-btn'
    b.setAttribute('aria-label', label)
    if (svg) b.innerHTML = svg
    b.addEventListener('click', onClick)
    return b
}
