import './ui.css'
import Modal from './Modal.js'
import { createButton } from './Button.js'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const PAD_REPEAT_MS = 160

const CARET_UP = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const CARET_DOWN = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/**
 * NameEntry — arcade-style 3-letter initials, playable with keyboard (type or
 * arrows), touch (▲/▼ per reel) and gamepad (dpad/stick + A). Used when a score
 * makes the Top 10. While open it suspends the pad's menu navigation so A and
 * the dpad drive the reels instead of the modal buttons.
 */
export default class NameEntry {
    constructor() {
        this.experience = window.experience
        this.letters = ['A', 'A', 'A']
        this.active = 0
        this._onSubmit = null
        this._navAt = 0
        this._pa = false

        this.modal = new Modal({
            variant: 'paper',
            align: 'center',
            title: '¡Estás en el Top 10!',
            subtitle: 'Pon tus iniciales',
            closable: false
        })

        this.reels = _el('div', 'fz-reels')
        this.reelEls = []
        for (let i = 0; i < 3; i++) {
            const reel = _el('div', 'fz-reel')
            const up = _el('button', 'fz-reel-btn')
            up.type = 'button'; up.innerHTML = CARET_UP
            up.addEventListener('click', () => { this._setActive(i); this._cycle(i, 1) })
            const letter = _el('div', 'fz-reel-letter')
            const down = _el('button', 'fz-reel-btn')
            down.type = 'button'; down.innerHTML = CARET_DOWN
            down.addEventListener('click', () => { this._setActive(i); this._cycle(i, -1) })
            reel.appendChild(up); reel.appendChild(letter); reel.appendChild(down)
            reel.addEventListener('click', (e) => { if (e.target === reel || e.target === letter) this._setActive(i) })
            this.reels.appendChild(reel)
            this.reelEls.push({ reel, letter })
        }
        this.modal.append(this.reels)

        this.row = _el('div', 'fz-btn-row')
        this.row.appendChild(createButton({ label: 'Aceptar', variant: 'primary', onClick: () => this._confirm() }))
        this.modal.append(this.row)

        this._onKeyDown = (e) => this._handleKey(e)
        this._onTick = () => this._pollPad()
    }

    open(onSubmit) {
        this._onSubmit = onSubmit
        this.letters = ['A', 'A', 'A']
        this.active = 0
        this._render()
        this.modal.open()

        const gp = this.experience?.gamepad
        if (gp) { gp.suspendMenuNav = true; this._pa = !!gp.getActions?.().button2 }
        window.addEventListener('keydown', this._onKeyDown, true)
        this.experience?.time?.on('tick', this._onTick)
    }

    _close() {
        window.removeEventListener('keydown', this._onKeyDown, true)
        this.experience?.time?.off('tick', this._onTick)
        const gp = this.experience?.gamepad
        if (gp) gp.suspendMenuNav = false
        this.modal.close()
    }

    _render() {
        for (let i = 0; i < 3; i++) {
            this.reelEls[i].letter.textContent = this.letters[i]
            this.reelEls[i].reel.classList.toggle('is-active', i === this.active)
        }
    }

    _setActive(i) { this.active = Math.max(0, Math.min(2, i)); this._render() }

    _cycle(i, dir) {
        const idx = LETTERS.indexOf(this.letters[i])
        this.letters[i] = LETTERS[(idx + dir + LETTERS.length) % LETTERS.length]
        this._render()
    }

    _move(dir) { this._setActive(this.active + dir) }

    _confirm() {
        const name = this.letters.join('')
        this._close()
        this._onSubmit?.(name)
    }

    _handleKey(e) {
        const k = e.key
        if (/^[a-zA-Z]$/.test(k)) {
            this.letters[this.active] = k.toUpperCase()
            if (this.active < 2) this.active++
            this._render(); e.preventDefault(); return
        }
        switch (k) {
            case 'Backspace':
                if (this.active > 0) this.active--
                this.letters[this.active] = 'A'; this._render(); e.preventDefault(); break
            case 'ArrowLeft': this._move(-1); e.preventDefault(); break
            case 'ArrowRight': this._move(1); e.preventDefault(); break
            case 'ArrowUp': this._cycle(this.active, 1); e.preventDefault(); break
            case 'ArrowDown': this._cycle(this.active, -1); e.preventDefault(); break
            case 'Enter': this._confirm(); e.preventDefault(); break
            default: break
        }
    }

    _pollPad() {
        const gp = this.experience?.gamepad
        if (!gp?.isActive?.()) return
        const a = !!gp.getActions?.().button2
        if (a && !this._pa) this._confirm()
        this._pa = a

        const m = gp.getMovement?.() || { x: 0, y: 0 }
        const d = gp.getDpad?.() || {}
        const left = d.left || m.x < -0.5
        const right = d.right || m.x > 0.5
        const up = d.up || m.y > 0.5
        const down = d.down || m.y < -0.5

        const now = performance.now()
        if (!(left || right || up || down)) { this._navAt = 0; return }
        if (now - this._navAt < PAD_REPEAT_MS) return
        this._navAt = now
        if (left) this._move(-1)
        else if (right) this._move(1)
        else if (up) this._cycle(this.active, 1)
        else if (down) this._cycle(this.active, -1)
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown, true)
        this.experience?.time?.off('tick', this._onTick)
        const gp = this.experience?.gamepad
        if (gp) gp.suspendMenuNav = false
        this.modal.destroy()
    }
}

function _el(tag, className) {
    const node = document.createElement(tag)
    if (className) node.className = className
    return node
}
