import * as THREE from 'three'
import Experience from '../Experience.js'
import InteractBadge, { anchorAbove } from './ui/InteractBadge.js'
import { seatOwnsInteract } from './seated.js'
import { createStylizedPropNodeMaterial } from './scene/StylizedPropMaterial.js'

/**
 * ControllerProp — an oversized gamepad lying by the house that tells you how
 * to play, in the language of whatever you are holding.
 *
 * Same shape as every other interactive here (Mailbox, Door): white outline
 * when you are near or hovering, the action glyph floating above it, and one
 * press to open. What it opens is THE settings panel, on its controls tab --
 * the same one the gear opens, not a second panel repeating it. That panel
 * already asks InputGlyph for the device in your hands, so walking up to this
 * with a pad connected shows A and X rather than a keyboard.
 *
 * The model carries its own placement from Blender (position, rotation and a
 * 7.8x scale), so nothing here decides where it goes: whoever moves it in the
 * source file moves it in the world, and this file does not have to be edited
 * to follow. That also means the glTF node is used as-is rather than having
 * its transform flattened, which is the one thing that would break that.
 *
 * It ships with no material at all -- one mesh, no textures -- so it is given
 * the same stylised prop material the trunks and props use, and lands in the
 * same lighting as everything around it instead of as a grey blob.
 */
export default class ControllerProp {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.renderer = this.experience.renderer
        this.resources = this.experience.resources

        this.position = new THREE.Vector3()
        this.node = null
        // Raycaster.addInteractiveObject DROPS anything without a `mesh`,
        // silently, so this is not decoration -- without it the mouse would
        // never have reached this prop and nothing would have said so.
        this.mesh = null
        this.meshes = []
        this.resolved = false

        this.isHovered = false
        this.isNear = false
        this.isHighlighted = false
        // Generous: the prop is over a metre wide, so a radius measured from
        // its centre has to clear its own body before it reaches the player.
        this.proximityRadius = 2.0

        this._badge = null
        this._prevMobileB = false
        this._prevPadA = false

        this._onKeyDown = (e) => {
            if (e.key === 'Enter' || e.key.toLowerCase() === 'e') this._tryInteract()
        }
        window.addEventListener('keydown', this._onKeyDown)

        this._resolve()
    }

    /** Lazy, like the other props: the model may not have landed yet. */
    _resolve() {
        const gltf = this.resources?.items?.controllerModel
        const source = gltf?.scene
        if (!source) return false

        // Cloned, not moved: Resources hands out the one parsed glTF and
        // reparenting it would empty the cache for anyone else who asks.
        this.node = source.clone(true)
        this.node.name = 'ControllerProp'

        // Textured off the Tiny atlas, like the rest of the small props.
        // It used to be a flat slate colour because the GLB ships with no
        // material -- but shipping without one is not the same as not having
        // one, and the UVs are authored against this atlas.
        const material = createStylizedPropNodeMaterial({
            map: this.resources?.items?.tinyAtlas || null,
            color: 0xffffff
        })
        this.node.traverse((child) => {
            if (!child.isMesh) return
            child.material = material
            child.castShadow = true
            child.receiveShadow = true
            child.userData.interactiveObject = this
            this.meshes.push(child)
        })
        if (!this.meshes.length) return false

        this.node.userData.interactiveObject = this
        this.mesh = this.node
        this.scene.add(this.node)
        this.node.updateWorldMatrix(true, true)

        // The CENTRE of the thing, not its pivot. The glTF origin sits off to
        // one side of a prop this wide, and proximity measured from a corner
        // lights it up from one direction and not the other.
        const box = new THREE.Box3().setFromObject(this.node)
        box.getCenter(this.position)

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
        if (document.querySelector('.fz-modal-overlay.is-open, .fz-proj.is-open')) return
        if (seatOwnsInteract(this.position)) return  // the seat you are at wins the key
        const frisbee = this.experience.world?.frisbeeMinigame
        if (frisbee && frisbee.state !== 'idle') return
        if (this.experience.world?.beachSession?.active) return

        // THE settings panel, opened on its controls tab -- not a second
        // modal that says the same thing. A duplicate would have to be kept in
        // step with the real one every time the controls change, and would
        // give two different-looking answers to the same question.
        this.experience.settingsUi?.open('controls')
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

        if (!this._badge) {
            this._badge = new InteractBadge()
            this._badgeAnchor = anchorAbove(this.meshes, 0.18)
        }
        this._badge.update(this._badgeAnchor, this.isHighlighted)

        // Mobile action button + gamepad A, on the rising edge.
        const mobile = this.experience.mobileControls?.getActions?.().button2 === true
        if (mobile && !this._prevMobileB) this._tryInteract()
        this._prevMobileB = mobile

        const pad = this.experience.gamepad?.getActions?.().button2 === true
        if (pad && !this._prevPadA) this._tryInteract()
        this._prevPadA = pad
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown)
        this._badge?.destroy()
        for (const m of this.meshes) this.renderer?.removeOutlinedObject?.(m)
        this.experience.world?.raycaster?.removeInteractiveObject?.(this)
        if (this.node) {
            this.scene.remove(this.node)
            this.node.traverse((c) => { if (c.isMesh) c.geometry?.dispose?.() })
        }
    }
}
