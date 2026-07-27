import Experience from '../Experience.js'
import Modal from './ui/Modal.js'
import BeachPrompt from './BeachPrompt.js'
import NameEntry from './ui/NameEntry.js'
import Leaderboard from '../Utils/Leaderboard.js'
import { buildLeaderboardList } from './ui/leaderboardView.js'
import { createModeCard, createCardGrid } from './ui/Card.js'
import { createButton } from './ui/Button.js'
import { iconTrophy, iconInfinity } from './ui/icons.js'

/**
 * BeachSession — everything ABOVE a single rally: the proximity prompt, mode
 * select, results, arcade initials and the ranking.
 *
 * Mirrors FrisbeeSession so both activities behave identically for the player,
 * and so the shared UI (Modal / NameEntry / leaderboardView) is reused rather
 * than re-invented.
 *
 *   Competitivo — one miss ends the run; the streak goes to the beach ranking.
 *   Libre       — endless practice, the rally just restarts. Nothing is saved.
 *
 * The two boards are separate Firestore collections (see Leaderboard.js), so
 * beach streaks never mix with frisbee scores.
 */
export default class BeachSession {
    constructor(minigame) {
        this.experience = new Experience()
        this.minigame = minigame
        this.leaderboard = new Leaderboard('beach')

        this.modal = null
        this.resultsModal = null
        this.lbModal = null
        this.nameEntry = null
        this.prompt = new BeachPrompt(minigame)

        this.active = false
        this._launching = false
        this._startingMode = null
        this._prevPadA = false
        this._prevPadB = false
        this._prevMobileB = false

        this.minigame.onRallyEnd = (touches) => this._onRallyEnd(touches)
        this.minigame.onExitClick = () => { if (!this._anyModalOpen()) this._end() }

        this._onKeyDown = (e) => this._handleKey(e)
        window.addEventListener('keydown', this._onKeyDown)
    }

    isModalOpen() {
        return !!this.modal?.isOpen() || !!this.resultsModal?.isOpen() || !!this.lbModal?.isOpen()
    }

    _anyModalOpen() {
        return this.isModalOpen() ||
            !!document.querySelector('.fz-modal-overlay.is-open, .fz-proj.is-open')
    }

    // ─── Entry: proximity prompt → mode select ───────────────────────────
    openModeSelect() {
        if (this.active || this._launching) return
        if (this.minigame.state !== 'idle' || !this.minigame._ready) return
        if (this._anyModalOpen()) return
        if (this.experience.camera.mode === 'cinematic') return

        const character = this.experience.world?.character
        if (character) character.movementLocked = true

        if (!this.modal) this._buildModal()
        this.prompt.press()
        this.prompt.hide()
        this.modal.open()
    }

    _buildModal() {
        this.modal = new Modal({
            variant: 'paper',
            title: 'Voleibol de playa',
            subtitle: 'Encadena toques sin que la pelota toque la arena'
        })

        this.modal.append(createCardGrid([
            createModeCard({
                icon: iconTrophy,
                title: 'Competitivo',
                desc: 'Un fallo y se acaba · entra en el ranking',
                onSelect: () => this._choose('competitivo')
            }),
            createModeCard({
                icon: iconInfinity,
                title: 'Libre',
                desc: 'Práctica · el peloteo se reinicia solo',
                onSelect: () => this._choose('libre')
            })
        ]))
        this.modal.onClose(() => this._onModalClosed())
    }

    _choose(mode) {
        this._startingMode = mode
        // Guard against the SAME confirm press re-opening the modal before the
        // session flips to `active` (the gamepad A is still down).
        this._launching = true
        this.modal.close()
    }

    _onModalClosed() {
        const character = this.experience.world?.character
        if (this._startingMode) {
            const mode = this._startingMode
            this._startingMode = null
            this.experience.waitMs(160).then(() => this._startSession(mode))
            return
        }
        // Cancelled — hand control back.
        this._launching = false
        if (character) character.movementLocked = false
    }

    _startSession(mode) {
        const character = this.experience.world?.character
        // start() re-locks movement its own way (planarLock), so release the
        // modal freeze first or the player would be stuck on the court.
        if (character) character.movementLocked = false

        if (!this.minigame.start(mode)) {
            this._launching = false
            return
        }
        this.active = true
        this._launching = false
    }

    // ─── Rally finished (competitive only) ───────────────────────────────
    _onRallyEnd(touches) {
        if (!this.active) return
        // Let the miss flash breathe before the modal covers the screen.
        this.experience.waitMs(1100).then(() => {
            if (!this.active) return
            this._showResults(touches)
        })
    }

