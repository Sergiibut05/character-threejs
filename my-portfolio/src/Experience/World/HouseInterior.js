import * as THREE from 'three'
import { uniform, viewportUV, vec2, vec4, float, uv, length, smoothstep, mix, clamp } from 'three/tsl'
import Experience from '../Experience.js'
import StaticPiece from './scene/StaticPiece.js'
import TrophyModal from './ui/TrophyModal.js'
import ComputerModal from './ui/ComputerModal.js'
import GamesModal from './ui/GamesModal.js'
import { seatOwnsInteract } from './seated.js'
import InteractBadge, { anchorAbove } from './ui/InteractBadge.js'
import { propShadowTint, propCoreLit0, propCoreLit1 } from './scene/StylizedPropMaterial.js'
import { dayNightTint } from './DayNight.js'
import { FX_NO_OCCLUDE_LAYER } from '../Renderer.js'

const _white = new THREE.Vector3(1, 1, 1)
const _flat = new THREE.Vector3()

/**
 * How far apart two points are ON THE FLOOR, ignoring height.
 *
 * Prop proximity used the full 3D distance, which quietly made every radius
 * mean something different depending on how high the prop sat: the character's
 * origin rides about 0.9 above the floor, so a worktop toaster at y=0.88 spent
 * ~0.1 of its radius on height and the Switch at y=0.45 spent ~0.98 of it —
 * enough that a 0.9 radius could never trigger at all, however close you stood.
 * Measuring on the floor plane makes a radius mean "how close you are standing",
 * which is what it was always being tuned as.
 */
function floorDistance(a, b) {
    return _flat.set(a.x - b.x, 0, a.z - b.z).length()
}

/**
 * HouseInterior — the Animal-Crossing style house interior.
 *
 * The interior lives in the SAME scene as the island, authored ~850 units away
 * in Blender (visuals + its colliders inside Collaiders.glb share coordinates,
 * so physics needs zero extra work). Entering/leaving is a teleport hidden
 * behind the iris transition (same pattern as the frisbee minigame).
 *
 *   Enter:  Door._tryInteract() → enter()  — spawn ON the 'entrance' rug.
 *   Exit:   walk onto/near the rug (edges glow white like the door) → interact
 *           → exit() — spawn back where you stood when you entered.
 *
 * Interior mode (while inside):
 *   - sky sphere hidden + scene.background = solid dark colour (AC look)
 *   - heavy frustumCulled=false instanced systems hidden (grass / flowers /
 *     fireflies) — their vertex shaders would still run otherwise
 *   - ambience audio ducked (AudioManager reads `isInside`)
 *   - the shadow camera already follows the character, so interior sun
 *     shadows work (and island casters leave the shadow frustum) for free.
 *
 * Assets are `decorative` priority (stream in after "Explorar"); enter() is
 * simply refused until the interior is built — by the time a player reaches
 * the door they're long loaded.
 */
export default class HouseInterior {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.renderer = this.experience.renderer
        this.debug = this.experience.debug

        // State
        this.ready = false          // visuals built + rug resolved
        this.isInside = false
        this._busy = false          // mid-transition
        this._outsideSpawn = null   // where to reappear when leaving

        // Rug interactive state (mirrors Mailbox/Door)
        this.position = new THREE.Vector3()   // rug world position
        this.mesh = null                      // raycaster target
        this.meshes = []                      // outline targets
        this.isHovered = false
        this.isNear = false
        this.isHighlighted = false
        this.proximityRadius = 1.25

        // Facing the room when arriving on the rug (tweak if the spawn looks off)
        this.enterYaw = Math.PI

        // Interior lighting — the stylized prop shader ignores scene lights, so
        // the interior look is driven by: frozen time-of-day (sun dir + light
        // intensities), a warm constant grade (dayNightTint), and a softened,
        // de-blued core-shadow band. All restored on exit.
        this.lighting = {
            hour: 0.5,                              // frozen time of day (0.5 = noon)
            shadowAmount: 0.6,                      // 0 = no shading at all, 1 = full outdoor look
            coreLit0: -0.45,                        // shadow band start (smaller = less shadow)
            coreLit1: 0.3,                          // shadow band end
            tint: new THREE.Color('#fff1e2')        // warm interior grade
        }
        this._savedLight = null

