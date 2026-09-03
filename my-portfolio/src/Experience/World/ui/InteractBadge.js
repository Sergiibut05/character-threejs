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

export default class InteractBadge {
    /**
     * @param {object} [o]
     * @param {string} [o.action]  input action to draw (default 'interact')
     * @param {number} [o.lift]    metres above the anchor to float
     */
    constructor(o = {}) {
        this.action = o.action || 'interact'
        this.lift = o.lift ?? 0.55

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
     * @param {THREE.Vector3} worldPos  the thing being pointed at
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

        _v.copy(worldPos)
        _v.y += this.lift
        _v.project(camera)

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