    _showResults(touches) {
        const qualifies = this.leaderboard.qualifiesForTop10(touches)

        this.resultsModal = new Modal({
            variant: 'paper',
            size: 'lg',
            title: '¡Se acabó el peloteo!',
            closable: false
        })

        const body = document.createElement('div')
        body.className = 'fz-result'
        body.innerHTML =
            '<span class="fz-result-label">Toques encadenados</span>' +
            `<span class="fz-result-total">${touches}</span>` +
            `<span class="fz-result-sub">tu mejor marca: ${Math.max(this.minigame.best, touches)}</span>`
        this.resultsModal.append(body)

        const row = document.createElement('div')
        row.className = 'fz-btn-row'

        if (qualifies && touches > 0) {
            const badge = document.createElement('div')
            badge.className = 'fz-result-badge'
            badge.textContent = '¡Has entrado en el Top 10!'
            this.resultsModal.append(badge)

            row.appendChild(createButton({
                label: 'Guardar récord', variant: 'primary',
                onClick: () => this._enterName(touches)
            }))
            row.appendChild(createButton({
                label: 'Salir', variant: 'ghost', onClick: () => this._end()
            }))
        } else {
            row.appendChild(createButton({
                label: 'Jugar otra vez', variant: 'primary', onClick: () => this._replay()
            }))
            row.appendChild(createButton({
                label: 'Ver ranking', variant: 'ghost', onClick: () => this._showLeaderboard()
            }))
            row.appendChild(createButton({
                label: 'Salir', variant: 'ghost', onClick: () => this._end()
            }))
        }

        this.resultsModal.append(row)
        this.resultsModal.open()
    }

    _enterName(touches) {
        this._destroyResults()
        if (!this.nameEntry) this.nameEntry = new NameEntry()
        this.nameEntry.open(async (name) => {
            let res = null
            try { res = await this.leaderboard.submitScore({ name, score: touches }) }
            catch { /* ephemeral */ }
            // Refresh the in-world beach board straight away.
            this.experience.world?.beachScoreboard?.render?.()
            this._showLeaderboard(res?.entry || null)
        })
    }

    async _showLeaderboard(highlightEntry = null) {
        this._destroyResults()
        this._destroyLeaderboard()

        const [top10, myBest] = await Promise.all([
            this.leaderboard.getTop10(),
            this.leaderboard.getMyBest()
        ])

        this.lbModal = new Modal({
            variant: 'paper',
            size: 'lg',
            title: 'Ranking',
            subtitle: 'Top 10 · Voleibol de playa',
            closable: false
        })
        this.lbModal.append(buildLeaderboardList(top10, myBest, highlightEntry))

        const row = document.createElement('div')
        row.className = 'fz-btn-row'
        row.appendChild(createButton({
            label: 'Jugar otra vez', variant: 'primary',
            onClick: () => { this._destroyLeaderboard(); this._replay() }
        }))
        row.appendChild(createButton({
            label: 'Salir', variant: 'ghost',
            onClick: () => { this._destroyLeaderboard(); this._end() }
        }))
        this.lbModal.append(row)
        this.lbModal.open()
    }

    _replay() {
        this._destroyResults()
        this._destroyLeaderboard()
        if (!this.minigame.replay()) this._end()
    }

    /** Leave the court entirely. */
    _end() {
        this._destroyResults()
        this._destroyLeaderboard()
        this.active = false
        this.minigame.stop()
    }

    _destroyResults() {
        this.resultsModal?.destroy()
        this.resultsModal = null
    }

    _destroyLeaderboard() {
        this.lbModal?.destroy()
        this.lbModal = null
    }

    // ─── Input ───────────────────────────────────────────────────────────
    _handleKey(e) {
        if (this._anyModalOpen()) return
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return

        if (!this.active) {
            const k = e.key.toLowerCase()
            if ((k === 'e' || e.key === 'Enter') && this.minigame.inRange()) this.openModeSelect()
            return
        }
        if (e.key === 'Escape') { e.stopPropagation(); this._end() }
    }

    update() {
        // Floating activity mark while idle (hidden during play / menus).
        this.prompt.update(!this.active && !this._launching && !this._anyModalOpen())

        // Gamepad / mobile action button (rising edge).
        const pad = this.experience.gamepad
        const padA = pad?.connected ? pad.getActions?.().button2 === true : false
        const padB = pad?.connected ? pad.getActions?.().back === true : false
        const mobB = this.experience.mobileControls?.getActions?.().button2 === true

        if (!this.active) {
            if (((padA && !this._prevPadA) || (mobB && !this._prevMobileB)) &&
                this.minigame.inRange()) {
                this.openModeSelect()
            }
        } else if (padB && !this._prevPadB && !this._anyModalOpen()) {
            this._end()
        }

        this._prevPadA = padA
        this._prevPadB = padB
        this._prevMobileB = mobB
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown)
        this.prompt?.destroy()
        this.modal?.destroy()
        this._destroyResults()
        this._destroyLeaderboard()
        this.nameEntry?.destroy?.()
    }
}