        // Standing lamp (lamp_standing in interior.glb) — toggleable interactive.
        // NOTE: the stylized prop shader ignores scene lights, so the PointLight
        // mainly lights the CHARACTER (real Lambert); the additive halo sells it.
        this.lampParams = {
            on: true,
            height: 1.0,        // light/halo height above the lamp's origin
            intensity: 2.5,
            distance: 6.5,
            glowSize: 0.35
        }
        this.uLampColor = uniform(new THREE.Color('#ffd9a0'))
        this.uLampGlowStrength = uniform(1.4)
        this.lamp = null

        // Profile props (trophy → certificates, computer → about/exp/BTS,
        // Switch → games shelf, toaster → toast pop).
        this._props = []            // generic proximity/hover interactives
        this.trophyModal = null     // lazy
        this.computerModal = null   // lazy
        this.gamesModal = null      // lazy
        this.toast = null           // toaster pop state (see _popToast)

        // Interior background — pastel-brown radial gradient, lightening toward
        // the screen centre (AC interior look). Built as a viewport-space TSL
        // backgroundNode: constant cost, no geometry.
        this.uBgCenter = uniform(new THREE.Color('#6e5946'))   // lighter centre
        this.uBgEdge = uniform(new THREE.Color('#3f322b'))     // dark pastel-brown edges
        const d = length(viewportUV.sub(vec2(0.5, 0.5)))
        this._bgNode = mix(this.uBgCenter, this.uBgEdge, smoothstep(0.15, 0.72, d))
        this._prevBackground = null
        this._prevBackgroundNode = null

        this._prevMobileB = false
        this._prevPadA = false
        this._onKeyDown = (e) => {
            if (e.key !== 'Enter') return
            this._tryLampToggle()
            for (const rec of this._props) this._tryProp(rec)
            this._tryExit()
        }
        window.addEventListener('keydown', this._onKeyDown)

        // Build now if the decorative assets already arrived, else on load.
        this._tryBuild()
        if (!this.ready) {
            this._onSourceLoaded = () => this._tryBuild()
            this.resources.on('sourceLoaded', this._onSourceLoaded)
        }

