import * as THREE from 'three'
import Experience from '../Experience.js'
import ContactModal from './ui/ContactModal.js'

/**
 * Mailbox — the `mailbox` node from outside-house-things becomes interactive:
 * its edges glow WHITE (via the renderer's outline pass) when the player is near
 * or hovers it with the mouse, and pressing the action button (A / Enter / tap /
 * mobile button / click) opens the contact modal.
 */
export default class Mailbox {
    constructor() {
        this.experience = new Experience()
        this.renderer = this.experience.renderer

        this.position = new THREE.Vector3()
        this.node = null      // raycaster target (recursive)
        this.mesh = null
        this.meshes = []      // outline targets
        this.resolved = false

        this.isHovered = false
        this.isNear = false
        this.isHighlighted = false
        this.proximityRadius = 1.8

        this.contact = null
        this._prevMobileB = false
        this._prevPadA = false

        this._onKeyDown = (e) => { if (e.key === 'Enter') this._tryInteract() }
        window.addEventListener('keydown', this._onKeyDown)

        this._resolve()
    }

    _resolve() {
        const root = this.experience.world?.patioScene?.pieces?.outsideHouseThings?.root
        const node = root?.getObjectByName('mailbox')
        if (!node) return false

        this.node = node
        this.mesh = node
        node.updateWorldMatrix(true, false)
        node.getWorldPosition(this.position)
        node.traverse((c) => {
            if (c.isMesh) { this.meshes.push(c); c.userData.interactiveObject = this }
        })
        node.userData.interactiveObject = this
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

    // ─── Interaction ─────────────────────────────────────────────────────
    _tryInteract() {
        if (!(this.isNear || this.isHovered)) return
        if (document.querySelector('.fz-modal-overlay.is-open')) return // a modal is open
        const mg = this.experience.world?.frisbeeMinigame
        if (mg && mg.state !== 'idle') return // mid-minigame
        if (!this.contact) this.contact = new ContactModal()
        this.contact.open()
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
        this.contact?.destroy?.()
    }
}
