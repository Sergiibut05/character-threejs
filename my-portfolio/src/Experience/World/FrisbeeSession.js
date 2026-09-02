import Experience from '../Experience.js'
import Modal from './ui/Modal.js'
import Hud from './ui/Hud.js'
import Stepper from './ui/Stepper.js'
import Announce from './ui/Announce.js'
import Hint from './ui/Hint.js'
import { createModeCard, createCardGrid } from './ui/Card.js'
import { createButton } from './ui/Button.js'
import NameEntry from './ui/NameEntry.js'
import Leaderboard from '../Utils/Leaderboard.js'

import { buildLeaderboardList } from './ui/leaderboardView.js'
import { t, controls } from '../Utils/gameText.js'
import {
    iconTrophy, iconTarget, iconAim, iconCurve, iconPower
} from './ui/icons.js'

const COMPETITIVE_ROUNDS = 10
const BALLOON_FROM_ROUND = 6   // rounds 6–10 add the balloon (competitive)
const RING_MAX = 100           // best ring score
const BALLOON_BONUS = 100      // popping the balloon
const TUTORIAL_SEEN_KEY = 'frisbee.tutorialSeen'

// A FUNCTION, not a constant. The old array baked its strings at module load,
// which is before any catalog is resident and long before the player can switch
// language — it has to be rebuilt every time the stepper renders.
const tutorialSteps = () => [
    {
        icon: iconAim,
        image: '/images/first.png',
        title: t('frisbee.tutorial.aimTitle'),
        body: (d) => t('frisbee.tutorial.aimBody', controls(d))
    },
    {
        icon: iconCurve,
        image: '/images/second.png',
        title: t('frisbee.tutorial.curveTitle'),
        body: (d) => t('frisbee.tutorial.curveBody', controls(d))
    },
    {
        icon: iconPower,
        image: '/images/third.png',
        title: t('frisbee.tutorial.powerTitle'),
        body: (d) => {
            const c = controls(d)
            // The press label is mid-sentence in one language and sentence-initial
            // in another, so it is capitalised here rather than in the catalog.
            return t('frisbee.tutorial.powerBody', {
                move: c.move,
                press: c.press.charAt(0).toUpperCase() + c.press.slice(1)
            })
        }
    }
]

/**
 * FrisbeeSession — orchestrates a play session ABOVE a single throw (plan §4.B/§4.C).
 *
 * Flow: mode-select modal → rounds → results.
 *   - Competitivo: 10 rounds (1–5 plain, 6–10 with balloon), scored, results screen.
 *   - Libre: infinite practice throws (always with balloon), leave via the HUD ✕.
 *
 * The minigame plays one atomic throw and reports its result via
 * `onThrowComplete`; this layer accumulates score, drives the HUD and re-arms
 * the next throw (or shows results).
 */
export default class FrisbeeSession {
    constructor(minigame) {
        this.experience = new Experience()
        this.minigame = minigame

        this.modal = null
        this.hud = null
        this.resultsModal = null
        this.tutorial = null
        this.announce = null
        this.hint = null
        this.nameEntry = null
        this.lbModal = null
        this.leaderboard = new Leaderboard()

        this.mode = null
        this.active = false
        this.round = 0
        this.score = 0

        this._startingMode = null
        this._launching = false
        this._helpShown = false
        this._tutorialPending = false
        this._announcedRound = 0
        this._prevPadConfirm = false
        this._onKeyDown = (e) => {
            // Esc abandons the session — but not while a modal/tutorial is open
            // (there it just closes that panel).
            if (e.key === 'Escape' && this.active && !this.tutorial && !this.isModalOpen()) {
                this._abandon()
            }
        }
    }

    isModalOpen() {
        return !!this.modal?.isOpen() || !!this.resultsModal?.isOpen()
    }

    // ─── Entry: mode select ──────────────────────────────────────────────

