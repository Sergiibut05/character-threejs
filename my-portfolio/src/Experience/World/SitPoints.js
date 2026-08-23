import * as THREE from 'three'
import Experience from '../Experience.js'

/**
 * SitPoints — the empties in `sit-points.glb` become places the player can sit.
 *
 * Each empty is an axis marker with no geometry. Its local **+Z** is the
 * direction the seated character faces: verified against the file rather than
 * assumed, by checking every campfire marker's axes against the ring's centre —
 * +Z scored a 0.997..1.002 dot product toward it at all five, +X scored ~0.05.
 *
 * Two things happen near a marker:
 *   1. The seat under it outlines (the renderer's post-process outline pass).
 *   2. The action button seats the character on it, facing the marker's +Z.
 *
 * The seats are InstancedMesh (6 logs, 4 beach chairs), and the outline pass
 * takes whole objects — selecting the InstancedMesh would light up every log on
 * the map at once. So each marker gets its own single-instance **proxy mesh**:
 * same geometry, baked to that one instance's world matrix, drawing nothing
 * (`colorWrite: false`) and existing only to give the outline pass one seat to
 * trace. It doubles as the mouse-click target.
 */

/** How far the player has to be for a seat to offer itself. */
const PROXIMITY = 1.5

/** Vertical gap between the seat surface and the hip bone once seated. */
const SIT_SINK = 0.02

/** Step taken away from the seat when standing, so you don't stand inside it. */
const STAND_STEP = 0.55

/** Seconds the stand-up slide takes. Matches the leg unfold so they read
 *  as one motion rather than a teleport followed by an animation. */
const EXIT_TIME = 0.42

/** Probe stride and reach when hunting for the seat's front edge. */
const STEP = 0.05
const MAX_PERCH = 0.20

/** How far behind the marker to look for the seat's high point. */
const BACK_SWEEP = 0.10

/** Slack kept behind the front edge so the perch doesn't look like a slip. */
const EDGE_MARGIN = 0.02

/** Reach, threshold and cap for reading a seat's backward tilt. */
const RECLINE_SWEEP = 0.45
const RECLINE_MIN = 0.02
const MAX_RECLINE = 0.45

/** Rise in ONE probe step that means "this is a backrest", not more seat. */
const BACKREST_STEP = 0.035

/** Above this tilt the seat is one you sink into, not one you perch on. */
const SETBACK_RECLINE = 0.14   // ~8°
const SETBACK = 0.12

/**
 * Hand-dialled forward nudge per marker, in metres, on top of whatever the
 * automatic perch works out.
 *
 * The geometry gets the character onto the right seat at the right height, but
 * how far along it a pose actually LOOKS right is a judgement call — so these
 * came from sliding each seat in the debug panel until it read well. Anything
 * not listed sits where the measurement puts it; the five campfire logs all
 * land on 0, which is the useful confirmation that the automatic pass is doing
 * its job and these are only corrections where furniture shape defeats it.
 */
const SEAT_NUDGE = {
    Empty005: 0.19,   // deckchairs — the markers sit well back on the fabric
    Empty006: 0.19,
    Empty007: 0.19,
    Empty008: 0.19,
    Empty009: 0.05,   // house porch edge
    Empty010: 0.02,   // interior sofa
    Empty011: 0.05
}

/** How much the outline proxy swells past the real seat. See _makeProxy(). */
const PROXY_SWELL = 1.015

/** Meshes that are never a seat — the ground, the water, helper volumes. */
const NOT_A_SEAT = /grass-floor|ground-floor|Colliders|Grass|agua|river|Field|Fringe|Umbrella|sit-proxy/i

export default class SitPoints {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.renderer = this.experience.renderer

        this.points = []
        this.resolved = false
        this.active = null        // the point currently sat on
        this.nearest = null       // the point currently offered

        this._hipOffset = null    // hip height above character.position, measured once
        this._exit = null         // in-progress stand-up slide
        this._prevMobileB = false
        this._prevPadA = false

        this._onKeyDown = (e) => {
            if (e.key === 'Enter') this._toggle()
            // Any movement key gets you up — being locked in a seat with no way
            // out but one specific key is the kind of thing players hate.
            else if (this.active && /^(w|a|s|d|W|A|S|D)$/.test(e.key)) this._stand()
            else if (this.active && e.key === 'Escape') this._stand()
        }
        window.addEventListener('keydown', this._onKeyDown)

