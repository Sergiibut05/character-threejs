import * as THREE from 'three'
import Experience from '../Experience.js'

// House nodes that make up the door and should light up together.
const DOOR_NODES = ['door', 'house_door']

/**
 * Door — the `door` + `house_door` nodes from house.glb become a highlight-only
 * interactive: their edges glow WHITE (shared outline pass) when the player is
 * near or hovers them with the mouse. No action yet — added later.
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
        this.proximityRadius = 1.8

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

    onClick() { /* no action yet */ }

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
    }

    destroy() {
        for (const m of this.meshes) this.renderer?.removeOutlinedObject?.(m)
        this.experience.world?.raycaster?.removeInteractiveObject?.(this)
    }
}
