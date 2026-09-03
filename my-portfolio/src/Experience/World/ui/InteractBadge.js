import './ui.css'
import { inputGlyph } from './InputGlyph.js'
import * as THREE from 'three'

/**
 * InteractBadge — the smallest possible "you can press this here".
 *
 * The two activities already announce themselves with StartEmblem: a leaf, a
 * title and a glyph, which is right for something you commit to. Everything
 * else you can interact with — the project boards, the front door — only had
 * the white outline, which says "this is a thing" without ever saying that a
 * key does anything to it.
 *
 * So: the glyph on its own, floating just above the object, and nothing else.
 * No label, no logo, no panel. It is the one piece of StartEmblem that carries
 * the actual information, at the size of a keycap.
 *
 * It follows the active input device for free, because inputGlyph already does:
 * Enter on a keyboard, Ⓐ on a pad, a tap icon on touch.
 *
 * The caller owns the world anchor and the on/off; this only draws and places.
 */

const _v = new THREE.Vector3()
const _box = new THREE.Box3()

/**
 * The point just above the TOP of some meshes, in world space.
 *
 * Anchoring to an object's origin does not work here: where Blender left that
 * origin is different for every model — a board plane's sits at its centre,
 * about a metre and a half up, so a badge lifted from it floated well over the
 * top of the sign. Measuring the object means "just above it" means the same
 * thing for a board, a door and anything added later.
 *
 * Static props, so callers should compute this ONCE and keep it.
 *
 * @param {THREE.Object3D|THREE.Object3D[]} target
 * @param {number} [gap]  metres of air between the object and the badge
 * @param {THREE.Vector3} [out]  reuse this instead of allocating — for the
 *   one anchor that has to be recomputed every frame (the ball rolls)
 */
export function anchorAbove(target, gap = 0.22, out) {
    const list = Array.isArray(target) ? target : [target]
    _box.makeEmpty()
    for (const o of list) {
        if (!o) continue
        o.updateWorldMatrix(true, false)
        _box.expandByObject(o)
    }
    const c = out || new THREE.Vector3()
    if (_box.isEmpty()) return c.set(0, 0, 0)
    _box.getCenter(c)
    c.y = _box.max.y + gap
    return c
}

export default class InteractBadge {
    /**
     * @param {object} [o]
     * @param {string} [o.action]  input action to draw (default 'interact')
     */
    constructor(o = {}) {
        this.action = o.action || 'interact'

        this.el = document.createElement('div')
        this.el.className = 'fz-ibadge'
        this.el.setAttribute('aria-hidden', 'true')   // decorative; the world is the UI
        document.body.appendChild(this.el)

        this._device = null
        this._shown = false
        this._render()

        // Live swap if the player picks up a pad mid-session.
        this._unsub = window.experience?.input?.onChange?.(() => this._render()) || null
    }

    _render() {
        const device = window.experience?.input?.device || 'keyboard'
        if (device === this._device) return
        this._device = device
        this.el.replaceChildren(inputGlyph(this.action, device))
    }

    /**
     * Place it over a world point and show or hide it.
     *
     * Called every frame by the owner, so it early-outs hard: while hidden it
     * does no projection at all, which is most frames for most badges.
     *
     * @param {THREE.Vector3} worldPos  where to draw it — usually from
     *   anchorAbove(), which already includes the gap
     * @param {boolean} on              whether it should be showing
     */
    update(worldPos, on) {
        if (!on) {
            if (this._shown) { this._shown = false; this.el.classList.remove('is-on') }
            return
        }

        const experience = window.experience
        const camera = experience?.camera?.instance
        const sizes = experience?.sizes
        if (!camera || !sizes) return

        if (!worldPos) return
        _v.copy(worldPos).project(camera)

        // Behind the camera or off the edges: no badge. Without the z test a
        // point behind you projects to a mirrored position in front of you.
        if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) {
            if (this._shown) { this._shown = false; this.el.classList.remove('is-on') }
            return
        }

        const x = (_v.x * 0.5 + 0.5) * sizes.width
        const y = (-_v.y * 0.5 + 0.5) * sizes.height
        this.el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`

        this._render()
        if (!this._shown) { this._shown = true; this.el.classList.add('is-on') }
    }

    destroy() {
        this._unsub?.()
        this.el?.remove()
    }
}