        this._resolve()
    }

    // ─── Build ───────────────────────────────────────────────────────────

    _resolve() {
        const gltf = this.resources.items?.sitPointsModel
        if (!gltf?.scene) return false

        const root = gltf.scene
        root.updateWorldMatrix(true, true)

        const forward = new THREE.Vector3()
        const world = new THREE.Vector3()
        const quat = new THREE.Quaternion()

        const markers = []
        root.traverse((node) => {
            // Empties only: anything with geometry is not a marker.
            if (node.isMesh || node === root) return
            markers.push(node)
        })
        if (!markers.length) return false

        // The seats live in the DECORATIVE load batch, which lands well after
        // this component is constructed. Resolving greedily would take whatever
        // props happened to exist on the first frame and silently drop the rest,
        // so nothing is committed until every marker has found its seat — the
        // proxies built along the way are thrown out if the batch is short.
        const built = []
        for (const node of markers) {
            node.getWorldPosition(world)
            node.getWorldQuaternion(quat)
            forward.set(0, 0, 1).applyQuaternion(quat)

            const seat = this._findSeatUnder(world)
            if (!seat) {
                for (const b of built) {
                    this.scene.remove(b.proxy)
                    b.proxy.material.dispose()
                }
                return false
            }

            const yaw = Math.atan2(forward.x, forward.z)
            const perch = this._findPerch(seat.proxy, world, yaw, seat.topY)

            built.push({
                name: node.name,
                position: world.clone(),
                seatPos: perch.position,
                yaw,
                seatTopY: perch.topY,
                recline: perch.recline,
                tune: { fwd: SEAT_NUDGE[node.name] || 0, lat: 0, up: 0, yaw: 0 },
                proxy: seat.proxy,
                highlighted: false
            })
        }

        this.points = built
        this.resolved = true
        console.log(`🪑 SitPoints: ${this.points.length} asientos`)
        if (this.experience.debug?.active) this._setupGUI()
        return true
    }

    /**
     * Live nudging for seat placement, because where a seat "looks right" is a
     * judgement call that belongs to whoever placed the empties, not to a
     * heuristic. Slide the character around on the seat here, then read the
     * Blender coordinates off the console and move the empty to match.
     */
    _setupGUI() {
        const ui = this.experience.debug.ui
        if (!ui || this._gui) return

        const first = this.points[0]
        const state = {
            punto: first.name,
            adelante: first.tune?.fwd || 0,
            lateral: first.tune?.lat || 0,
            altura: first.tune?.up || 0,
            giro: (first.tune?.yaw || 0) * 180 / Math.PI
        }
        const current = () => this.points.find((p) => p.name === state.punto)

        const apply = () => {
            const p = current()
            if (!p) return
            p.tune = {
                fwd: state.adelante, lat: state.lateral,
                up: state.altura, yaw: state.giro * Math.PI / 180
            }
            if (this.active === p) { this._standInstant(); this._sit(p) }
        }

        const folder = ui.addFolder('Asientos (sit points)')
        folder.close()
        this._gui = folder

        folder.add(state, 'punto', this.points.map((p) => p.name))
            .name('Punto')
            .onChange(() => {
                const t = current()?.tune
                state.adelante = t?.fwd ?? 0
                state.lateral = t?.lat ?? 0
                state.altura = t?.up ?? 0
                state.giro = (t?.yaw ?? 0) * 180 / Math.PI
                folder.controllers.forEach((c) => c.updateDisplay())
            })
        folder.add(state, 'adelante', -0.6, 0.6, 0.01).name('Adelante / atrás').onChange(apply)
        folder.add(state, 'lateral', -0.6, 0.6, 0.01).name('Izquierda / derecha').onChange(apply)
        folder.add(state, 'altura', -0.3, 0.3, 0.005).name('Altura').onChange(apply)
        folder.add(state, 'giro', -180, 180, 1).name('Giro (°)').onChange(apply)

        folder.add({ sentar: () => { const p = current(); if (p) { this._standInstant(); this._sit(p) } } }, 'sentar')
            .name('Sentarse aquí')

        folder.add({
            copiar: () => {
                const p = current()
                if (!p) return
                const t = p.tune || { fwd: 0, lat: 0, up: 0, yaw: 0 }
                const yaw = p.yaw + t.yaw
                const x = p.position.x + Math.sin(yaw) * t.fwd + Math.cos(yaw) * t.lat
                const z = p.position.z + Math.cos(yaw) * t.fwd - Math.sin(yaw) * t.lat
                const y = p.position.y + t.up
                // Blender is Z-up: the export writes three (x, y, z) from
                // Blender (bx, by, bz) as (bx, bz, -by), so invert it here.
                console.log(
                    `🪑 ${p.name} → Blender  X ${x.toFixed(3)}  Y ${(-z).toFixed(3)}  Z ${y.toFixed(3)}` +
                    `  |  giro Z ${(yaw * 180 / Math.PI).toFixed(1)}°`
                )
            }
        }, 'copiar').name('Coordenadas para Blender →consola')
    }

    /** Stand with no easing — used when the GUI re-seats mid-preview. */
    _standInstant() {
        const character = this.experience.world?.character
        if (!character) return
        this._exit = null
        this.active = null
        character.setSitting(false)
        character.movementLocked = false
    }

    /**
     * Ray straight down from just above the marker to find the seat, then build
     * the outline proxy for the exact instance that was hit.
     *
     * The ray starts only a little above the marker on purpose: from higher up
     * the beach markers hit the parasol canopy instead of the chair beneath it.
     */
    _findSeatUnder(worldPos) {
        const targets = []
        this.scene.traverse((o) => {
            if (o.isMesh && o.visible && !NOT_A_SEAT.test(o.name || '')) targets.push(o)
        })

        const ray = new THREE.Raycaster(
            new THREE.Vector3(worldPos.x, worldPos.y + 0.4, worldPos.z),
            new THREE.Vector3(0, -1, 0),
            0.02,
            2.5
        )
        const hit = ray.intersectObjects(targets, false)[0]
        if (!hit) return null

        return {
            topY: hit.point.y,
            hitObject: hit.object,
            proxy: this._makeProxy(hit.object, hit.instanceId)
        }
    }

    /**
     * Decide exactly where on the seat the hips go, how high, and how far the
     * body should lean — all measured off the seat itself.
     *
     * A marker dropped by eye is close but rarely exact, and "close" fails in
     * two opposite ways depending on the furniture:
     *
     *   - A LOG is barely 0.13 deep in front of the marker. This character is
     *     chibi (thigh 0.10, shin 0.08 against a ~0.99 total height), so from
     *     the middle of a log the whole leg ends up inside the wood. It has to
     *     shuffle FORWARD to the edge for the legs to hang free.
     *   - A DECKCHAIR is the reverse: a long sloped sheet whose marker sits near
     *     the front lip, so perching further forward leaves the character
     *     balanced off the end of it. It has to settle BACK into the seat, and
     *     lean with the fabric.
     *
     * So the slope decides the direction: flat seats perch forward, reclined
     * seats sink back. Everything below is probed against the proxy, meaning
     * the neighbouring log or chair can never stand in for this one.
     */
    _findPerch(proxy, worldPos, yaw, fallbackTopY) {
        const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
        const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0.02, 2.5)
        const probe = new THREE.Vector3()
        const originY = worldPos.y + 0.4

        const sample = (d) => {
            probe.copy(worldPos).addScaledVector(dir, d)
            ray.ray.origin.set(probe.x, originY, probe.z)
            return ray.intersectObject(proxy, false)[0] || null
        }

        // How far the SEAT tips back, from the rise behind the marker. A log
        // curves down behind the sit point, so it scores 0 and stays untouched.
        //
        // The sweep stops the moment one step jumps: a sofa is a flat cushion
        // with a backrest standing up off the back of it, and running the sweep
        // straight up that backrest reported a 24° "slope" for a seat measured
        // dead flat at 0.487 over its whole length — which then leaned the
        // player back into the upholstery. A deckchair has no such step, its
        // fabric curves continuously, so it still reads as reclined.
        let rise = 0
        let behind = 0
        let prevY = fallbackTopY
        for (let d = -STEP; d >= -RECLINE_SWEEP; d -= STEP) {
            const hit = sample(d)
            if (!hit) break
            if (hit.point.y - prevY > BACKREST_STEP) break
            prevY = hit.point.y
            behind = -d
            rise = Math.max(rise, hit.point.y - fallbackTopY)
        }
        const recline = (behind > 0 && rise > RECLINE_MIN)
            ? Math.min(MAX_RECLINE, Math.atan2(rise, behind))
            : 0

        let offset
        if (recline > SETBACK_RECLINE) {
            // Reclined: sink back into the seat, but never further than the
            // fabric actually reaches.
            offset = -Math.min(SETBACK, behind)
        } else {
            // Flat: perch at the front edge so the legs clear it.
            let furthest = 0
            for (let d = STEP; d <= MAX_PERCH; d += STEP) {
                if (!sample(d)) break
                furthest = d
            }
            offset = Math.max(0, furthest - EDGE_MARGIN)
        }

        // Height at the chosen spot, allowing a short reach for the local high
        // point — a marker dropped on a log's curved flank would otherwise bury
        // the hips a few centimetres into the wood.
        let topY = fallbackTopY
        const from = Math.min(0, offset) - BACK_SWEEP
        const to = Math.max(0, offset)
        for (let d = from; d <= to + 1e-6; d += STEP) {
            const hit = sample(d)
            if (hit && hit.point.y > topY) topY = hit.point.y
        }

        return {
            position: worldPos.clone().addScaledVector(dir, offset),
            topY,
            recline
        }
    }

    /** Single-instance stand-in for one seat, used only by the outline pass. */
    _makeProxy(source, instanceId) {
        const proxy = new THREE.Mesh(
            source.geometry,
            // Draws nothing at all: no colour, no depth. The outline pass renders
            // selected objects with its own material, so an invisible proxy is
            // still enough to trace an edge around, and writing no depth keeps it
            // from punching a colourless hole through the seat behind it.
            new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
        )
        proxy.name = `sit-proxy:${source.name}`
        proxy.castShadow = false
        proxy.receiveShadow = false
        proxy.frustumCulled = true
        proxy.matrixAutoUpdate = false

        source.updateWorldMatrix(true, false)
        proxy.matrix.copy(source.matrixWorld)
        if (source.isInstancedMesh && instanceId !== undefined) {
            const local = new THREE.Matrix4()
            source.getMatrixAt(instanceId, local)
            proxy.matrix.multiply(local)
        }

        // Inflate a hair about the geometry's own centre.
        //
        // Sitting EXACTLY on the real seat is what made the outline glitch: the
        // pass classifies each pixel as visible or hidden edge by comparing the
        // selected object's depth against the scene's, and two surfaces at
        // identical depth make that comparison a coin toss decided by float
        // noise. The result flickered between a clean rim and a filled halo.
        // A 1.5% swell puts the proxy unambiguously in front, costs nothing
        // visually (it draws no pixels), and reads as a rim rather than a seam.
        source.geometry.computeBoundingBox()
        const c = source.geometry.boundingBox.getCenter(new THREE.Vector3())
        proxy.matrix.multiply(
            new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)
                .multiply(new THREE.Matrix4().makeScale(PROXY_SWELL, PROXY_SWELL, PROXY_SWELL))
                .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z))
        )

        proxy.matrix.decompose(proxy.position, proxy.quaternion, proxy.scale)
        proxy.updateMatrixWorld(true)

        this.scene.add(proxy)
        return proxy
    }

    // ─── Raycaster callbacks (mouse) ─────────────────────────────────────

    onHover() { document.body.style.cursor = 'pointer' }
    onUnhover() { document.body.style.cursor = '' }
    onClick() { this._toggle() }

    // ─── Sit / stand ─────────────────────────────────────────────────────

    _blocked() {
        if (document.querySelector('.fz-modal-overlay.is-open')) return true
        const world = this.experience.world
        if (world?.frisbeeMinigame && world.frisbeeMinigame.state !== 'idle') return true
        if (world?.beachMinigame && world.beachMinigame.state !== 'idle') return true
        return false
    }

    _toggle() {
        if (this.active) this._stand()
        else if (this.nearest) this._sit(this.nearest)
    }

    /**
     * Hip height above `character.position`, measured once off the live rig.
     *
     * The seated pose only rotates the leg bones, so the hip bone keeps its
     * standing height relative to the character origin — which means this one
     * measurement is enough to drop the character until its hips rest exactly on
     * the seat, whatever that seat's height is. Hard-coding an offset instead
     * would put the player through a log and floating over a beach chair.
     */
    _hipHeight(character) {
        if (this._hipOffset !== null) return this._hipOffset
        let hips = null
        character.model?.traverse((c) => {
            if (!hips && c.isBone && c.name === 'mixamorigHips') hips = c
        })
        if (!hips) return null
        const v = new THREE.Vector3()
        hips.getWorldPosition(v)
        this._hipOffset = v.y - character.position.y
        return this._hipOffset
    }

    _sit(point) {
        if (this._blocked()) return
        const character = this.experience.world?.character
        if (!character || character.movementLocked) return

        const hipOffset = this._hipHeight(character)
        if (hipOffset === null) return

        // teleportTo() takes the FLOOR height and adds the capsule offset itself,
        // so work backwards from where the hips have to end up.
        const tune = point.tune
        const yaw = point.yaw + (tune?.yaw || 0)
        const targetY = point.seatTopY + SIT_SINK + (tune?.up || 0) - hipOffset
        const groundY = targetY - character.capsuleCenterY - 0.15

        const seat = point.seatPos || point.position
        let x = seat.x
        let z = seat.z
        if (tune) {
            x += Math.sin(yaw) * tune.fwd + Math.cos(yaw) * tune.lat
            z += Math.cos(yaw) * tune.fwd - Math.sin(yaw) * tune.lat
        }

        character.teleportTo(x, groundY, z, yaw)
        character.setSitting(true, point.recline)
        this.active = point
    }

    /**
     * Get up — as a short move, not a jump cut.
     *
     * Standing used to write the exit position in one frame, which teleported the
     * player half a metre and read as a glitch. Now the same displacement is
     * eased over EXIT_TIME while the legs unfold on their own blend, so the two
     * happen together and it looks like standing up. Movement stays locked for
     * the duration or the player's own input would fight the slide; physics takes
     * back over the instant it lands.
     */
    _stand() {
        const character = this.experience.world?.character
        if (!character || !this.active) return

        const point = this.active
        this.active = null
        character.setSitting(false)
        character.movementLocked = true    // released when the exit finishes

        const seat = point.seatPos || point.position
        this._exit = {
            from: character.position.clone(),
            to: new THREE.Vector3(
                seat.x + Math.sin(point.yaw) * STAND_STEP,
                point.seatTopY + character.capsuleCenterY,
                seat.z + Math.cos(point.yaw) * STAND_STEP
            ),
            t: 0
        }
    }

    /** Drive the easing started by _stand(). */
    _updateExit(character, dt) {
        const exit = this._exit
        exit.t = Math.min(1, exit.t + dt / EXIT_TIME)

        // Ease-out: quickest at the push off the seat, settling into the stand.
        const e = 1 - Math.pow(1 - exit.t, 3)
        character.position.lerpVectors(exit.from, exit.to, e)
        character.verticalVelocity = 0
        character.rigidBody?.setTranslation({
            x: character.position.x, y: character.position.y, z: character.position.z
        }, true)
        character.container.position.copy(character.position)
        character.previousPosition.copy(character.position)

        if (exit.t >= 1) {
            this._exit = null
            character.movementLocked = false
        }
    }

    // ─── Frame ───────────────────────────────────────────────────────────

    _setHighlight(point, on) {
        if (!point || point.highlighted === on) return
        point.highlighted = on
        if (on) this.renderer?.addOutlinedObject?.(point.proxy)
        else this.renderer?.removeOutlinedObject?.(point.proxy)
    }

    update() {
        if (!this.resolved) { if (!this._resolve()) return }

        const character = this.experience.world?.character
        if (!character) return

        if (this._exit) {
            this._updateExit(character, Math.min(this.experience.time.delta * 0.001, 0.05))
        }

        // Exactly one seat may glow: a cluster of five logs all lit at once says
        // "something is here", not "sit on THIS one". While seated it is the one
        // being sat on; otherwise the nearest in range.
        //
        // Resolved by sweeping every point each frame rather than by tracking
        // changes. The bookkeeping version leaked — hopping straight from one
        // seat to another (which the debug panel does on every slider drag)
        // never cleared the old one, and they piled up in the outline's
        // selection until several seats glowed at once. Twelve early-outs a
        // frame is nothing, and it cannot drift out of sync.
        let best = this.active
        if (!best) {
            let bestDist = PROXIMITY
            for (const point of this.points) {
                const d = point.position.distanceTo(character.position)
                if (d < bestDist) { bestDist = d; best = point }
            }
        }
        this.nearest = best
        for (const point of this.points) this._setHighlight(point, point === best)

        const mb = this.experience.mobileControls?.getActions?.().button2 === true
        if (mb && !this._prevMobileB) this._toggle()
        this._prevMobileB = mb

        const pa = this.experience.gamepad?.getActions?.().button2 === true
        if (pa && !this._prevPadA) this._toggle()
        this._prevPadA = pa
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown)
        for (const point of this.points) {
            this.renderer?.removeOutlinedObject?.(point.proxy)
            this.scene.remove(point.proxy)
            point.proxy.material.dispose()
        }
        this.points.length = 0
    }
}
