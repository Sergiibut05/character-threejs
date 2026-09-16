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
import { t } from '../../Utils/gameText.js'

/**
 * World (X, Z) → map image pixels, as a 2D affine transform.
 *
 *     px = ax·X + bx·Z + cx
 *     py = ay·X + by·Z + cy
 *
 * Fitted against three landmarks whose world positions are known exactly: the
 * house, the bridge, and the frisbee activity anchor. It is a full affine and
 * not a scale plus offset because the drawing is stretched ~28% along Z.
 *
 * ── bx used to be 2.970, and it was wrong ─────────────────────────────────
 *
 * Nothing showed it while only pins used this transform: a pin is drawn from
 * the same numbers it was authored with, so it lands on its subject whatever
 * the transform does in between. Putting the player on the map is what broke
 * the symmetry -- that reads a live position the fit never saw -- and the
 * southern half of the island came out pushed to the right.
 *
 * bx is how far a step south moves you across the picture, and at 2.970 it
 * moved things +1.2% of the map width per 4 units of Z. Walked out to the
 * beach at Z=40 that is +11.6%, which is most of a beach.
 *
 * Two things say it was an artefact rather than the drawing:
 *
 *   - For a rotation plus scale the two cross terms mirror each other, and
 *     ay is -0.070, thirty times smaller. A picture cannot be rotated on one
 *     axis and not the other.
 *   - All three landmarks it was fitted from sit between Z = -6.3 and Z = 5.7.
 *     Estimating a slope in Z from a 12-unit spread, then applying it out to
 *     Z = 42, is extrapolating 3.5x past the evidence.
 *
 * It is now zero, with ax and cx refitted on the four landmarks the artwork
 * corroborates. Confirmed against reports of where the player marker actually
 * appeared: the campfire and the bridge were right before and move by 0.3%
 * and 0.1% now, the social corner was "a bit right" and comes back 6.1%, and
 * the beach was "way right" and comes back 11.6%. The house and the frisbee
 * pin shift by ~2% and ~1.6%, which is the price of the correction.
 *
 * ── and by was 4% too big, for exactly the same reason ───────────────────
 *
 * With the sideways drift gone, the beach still sat low. Same diagnosis, same
 * cause: by is the scale along Z, fitted from landmarks spanning 12 units of
 * it, and a 4% error there is invisible at Z=5 and half a beach at Z=40.
 *
 * Solved rather than fitted -- there was one hard reference, the marked-up
 * screenshot -- by asking what by puts the beach landing spot on the mark,
 * then refitting cy on the same four landmarks. They move 0.4% at worst.
 *
 * Both pins that are authored to LOOK right rather than to BE right (beach,
 * social) were re-derived afterwards; see their entries. Everything else is
 * authored at its subject's true position and just follows the maths.
 */
