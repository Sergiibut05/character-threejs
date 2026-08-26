import * as THREE from 'three'
import Experience from '../Experience.js'
import StartEmblem from './ui/StartEmblem.js'

/**
 * BeachPrompt — the floating activity mark over the beach court, mirroring
 * ActivityPrompt (frisbee) so both activities are discovered the same way:
 * the mark floats above the spot, and OPENS to reveal the name + the button to
 * press once you are close enough.
 *
 * It carries a beach ball instead of the portfolio leaf, so at a glance you can
 * tell the two activities apart from across the map.
 */
const BALL_SVG = `
<svg class="fz-emblem-svg fz-emblem-ball" viewBox="0 0 48 48" aria-hidden="true">
  <circle cx="24" cy="24" r="19" fill="#fdfdfb"/>
  <path d="M24 5a19 19 0 0 1 0 38Z" fill="#ff8a6b"/>
  <path d="M24 5a19 19 0 0 0-16.2 9.1c6 2.4 11.4 3.6 16.2 3.6s10.2-1.2 16.2-3.6A19 19 0 0 0 24 5Z" fill="#5ec7f0"/>
  <path d="M24 43a19 19 0 0 0 16.2-9.1c-6-2.4-11.4-3.6-16.2-3.6s-10.2 1.2-16.2 3.6A19 19 0 0 0 24 43Z" fill="#ffd84d"/>
  <path d="M24 5c-5.5 5.7-8.3 12-8.3 19S18.5 37.3 24 43M24 5c5.5 5.7 8.3 12 8.3 19S29.5 37.3 24 43" stroke="#3f7f66" stroke-width="2.2" fill="none"/>
  <circle cx="24" cy="24" r="19" stroke="#3f7f66" stroke-width="2.6" fill="none"/>
</svg>`

export default class BeachPrompt {
    constructor(minigame) {
        this.experience = new Experience()
        this.camera = this.experience.camera
        this.sizes = this.experience.sizes
        this.minigame = minigame

        this.radius = 3.2          // must match BeachSession's activation range
        this.fadeDistance = 16
        this.heightAbove = 1.5     // metres above the sand

        this.anchor = new THREE.Vector3()
        this.screen = new THREE.Vector3()
        this.isOpen = false

        this.emblem = new StartEmblem({ svg: BALL_SVG })
        this.emblem.setLabel('Voleibol de playa')
        this.emblem.setVisible(false)
    }

    press() { this.emblem.press() }

    hide() {
        this.emblem.setVisible(false)
        if (this.isOpen) { this.isOpen = false; this.emblem.setActive(false) }
    }

    update(enabled = true) {
        if (!enabled || !this.minigame?._ready) { this.hide(); return }

        const character = this.experience.world?.character
        if (!character) { this.hide(); return }

        this.anchor.copy(this.minigame.courtCenter)
        this.anchor.y += this.heightAbove

        const dx = character.position.x - this.minigame.courtCenter.x
        const dz = character.position.z - this.minigame.courtCenter.z
        const distance = Math.hypot(dx, dz)

        const shouldOpen = distance <= this.radius
        this.emblem.el.classList.toggle('is-out-of-range', !shouldOpen)
        if (shouldOpen !== this.isOpen) {
            this.isOpen = shouldOpen
            this.emblem.setActive(shouldOpen)
        }

        this.screen.copy(this.anchor).project(this.camera.instance)
        // Hide when behind the camera OR projected outside the viewport — a
        // side-exit would otherwise leave it pinned to the screen edge.
        const onScreen = this.screen.z <= 1 &&
            Math.abs(this.screen.x) <= 1.05 && Math.abs(this.screen.y) <= 1.05
        if (!onScreen || distance > this.fadeDistance) { this.hide(); return }

        this.emblem.setVisible(true)
        this.emblem.setPosition(
            (this.screen.x * 0.5 + 0.5) * this.sizes.width,
            (-this.screen.y * 0.5 + 0.5) * this.sizes.height
        )
        this.emblem.setOpacity(THREE.MathUtils.clamp(1 - distance / this.fadeDistance, 0.35, 1))
        this.emblem.setProximity(THREE.MathUtils.clamp((this.radius + 4 - distance) / 4, 0, 1))
    }

    destroy() { this.emblem?.destroy() }
}
