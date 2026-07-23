import * as THREE from 'three'
import { texture, uv, vec4 } from 'three/tsl'
import Experience from '../Experience.js'
import InstancedFromJSON from './scene/InstancedFromJSON.js'
import { dayNightTint } from './DayNight.js'
import ProjectModal from './ui/ProjectModal.js'

/**
 * ProjectCarts — the three project stands in the west play area.
 *
 * Assets: cart.glb ships the three page PLANES (cart1/cart2/cart3, already
 * world-positioned) plus one stand mesh that cart-references.json instances
 * at the three spots (Tiny atlas, same pipeline as fence/posts).
 *
 * Interaction: when the player approaches, only the NEAREST cart's page plane
 * gets the white outline; interacting opens the project panel (right drawer on
 * desktop / draggable bottom sheet on touch). Mouse hover works per-plane too.
 */
const PLANE_NAMES = ['cart1', 'cart2', 'cart3']
const PAGE_SOURCES = ['cartPage1', 'cartPage2', 'cartPage3']

export default class ProjectCarts {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.renderer = this.experience.renderer

        this.ready = false
        this.carts = []               // { index, plane, position, isNear, isHovered, isHighlighted }
        this.nearestIndex = -1
        this.proximityRadius = 1.9
        this.modal = null

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
        const r = this.resources.items
        if (!r.cartModel || !r.cartReferences || !r.tinyAtlas) return

        // ── Stands: instanced from the JSON (Tiny atlas) ─────────────────
        this.stands = new InstancedFromJSON('Carts', r.cartModel, r.cartReferences, {
            singleMesh: true,
            meshFilter: (m) => m.name.toLowerCase().startsWith('cube'),
            map: r.tinyAtlas,
            // This JSON comes from the newer export script (like trees/rocks):
            // real world rotations → true change-of-basis conversion.
            rotationMode: 'conjugate'
        })

        // ── Page planes: textured screens, one per project ───────────────
        const root = r.cartModel.scene
        root.updateMatrixWorld(true)
        const self = this
        PLANE_NAMES.forEach((name, index) => {
            const node = root.getObjectByName(name)
            if (!node) { console.warn(`ProjectCarts: ${name} not found`); return }
            let plane = node.isMesh ? node : null
            if (!plane) node.traverse((c) => { if (!plane && c.isMesh) plane = c })
            if (!plane) return

            // Unlit screen: the page texture, day/night tinted like the world.
            const map = r[PAGE_SOURCES[index]]
            const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
            if (map) mat.colorNode = texture(map, uv()).mul(vec4(dayNightTint, 1.0))
            else mat.colorNode = vec4(0.92, 0.94, 0.95, 1.0)
            plane.material?.dispose?.()
            plane.material = mat
            plane.castShadow = false
            plane.receiveShadow = false

            // World transform is baked in the GLB — detach and add directly.
            const worldMatrix = plane.matrixWorld.clone()
            plane.parent?.remove(plane)
            plane.matrixAutoUpdate = false
            plane.matrix.copy(worldMatrix)
            this.scene.add(plane)

            const position = new THREE.Vector3().setFromMatrixPosition(worldMatrix)
            const cart = {
                index, plane, position,
                isNear: false, isHovered: false, isHighlighted: false
            }
            // Mouse hover/click via the shared raycaster.
            plane.userData.interactiveObject = {
                onHover() {
                    if (cart.isHovered) return
                    cart.isHovered = true
                    self._refreshHighlight(cart)
                    document.body.style.cursor = 'pointer'
                },
                onUnhover() {
                    if (!cart.isHovered) return
                    cart.isHovered = false
                    self._refreshHighlight(cart)
                    document.body.style.cursor = ''
                },
                onClick() { self._open(cart.index, true) }
            }
            this.experience.world?.raycaster?.addInteractiveObject({ mesh: plane })
            this.carts.push(cart)
        })

        if (this.carts.length) {
            this.ready = true
            if (this._onSourceLoaded) {
                this.resources.off('sourceLoaded', this._onSourceLoaded)
                this._onSourceLoaded = null
            }
        }
    }

    _refreshHighlight(cart) {
        const should = cart.isHovered || cart.isNear
        if (should === cart.isHighlighted) return
        cart.isHighlighted = should
        if (should) this.renderer.addOutlinedObject(cart.plane)
        else this.renderer.removeOutlinedObject(cart.plane)
    }

    _tryInteract() {
        if (this.nearestIndex === -1) return
        // The ball rolls through this area — kicking has priority over opening
        // a project panel when both are in range on the same press.
        if (this.experience.world?.ball?.isNear) return
        this._open(this.nearestIndex, false)
    }

    _open(index, fromPointer) {
        if (document.querySelector('.fz-modal-overlay.is-open')) return
        const mg = this.experience.world?.frisbeeMinigame
        if (mg && mg.state !== 'idle') return
        if (this.modal?.isOpen()) return
        // Pointer clicks work from anywhere; key/pad interactions need proximity.
        if (!fromPointer && this.nearestIndex !== index) return

        if (!this.modal) this.modal = new ProjectModal()
        this.modal.open(index)
    }

    update() {
        if (!this.ready) return
        const character = this.experience.world?.character
        if (!character) return

        // Nearest cart within radius — ONLY that one highlights by proximity.
        let best = -1
        let bestD = this.proximityRadius
        for (const cart of this.carts) {
            const d = cart.position.distanceTo(character.position)
            if (d < bestD) { bestD = d; best = cart.index }
        }
        this.nearestIndex = best
        for (const cart of this.carts) {
            const near = cart.index === best
            if (near !== cart.isNear) { cart.isNear = near; this._refreshHighlight(cart) }
        }

        // Mobile action button + gamepad A (rising edge).
        const mb = this.experience.mobileControls?.getActions?.().button2 === true
        if (mb && !this._prevMobileB) this._tryInteract()
        this._prevMobileB = mb

        const pa = this.experience.gamepad?.getActions?.().button2 === true
        if (pa && !this._prevPadA) this._tryInteract()
        this._prevPadA = pa
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown)
        for (const cart of this.carts) this.renderer?.removeOutlinedObject?.(cart.plane)
        if (this._onSourceLoaded) this.resources.off('sourceLoaded', this._onSourceLoaded)
        this.modal?.destroy?.()
        this.stands?.dispose?.()
    }
}