const MAP_FIT = {
    ax: 10.2585, bx: 0,      cx: 653.70,
    ay: -0.070,  by: 12.6088, cy: 339.01
}
const MAP_IMAGE = '/images/map/world-map.webp'
const YOU_IMAGE = '/images/map/character-face.webp'
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
        labelKey: 'map.house',
        // The world's own spawn point, looking at the house. Picked over a
        // hand-placed spot in front of the door because the game already drops
        // you here on load, so it is known-clear ground — the first attempt
        // put you in a corner, clipped through a fence.
        x: 0, y: 0.21, z: 0, yaw: 2.90,
        // The pin marks the house itself, not where you land.
        pin: { x: 1.55, z: -6.31 }
    },
    {
        id: 'frisbee',
        labelKey: 'map.frisbee',
        // Short of the activity anchor, not on it: the anchor is where the DOG
        // waits, so landing exactly there put you inside the dog. 1.8 units
        // back still sits inside the 2.25 activation radius, so the prompt
        // comes up on arrival either way.
        x: 4.9, y: 0.237, z: 5.72696, yaw: Math.PI / 2,
        pin: { x: 6.6989, z: 5.72696 }
    },
    {
        id: 'fuego',
        labelKey: 'map.fire',
        // Beside the fire, facing it. FIRE_POINT_THREE in World.js.
        x: -12.45, y: 0.21, z: 3.11, yaw: -Math.PI / 2,
        pin: { x: -14.158, z: 3.11 }
    },
    {
        id: 'puente',
        labelKey: 'map.bridge',
        // East bank, looking across (the bridge spans X -37.5..-33.2).
        x: -32.4, y: 0.21, z: 4.44, yaw: -Math.PI / 2,
        pin: { x: -35.36, z: 4.44 }
    },
    {
        id: 'social',
        labelKey: 'map.social',
        x: -7.5, y: 0.21, z: 21.0, yaw: 2.66,
        // The one pin the map art cannot corroborate — the illustration draws
        // forest here and never depicted the structure — so unlike the rest it
        // is placed to look right rather than to be right.
        //
        // Which means it had to be re-derived when bx changed. The others are
        // authored at their subjects' true positions and simply follow the
        // corrected transform to better places; this one is authored at
        // whatever coordinate happens to DRAW in the right spot, so fixing the
        // transform under it would have dragged it 4.5% west. Solved back from
        // the pixel it occupied before, so it has not visibly moved at all --
        // and solved a second time when by was corrected, for the same reason.
        pin: { x: -5.03, z: 17.79 }
    },
    {
        id: 'playa',
        labelKey: 'map.beach',
        // On the sand, facing the sea (+Z).
        x: 1.65, y: 0.21, z: 40.0, yaw: 0,
        // Placed by hand, and further west again than the first correction.
        //
        // The `pin` is DRAWING ONLY -- travel uses the x/z above -- so moving
        // it costs nothing but its agreement with the illustration, and the
        // illustration is what the reader is looking at. This one sits 42
        // units south of any landmark the transform was fitted from, which is
        // far more extrapolation than the fit was ever checked over, so it is
        // the one pin whose drawn position is worth trusting over the maths.
        //
        // Read off a marked-up screenshot rather than guessed: the six pin
        // rings were detected in the image and used to map screen pixels back
        // to map uv (residuals under 0.6 px on all six), then the mark was run
        // back through the inverse transform.
        //
        // Barely moved in the end, which is the tell that the pin was never
        // the problem. Running the mark through the FIXED transform puts it a
        // third of a unit west of where it always was, and at Z = 40.00 -- the
        // landing spot itself, to two decimals. Every one of the ten units it
        // appeared to need was error in the transform.
        //
        // It coinciding with the landing spot is right here, even though every
        // other pin deliberately stands off its own: those name a building or a
        // fire you would rather not arrive inside. This one names a beach.
        pin: { x: -0.36, z: 40.00 }
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
        this._placeYou()
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
            title: t('map.title'),
            subtitle: t('map.subtitle')
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
            pin.setAttribute('aria-label', t('map.goTo', { place: t(dest.labelKey) }))
            pin.innerHTML = `<span class="fz-map-dot"></span><span class="fz-map-label">${t(dest.labelKey)}</span>`
            pin.addEventListener('click', () => this._travelTo(dest))
            stage.appendChild(pin)
        }

        // "You are here".
        //
        // Built once and moved on every open, rather than created per open,
        // because _build() only ever runs the first time -- and because a
        // marker that is always in the DOM can be animated by CSS without
        // anything having to restart it.
        //
        // It costs almost nothing: worldToMap() is already fitted and already
        // drives the six pins, so the only new idea here is reading the
        // character's XZ instead of a hardcoded pair.
        this.you = document.createElement('div')
        this.you.className = 'fz-map-you'
        this.you.setAttribute('role', 'img')
        this.you.innerHTML =
            `<img class="fz-map-you-face" src="${YOU_IMAGE}" alt="" draggable="false">`
        stage.appendChild(this.you)

        this.modal.append(stage)
    }

    /**
     * Put the marker where the character is standing.
     *
     * Called on open and not per frame on purpose: the map cannot be opened
     * while anything owns the character (see canOpen), so while it is up the
     * position it was opened with is still the position he is in.
     *
     * Off-map is a real case, not a defensive one -- the world runs past the
     * edges of the illustration, and the fit extrapolates well but the art
     * simply stops. Rather than clamp the marker to the border, where it would
     * confidently claim a spot that is not where you are, it hides.
     */
    _placeYou() {
        if (!this.you) return

        const character = this.experience.world?.character
        const position = character?.container?.position
        if (!position) { this.you.hidden = true; return }

        const { u, v } = worldToMap(position.x, position.z)
        const onMap = u >= 0 && u <= 1 && v >= 0 && v <= 1
        this.you.hidden = !onMap
        if (!onMap) return

        this.you.style.left = `${(u * 100).toFixed(2)}%`
        this.you.style.top = `${(v * 100).toFixed(2)}%`
        this.you.setAttribute('aria-label', t('map.you'))
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

            // Get out of whatever you are in FIRST. Fast travel is a second
            // way out of the house and off a seat, and both of those are
            // states with their own teardown — skipping it left the world
            // wearing the interior's sky and light, or left you sitting on
            // nothing. Both no-op when they do not apply.
            const world = this.experience.world
            world?.sitPoints?.forceStand?.()

            // leaveInteriorAround runs the move itself either way, so this is
            // NOT `if (!leave(move)) move()` — that teleports twice outdoors.
            const move = () => character.teleportTo(dest.x, dest.y, dest.z, dest.yaw)
            const house = world?.houseInterior
            if (house) house.leaveInteriorAround(move)
            else move()

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
