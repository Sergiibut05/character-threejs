import './ui.css'
import { iconDisc, iconExit, iconHelp } from './icons.js'

/**
 * In-game HUD (top-left) — round + score, clean glass-pastel family (plan §5).
 *
 * The round is shown both as text and as a row of progress pips (balloon rounds
 * are tinted) so it reads at a glance and feels lively. Libre mode hides the
 * pips and just counts throws. An ✕ lets the player leave.
 */
export default class Hud {
    constructor() {
        this.el = document.createElement('div')
        this.el.className = 'fz-hud'
        this.el.innerHTML = `
            <div class="fz-hud-top">
                <span class="fz-hud-icon">${iconDisc}</span>
                <span class="fz-hud-round"></span>
            </div>
            <div class="fz-hud-pips"></div>
            <div class="fz-hud-score">
                <span class="fz-hud-score-label">Puntos</span>
                <span class="fz-hud-score-value">0</span>
            </div>
        `
        document.body.appendChild(this.el)
        this.roundEl = this.el.querySelector('.fz-hud-round')
        this.pipsEl = this.el.querySelector('.fz-hud-pips')
        this.scoreEl = this.el.querySelector('.fz-hud-score-value')

        // Standalone exit button — top-right, under the settings gear, icon-only.
        this.exitBtn = document.createElement('button')
        this.exitBtn.type = 'button'
        this.exitBtn.className = 'fz-hud-leave'
        this.exitBtn.setAttribute('aria-label', 'Salir del minijuego')
        this.exitBtn.innerHTML = `<span class="fz-hud-leave-icon">${iconExit}</span>`
        document.body.appendChild(this.exitBtn)

        // Help "?" — reopens the tutorial; only shown while aiming (toggled by
        // FrisbeeSession, hidden during flight).
        this.helpBtn = document.createElement('button')
        this.helpBtn.type = 'button'
        this.helpBtn.className = 'fz-hud-help'
        this.helpBtn.setAttribute('aria-label', 'Cómo jugar')
        this.helpBtn.innerHTML = `<span class="fz-hud-help-icon">${iconHelp}</span>`
        document.body.appendChild(this.helpBtn)

        this.mode = 'competitivo'
        this.totalRounds = 10
        this.balloonFrom = 6
    }

    /** Build the pip row for the chosen mode (competitive only). */
    configure(mode, totalRounds, balloonFrom = 6) {
        this.mode = mode
        this.totalRounds = totalRounds
        this.balloonFrom = balloonFrom
        this.pipsEl.innerHTML = ''

        if (mode === 'competitivo') {
            this.pipsEl.style.display = ''
            for (let i = 1; i <= totalRounds; i++) {
                const pip = document.createElement('span')
                pip.className = 'fz-hud-pip'
                if (i >= balloonFrom) pip.classList.add('is-balloon')
                this.pipsEl.appendChild(pip)
            }
        } else {
            this.pipsEl.style.display = 'none'
        }
    }

    setRound(current) {
        if (this.mode === 'competitivo') {
            this.roundEl.textContent = `Ronda ${current} / ${this.totalRounds}`
            const pips = this.pipsEl.children
            for (let i = 0; i < pips.length; i++) {
                // Only the current pip toggles here; completed pips keep their
                // outcome colour set by setRoundResult().
                pips[i].classList.toggle('is-current', i === current - 1)
            }
        } else {
            this.roundEl.textContent = `Libre · Tirada ${current}`
        }
    }

    /**
     * Colour a completed round's pip by outcome: bullseye / hit / miss, with an
     * extra ring when the balloon was popped.
     */
    setRoundResult(index, { points = 0, balloonPopped = false } = {}) {
        const pip = this.pipsEl.children[index]
        if (!pip) return
        pip.classList.remove('is-current')
        pip.classList.add('is-done')
        pip.classList.toggle('res-bull', points >= 100)
        pip.classList.toggle('res-hit', points > 0 && points < 100)
        pip.classList.toggle('res-miss', points <= 0)
        pip.classList.toggle('res-balloon', !!balloonPopped)
    }

    setScore(value) {
        this.scoreEl.textContent = `${value}`
        this.scoreEl.classList.remove('is-bumped')
        void this.scoreEl.offsetWidth
        this.scoreEl.classList.add('is-bumped')
    }

    show() {
        this.el.classList.add('is-visible')
        this.exitBtn.classList.add('is-visible')
    }

    hide() {
        this.el.classList.remove('is-visible')
        this.exitBtn.classList.remove('is-visible')
        this.setHelpVisible(false)
    }

    setHelpVisible(visible) {
        this.helpBtn.classList.toggle('is-visible', visible)
    }

    onExit(cb) { this.exitBtn.onclick = cb }
    onHelp(cb) { this.helpBtn.onclick = cb }

    destroy() {
        this.el?.remove()
        this.exitBtn?.remove()
        this.helpBtn?.remove()
    }
}