    openModeSelect() {
        if (this.minigame.state !== 'idle' || this.active || this._launching) return
        if (this.isModalOpen()) return

        const character = this.experience.world?.character
        if (character) character.movementLocked = true

        // Warm the throw/score/finish clips now: the player is standing at
        // the pitch about to choose a mode, so there is a beat to spare and
        // the first throw must not be silent while a file downloads.
        this.experience.audio?.preloadSfx?.('frisbee')
        if (!this.modal) this._buildModal()
        this.modal.open()
    }

    _buildModal() {
        this.modal = new Modal({
            variant: 'paper',
            title: t('frisbee.title'),
            subtitle: t('frisbee.chooseMode')
        })

        const grid = createCardGrid([
            createModeCard({
                icon: iconTrophy,
                title: t('common.competitive'),
                desc: t('frisbee.competitiveDesc'),
                onSelect: () => this._choose('competitivo')
            }),
            createModeCard({
                icon: iconTarget,
                title: t('common.free'),
                desc: t('frisbee.freeDesc'),
                onSelect: () => this._choose('libre')
            })
        ])
        this.modal.append(grid)
        this.modal.onClose(() => this._onModalClosed())
    }

    _choose(mode) {
        this._startingMode = mode
        // Guard against the SAME confirm press (gamepad A) re-opening the modal
        // via ActivityPrompt before the session flips to `active`.
        this._launching = true
        this.modal.close() // triggers _onModalClosed
    }

    _onModalClosed() {
        if (this._startingMode) {
            const mode = this._startingMode
            this._startingMode = null
            // Enter the activity straight away; the first-time tutorial pops up
            // later, right when the first throw is about to begin (see update()).
            this.experience.waitMs(180).then(() => this._startSession(mode))
            return
        }
        // Cancelled — hand control back.
        this._launching = false
        const character = this.experience.world?.character
        if (character && this.minigame.state === 'idle') character.movementLocked = false
    }

    // ─── Tutorial ────────────────────────────────────────────────────────

