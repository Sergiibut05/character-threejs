import * as THREE from 'three'
import Experience from '../Experience.js'

/**
 * MapBoard — the park sign that shows the world map, and opens it.
 *
 * The GLB (park-info-board-compressed.glb) ships two nodes: `Map`, the flat
 * plane the map picture is printed on, and `ParkInfoBoard`, the frame it is
 * mounted in. PatioScene builds both as one StaticPiece — the picture arrives
 * through its `meshMaps` option — and this class only adds the behaviour.
 *
 * The outline goes on the FRAME, never on the picture. Outlining the plane
 * traces the edge of the image, which reads as a glowing rectangle floating in
 * the park rather than as "this object is interactive". ProjectCarts learned
 * the same thing about its page planes and does the same.
 */
const FRAME_NODE = 'ParkInfoBoard'
const PICTURE_NODE = 'Map'

export default class MapBoard {
    constructor() {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.renderer = this.experience.renderer

        this.ready = false
        this.isNear = false
        this.isHovered = false
        this.isHighlighted = false
        // A sign is read from further away than a cart is rummaged through.
        this.proximityRadius = 2.6
        this.position = new THREE.Vector3()

        this._prevMobileB = false
        this._prevPadA = false
        this._onKeyDown = (e) => { if (e.key === 'Enter') this._tryInteract() }
        window.addEventListener('keydown', this._onKeyDown)

        this._tryBuild()
        if (!this.ready) {
            this._onSourceLoaded = () => this._tryBuild()
            this.resources.on('sourceLoaded', this._onSourceLoaded)
        }
    }

    _tryBuild() {
        if (this.ready) return
        // PatioScene owns the piece — it is decorative scenery that happens to
        // be interactive, not the other way round.
        const root = this.experience.world?.patioScene?.pieces?.infoBoard?.root
        if (!root) return

        this.frame = root.getObjectByName(FRAME_NODE)
        this.picture = root.getObjectByName(PICTURE_NODE)
        if (!this.frame) return

        root.updateMatrixWorld(true)
        this.position.setFromMatrixPosition(this.frame.matrixWorld)

        // Hovering either half should light the sign up — you point at the map,
        // not at its frame — but both route to the same highlight.
        const self = this
        const hover = {
            position: this.position,
            proximityRadius: this.proximityRadius,
            onHover() {
                if (self.isHovered) return
                self.isHovered = true
                self._refreshHighlight()
                document.body.style.cursor = 'pointer'
            },
            onUnhover() {
                if (!self.isHovered) return
                self.isHovered = false
                self._refreshHighlight()
                document.body.style.cursor = ''
            },
            onClick() { self._open(true) }
        }
        this.frame.userData.interactiveObject = hover
        if (this.picture) this.picture.userData.interactiveObject = hover

        this.ready = true
        if (this._onSourceLoaded) {
            this.resources.off('sourceLoaded', this._onSourceLoaded)
            this._onSourceLoaded = null
        }
    }

    _refreshHighlight() {
        const should = this.isNear || this.isHovered
        if (should === this.isHighlighted) return
        this.isHighlighted = should
        if (should) this.renderer.addOutlinedObject(this.frame)
        else this.renderer.removeOutlinedObject(this.frame)
    }

    _tryInteract() {
        if (!this.isNear) return
        this._open(false)
    }

    /** @param {boolean} fromPointer clicked rather than walked up to */
    _open(fromPointer) {
        const map = this.experience.worldMap
        if (!map) return
        const character = this.experience.world?.character
        if (!character) return
        if (!fromPointer && !this.isNear) return
        if (fromPointer && this.position.distanceTo(character.position) > this.proximityRadius * 1.15) return
        // canOpen() already refuses while a minigame, a cutscene or another
        // dialog owns the screen, so there is nothing to re-check here.
        map.open()
    }

    update() {
        if (!this.ready) return
        const character = this.experience.world?.character
        if (!character) return

        const near = this.position.distanceTo(character.position) <= this.proximityRadius
        if (near !== this.isNear) {
            this.isNear = near
            this._refreshHighlight()
        }

        const mb = this.experience.mobileControls?.getActions?.().button2 === true
        if (mb && !this._prevMobileB) this._tryInteract()
        this._prevMobileB = mb

        const pa = this.experience.gamepad?.getActions?.().button2 === true
        if (pa && !this._prevPadA) this._tryInteract()
        this._prevPadA = pa
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown)
        if (this.frame) this.renderer?.removeOutlinedObject?.(this.frame)
        if (this._onSourceLoaded) this.resources.off('sourceLoaded', this._onSourceLoaded)
    }
}
