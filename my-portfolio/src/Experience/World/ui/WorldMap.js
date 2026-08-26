/**
 * WorldMap — the map, and fast travel to six places on it.
 *
 * The map art is an illustration, not a render of the scene, so the one thing
 * that matters here is the correspondence between it and the world. That lives
 * in MAP_FIT below and every pin is derived from it: a destination is authored
 * as a WORLD coordinate, and where its pin sits on the picture is calculated.
 * Never the other way round — pin positions typed in by eye go stale the first
 * time anything in the scene moves.
 *
 * Travel itself reuses what the world already does for the house doors and the
 * frisbee round start: close the iris, teleport behind it, open. Same wipe, so
 * arriving somewhere from the map feels like the rest of the game.
 */
import './map.css'
import Modal from './Modal.js'

/**
 * World (X, Z) → map image pixels, as a 2D affine transform.
 *
 *     px = ax·X + bx·Z + cx
 *     py = ay·X + by·Z + cy
 *
 * Fitted against three landmarks whose world positions are known exactly: the
 * house, the bridge, and the frisbee activity anchor. It has to be a full
 * affine and not a scale plus offset, because the drawing is stretched ~28%
 * along Z and its axes are ~12° off square — a uniform fit misses by metres at
 * the edges of the map.
 *
 * Checked by fitting on those three and predicting others that were held out:
 * the three project carts land within ~1 world unit with the right spacing
 * between them, and the beach comes out on the sand 42 units further south
 * than anything used in the fit. Good enough that a pin sits on its subject.
 */
const MAP_FIT = {
    ax: 10.537, bx: 2.970, cx: 651.4,
    ay: -0.070, by: 13.156, cy: 338.1
}
const MAP_IMAGE = '/images/map/world-map.webp'
const MAP_PX = 1024

/**
 * Where each pin sends you.
 *
 * `y` is the FLOOR height, which teleportTo offsets the capsule from. The
 * playable ground sits at ~0.20 almost everywhere (measured off the scene
 * GLBs: pitch 0.22, beach 0.19, social area 0.20, park things 0.17), and the
 * default settle margin lets physics drop the last few centimetres — so a
 * slightly generous value is safe and a slightly low one is not.
 *
 * Landing spots are placed just OUTSIDE whatever the pin names, looking at it,
 * rather than on top of it — nobody wants to arrive inside a building.
 */
const DESTINATIONS = [
    {
        id: 'casa',
        label: 'Casa',
        // In the open in front of the house (which occupies Z -8.9..-3.7).
        x: 1.5, y: 0.21, z: -2.0, yaw: Math.PI,
        // The pin marks the house itself, not where you land.
        pin: { x: 1.55, z: -6.31 }
    },
    {
        id: 'frisbee',
        label: 'Frisbee',
        // The activity's own anchor point, straight out of activities-points.glb,
        // so arriving here puts the prompt up immediately.
        x: 6.6989, y: 0.237, z: 5.72696, yaw: Math.PI / 2,
        pin: { x: 6.6989, z: 5.72696 }
    },
    {
        id: 'fuego',
        label: 'La hoguera',
        // Beside the fire, facing it. FIRE_POINT_THREE in World.js.
        x: -12.8, y: 0.21, z: 3.11, yaw: -Math.PI / 2,
        pin: { x: -14.158, z: 3.11 }
    },
    {
        id: 'puente',
        label: 'El puente',
        // East bank, looking across (the bridge spans X -37.5..-33.2).
        x: -32.4, y: 0.21, z: 4.44, yaw: -Math.PI / 2,
        pin: { x: -35.36, z: 4.44 }
    },
    {
        id: 'social',
        label: 'Zona social',
        x: -7.5, y: 0.21, z: 21.0, yaw: 2.66,
        pin: { x: -5.45, z: 17.1 }
    },
    {
        id: 'playa',
        label: 'La playa',
        // On the sand, facing the sea (+Z).
        x: 1.65, y: 0.21, z: 40.0, yaw: 0,
        pin: { x: 1.65, z: 42.44 }
    }
]