        if (this.debug?.active) this._setDebug()
    }

    // ─── Build (lazy: needs interiorModel + tinyAtlas [+ special]) ────────

    _tryBuild() {
        const r = this.resources.items

        // Main interior (shared Tiny atlas) + entrance rug.
        if (!this.piece && r.interiorModel && r.tinyAtlas) {
            this.piece = new StaticPiece('interior', r.interiorModel, {
                map: r.tinyAtlas
            })

            // Resolve the entrance rug → spawn point + exit interactive.
            const rug = this.piece.root?.getObjectByName('entrance')
            if (rug) {
                rug.updateWorldMatrix(true, false)
                rug.getWorldPosition(this.position)
                this.mesh = rug
                rug.userData.interactiveObject = this
                rug.traverse((c) => {
                    if (c.isMesh) { this.meshes.push(c); c.userData.interactiveObject = this }
                })
                this.experience.world?.raycaster?.addInteractiveObject(this)
                this.ready = true
            } else {
                console.warn('HouseInterior: "entrance" rug not found in interior.glb')
            }

            this._setupLamp()
            this._setupInteriorProps()
        }

        // Special objects keep their own baked materials (converted to the
        // stylized look per-mesh by StaticPiece when no shared map is given).
        // May arrive before OR after the main interior — built independently.
        if (!this.specialPiece && r.interiorSpecialModel) {
            this.specialPiece = new StaticPiece('interior-special', r.interiorSpecialModel, {})
            this._setupSpecialInteractives()
        }

        // Stop listening only once EVERYTHING is in.
        if (this.ready && this.specialPiece && this._onSourceLoaded) {
            this.resources.off('sourceLoaded', this._onSourceLoaded)
            this._onSourceLoaded = null
        }
    }

    // ─── Standing lamp (toggleable warm light + halo) ────────────────────

    _setupLamp() {
        const node = this.piece.root?.getObjectByName('lamp_standing')
        if (!node) return

        node.updateWorldMatrix(true, false)
        const pos = new THREE.Vector3()
        node.getWorldPosition(pos)

        this.lamp = {
            node,
            position: pos,
            meshes: [],
            isNear: false,
            isHovered: false,
            isHighlighted: false,
            proximityRadius: 1.2
        }

        // Raycaster adapter (hover + click) — a separate interactive from the rug.
        const self = this
        this._lampInteractive = {
            mesh: node,
            position: pos,
            proximityRadius: this.lamp.proximityRadius,
            onHover() {
                if (self.lamp.isHovered) return
                self.lamp.isHovered = true
                self._updateLampHighlight()
                document.body.style.cursor = 'pointer'
            },
            onUnhover() {
                if (!self.lamp.isHovered) return
                self.lamp.isHovered = false
                self._updateLampHighlight()
                document.body.style.cursor = ''
            },
            onClick() { self._tryLampToggle() }
        }
        node.userData.interactiveObject = this._lampInteractive
        node.traverse((c) => {
            if (c.isMesh) { this.lamp.meshes.push(c); c.userData.interactiveObject = this._lampInteractive }
        })
        this.experience.world?.raycaster?.addInteractiveObject(this._lampInteractive)

        // Warm point light (cheap: no shadows, short range).
        const P = this.lampParams
        this.lampLight = new THREE.PointLight(this.uLampColor.value, P.intensity, P.distance, 2)
        this.lampLight.castShadow = false
        this.scene.add(this.lampLight)

        // Additive halo (Bruno-style glow sprite, like the fireflies).
        const dGlow = length(uv().sub(0.5))
        const glow = clamp(float(0.05).div(dGlow).sub(0.1), 0.0, 1.0)
        const mat = new THREE.SpriteNodeMaterial()
        mat.outputNode = vec4(this.uLampColor.mul(glow).mul(this.uLampGlowStrength), glow)
        mat.blending = THREE.AdditiveBlending
        mat.transparent = true
        mat.depthWrite = false
        this.lampGlow = new THREE.Mesh(new THREE.CircleGeometry(1, 16), mat)
        this.lampGlow.renderOrder = 5
        // The halo is wider than the lamp it surrounds, and the outline pass's
        // depth pre-pass would otherwise treat it as something solid standing
        // in front — erasing the lamp's own outline whenever the light was on.
        this.lampGlow.layers.set(FX_NO_OCCLUDE_LAYER)
        this.scene.add(this.lampGlow)

        this._applyLampState()
    }

    /** Re-apply on/off + placement/params (used by the toggle and the GUI). */
    _applyLampState() {
        if (!this.lamp) return
        const P = this.lampParams
        const pos = this.lamp.position

        this.lampLight.visible = P.on
        this.lampLight.intensity = P.intensity
        this.lampLight.distance = P.distance
        this.lampLight.position.set(pos.x, pos.y + P.height, pos.z)

        this.lampGlow.visible = P.on
        this.lampGlow.scale.setScalar(P.glowSize)
        this.lampGlow.position.set(pos.x, pos.y + P.height, pos.z)
    }

    _tryLampToggle() {
        if (!this.isInside || this._busy || !this.lamp) return
        if (seatOwnsInteract(this.lamp.position)) return
        if (!(this.lamp.isNear || this.lamp.isHovered)) return
        if (document.querySelector('.fz-modal-overlay.is-open')) return
        this.lampParams.on = !this.lampParams.on
        this._applyLampState()
    }

    /** Point the room's single badge at whatever is currently outlined. */
    _updateBadge() {
        if (!this._badge) this._badge = new InteractBadge()

        // Every highlight below is already gated on isInside, so this is
        // belt-and-braces — but it is the cheap half, and it is the half that
        // cannot be undone by someone adding a new prop later.
        if (!this.isInside) { this._badge.update(null, false); return }

        let target = null
        for (const rec of this._props) {
            if (rec.isHighlighted) { target = rec; break }
        }
        if (!target && this.lamp?.isHighlighted) target = this.lamp
        if (!target && this.isHighlighted) target = this

        if (target && !target.badgeAnchor) target.badgeAnchor = anchorAbove(target.meshes)
        this._badge.update(target?.badgeAnchor, !!target)
    }

    _updateLampHighlight() {
        const L = this.lamp
        if (!L) return
        // Dark while the sofa two steps away holds the key (see seated.js).
        const should = this.isInside && (L.isHovered || L.isNear)
            && !seatOwnsInteract(L.position)
        if (should === L.isHighlighted) return
        L.isHighlighted = should
        for (const m of L.meshes) {
            if (should) this.renderer.addOutlinedObject(m)
            else this.renderer.removeOutlinedObject(m)
        }
    }

    // ─── Interior props: toaster (toast pop) + Switch (games shelf) ─────

    /** Height of the toast pop, in world units. */
    static POP_HEIGHT = 0.11
    /** Fall acceleration. Higher = snappier, less floaty. */
    static POP_GRAVITY = 9.0
    /** How much of its speed a slice keeps on the one bounce it gets. */
    static POP_BOUNCE = 0.26
    /** The second slice lags the first by this, so the pair is not robotic. */
    static POP_STAGGER = 0.055

    /**
     * The toaster and the Nintendo Switch, both from interior.glb.
     *
     * Radii are small on purpose — these sit on a worktop beside each other
     * and the lamp, and an over-generous radius means two things glow at once
     * and Enter fires whichever the loop happens to reach first.
     */
    _setupInteriorProps() {
        const root = this.piece?.root
        if (!root || this._interiorPropsSetup) return
        this._interiorPropsSetup = true
        root.updateMatrixWorld(true)

        const meshesOf = (name) => {
            const out = []
            root.getObjectByName(name)?.traverse((c) => { if (c.isMesh) out.push(c) })
            return out.length ? out : null
        }

        // Toaster: the two slices are separate top-level nodes, so the pop is
        // a plain local-Y offset on each — no rig, no animation clip. Their
        // authored Y is the rest position and every frame returns to exactly
        // that, so a pop interrupted half way cannot leave them drifting.
        const toasterMeshes = meshesOf('toaster')
        const slices = ['toast1', 'toast2']
            .map((n) => root.getObjectByName(n))
            .filter(Boolean)
        if (toasterMeshes && slices.length) {
            this.toast = {
                playing: false,
                slices: slices.map((node, i) => ({
                    node,
                    baseY: node.position.y,
                    v: 0,
                    t: 0,
                    delay: i * HouseInterior.POP_STAGGER,
                    bounced: false
                }))
            }
            this._toasterProp = this._makeProp(toasterMeshes, 1.0, () => this._popToast(), { once: true })
        } else console.warn('HouseInterior: toaster/toast meshes not found')

        // The console on the shelf is a Nintendo Switch — hence a games panel
        // rather than the light switch the node name suggests.
        const switchMeshes = meshesOf('switch')
        if (switchMeshes) this._makeProp(switchMeshes, 0.9, () => this._openGames())
        else console.warn('HouseInterior: switch meshes not found')
    }

    /** Launch both slices. Ignored while a pop is already in the air. */
    _popToast() {
        const toast = this.toast
        if (!toast || toast.playing) return
        toast.playing = true

        // v0 derived from the height we actually want, so POP_HEIGHT alone
        // changes how far they go and POP_GRAVITY alone how snappy it feels.
        const v0 = Math.sqrt(2 * HouseInterior.POP_GRAVITY * HouseInterior.POP_HEIGHT)
        for (const s of toast.slices) {
            s.node.position.y = s.baseY
            s.v = v0
            s.t = -s.delay
            s.bounced = false
        }

        // The outline goes out for the whole pop, as asked: it is the prompt
        // that says "there is something to do here", and leaving it lit while
        // the thing is visibly doing it reads as if the press had missed.
        if (this._toasterProp) {
            this._toasterProp.suppressed = true
            this._refreshPropHighlight(this._toasterProp)
        }
        this.experience.audio?.playSfx?.('ui')
    }

    /** Ballistic integration for the slices in flight. No-op when idle. */
    _updateToast(dt) {
        const toast = this.toast
        if (!toast?.playing) return

        let moving = false
        for (const s of toast.slices) {
            s.t += dt
            if (s.t < 0) { moving = true; continue }   // still waiting its turn

            s.v -= HouseInterior.POP_GRAVITY * dt
            let y = s.node.position.y + s.v * dt
            if (y <= s.baseY) {
                y = s.baseY
                // One bounce, then dead: a real slice rattles once in the slot
                // and stops, while an endless damped bounce reads as a bug.
                if (!s.bounced && s.v < 0) {
                    s.v = -s.v * HouseInterior.POP_BOUNCE
                    s.bounced = true
                } else s.v = 0
            }
            s.node.position.y = y
            if (y > s.baseY || s.v > 0) moving = true
        }

        if (moving) return
        toast.playing = false
        for (const s of toast.slices) s.node.position.y = s.baseY
        if (this._toasterProp) {
            this._toasterProp.suppressed = false
            this._refreshPropHighlight(this._toasterProp)
        }
    }

    // ─── Profile props: trophy (certificates) + computer (about) ─────────

    /**
     * Resolve the trophy & computer inside interior-special-things. The user's
     * compressor flattened node names (Mesh001*, Plane018*), so we try proper
     * names first ('trophy' / 'computer' — future re-exports) and fall back to
     * the known node-name patterns of the current asset.
     */
    _setupSpecialInteractives() {
        const root = this.specialPiece?.root
        if (!root || this._specialSetup) return
        this._specialSetup = true
        root.updateMatrixWorld(true)

        const meshesUnder = (node) => {
            const out = []
            node?.traverse((c) => { if (c.isMesh) out.push(c) })
            return out.length ? out : null
        }
        const byName = (name) => meshesUnder(root.getObjectByName(name))
        const byNodeRegex = (re) => {
            const out = []
            root.traverse((c) => {
                if (c.isMesh && (re.test(c.name) || re.test(c.parent?.name || ''))) out.push(c)
            })
            return out.length ? out : null
        }

        const trophyMeshes = byName('trophy') || byNodeRegex(/^Plane018/)
        const computerMeshes = byName('computer') || byNodeRegex(/^Mesh001($|_)/)

        // 1.0 / 1.15 are the 1.3 / 1.4 these had as 3D radii, converted: at
        // the height each one sits, that is the floor reach they already had,
        // so switching to floorDistance leaves them feeling identical.
        if (trophyMeshes) this._makeProp(trophyMeshes, 1.0, () => this._openTrophy())
        else console.warn('HouseInterior: trophy meshes not found')
        if (computerMeshes) this._makeProp(computerMeshes, 1.15, () => this._openComputer())
        else console.warn('HouseInterior: computer meshes not found')
    }

    /**
     * Generic prop interactive: outline on near/hover + action on interact.
     *
     * `once` makes it a one-shot — after the first interaction the prop is
     * spent: no outline however close you stand, no pointer cursor, and no
     * second trigger from click, Enter, the mobile button or the pad. Spending
     * it is what a one-off flourish wants: the outline is a promise that
     * something will happen, so it has to stop being made once nothing will.
     * Spent-ness is per session; reloading gives the prop back.
     */
    _makeProp(meshes, radius, onInteract, { once = false } = {}) {
        const box = new THREE.Box3()
        for (const m of meshes) box.expandByObject(m)

        const rec = {
            meshes,
            position: box.getCenter(new THREE.Vector3()),
            proximityRadius: radius,
            isNear: false,
            isHovered: false,
            isHighlighted: false,
            once,
            spent: false,
            onInteract
        }

        const self = this
        rec.adapter = {
            position: rec.position,
            proximityRadius: rec.proximityRadius,
            onHover() {
                if (rec.isHovered || rec.spent) return
                rec.isHovered = true
                self._refreshPropHighlight(rec)
                document.body.style.cursor = 'pointer'
            },
            onUnhover() {
                if (!rec.isHovered) return
                rec.isHovered = false
                self._refreshPropHighlight(rec)
                document.body.style.cursor = ''
            },
            onClick() { self._tryProp(rec) }
        }

        const raycaster = this.experience.world?.raycaster
        for (const m of meshes) {
            m.userData.interactiveObject = rec.adapter
            raycaster?.addInteractiveObject({ mesh: m })
        }

        this._props.push(rec)
        return rec
    }

    _tryProp(rec) {
        if (rec.spent || seatOwnsInteract(rec.position)) return
        if (!this.isInside || this._busy) return
        if (!(rec.isNear || rec.isHovered)) return
        if (document.querySelector('.fz-modal-overlay.is-open')) return

        // Spent BEFORE the action runs, not after: _popToast turns the outline
        // off through _refreshPropHighlight, and that has to already know the
        // prop is finished or it would light it straight back up on landing.
        if (rec.once) {
            rec.spent = true
            rec.isHovered = false
            document.body.style.cursor = ''
        }
        rec.onInteract()
        if (rec.spent) this._refreshPropHighlight(rec)
    }

    _refreshPropHighlight(rec) {
        // `suppressed` drops the outline while a prop is busy doing the thing
        // you just asked for; `spent` drops it for good (see _makeProp); and a
        // seat that has taken the key drops it for as long as it holds it — an
        // outline is an offer, and this one would be refused (see seated.js).
        const should = this.isInside && !rec.spent && !rec.suppressed
            && (rec.isHovered || rec.isNear) && !seatOwnsInteract(rec.position)
        if (should === rec.isHighlighted) return
        rec.isHighlighted = should
        for (const m of rec.meshes) {
            if (should) this.renderer.addOutlinedObject(m)
            else this.renderer.removeOutlinedObject(m)
        }
    }

    _openTrophy() {
        if (!this.trophyModal) {
            this.trophyModal = new TrophyModal()
            this.trophyModal.onClose(() => this._onProfileModalClosed())
        }
        this._lockForModal()
        this.trophyModal.open()
    }

    _openGames() {
        if (!this.gamesModal) {
            this.gamesModal = new GamesModal()
            this.gamesModal.onClose(() => this._onProfileModalClosed())
        }
        this._lockForModal()
        this.gamesModal.open()
    }

    _openComputer() {
        if (!this.computerModal) {
            this.computerModal = new ComputerModal()
            this.computerModal.onClose(() => this._onProfileModalClosed())
        }
        this._lockForModal()
        this.computerModal.open()
    }

    _lockForModal() {
        // Idempotent: a duplicated trigger must not re-capture the lock state
        // AFTER we already locked (that would "restore" locked=true on close).
        if (this._prevModalLock !== undefined) return
        const character = this.experience.world?.character
        if (character) {
            this._prevModalLock = character.movementLocked
            character.movementLocked = true
        }
    }

    _onProfileModalClosed() {
        const character = this.experience.world?.character
        if (character && this._prevModalLock !== undefined) {
            character.movementLocked = this._prevModalLock
            this._prevModalLock = undefined
        }
    }

    // ─── Enter / Exit (iris-masked teleports) ────────────────────────────

    async enter() {
        if (!this.ready || this._busy || this.isInside) return false
        const character = this.experience.world?.character
        if (!character?.rigidBody) return false

        this._busy = true
        character.movementLocked = true

        // Remember where we stood so exiting drops us back by the door —
        // pushed a bit FURTHER from the door plus a touch "down" (toward the
        // camera) so we don't reappear glued to it.
        let sx = character.position.x
        let sz = character.position.z
        const door = this.experience.world?.door
        if (door?.resolved) {
            const dx = sx - door.position.x
            const dz = sz - door.position.z
            const len = Math.hypot(dx, dz) || 1
            const extra = 0.8
            sx += (dx / len) * extra
            sz += (dz / len) * extra
        }
        sz += 0.35 // screen-down nudge (camera sits at +Z looking -Z)
        this._outsideSpawn = {
            x: sx,
            y: character.groundY,
            z: sz,
            yaw: character.container.rotation.y + Math.PI // face away from the door
        }

        await this._irisClose()

        this._setInsideMode(true)
        character.teleportTo(this.position.x, this.position.y, this.position.z, this.enterYaw)
        this._applyInteriorLighting(true)
        this.experience.camera.setMode('follow')

        await this.experience.waitMs(200)
        await this._irisOpen()

        character.movementLocked = false
        this._busy = false
        return true
    }

    async exit() {
        if (!this._busy && this.isInside && this._outsideSpawn) {
            const character = this.experience.world?.character
            if (!character?.rigidBody) return false

            this._busy = true
            character.movementLocked = true

            await this._irisClose()

            const s = this._outsideSpawn
            this.leaveInteriorAround(
                () => character.teleportTo(s.x, s.y, s.z, s.yaw))
            this.experience.camera.setMode('follow')

            await this.experience.waitMs(200)
            await this._irisOpen()

            character.movementLocked = false
            this._busy = false
            return true
        }
        return false
    }

    /**
     * Take the world back out of interior mode, around a move of your choosing.
     *
     * Everything entering the house changes lives here rather than in exit():
     * the sky sphere and the brown background, the instanced grass/flowers/
     * fireflies, the frozen day-night cycle and its warm grade, the outlines,
     * and `isInside` itself — which the audio also reads. exit() is only that
     * list plus an iris wipe and a walk back to the door.
     *
     * Anything else that moves you out of the house has to run the same list,
     * and the map's fast travel did not: travelling to the beach from inside
     * left you on the sand under a brown sky, with no grass, no fireflies, the
     * interior's warm light frozen on the world and the day/night cycle stopped
     * for the rest of the session. It could not have known — nothing said so.
     *
     * The move is a CALLBACK because the order is not free: the lighting
     * restore recenters the shadow camera on wherever the character now is, so
     * it has to run after the move, while the mode flip has to run before it.
     * Taking the move as an argument is what stops the next caller getting that
     * wrong; passing it a move while already outside just runs the move.
     *
     * @param {() => void} move  puts the character wherever it is going
     * @returns {boolean} whether we were actually inside
     */
    leaveInteriorAround(move) {
        if (!this.isInside) { move?.(); return false }
        this._setInsideMode(false)
        move?.()
        this._applyInteriorLighting(false)
        this._outsideSpawn = null
        return true
    }

    async _irisClose() {
        const renderer = this.renderer
        renderer.setIrisTransitionEnabled(true)
        await this.experience.animateValue(1.35, 0.0, 600, (v) => renderer.setIrisTransitionSize(v))
    }

    async _irisOpen() {
        const renderer = this.renderer
        await this.experience.animateValue(0.0, 1.35, 800, (v) => renderer.setIrisTransitionSize(v))
        renderer.setIrisTransitionEnabled(false)
    }

    // ─── Interior mode (background + perf toggles) ───────────────────────

    _setInsideMode(inside) {
        this.isInside = inside
        const world = this.experience.world
        const env = world?.environment

        // Sky sphere ↔ pastel-brown gradient background (AC interior look).
        if (env?.sky) env.sky.visible = !inside
        if (inside) {
            this._prevBackground = this.scene.background ?? null
            this._prevBackgroundNode = this.scene.backgroundNode ?? null
            this.scene.background = null
            this.scene.backgroundNode = this._bgNode
        } else {
            this.scene.backgroundNode = this._prevBackgroundNode
            this.scene.background = this._prevBackground
        }

        // The big frustumCulled=false instanced systems keep paying their
        // vertex cost even when distance-collapsed — skip their draws entirely.
        const toggles = [world?.grass?.mesh, world?.flowers?.mesh, world?.fireflies?.mesh]
        for (const mesh of toggles) {
            if (mesh) mesh.visible = !inside
        }

        // Highlights depend on isInside — refresh so they clear when leaving.
        this._updateHighlight()
        this._updateLampHighlight()
        for (const rec of this._props) this._refreshPropHighlight(rec)
    }

    // ─── Interior lighting (call AFTER the teleport — recenters shadows) ──

    _applyInteriorLighting(on) {
        const env = this.experience.world?.environment
        if (!env) return

        if (on) {
            this._savedLight = {
                cycleEnabled: env.cycle.enabled,
                timeOfDay: env.timeOfDay,
                shadowTint: propShadowTint.value.clone(),
                coreLit0: propCoreLit0.value,
                coreLit1: propCoreLit1.value
            }
            // Freeze the day/night cycle so nothing rewrites our grade per-frame.
            env.cycle.enabled = false
            this._applyInteriorLightParams()
        } else if (this._savedLight) {
            const s = this._savedLight
            propShadowTint.value.copy(s.shadowTint)
            propCoreLit0.value = s.coreLit0
            propCoreLit1.value = s.coreLit1
            env.timeOfDay = s.timeOfDay
            env.cycle.enabled = s.cycleEnabled
            // Restore outdoor light state + recenter the shadow camera outside.
            env._applyTimeOfDay(env.timeOfDay)
            this._savedLight = null
        }
    }

    _applyInteriorLightParams() {
        const env = this.experience.world?.environment
        if (!env || !this._savedLight) return
        const L = this.lighting

        // Base light state at the frozen hour. This also re-runs the
        // character-following shadow-camera centering, which matters because
        // the frozen cycle stops per-frame updates — one call after the
        // teleport centres the shadow frustum on the interior.
        env.timeOfDay = L.hour
        env._applyTimeOfDay(L.hour)

        // Warm constant grade + soft, de-blued core shadow for the props.
        // shadowAmount 1 = full outdoor shadow tint, 0 = flat (no shading).
        dayNightTint.value.copy(L.tint)
        propShadowTint.value.copy(this._savedLight.shadowTint).lerp(_white, 1 - L.shadowAmount)
        propCoreLit0.value = L.coreLit0
        propCoreLit1.value = L.coreLit1
    }

    // ─── Rug interactive (exit) — mirrors Mailbox ────────────────────────

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

    onClick() { this._tryExit() }

    _tryExit() {
        if (!this.isInside || this._busy || seatOwnsInteract(this.position)) return
        if (!(this.isNear || this.isHovered)) return
        if (document.querySelector('.fz-modal-overlay.is-open')) return
        this.exit()
    }

    _updateHighlight() {
        // Only relevant while inside — the rug shouldn't glow from the island.
        const should = this.isInside && (this.isHovered || this.isNear)
            && !seatOwnsInteract(this.position)
        if (should === this.isHighlighted) return
        this.isHighlighted = should
        for (const m of this.meshes) {
            if (should) this.renderer.addOutlinedObject(m)
            else this.renderer.removeOutlinedObject(m)
        }
    }

    update() {
        if (!this.ready) return

        // Outside the isInside branch on purpose: a pop already in the air
        // still has to land if you walk out of the house mid-toast.
        this._updateToast(Math.min(0.05, (this.experience.time?.delta || 16) * 0.001))

        // Outside it for the same kind of reason. Inside the branch, leaving
        // the house by any route that is not the door — the map's fast travel —
        // simply stopped calling this, and the glyph stayed burned onto the
        // screen for the rest of the session. Out here it is asked every frame
        // and answers "nothing is lit" on its own, whichever way you left.
        this._updateBadge()

        const character = this.experience.world?.character
        if (character && this.isInside) {
            // `isNear` stays PURE GEOMETRY — seatYieldsToRival reads it to
            // decide whether the seat should stand down, so filtering it by the
            // seat rule here would leave the two halves waiting on each other.
            // The seat rule belongs on the outline instead, which is why the
            // highlight is refreshed every frame rather than only on a change:
            // the sofa can take the key without you having moved at all. Each
            // of these early-outs when nothing changed.
            this.isNear = this.position.distanceTo(character.position) < this.proximityRadius
            this._updateHighlight()

            if (this.lamp) {
                this.lamp.isNear = this.lamp.position.distanceTo(character.position)
                    < this.lamp.proximityRadius
                this._updateLampHighlight()
            }

            for (const rec of this._props) {
                rec.isNear = floorDistance(rec.position, character.position) < rec.proximityRadius
                this._refreshPropHighlight(rec)
            }


            // Mobile action button + gamepad A (rising edge), like Mailbox.
            // Each action self-guards by its own proximity.
            const interactAll = () => {
                this._tryLampToggle()
                for (const rec of this._props) this._tryProp(rec)
                this._tryExit()
            }
            const mb = this.experience.mobileControls?.getActions?.().button2 === true
            if (mb && !this._prevMobileB) interactAll()
            this._prevMobileB = mb

            const pa = this.experience.gamepad?.getActions?.().button2 === true
            if (pa && !this._prevPadA) interactAll()
            this._prevPadA = pa
        }
    }

    _setDebug() {
        const f = this.debug.ui.addFolder('🏠 Interior')
        f.close()
        f.add(this, 'enterYaw', -Math.PI, Math.PI, 0.05).name('Spawn yaw')
        f.addColor({ value: this.uBgCenter.value }, 'value').name('Fondo centro')
            .onChange((v) => this.uBgCenter.value.copy(v))
        f.addColor({ value: this.uBgEdge.value }, 'value').name('Fondo bordes')
            .onChange((v) => this.uBgEdge.value.copy(v))

        // Interior lighting — live while inside the house.
        const reapply = () => { if (this.isInside) this._applyInteriorLightParams() }
        const lf = f.addFolder('Luz interior')
        lf.add(this.lighting, 'hour', 0, 1, 0.01).name('Hora congelada').onChange(reapply)
        lf.add(this.lighting, 'shadowAmount', 0, 1, 0.01).name('Cantidad de sombra').onChange(reapply)
        lf.add(this.lighting, 'coreLit0', -1, 1, 0.01).name('Banda sombra · inicio').onChange(reapply)
        lf.add(this.lighting, 'coreLit1', -1, 1, 0.01).name('Banda sombra · fin').onChange(reapply)
        lf.addColor({ value: this.lighting.tint }, 'value').name('Tinte cálido')
            .onChange((v) => { this.lighting.tint.copy(v); reapply() })

        // Standing lamp
        const applyLamp = () => this._applyLampState()
        const gf = f.addFolder('Lámpara')
        gf.add(this.lampParams, 'on').name('Encendida').onChange(applyLamp)
        gf.add(this.lampParams, 'height', 0, 3, 0.05).name('Altura luz').onChange(applyLamp)
        gf.add(this.lampParams, 'intensity', 0, 8, 0.1).name('Intensidad').onChange(applyLamp)
        gf.add(this.lampParams, 'distance', 1, 15, 0.5).name('Alcance').onChange(applyLamp)
        gf.add(this.lampParams, 'glowSize', 0.05, 1.2, 0.01).name('Halo tamaño').onChange(applyLamp)
        gf.add(this.uLampGlowStrength, 'value', 0.2, 4, 0.1).name('Halo brillo')
        gf.addColor({ value: this.uLampColor.value }, 'value').name('Color')
            .onChange((v) => {
                this.uLampColor.value.copy(v)
                if (this.lampLight) this.lampLight.color.copy(v)
            })
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown)
        this._badge?.destroy()
        for (const m of this.meshes) this.renderer?.removeOutlinedObject?.(m)
        for (const rec of this._props) {
            for (const m of rec.meshes) this.renderer?.removeOutlinedObject?.(m)
        }
        this.experience.world?.raycaster?.removeInteractiveObject?.(this)
        if (this._onSourceLoaded) this.resources.off('sourceLoaded', this._onSourceLoaded)
        this.trophyModal?.destroy?.()
        this.computerModal?.destroy?.()
        this.gamesModal?.destroy?.()
        this.piece?.dispose?.()
        this.specialPiece?.dispose?.()
    }
}