    _tutorialSeen() {
        try { return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1' } catch { return false }
    }

    _markTutorialSeen() {
        try { localStorage.setItem(TUTORIAL_SEEN_KEY, '1') } catch { /* ignore */ }
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

    /** Freeze/resume the throw AND the character animation (modal open). */
    _setPaused(paused) {
        this.minigame._paused = paused
        const character = this.experience.world?.character
        if (character) character.animationPaused = paused
    }

    /** Reopen the tutorial from the "?" button — freezes the throw meanwhile. */
    _openHelp() {
        if (!this.active || this.tutorial) return
        this._setPaused(true)
        this._showTutorial(() => this._setPaused(false))
    }

    /** Called each frame by World. */
    update() {
        if (!this.active) return

        // Gamepad A satisfies a pending "press to continue" cinematic.
        const padConfirm = this.experience.gamepad?.getActions?.().button2 === true
        if (padConfirm && !this._prevPadConfirm && this._continueResolve) {
            this._continueResolve()
        }
        this._prevPadConfirm = padConfirm

        // First time ever: pop the tutorial the moment the first throw begins
        // (aiming), freezing the throw until it's dismissed.
        if (this._tutorialPending && !this.tutorial && this.minigame.state === 'windUp') {
            this._tutorialPending = false
            this._setPaused(true)
            this._showTutorial(() => {
                this._markTutorialSeen()
                this._setPaused(false)
            })
        }

        // Round-start cinematic: once per round, when aiming begins (and not
        // while the tutorial is up).
        if (this.minigame.state === 'windUp' && !this.tutorial && !this._tutorialPending &&
            this._announcedRound !== this.round) {
            this._announcedRound = this.round
            this._playRoundStart()
        }

        if (!this.hud) return
        const s = this.minigame.state
        const canHelp = !this.tutorial && (s === 'windUp' || s === 'charge')
        if (canHelp !== this._helpShown) {
            this._helpShown = canHelp
            this.hud.setHelpVisible(canHelp)
        }
    }

    _playRoundStart() {
        if (!this.announce) this.announce = new Announce()
        const text = this.mode === 'competitivo'
            ? (this.round >= COMPETITIVE_ROUNDS
                ? t('frisbee.lastRound')
                : t('frisbee.round', { n: this.round }))
            : t('frisbee.shot', { n: this.round })
        this.announce.show(text, 1900)
        this.experience.camera.playRoundStartDescend?.(1800)
    }

    // ─── Session lifecycle ───────────────────────────────────────────────

    async _startSession(mode) {
        this._launching = false
        if (this.minigame.state !== 'idle') return
        this.mode = mode
        this.active = true
        this.round = 1
        this.score = 0
        this._announcedRound = 0
        // Silence the world soundtrack while inside the minigame.
        this.experience.audio?.suspendForMinigame()
        this._tutorialPending = !this._tutorialSeen() // shown at the first windUp
        this.minigame.roundStartCinematic = true
        this.experience.mobileControls?.setActionIcon?.('frisbee')
        this.experience.mobileControls?.setSprintVisible?.(false)

        // Hide the activity badge for the whole session (exitMinigame restores).
        const prompt = this.experience.world?.activityPrompt
        if (prompt?.el) prompt.el.style.display = 'none'

        // Entry cinematic (pan + dog framing) before the first round.
        await this._playEntrySequence()
        if (!this.active) return // left during the intro

        if (!this.hud) this._buildHud()
        this.hud.configure(mode, COMPETITIVE_ROUNDS, BALLOON_FROM_ROUND)
        this.hud.show()
        this._updateHud()
        window.addEventListener('keydown', this._onKeyDown, true)

        this.minigame.onThrowComplete = (r) => this._onThrowComplete(r)
        this.minigame.start(mode, this._roundHasBalloon(this.round))
    }

    // ─── Entry cinematic (pan + dog framing) ─────────────────────────────

    async _playEntrySequence() {
        const camera = this.experience.camera
        const character = this.experience.world?.character
        const dog = this.minigame.dog
        if (!this.hint) this.hint = new Hint()

        // 0. Iris out over the gameplay view, swing the camera to the opening
        // frame of the pan while it is dark, iris back in. Without it the cut
        // from the follow camera to the cinematic is a hard jump — and it is
        // the same wipe the round start and the house doors already use, so
        // the whole activity opens and closes the same way.
        const renderer = this.experience.renderer
        renderer.setIrisTransitionEnabled(true)
        await this.experience.animateValue(1.35, 0.0, 520,
            (v) => renderer.setIrisTransitionSize(v))

        // Put the player on the throwing mark and face the pitch, so the pan
        // (and later the aim) line up. Behind the closed iris, along with the
        // camera move. Also stands the dog up and moves it out of the way.
        this._placeAtThrowMark(character, dog)

        camera.primeEntryPan?.()

        if (!this.active) {
            renderer.setIrisTransitionEnabled(false)
            return
        }

        await this.experience.waitMs(120)
        await this.experience.animateValue(0.0, 1.35, 700,
            (v) => renderer.setIrisTransitionSize(v))
        renderer.setIrisTransitionEnabled(false)
        if (!this.active) return

        // 1. Entry pan — very slow, skippable from the start.
        this.hint?.show('saltar', 'continue')
        const skipped = await this._runSkippable(camera.playEntryPan?.(8000))
        this.hint?.hide()
        if (!this.active) return

        // 2. Hold on the pan's end pose and wait to be let go — but only if the
        // pan was allowed to finish. Skipping it IS the player saying "get on
        // with it", and following that with a second "press to continue" made
        // them press Enter twice to start playing: the first press bought them
        // nothing but a different thing to press through.
        if (skipped) return
        await this._waitForContinue()
    }

    /**
     * Resolve when `animPromise` finishes OR the player presses to skip.
     *
     * @returns {Promise<boolean>} true when a PRESS ended it, false when the
     *   animation ran out on its own. The caller needs to tell the two apart:
     *   a player who skipped has already asked to start.
     */
    _runSkippable(animPromise) {
        return new Promise((resolve) => {
            let done = false
            const finish = (skipped) => {
                if (done) return
                done = true
                window.removeEventListener('keydown', onKey, true)
                window.removeEventListener('pointerdown', onPointer, true)
                this._continueResolve = null
                resolve(skipped === true)
            }
            const onKey = (e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault()
                    e.stopPropagation()
                    finish(true)
                }
            }
            const onPointer = () => finish(true)
            // Gamepad A and the leave-the-activity path both call this; the pad
            // is a skip, so wrap rather than pass `finish` bare (it would
            // receive the caller's argument, or none, and read as "not
            // skipped").
            this._continueResolve = () => finish(true)
            setTimeout(() => {
                if (done) return
                window.addEventListener('keydown', onKey, true)
                window.addEventListener('pointerdown', onPointer, true)
            }, 200)
            Promise.resolve(animPromise).then(() => finish(false))
        })
    }

    /**
     * Stand the player on the throwing mark — the activity's own anchor point,
     * where the dog waits — facing the field, and move the dog aside.
     *
     * The activity triggers anywhere within 2.25 units of that anchor, so
     * without this the round starts from wherever you happened to be when you
     * pressed Enter: a 4.5-unit circle of possible positions, which drags the
     * entry pan, the aim calibration and the dog's spot along with it. Pinned
     * to the mark, every round opens from the same shot.
     *
     * Called behind the closed iris, so neither move is ever seen.
     */
    _placeAtThrowMark(character, dog) {
        if (!character) return
        const bbox = this.experience.world?.getPitchBBox?.()
        if (!bbox) return
        const cx = (bbox.min.x + bbox.max.x) / 2
        const cz = (bbox.min.z + bbox.max.z) / 2

        const anchor = this.experience.world?.activityPrompt?.anchorPosition
        if (!anchor) {
            // No anchor (GLB marker missing): keep the old behaviour of just
            // turning on the spot rather than teleporting somewhere arbitrary.
            const yaw = Math.atan2(cx - character.position.x, cz - character.position.z)
            character.container.rotation.y = yaw
            if (dog?.container) dog.container.rotation.y = yaw
            return
        }

        const yaw = Math.atan2(cx - anchor.x, cz - anchor.z)

        // The pitch surface, not the GLB marker's Y (which floats above it) and
        // not the player's own ground height (they may have walked in off the
        // grass). No settle margin: movement is locked for the whole round, so
        // nothing would ever bring them down the last 15cm.
        const pitchY = (bbox.min.y + bbox.max.y) / 2
        character.teleportTo(anchor.x, pitchY, anchor.z, yaw, 0)

        // The player is standing on the dog's waiting spot now, so put the dog
        // where it goes for the throw. Doing it here rather than at the round
        // start means the cinematic already shows the pair as they will be —
        // and `show` stands the dog up, which is what the intro wants.
        dog?.show?.(character.position, yaw, pitchY)
    }

    /** Resolve on the next continue input (Enter/Space/click/tap). */
    _waitForContinue() {
        return new Promise((resolve) => {
            this.hint?.show('continuar', 'continue')
            const finish = () => {
                window.removeEventListener('keydown', onKey, true)
                window.removeEventListener('pointerdown', onPointer, true)
                this._continueResolve = null
                this.hint?.hide()
                resolve()
            }
            const onKey = (e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault()
                    e.stopPropagation()
                    finish()
                }
            }
            const onPointer = () => finish()
            this._continueResolve = finish
            // Small delay so the input that opened this doesn't instantly resolve.
            setTimeout(() => {
                if (!this._continueResolve) return
                window.addEventListener('keydown', onKey, true)
                window.addEventListener('pointerdown', onPointer, true)
            }, 300)
        })
    }