/** World XZ → a fraction of the map image, 0..1 on each axis. */
function worldToMap(x, z) {
    return {
        u: (MAP_FIT.ax * x + MAP_FIT.bx * z + MAP_FIT.cx) / MAP_PX,
        v: (MAP_FIT.ay * x + MAP_FIT.by * z + MAP_FIT.cy) / MAP_PX
    }
}

export default class WorldMap {
    /** @param {import('../../Experience.js').default} experience */
    constructor(experience) {
        this.experience = experience
        this.modal = null
        this._travelling = false

        this._onKeyDown = (e) => {
            if (e.key !== 'm' && e.key !== 'M') return
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
            const t = e.target
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
            e.preventDefault()
            this.toggle()
        }
        window.addEventListener('keydown', this._onKeyDown)

        // The on-screen button: the key is for people who know it is there,
        // this is for everyone else — and it is the only way in on touch.
        this.fab = document.getElementById('map-fab-btn')
        this._onFabClick = () => this.toggle()
        this.fab?.addEventListener('click', this._onFabClick)
    }

    /**
     * The map is for roaming. Anything that has taken over the character — a
     * minigame, a cutscene, sitting on a bench, another dialog — owns the
     * screen until it gives it back.
     */
    canOpen() {
        const world = this.experience.world
        const character = world?.character
        if (!this.experience.ready || !character) return false
        if (character.movementLocked) return false
        if (world.frisbeeSession?.active || world.beachSession?.active) return false
        if (world.frisbeeSession?.isModalOpen?.()) return false
        if (document.querySelector('.fz-modal-overlay.is-open')) return false
        return true
    }

    toggle() {
        if (this.modal?.isOpen()) this.modal.close()
        else this.open()
    }

    open() {
        if (this._travelling || !this.canOpen()) return
        this._build()
        this.modal.open()
    }

    close() { this.modal?.close() }

    // ─── Build ──────────────────────────────────────────────────────────

    _build() {
        if (this.modal) return

        this.modal = new Modal({
            variant: 'paper',
            size: 'lg',
            align: 'center',
            title: 'Mapa',
            subtitle: 'Elige a dónde ir'
        })

        const stage = document.createElement('div')
        stage.className = 'fz-map'

        const img = document.createElement('img')
        img.className = 'fz-map-img'
        img.src = MAP_IMAGE
        img.alt = ''
        img.draggable = false
        stage.appendChild(img)

        for (const dest of DESTINATIONS) {
            const { u, v } = worldToMap(dest.pin.x, dest.pin.z)
            const pin = document.createElement('button')
            pin.type = 'button'
            pin.className = 'fz-map-pin'
            pin.style.left = `${(u * 100).toFixed(2)}%`
            pin.style.top = `${(v * 100).toFixed(2)}%`
            pin.setAttribute('aria-label', `Ir a ${dest.label}`)
            pin.innerHTML = `<span class="fz-map-dot"></span><span class="fz-map-label">${dest.label}</span>`
            pin.addEventListener('click', () => this._travelTo(dest))
            stage.appendChild(pin)
        }

        this.modal.append(stage)
    }

    // ─── Travel ─────────────────────────────────────────────────────────

    async _travelTo(dest) {
        if (this._travelling) return
        const character = this.experience.world?.character
        if (!character) return

        this._travelling = true
        this.modal.close()
        character.movementLocked = true

        const renderer = this.experience.renderer
        try {
            renderer.setIrisTransitionEnabled(true)
            await this.experience.animateValue(1.35, 0.0, 600,
                (value) => renderer.setIrisTransitionSize(value))

            character.teleportTo(dest.x, dest.y, dest.z, dest.yaw)
            // Snap rather than let the follow camera lerp: without this it
            // sails across the whole world to catch up once the iris opens.
            this.experience.camera.setMode('follow')

            await this.experience.waitMs(200)
            await this.experience.animateValue(0.0, 1.35, 800,
                (value) => renderer.setIrisTransitionSize(value))
        } finally {
            renderer.setIrisTransitionEnabled(false)
            character.movementLocked = false
            this._travelling = false
        }
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown)
        this.fab?.removeEventListener('click', this._onFabClick)
        this.modal?.destroy?.()
        this.modal = null
    }
}
