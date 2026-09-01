import * as THREE from 'three'
import { positionLocal, mix, smoothstep, vec3, float, max } from 'three/tsl'
import Experience from '../Experience.js'
import { seatOwnsInteract } from './seated.js'
import { dayNightLitTint } from './DayNight.js'
import { createStylizedPropNodeMaterial } from './scene/StylizedPropMaterial.js'

/**
 * Ball — a kickable football living by the carts/goal play area.
 *
 *   - Visual: stylized sphere (white with soft dark patches, spins with the
 *     physics body). One mesh.
 *   - Physics: Rapier DYNAMIC ball (bounce + roll + sleep when idle).
 *   - Kick: within range the ball gets the white outline; interacting turns
 *     the character to face it, plays the procedural kick (Character.playKick)
 *     and applies the impulse right at the strike frame.
 *   - Goal: when the ball enters the GoalPost trigger → confetti burst
 *     (once per entry).
 *
 * Spawn: just off the LEFT side of the bridge (resolved from the bridge's
 * bbox when it streams in; tunable in the debug GUI).
 */
const RADIUS = 0.16

export default class Ball {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.renderer = this.experience.renderer
        this.physics = this.experience.world.physics
        this.debug = this.experience.debug

        this.position = new THREE.Vector3()
        this.spawnOffset = new THREE.Vector2(-2.4, 0.6) // from the bridge's west edge (x), center z
        this.kickRadius = 0.9
        this.kickPower = 0.14       // horizontal impulse
        this.kickLift = 0.06        // vertical impulse
        this.isNear = false
        this.isHovered = false
        this.isHighlighted = false

        this._spawned = false
        this._kickTimer = -1
        this._impulseDone = false
        this._inGoal = false
        this._prevMobileB = false
        this._prevPadA = false

        this._buildMesh()

        this._onKeyDown = (e) => { if (e.key === 'Enter') this._tryKick() }
        window.addEventListener('keydown', this._onKeyDown)