    _buildHud() {
        this.hud = new Hud()
        this.hud.onExit(() => this._abandon())
        this.hud.onHelp(() => this._openHelp())
    }

    _roundHasBalloon(round) {
        if (this.mode === 'libre') return true
        return round >= BALLOON_FROM_ROUND
    }

    _updateHud() {
        if (!this.hud) return
        this.hud.setRound(this.round)
        this.hud.setScore(this.score)
    }

    _onThrowComplete(result) {
        if (!this.active) return

        const gained = (result.points || 0) + (result.balloonPopped ? BALLOON_BONUS : 0)
        this.score += gained

        if (this.hud) {
            // Stamp the just-finished round's pip with its outcome, bump score.
            if (this.mode === 'competitivo') this.hud.setRoundResult(this.round - 1, result)
            this.hud.setScore(this.score)
        }

        // Competitive: stop after the last round → results.
        if (this.mode === 'competitivo' && this.round >= COMPETITIVE_ROUNDS) {
            this.experience.waitMs(900).then(() => {
                if (this.active) this._showResults()
            })
            return
        }

        // Otherwise advance and re-arm the next throw after a short beat.
        this.experience.waitMs(900).then(() => {
            if (!this.active || this.minigame.state !== 'roundEnd') return
            this.round += 1
            if (this.hud) { this.hud.setRound(this.round); this.hud.setScore(this.score) }
            this.minigame.nextThrow(this._roundHasBalloon(this.round))
        })
    }

