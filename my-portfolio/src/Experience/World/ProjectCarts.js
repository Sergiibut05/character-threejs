import * as THREE from 'three'
import { texture, uv, vec3, vec4, uniform, mix } from 'three/tsl'
import Experience from '../Experience.js'
import { seatOwnsInteract } from './seated.js'
import { blenderTransformToMatrix } from './scene/SceneUtils.js'
import { createStylizedPropNodeMaterial } from './scene/StylizedPropMaterial.js'
import { dayNightTint } from './DayNight.js'
import ProjectModal from './ui/ProjectModal.js'
import InteractBadge, { anchorAbove } from './ui/InteractBadge.js'

/**
 * How much brighter a cart's picture goes once you are in range of it.
 *
 * A ceiling, not a fixed amount — see headroomLift(). Applied to the day/night
 * tint rather than to the texture, so it grades the picture without ever
 * touching alpha, and so it reads strongest at dusk and at night when that
 * tint is what was dimming the page in the first place.
 */
const LIFT_GAIN = 0.14

/**
 * Never spend more than this share of a picture's REMAINING headroom.
 *
 * The three pages are screenshots of very different websites: page2 averages
 * 231/255 (an almost entirely white page), page1 189, page3 36. A flat +14% is
 * comfortable on the first and the last and blows page2 straight past white —
 * which is exactly what it looked like: one cart flaring while the other two
 * sat right. Capping by headroom leaves the dark pages untouched and only
 * bites on the bright ones, so it self-corrects when a screenshot is
 * re-exported instead of needing a per-cart number kept in sync by hand.
 */
const HEADROOM_SHARE = 0.8

/** Approach speed of that lighting-up, per second. */
const LIFT_LERP = 7

/**
 * The lift `map` can take without clipping, as a 0..LIFT_GAIN amount.
 *
 * Measured from the decoded image itself, once, at 8×8 — 256 pixels is
 * plenty for a mean and costs a single readback on a texture that has just
 * been downloaded anyway. Falls back to the full gain if the image cannot be
 * read back (a tainted canvas, or a compressed format with no decoded pixels),
 * which is the pre-existing behaviour rather than a new failure mode.
 */
