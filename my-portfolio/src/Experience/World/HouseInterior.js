import * as THREE from 'three'
import { uniform, viewportUV, vec2, vec4, float, uv, length, smoothstep, mix, clamp } from 'three/tsl'
import Experience from '../Experience.js'
import StaticPiece from './scene/StaticPiece.js'
import TrophyModal from './ui/TrophyModal.js'
import ComputerModal from './ui/ComputerModal.js'
import { propShadowTint, propCoreLit0, propCoreLit1 } from './scene/StylizedPropMaterial.js'
import { dayNightTint } from './DayNight.js'

const _white = new THREE.Vector3(1, 1, 1)

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

        // Profile props (trophy → certificates, computer → about/exp/BTS).
        this._props = []            // generic proximity/hover interactives
        this.trophyModal = null     // lazy
        this.computerModal = null   // lazy

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
        if (!(this.lamp.isNear || this.lamp.isHovered)) return
        if (document.querySelector('.fz-modal-overlay.is-open')) return
        this.lampParams.on = !this.lampParams.on
        this._applyLampState()
    }

    _updateLampHighlight() {
        const L = this.lamp
        if (!L) return
        const should = this.isInside && (L.isHovered || L.isNear)
        if (should === L.isHighlighted) return
        L.isHighlighted = should
        for (const m of L.meshes) {
            if (should) this.renderer.addOutlinedObject(m)
            else this.renderer.removeOutlinedObject(m)
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

        if (trophyMeshes) this._makeProp(trophyMeshes, 1.3, () => this._openTrophy())
        else console.warn('HouseInterior: trophy meshes not found')
        if (computerMeshes) this._makeProp(computerMeshes, 1.4, () => this._openComputer())
        else console.warn('HouseInterior: computer meshes not found')
    }

    /** Generic prop interactive: outline on near/hover + action on interact. */
    _makeProp(meshes, radius, onInteract) {
        const box = new THREE.Box3()
        for (const m of meshes) box.expandByObject(m)

        const rec = {
            meshes,
            position: box.getCenter(new THREE.Vector3()),
            proximityRadius: radius,
            isNear: false,
            isHovered: false,
            isHighlighted: false,
            onInteract
        }

        const self = this
        rec.adapter = {
            onHover() {
                if (rec.isHovered) return
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
        if (!this.isInside || this._busy) return
        if (!(rec.isNear || rec.isHovered)) return
        if (document.querySelector('.fz-modal-overlay.is-open')) return
        rec.onInteract()
    }

    _refreshPropHighlight(rec) {
        const should = this.isInside && (rec.isHovered || rec.isNear)
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

            this._setInsideMode(false)
            const s = this._outsideSpawn
            character.teleportTo(s.x, s.y, s.z, s.yaw)
            this._applyInteriorLighting(false)
            this.experience.camera.setMode('follow')

            await this.experience.waitMs(200)
            await this._irisOpen()

            character.movementLocked = false
            this._busy = false
            return true
        }
        return false
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
        if (!this.isInside || this._busy) return
        if (!(this.isNear || this.isHovered)) return
        if (document.querySelector('.fz-modal-overlay.is-open')) return
        this.exit()
    }

    _updateHighlight() {
        // Only relevant while inside — the rug shouldn't glow from the island.
        const should = this.isInside && (this.isHovered || this.isNear)
        if (should === this.isHighlighted) return
        this.isHighlighted = should
        for (const m of this.meshes) {
            if (should) this.renderer.addOutlinedObject(m)
            else this.renderer.removeOutlinedObject(m)
        }
    }

    update() {
        if (!this.ready) return

        const character = this.experience.world?.character
        if (character && this.isInside) {
            const near = this.position.distanceTo(character.position) < this.proximityRadius
            if (near !== this.isNear) { this.isNear = near; this._updateHighlight() }

            if (this.lamp) {
                const lampNear = this.lamp.position.distanceTo(character.position) < this.lamp.proximityRadius
                if (lampNear !== this.lamp.isNear) { this.lamp.isNear = lampNear; this._updateLampHighlight() }
            }

            for (const rec of this._props) {
                const near = rec.position.distanceTo(character.position) < rec.proximityRadius
                if (near !== rec.isNear) { rec.isNear = near; this._refreshPropHighlight(rec) }
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
        for (const m of this.meshes) this.renderer?.removeOutlinedObject?.(m)
        for (const rec of this._props) {
            for (const m of rec.meshes) this.renderer?.removeOutlinedObject?.(m)
        }
        this.experience.world?.raycaster?.removeInteractiveObject?.(this)
        if (this._onSourceLoaded) this.resources.off('sourceLoaded', this._onSourceLoaded)
        this.trophyModal?.destroy?.()
        this.computerModal?.destroy?.()
        this.piece?.dispose?.()
        this.specialPiece?.dispose?.()
    }
}