    // ─── Results ─────────────────────────────────────────────────────────

    _showResults() {
        this.active = false
        window.removeEventListener('keydown', this._onKeyDown, true)
        this.hud?.hide()

        const maxScore = 5 * RING_MAX + 5 * (RING_MAX + BALLOON_BONUS) // 1500
        const qualifies = this.mode === 'competitivo' &&
            this.leaderboard.qualifiesForTop10(this.score)

        this.resultsModal = new Modal({
            variant: 'paper',
            size: 'lg',
            title: t('frisbee.resultsTitle'),
            closable: false,
            openSfx: 'finish'
        })

        const body = document.createElement('div')
        body.className = 'fz-result'
        body.innerHTML = `
            <span class="fz-result-label">${t('frisbee.finalScore')}</span>
            <span class="fz-result-total">${this.score}</span>
            <span class="fz-result-sub">${t('frisbee.ofPossible', { max: maxScore })}</span>
        `
        this.resultsModal.append(body)

        const row = document.createElement('div')
        row.className = 'fz-btn-row'

        if (qualifies) {
            const badge = document.createElement('div')
            badge.className = 'fz-result-badge'
            badge.textContent = t('frisbee.top10Badge')
            this.resultsModal.append(badge)

            row.appendChild(createButton({
                label: t('common.saveRecord'),
                variant: 'primary',
                onClick: () => this._enterName()
            }))
            row.appendChild(createButton({
                label: t('common.exit'),
                variant: 'ghost',
                onClick: () => this._endSession()
            }))
        } else {
            row.appendChild(createButton({
                label: t('common.playAgain'),
                variant: 'primary',
                onClick: () => this._replay()
            }))
            row.appendChild(createButton({
                label: t('common.seeRanking'),
                variant: 'ghost',
                onClick: () => this._showLeaderboard()
            }))
            row.appendChild(createButton({
                label: t('common.exit'),
                variant: 'ghost',
                onClick: () => this._endSession()
            }))
        }
        this.resultsModal.append(row)
        this.resultsModal.open()
    }

    /** Arcade initials → submit → leaderboard. */
    _enterName() {
        this._destroyResults()
        if (!this.nameEntry) this.nameEntry = new NameEntry()
        this.nameEntry.open(async (name) => {
            let res = null
            try { res = await this.leaderboard.submitScore({ name, score: this.score }) }
            catch { /* ephemeral */ }
            // Refresh the in-world scoreboard immediately (it also ticks every 30s).
            this.experience.world?.scoreboardScreen?.render?.()
            this._showLeaderboard(res?.entry || null)
        })
    }

