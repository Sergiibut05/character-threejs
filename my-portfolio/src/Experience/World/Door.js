import * as THREE from 'three'
import Experience from '../Experience.js'
import InteractBadge, { anchorAbove } from './ui/InteractBadge.js'
import { seatOwnsInteract } from './seated.js'

// House nodes that make up the door and should light up together.
const DOOR_NODES = ['door', 'house_door']

/**
 * Door — the `door` + `house_door` nodes from house.glb become interactive:
 * their edges glow WHITE (shared outline pass) when the player is near or
 * hovers them, and pressing the action button (A / Enter / tap / click)
 * teleports into the house interior (World.houseInterior).
 */
export default class Door {
    constructor() {
        this.experience = new Experience()
        this.renderer = this.experience.renderer

        this.position = new THREE.Vector3()
        this.mesh = null        // raycaster target (a group wrapping both nodes)
        this.meshes = []        // outline targets
        this.resolved = false

        this.isHovered = false
        this.isNear = false
        this.isHighlighted = false
        // Measured from the door node's centre; the house collider keeps the
        // character ~1u away from the slab, so the effective window was tiny.
        this.proximityRadius = 2.4

        this._prevMobileB = false
        this._prevPadA = false
        this._onKeyDown = (e) => { if (e.key === 'Enter') this._tryInteract() }
        window.addEventListener('keydown', this._onKeyDown)

        this._resolve()
    }

    _resolve() {
        const root = this.experience.world?.patioScene?.pieces?.house?.root
        if (!root) return false

        const nodes = DOOR_NODES
            .map((name) => root.getObjectByName(name))
            .filter(Boolean)
        if (!nodes.length) return false

        // Wrap both door nodes in one group so a single raycaster target (mouse
        // hover/click) covers them without also catching the rest of the house.
        // `attach` preserves each node's world transform while reparenting.
        const group = new THREE.Group()
        group.name = 'DoorGroup'
        root.add(group)
        for (const node of nodes) {
            group.attach(node)
            node.userData.interactiveObject = this
            node.traverse((c) => {
                if (c.isMesh) { this.meshes.push(c); c.userData.interactiveObject = this }
            })
        }
        group.userData.interactiveObject = this
        this.mesh = group

        // Proximity is measured from the first resolved node (the door slab).
        nodes[0].getWorldPosition(this.position)

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

    // ─── Interaction: step into the house ────────────────────────────────
    _tryInteract() {
        if (!(this.isNear || this.isHovered)) return
        if (document.querySelector('.fz-modal-overlay.is-open')) return // a modal is open
        if (seatOwnsInteract(this.position)) return  // the seat you are at wins the key
        const mg = this.experience.world?.frisbeeMinigame
        if (mg && mg.state !== 'idle') return // mid-minigame
        this.experience.world?.houseInterior?.enter()
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

        // The outline says "this is a thing"; the badge says a key opens it.
        // Anchored to the top of the door meshes rather than to the node's
        // origin, which sits at its base.
        if (!this._badge) {
            this._badge = new InteractBadge()
            this._badgeAnchor = anchorAbove(this.meshes)
        }
        this._badge.update(this._badgeAnchor, this.isHighlighted)

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
        this._badge?.destroy()
        for (const m of this.meshes) this.renderer?.removeOutlinedObject?.(m)
        this.experience.world?.raycaster?.removeInteractiveObject?.(this)
    }
}
