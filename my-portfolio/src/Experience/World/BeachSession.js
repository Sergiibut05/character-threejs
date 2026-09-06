import Experience from '../Experience.js'
import Modal from './ui/Modal.js'
import BeachPrompt from './BeachPrompt.js'
import NameEntry from './ui/NameEntry.js'
import Leaderboard from '../Utils/Leaderboard.js'
import { t, controls } from '../Utils/gameText.js'
import Stepper from './ui/Stepper.js'
import { buildLeaderboardList } from './ui/leaderboardView.js'
import { createModeCard, createCardGrid } from './ui/Card.js'
import { createButton } from './ui/Button.js'
import { iconTrophy, iconInfinity, iconAim } from './ui/icons.js'

const TUTORIAL_SEEN_KEY = 'beach.tutorialSeen'

// ONE step, because there is only one thing to know: be under the ball and
// press at the right moment. The frisbee needs three because aiming, curving
// and power are three separate skills; padding this one out to match would be
// three panels of the same sentence.
//
// A function and not a constant, for the same reason as the frisbee's: an
// array built at module load bakes its strings before any catalog is resident
// and long before anyone can switch language.
const tutorialSteps = () => [
    {
        icon: iconAim,
        image: '/images/beach.png',
        title: t('beach.tutorial.title'),
        body: (d) => {
            const c = controls(d)
            // The press label opens the sentence here and sits mid-sentence in
            // the frisbee copy, so it is capitalised at the call site.
            return t('beach.tutorial.body', {
                move: c.move,
                press: c.press.charAt(0).toUpperCase() + c.press.slice(1)
            })
        }
    }
]

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
        this.tutorial = null
        this.prompt = new BeachPrompt(minigame)

        this.active = false
        this._launching = false
        this._startingMode = null
        this._prevPadA = false
        this._prevPadB = false
        this._prevMobileB = false

        this.minigame.onRallyEnd = (touches) => this._onRallyEnd(touches)
        this.minigame.onExitClick = () => { if (!this._anyModalOpen()) this._end() }
        this.minigame.onHelpClick = () => this._openHelp()

        this._onKeyDown = (e) => this._handleKey(e)
        window.addEventListener('keydown', this._onKeyDown)
    }

    isModalOpen() {
        return !!this.modal?.isOpen() || !!this.resultsModal?.isOpen() ||
            !!this.lbModal?.isOpen() || !!this.tutorial
    }

    // ─── Tutorial ────────────────────────────────────────────────────────

    _tutorialSeen() {
        try { return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1' } catch { return false }
    }

    _markTutorialSeen() {
        try { localStorage.setItem(TUTORIAL_SEEN_KEY, '1') } catch { /* ignore */ }
    }

    /** Freeze the rally AND the character animation while the panel is up. */
    _setPaused(paused) {
        this.minigame.paused = paused
        const character = this.experience.world?.character
        if (character) character.animationPaused = paused
    }

    _showTutorial(onDone) {
        this.tutorial?.destroy()
        this.tutorial = new Stepper({
            title: t('common.howToPlay'),
            steps: tutorialSteps(),
            onFinish: () => {
                this.tutorial?.destroy()
                this.tutorial = null
                onDone?.()
            }
        })
        this.tutorial.open()
    }

    /** Reopen from the "?" button — freezes the rally meanwhile. */
    _openHelp() {
        if (!this.active || this.tutorial) return
        this._setPaused(true)
        this._showTutorial(() => this._setPaused(false))
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
        this.experience.audio?.preloadSfx?.('beach')
        this.experience.audio?.preloadSfx?.('frisbee')   // the shared finish stinger
        this.modal.open()
    }

    _buildModal() {
        this.modal = new Modal({
            variant: 'paper',
            title: t('beach.title'),
            subtitle: t('beach.chooseMode')
        })

        this.modal.append(createCardGrid([
            createModeCard({
                icon: iconTrophy,
                title: t('common.competitive'),
                desc: t('beach.competitiveDesc'),
                onSelect: () => this._choose('competitivo')
            }),
            createModeCard({
                icon: iconInfinity,
                title: t('common.free'),
                desc: t('beach.freeDesc'),
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

        // First time ever: the panel comes up over the served ball, frozen,
        // so nobody loses a rally to reading it.
        if (!this._tutorialSeen()) {
            this._setPaused(true)
            this._showTutorial(() => {
                this._markTutorialSeen()
                this._setPaused(false)
            })
        }
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
            title: t('beach.resultsTitle'),
            closable: false,
            openSfx: 'finish'
        })

        const body = document.createElement('div')
        body.className = 'fz-result'
        body.innerHTML =
            `<span class="fz-result-label">${t('beach.touches')}</span>` +
            `<span class="fz-result-total">${touches}</span>` +
            `<span class="fz-result-sub">${t('beach.best', { n: Math.max(this.minigame.best, touches) })}</span>`
        this.resultsModal.append(body)

        const row = document.createElement('div')
        row.className = 'fz-btn-row'

        if (qualifies && touches > 0) {
            const badge = document.createElement('div')
            badge.className = 'fz-result-badge'
            badge.textContent = t('beach.top10Badge')
            this.resultsModal.append(badge)

            row.appendChild(createButton({
                label: t('common.saveRecord'), variant: 'primary',
                onClick: () => this._enterName(touches)
            }))
            row.appendChild(createButton({
                label: t('common.exit'), variant: 'ghost', onClick: () => this._end()
            }))
        } else {
            row.appendChild(createButton({
                label: t('common.playAgain'), variant: 'primary', onClick: () => this._replay()
            }))
            row.appendChild(createButton({
                label: t('common.seeRanking'), variant: 'ghost', onClick: () => this._showLeaderboard()
            }))
            row.appendChild(createButton({
                label: t('common.exit'), variant: 'ghost', onClick: () => this._end()
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
            title: t('common.ranking'),
            subtitle: t('beach.lbSubtitle'),
            closable: false
        })
        this.lbModal.append(buildLeaderboardList(top10, myBest, highlightEntry))

        const row = document.createElement('div')
        row.className = 'fz-btn-row'
        row.appendChild(createButton({
            label: t('common.playAgain'), variant: 'primary',
            onClick: () => { this._destroyLeaderboard(); this._replay() }
        }))
        row.appendChild(createButton({
            label: t('common.exit'), variant: 'ghost',
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
        this.tutorial?.destroy()
        this.tutorial = null
        this._setPaused(false)
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