    /** Top 10 list + your position (highlight the just-saved entry if given). */
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
            subtitle: t('frisbee.lbSubtitle'),
            closable: false
        })

        this.lbModal.append(buildLeaderboardList(top10, myBest, highlightEntry))

        const row = document.createElement('div')
        row.className = 'fz-btn-row'
        row.appendChild(createButton({
            label: t('common.playAgain'),
            variant: 'primary',
            onClick: () => { this._destroyLeaderboard(); this._replay() }
        }))
        row.appendChild(createButton({
            label: t('common.exit'),
            variant: 'ghost',
            onClick: () => { this._destroyLeaderboard(); this._endSession() }
        }))
        this.lbModal.append(row)
        this.lbModal.open()
    }

    _destroyLeaderboard() {
        this.lbModal?.destroy()
        this.lbModal = null
    }

    _replay() {
        this._destroyResults()
        // Restart in place — the minigame is still session-armed (roundEnd).
        this.active = true
        this.round = 1
        this.score = 0
        this._announcedRound = 0
        this.hud?.configure(this.mode, COMPETITIVE_ROUNDS, BALLOON_FROM_ROUND)
        this.hud?.show()
        this._updateHud()
        window.addEventListener('keydown', this._onKeyDown, true)
        if (this.minigame.state === 'roundEnd') {
            this.minigame.nextThrow(this._roundHasBalloon(this.round))
        } else if (this.minigame.state === 'idle') {
            this.minigame.onThrowComplete = (r) => this._onThrowComplete(r)
            this.minigame.start(this.mode, this._roundHasBalloon(this.round))
        }
    }

    // ─── Exit ────────────────────────────────────────────────────────────

    _abandon() {
        if (!this.active) return
        this._endSession()
    }

    _endSession() {
        this.active = false
        this._helpShown = false
        // Bring the world soundtrack back as we return to free roam.
        this.experience.audio?.resumeAfterMinigame()
        window.removeEventListener('keydown', this._onKeyDown, true)
        this.minigame.onThrowComplete = null
        this.minigame.roundStartCinematic = false
        this.experience.mobileControls?.setActionIcon?.('interact')
        this.experience.mobileControls?.setSprintVisible?.(true)
        this._setPaused(false)
        this.tutorial?.destroy()
        this.tutorial = null
        this.announce?.hide()
        this.hint?.hide()
        this._continueResolve?.() // unblock a pending "press to continue"
        this.hud?.hide()
        this._destroyResults()
        this._destroyLeaderboard()
        this.nameEntry?.destroy()
        this.nameEntry = null
        if (this.minigame.state !== 'idle' && this.minigame.state !== 'exiting') {
            this.minigame.exitMinigame()
        }
        this._stepOffAnchor()
    }

    /**
     * Get out of the dog's spot on the way out.
     *
     * Entering teleported the player ONTO the anchor — the dog's waiting place
     * — and moved the dog aside for the throw (see _placeAtThrowMark). Leaving
     * sends the dog straight back to that anchor, so a player left standing
     * where they were ends up inside it.
     *
     * The step is BACKWARDS along the entry facing, so they end just behind the
     * dog and still looking at the pitch, which reads as having stepped back
     * after a game. That is also the direction they walked in from, so it is
     * ground already known to be clear — unlike sideways, which on this pitch
     * is the fence.
     */
    _stepOffAnchor() {
        const character = this.experience.world?.character
        const anchor = this.experience.world?.activityPrompt?.anchorPosition
        const bbox = this.experience.world?.getPitchBBox?.()
        if (!character || !anchor || !bbox) return

        const cx = (bbox.min.x + bbox.max.x) / 2
        const cz = (bbox.min.z + bbox.max.z) / 2
        const yaw = Math.atan2(cx - anchor.x, cz - anchor.z)

        // Forward is (sin yaw, cos yaw), so subtracting it walks backwards.
        const back = 2.0
        // Default settle margin this time, unlike the entry: movement is
        // unlocked again, so gravity can drop them onto whatever is actually
        // underfoot rather than being pinned to the pitch plane.
        character.teleportTo(
            anchor.x - Math.sin(yaw) * back,
            (bbox.min.y + bbox.max.y) / 2,
            anchor.z - Math.cos(yaw) * back,
            yaw
        )
    }

    _destroyResults() {
        this.resultsModal?.destroy()
        this.resultsModal = null
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown, true)
        this.modal?.destroy()
        this.tutorial?.destroy()
        this.announce?.destroy()
        this.hint?.destroy()
        this._destroyResults()
        this._destroyLeaderboard()
        this.nameEntry?.destroy()
        this.hud?.destroy()
    }
}