        if (this.debug?.active) this._setDebug()
    }

    _buildMesh() {
        const geometry = new THREE.SphereGeometry(RADIUS, 20, 14)

        // Classic football pattern: the 12 black pentagons of a real ball sit
        // at the vertices of an ICOSAHEDRON. One black spot per vertex
        // direction (object space → the pattern spins with the ball).
        const PHI = (1 + Math.sqrt(5)) / 2
        const raw = [
            [0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
            [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
            [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
        ]
        const n = positionLocal.normalize()
        let field = float(-1.0)
        for (const [x, y, z] of raw) {
            const len = Math.hypot(x, y, z)
            field = max(field, n.dot(vec3(x / len, y / len, z / len)))
        }
        // Spot edge between ~31° and ~26° from each vertex → crisp pentagons.
        // Inverted colourway: dark ball, white pentagons.
        const patches = smoothstep(0.855, 0.9, field)
        const base = mix(vec3(0.12, 0.13, 0.16), vec3(0.96, 0.96, 0.95), patches)

        const material = new THREE.MeshLambertNodeMaterial()
        material.colorNode = base.mul(dayNightLitTint)

        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.castShadow = true
        this.mesh.receiveShadow = false
        this.mesh.visible = false
        this.mesh.userData.interactiveObject = {
            position: this.position,
            proximityRadius: this.kickRadius,
            onHover: () => {
                if (this.isHovered) return
                this.isHovered = true
                this._refreshHighlight()
                document.body.style.cursor = 'pointer'
            },
            onUnhover: () => {
                if (!this.isHovered) return
                this.isHovered = false
                this._refreshHighlight()
                document.body.style.cursor = ''
            },
            onClick: () => this._tryKick()
        }
        this.scene.add(this.mesh)
    }

    // ─── Spawn (bridge left side; lazy — bridge is a decorative asset) ───
    _trySpawn() {
        if (this._spawned) return
        if (!this.physics?.world) return
        const bridge = this.experience.world?.patioScene?.pieces?.bridge?.root
        if (!bridge) return

        bridge.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(bridge)
        if (!isFinite(box.min.x)) return

        const x = box.min.x + this.spawnOffset.x
        const z = (box.min.z + box.max.z) * 0.5 + this.spawnOffset.y
        const y = box.max.y + 0.6

        const RAPIER = this.physics.RAPIER
        const rbDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(x, y, z)
            .setLinearDamping(0.5)
            .setAngularDamping(0.7)
            .setCcdEnabled(true)
        this.body = this.physics.world.createRigidBody(rbDesc)
        const colDesc = RAPIER.ColliderDesc.ball(RADIUS)
            .setRestitution(0.5)
            .setFriction(0.8)
        this.physics.world.createCollider(colDesc, this.body)

        this.mesh.visible = true
        this._spawned = true
        this.experience.world?.raycaster?.addInteractiveObject({ mesh: this.mesh })
    }

    // ─── Kick ────────────────────────────────────────────────────────────
    _tryKick() {
        if (!this._spawned || this._kickTimer >= 0) return
        if (!(this.isNear || (this.isHovered && this.isNear))) return
        if (document.querySelector('.fz-modal-overlay.is-open')) return
        if (seatOwnsInteract(this.position)) return  // the seat you are at wins the key
        const mg = this.experience.world?.frisbeeMinigame
        if (mg && mg.state !== 'idle') return
        const character = this.experience.world?.character
        if (!character || character.movementLocked || character.isKicking) return

        // Face the ball and start the procedural kick.
        const dx = this.position.x - character.position.x
        const dz = this.position.z - character.position.z
        character.container.rotation.y = Math.atan2(dx, dz)
        character.movementLocked = true
        character.playKick()

        this._kickTimer = 0
        this._impulseDone = false
        this._kickDir = new THREE.Vector3(dx, 0, dz).normalize()
    }

    _updateKick(dt) {
        if (this._kickTimer < 0) return
        this._kickTimer += dt

        // Impulse right at the strike frame of the animation (~0.31s).
        if (!this._impulseDone && this._kickTimer >= 0.31) {
            this._impulseDone = true
            if (this.body) {
                this.body.applyImpulse({
                    x: this._kickDir.x * this.kickPower,
                    y: this.kickLift,
                    z: this._kickDir.z * this.kickPower
                }, true)
                this.body.applyTorqueImpulse({
                    x: this._kickDir.z * 0.004,
                    y: 0,
                    z: -this._kickDir.x * 0.004
                }, true)
            }
        }

        if (this._kickTimer >= 0.65) {
            this._kickTimer = -1
            const character = this.experience.world?.character
            if (character) character.movementLocked = false
        }
    }

    _refreshHighlight() {
        const should = this.isNear || this.isHovered
        if (should === this.isHighlighted) return
        this.isHighlighted = should
        if (should) this.renderer.addOutlinedObject(this.mesh)
        else this.renderer.removeOutlinedObject(this.mesh)
    }

    /**
     * Swap the procedural football for the authored model once it streams in.
     *
     * Its geometry is QUANTIZED (positions are normalised int16), so it can be
     * neither transformed nor re-centred in place — writing floats back into
     * that buffer destroys it. We rebuild a plain float copy instead, recentre
     * it (the model is authored resting ON the ground, not around its origin)
     * and normalise it to a unit sphere so the existing RADIUS still rules.
     */
    _trySoccerSkin() {
        if (this._skinned) return
        const gltf = this.experience.resources?.items?.soccerBallModel
        if (!gltf?.scene) return

        let src = null
        gltf.scene.traverse((c) => { if (!src && c.isMesh) src = c })
        if (!src?.geometry?.attributes?.position) { this._skinned = true; return }

        const pos = src.geometry.attributes.position
        const nrm = src.geometry.attributes.normal
        const uvA = src.geometry.attributes.uv

        // getX/getY/getZ denormalise for us — read through them, never the raw array.
        const n = pos.count
        const p = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) {
            p[i * 3] = pos.getX(i); p[i * 3 + 1] = pos.getY(i); p[i * 3 + 2] = pos.getZ(i)
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
        if (nrm) {
            const nn = new Float32Array(n * 3)
            for (let i = 0; i < n; i++) {
                nn[i * 3] = nrm.getX(i); nn[i * 3 + 1] = nrm.getY(i); nn[i * 3 + 2] = nrm.getZ(i)
            }
            geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3))
        }
        if (uvA) {
            const uu = new Float32Array(n * 2)
            for (let i = 0; i < n; i++) { uu[i * 2] = uvA.getX(i); uu[i * 2 + 1] = uvA.getY(i) }
            geo.setAttribute('uv', new THREE.BufferAttribute(uu, 2))
        }
        if (src.geometry.index) geo.setIndex(src.geometry.index.clone())

        geo.computeBoundingSphere()
        const c = geo.boundingSphere.center
        geo.translate(-c.x, -c.y, -c.z)          // safe: plain floats now
        geo.computeBoundingSphere()
        const r = geo.boundingSphere.radius || 1
        geo.scale(1 / r, 1 / r, 1 / r)           // unit sphere → RADIUS drives the size
        geo.computeBoundingSphere()

        const map = src.material?.map || null
        this.mesh.geometry?.dispose()
        this.mesh.material?.dispose()
        this.mesh.geometry = geo
        this.mesh.material = createStylizedPropNodeMaterial({ map, gloss: 0.4, shininess: 24 })
        this.mesh.scale.setScalar(RADIUS)

        this._skinned = true
    }

    // ─── Per-frame ───────────────────────────────────────────────────────
    update() {
        this._trySoccerSkin()
        if (!this._spawned) { this._trySpawn(); return }
        const dt = this.experience.time.delta * 0.001

        // Sync visual ← physics
        if (this.body) {
            const t = this.body.translation()
            this.position.set(t.x, t.y, t.z)
            this.mesh.position.copy(this.position)
            const r = this.body.rotation()
            this.mesh.quaternion.set(r.x, r.y, r.z, r.w)

            // Safety net: fell through the world → respawn above the play area.
            if (t.y < -12) {
                this.body.setTranslation({ x: this.position.x, y: 2, z: this.position.z }, true)
                this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
            }
        }

        this._updateKick(dt)

        // Proximity outline + goal check
        const character = this.experience.world?.character
        if (character) {
            const near = this.position.distanceTo(character.position) < this.kickRadius
            if (near !== this.isNear) { this.isNear = near; this._refreshHighlight() }
        }

        const goal = this.experience.world?.goalPost
        if (goal?.ready) {
            const inside = goal.containsPoint(this.position)
            if (inside && !this._inGoal) {
                this._inGoal = true
                const burstAt = this.position.clone()
                burstAt.y += 0.5
                this.experience.world?.confetti?.trigger(burstAt)
            } else if (!inside) {
                this._inGoal = false
            }
        }

        // Mobile action button + gamepad A (rising edge).
        const mb = this.experience.mobileControls?.getActions?.().button2 === true
        if (mb && !this._prevMobileB) this._tryKick()
        this._prevMobileB = mb

        const pa = this.experience.gamepad?.getActions?.().button2 === true
        if (pa && !this._prevPadA) this._tryKick()
        this._prevPadA = pa
    }

    _setDebug() {
        const f = this.debug.ui.addFolder('⚽ Ball')
        f.close()
        f.add(this, 'kickPower', 0.05, 1.2, 0.01).name('Kick power')
        f.add(this, 'kickLift', 0.0, 0.5, 0.01).name('Kick lift')
        f.add(this, 'kickRadius', 0.6, 3.0, 0.05).name('Kick range')
        f.add(this.spawnOffset, 'x', -8, 8, 0.1).name('Spawn offset X')
        f.add(this.spawnOffset, 'y', -8, 8, 0.1).name('Spawn offset Z')
        f.add({
            respawn: () => {
                if (!this.body) return
                this._spawned = false
                this.physics.world.removeRigidBody(this.body)
                this.body = null
                this.mesh.visible = false
                this._trySpawn()
            }
        }, 'respawn').name('Respawn (apply offsets)')
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown)
        this.renderer?.removeOutlinedObject?.(this.mesh)
        if (this.body && this.physics?.world) this.physics.world.removeRigidBody(this.body)
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh.geometry?.dispose()
            this.mesh.material?.dispose()
        }
    }
}