function headroomLift(map) {
    const image = map?.image
    if (!image || typeof document === 'undefined') return LIFT_GAIN
    try {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 8
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(image, 0, 0, 8, 8)
        const d = ctx.getImageData(0, 0, 8, 8).data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) {
            sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        }
        const mean = sum / (d.length / 4) / 255
        return Math.min(LIFT_GAIN, HEADROOM_SHARE * (1 - mean))
    } catch {
        return LIFT_GAIN
    }
}

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

        const root = r.cartModel.scene
        root.updateMatrixWorld(true)

        // ── Stands: ONE MESH PER CART, deliberately not an InstancedMesh ──
        // The outline pass takes whole objects, so a single InstancedMesh would
        // light up all three stands at once. Three meshes is three draw calls
        // for three objects — nothing — and it is what lets the nearest cart
        // highlight on its own.
        let standTpl = null
        root.traverse((c) => {
            if (!standTpl && c.isMesh && c.name.toLowerCase().startsWith('cube')) standTpl = c
        })

        this.stands = []
        if (standTpl) {
            // Same material the instancer built, so the stands look untouched.
            const standMat = createStylizedPropNodeMaterial({ map: r.tinyAtlas || null })
            standTpl.material?.dispose?.()

            for (const inst of (r.cartReferences?.instances || [])) {
                const mesh = new THREE.Mesh(standTpl.geometry, standMat)
                // This JSON comes from the newer export script (like trees/rocks):
                // real world rotations → true change-of-basis conversion.
                blenderTransformToMatrix(
                    inst.position, inst.rotation, inst.scale, mesh.matrix, 'conjugate'
                )
                mesh.matrixAutoUpdate = false
                mesh.castShadow = true
                mesh.receiveShadow = true
                mesh.name = `CartStand:${this.stands.length}`
                this.scene.add(mesh)
                this.stands.push(mesh)
            }
            standTpl.parent?.remove(standTpl)
        }

        // ── Page planes: textured screens, one per project ───────────────
        const self = this
        PLANE_NAMES.forEach((name, index) => {
            const node = root.getObjectByName(name)
            if (!node) { console.warn(`ProjectCarts: ${name} not found`); return }
            let plane = node.isMesh ? node : null
            if (!plane) node.traverse((c) => { if (!plane && c.isMesh) plane = c })
            if (!plane) return

            // Unlit screen: the page texture, day/night tinted like the world.
            //
            // `lift` is 0..1 and rides ON the day/night tint, so it never
            // touches alpha — and it stays a uniform, so lighting up costs no
            // shader rebuild and no second material, just one float a frame.
            // How FAR 1 reaches is per-page, measured from the picture.
            const map = r[PAGE_SOURCES[index]]
            const lift = uniform(0)
            const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
            if (map) {
                const litTint = mix(dayNightTint, vec3(1 + headroomLift(map)), lift)
                mat.colorNode = texture(map, uv()).mul(vec4(litTint, 1.0))
            } else mat.colorNode = vec4(0.92, 0.94, 0.95, 1.0)
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
                index, plane, position, lift,
                isNear: false, isHovered: false, isHighlighted: false
            }
            // Mouse hover/click via the shared raycaster.
            plane.userData.interactiveObject = {
                position,
                proximityRadius: self.proximityRadius,
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
            // Pair the plane with the stand it sits in, by proximity — the two
            // come from different sources (baked world transform vs. JSON) so
            // there is no shared index to trust.
            let best = null
            let bestDist = Infinity
            const _sp = new THREE.Vector3()
            for (const stand of this.stands) {
                _sp.setFromMatrixPosition(stand.matrix)
                const d = Math.hypot(_sp.x - position.x, _sp.z - position.z)
                if (d < bestDist) { bestDist = d; best = stand }
            }
            cart.stand = best

            // Both surfaces open the panel; only the stand takes the outline.
            this.experience.world?.raycaster?.addInteractiveObject({ mesh: plane })
            if (best && !best.userData.interactiveObject) {
                best.userData.interactiveObject = plane.userData.interactiveObject
                this.experience.world?.raycaster?.addInteractiveObject({ mesh: best })
            }
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
        // The frame around the artwork, not the artwork itself: outlining the
        // image plane traced the picture instead of the object you walk up to.
        const target = cart.stand || cart.plane
        if (should) this.renderer.addOutlinedObject(target)
        else this.renderer.removeOutlinedObject(target)
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
        if (seatOwnsInteract(this.carts[index]?.position)) return  // the seat you are at wins the key
        const mg = this.experience.world?.frisbeeMinigame
        if (mg && mg.state !== 'idle') return
        if (this.modal?.isOpen()) return
        const cart = this.carts.find((c) => c.index === index)
        const character = this.experience.world?.character
        if (!cart || !character) return
        if (cart.position.distanceTo(character.position) > this.proximityRadius * 1.15) return
        if (!fromPointer && this.nearestIndex !== index) return

        if (!this.modal) this.modal = new ProjectModal()
        this.modal.open(index)
    }

    update() {
        if (!this.ready) return
        const character = this.experience.world?.character
        if (!character) return

        // ONE badge for all three boards, not one each: only ever a single
        // board is highlighted, so a second badge could never be on screen.
        if (!this._badge) this._badge = new InteractBadge()

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

        // Ease the page brightness toward the highlight state. Eased, not
        // switched: the outline can snap because it is a hard edge, but a
        // picture that jumps in brightness reads as a flicker rather than as
        // something waking up.
        const dt = Math.min(0.05, (this.experience.time?.delta || 16) * 0.001)
        const k = Math.min(1, dt * LIFT_LERP)
        for (const cart of this.carts) {
            if (!cart.lift) continue
            const target = cart.isHighlighted ? 1 : 0
            cart.lift.value += (target - cart.lift.value) * k
        }

        // Follow whichever board is lit, and go out with it. The anchor is
        // measured off the sign itself the first time it is needed — the
        // boards never move, so once is enough.
        const lit = this.carts.find((c) => c.isHighlighted)
        if (lit && !lit.badgeAnchor) lit.badgeAnchor = anchorAbove(lit.plane)
        this._badge.update(lit?.badgeAnchor, !!lit)

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
        this._badge?.destroy()
        for (const cart of this.carts) {
            this.renderer?.removeOutlinedObject?.(cart.stand || cart.plane)
        }
        if (this._onSourceLoaded) this.resources.off('sourceLoaded', this._onSourceLoaded)
        this.modal?.destroy?.()
        this.stands?.dispose?.()
    }
}
