import * as THREE from 'three'
import Experience from '../Experience.js'
import Modal from './ui/Modal.js'
import Leaderboard from '../Utils/Leaderboard.js'
import { buildLeaderboardList } from './ui/leaderboardView.js'

/**
 * ScoreboardInteractive — the physical leaderboard by the pitch becomes an
 * interactive (same pattern as Mailbox): its edges glow white when the player
 * is near or hovers it, and interacting opens a modal with the full top 10
 * plus your own best score (reuses the session's leaderboard list view).
 */
export default class ScoreboardInteractive {
    constructor() {
        this.experience = new Experience()
        this.renderer = this.experience.renderer
        this.leaderboard = new Leaderboard()

        this.position = new THREE.Vector3()
        this.mesh = null
        this.meshes = []
        this.resolved = false

        this.isHovered = false
        this.isNear = false
        this.isHighlighted = false
        this.proximityRadius = 2.0

        this.modal = null
        this._prevMobileB = false
        this._prevPadA = false

        this._onKeyDown = (e) => { if (e.key === 'Enter') this._tryInteract() }
        window.addEventListener('keydown', this._onKeyDown)

        this._resolve()
    }

    _resolve() {
        const root = this.experience.world?.patioScene?.pieces?.scoreboard?.root
        if (!root) return false

        root.updateWorldMatrix(true, false)
        const box = new THREE.Box3().setFromObject(root)
        box.getCenter(this.position)

        this.mesh = root
        root.userData.interactiveObject = this
        root.traverse((c) => {
            if (c.isMesh) { this.meshes.push(c); c.userData.interactiveObject = this }
        })
        this.experience.world?.raycaster?.addInteractiveObject(this)
        this.resolved = true
        return true
    }

    // ─── Raycaster callbacks (mouse) ─────────────────────────────────────
    onHover() {
        if (this.isHovered) return
        this.isHovered = true
        this._updateHighlight()
        document.body.style.cursor = 'pointer'
    }

    onUnhover() {
        if (!this.isHovered) return
        this.isHovered = false
        this._updateHighlight()
        document.body.style.cursor = ''
    }

    onClick() { this._tryInteract() }

    // ─── Interaction: full top-10 modal ──────────────────────────────────
    async _tryInteract() {
        // Re-entrancy guard: this handler is ASYNC (fetches the ranking before
        // opening). A duplicated trigger during that gap re-captured
        // `_prevLocked` AFTER the first call had already locked movement →
        // closing "restored" locked=true and froze the character.
        if (this._busy) return
        if (!(this.isNear || this.isHovered)) return
        if (document.querySelector('.fz-modal-overlay.is-open')) return
        const mg = this.experience.world?.frisbeeMinigame
        if (mg && mg.state !== 'idle') return

        this._busy = true

        // Freeze the character while reading (restored on close).
        const character = this.experience.world?.character
        if (character) {
            this._prevLocked = character.movementLocked
            character.movementLocked = true
        }

        try {
            if (!this.modal) {
                this.modal = new Modal({
                    variant: 'paper',
                    size: 'lg',
                    title: 'Ranking',
                    subtitle: 'Top 10 · Frisbee con el perro'
                })
                this.modal.onClose(() => this._onModalClosed())
            }

            // Fresh data every open.
            const [top10, myBest] = await Promise.all([
                this.leaderboard.getTop10(),
                this.leaderboard.getMyBest()
            ])
            this.modal.body.innerHTML = ''
            this.modal.append(buildLeaderboardList(top10, myBest))
            this.modal.open()
        } catch (e) {
            // Fetch failed — never leave the character frozen.
            this._onModalClosed()
        }
    }

    _onModalClosed() {
        const character = this.experience.world?.character
        if (character && this._prevLocked !== undefined) {
            character.movementLocked = this._prevLocked
            this._prevLocked = undefined
        }
        this._busy = false
    }

    _updateHighlight() {
        const should = this.isHovered || this.isNear
        if (should === this.isHighlighted) return
        this.isHighlighted = should
        for (const m of this.meshes) {
            if (should) this.renderer.addOutlinedObject(m)
            else this.renderer.removeOutlinedObject(m)
        }
    }

    update() {
        if (!this.resolved) { if (!this._resolve()) return }

        const character = this.experience.world?.character
        if (character) {
            const near = this.position.distanceTo(character.position) < this.proximityRadius
            if (near !== this.isNear) { this.isNear = near; this._updateHighlight() }
        }

        // Mobile action button + gamepad A (rising edge) when near/hovered.
        const mb = this.experience.mobileControls?.getActions?.().button2 === true
        if (mb && !this._prevMobileB) this._tryInteract()
        this._prevMobileB = mb

        const pa = this.experience.gamepad?.getActions?.().button2 === true
        if (pa && !this._prevPadA) this._tryInteract()
        this._prevPadA = pa
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown)
        for (const m of this.meshes) this.renderer?.removeOutlinedObject?.(m)
        this.experience.world?.raycaster?.removeInteractiveObject?.(this)
        this.modal?.destroy?.()
    }
}
