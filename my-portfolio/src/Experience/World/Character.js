import * as THREE from 'three'
import Experience from '../Experience.js'

/**
 * Physical key positions that drive the character, mapped to the four
 * directions the movement code already speaks. Keyed by KeyboardEvent.code, so
 * it is the same key under the same finger on every layout.
 */
const MOVEMENT_KEYS = {
    KeyW: 'w', ArrowUp: 'w',
    KeyS: 's', ArrowDown: 's',
    KeyA: 'a', ArrowLeft: 'a',
    KeyD: 'd', ArrowRight: 'd',
    ShiftLeft: 'shift', ShiftRight: 'shift',
}


/**
 * Opening spawn, on the dirt in front of the house.
 *
 * Nudged right of the world origin rather than sitting on it — a small
 * framing choice, and one line to re-tune.
 */
const SPAWN_X = 1.2
const SPAWN_Z = 0


// Seated leg pose, in radians, added on top of the idle clip.
//
// Measured against the rig rather than guessed, because this character is chibi
// and the textbook 90°/90° office-chair pose is wrong for it: from the hip the
// whole leg is only 0.234 long (thigh 0.101, shin 0.082, foot 0.081) against a
// ~0.99 total height, so on a log whose top sits 0.27 above the ground the feet
// cannot reach the floor at all. Folding to 90° just sticks both legs straight
// out in mid-air. What reads right is a gentler fold with the legs DANGLING —
// which is also what a small child on a log actually looks like.
//
// The knee sign is the counter-intuitive one: positive X on the shin lifts the
// foot toward the thigh (that is the fold playKick() winds up with), so seating
// needs it negative to drop the shin down.
const SIT_THIGH = 1.00   // hip flexion — leg swings forward off the seat
const SIT_SHIN = -0.70   // knee flexion — shin hangs down from the knee
const SIT_SPLAY = 0.08   // slight outward knee spread; parallel legs look rigid
const SIT_ANKLE = 0.18   // tips the toes down, the way a dangling foot rests

// Per-radian-of-recline corrections. On a flat seat the legs dangle; on a
// sloped one — a deckchair, a sofa — you do NOT dangle them, you stretch them
// out along the seat. So the more the seat tips back, the further the leg
// extends and the straighter the knee goes. At the deckchair's measured 18°
// this lands on thigh 1.35 / shin -0.15, i.e. legs lying up the fabric.
const RECLINE_EXTEND_THIGH = 1.15
const RECLINE_STRAIGHTEN_SHIN = 1.80

export default class Character {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.physics = this.experience.world.physics
        this.debug = this.experience.debug

        // Capsule dimensions
        this.capsuleHalfHeight = 0.5
        this.capsuleRadius = 0.32
        this.capsuleCenterY = this.capsuleHalfHeight + this.capsuleRadius
        // Small lift above the capsule bottom so feet aren’t clipped by the terrain shader.
        this.spawnOffsetY = 0.32

        // Where you are standing when the world opens.
        //
        // Screen-right is +X here: the follow camera sits at character + (0,
        // 2.5, 7) looking back down −Z with +Y up, so its right vector is +X —
        // which is also why the joystick's own mapping a few hundred lines down
        // reads `dir.x += stick.x` with no camera basis to rotate through.
        this.position = new THREE.Vector3(
            SPAWN_X, this.capsuleCenterY + this.spawnOffsetY, SPAWN_Z)
        this.previousPosition = this.position.clone()
        this.gravity = -9.81
        this.verticalVelocity = 0
        this.isGrounded = false

        // Movement tuning
        // 1.3 read as a stroll to more than one player — slower than it
        // looks in the video of it. Sprint is still there for crossing the
        // island; this is about the default pace not feeling like wading.
        this.walkSpeed = 1.65
        // Up with the walk, not just because. At 1.3/2.8 sprinting was 2.15x
        // walking; leaving it at 2.8 while walking went to 1.65 would have cut
        // that to 1.70 and made holding shift feel like it barely did anything.
        this.runSpeed = 3.1
        this.rotationSpeed = 12.0
        // Playback speed of the locomotion clips (they read a touch slow at 1).
        this.walkAnimSpeed = 1.15
        this.runAnimSpeed = 1.08

        // Reused input vector — no per-frame allocation (GC hitches).
        this._dir = new THREE.Vector3()

        // State machine: idle | walking | running | resting
        this.state = 'idle'
        // Seconds the character has stood still (drives idle effects like MusicNotes).
        // Reset to 0 the moment the player moves, throws, or a minigame locks movement.
        this.idleTime = 0
        this.runDuration = 0
        this.restAfterRunThreshold = 2.0
        this.isSprinting = false
        // Idle (happy) animation plays slightly faster while humming/singing.
        this.singIdleSpeed = 1.18

        // Footprints: stamped every stride while walking on dirt (see World).
        this.strideWalk = 0.7         // metres between prints when walking
        this.strideRun = 1.15         // metres between prints when sprinting
        this.strideStartDelay = 0     // extra metres before the FIRST print after stopping
        this.footSpacing = 0.04       // lateral offset of each print from the centreline (±)
        this._strideAcc = 0
        this._strideFresh = true
        this._footSide = 1

        // Blinking
        this.blinkTimer = 0
        this.nextBlinkTime = this._randomBlinkInterval()
        this.isBlinking = false
        this.blinkDuration = 0.12

        // Atlas UV offsets (2x2 grid). repeat is (0.5, 0.5).
        // V axis is flipped (KTX2 flipY=false), so v=0 is the TOP row:
        //   (0,0)=top-left  (0.5,0)=top-right  (0,0.5)=bottom-left  (0.5,0.5)=bottom-right
        this._uvOpen = new THREE.Vector2(0, 0)          // top-left:    normal, eyes open
        this._uvClosed = new THREE.Vector2(0.5, 0)      // top-right:   normal, eyes closed (blink)
        this._uvSingOpen = new THREE.Vector2(0, 0.5)    // bottom-left: singing, eyes open
        this._uvSingClosed = new THREE.Vector2(0.5, 0.5)// bottom-right:singing, eyes closed (blink)

        // Input -- see _onKeyChange for why this is keyed by physical position
        this.keys = { w: false, a: false, s: false, d: false, shift: false }

        // Beach minigame: restrict movement to a single world axis. When set to
        // { z, minX, maxX, faceYaw, inputSign } the character only walks left /
        // right along X, keeps Z pinned, and faces the camera instead of its
        // direction of travel. Null = normal free roaming.
        this.planarLock = null

        // Throw support
        this.movementLocked = false
        this.throwPaused = false
        this.throwPauseTime = null
        this.animationPaused = false // frozen (e.g. tutorial modal open mid-throw)

        // Sitting: a procedural leg pose layered over the idle clip. There is no
        // sit animation in the rig, so `isSitting` drives `_sitBlend` (0..1) and
        // _applySitPose() folds the legs by that amount every frame.
        this.isSitting = false
        this._sitBlend = 0
        this._sitBones = null
        this._sitBind = null
        this._sitRecline = 0

        this.setModel()
        this.setAnimation()
        this.setInput()

        this._schedulePhysicsInit()

        if (this.debug.active) this.setDebug()
    }

    _randomBlinkInterval() {
        return 2.0 + Math.random() * 4.0
    }

    // ─── Model & Atlas ──────────────────────────────────────────────────

    setModel() {
        this.resource = this.resources.items.humanModel

        this.container = new THREE.Group()
        this.container.name = 'CharacterContainer'
        this.container.position.copy(this.position)

        this.model = this.resource.scene
        this.model.name = 'CharacterModel'
        this.model.scale.set(0.85, 0.85, 0.85)

        const box = new THREE.Box3().setFromObject(this.model)
        // Small lift to prevent feet sinking visually, scaled with model scale.
        const modelOffsetY = -this.capsuleCenterY - box.min.y + 0.07 * this.model.scale.y
        this.model.position.set(0, modelOffsetY, 0)

        this._applyAtlas()

        this.container.add(this.model)
        this.scene.add(this.container)
    }

    /** World-space Y of the character's feet (ground level). */
    get groundY() { return this.container.position.y - this.capsuleCenterY }

    getRightHandBone() {
        if (this._rightHandBone) return this._rightHandBone
        this.model.traverse((child) => {
            if (child.isBone && child.name === 'mixamorigRightHand') {
                this._rightHandBone = child
            }
        })
        return this._rightHandBone
    }

    _applyAtlas() {
        const atlas = this.resources.items.humanAtlas
        if (!atlas) return

        this.atlas = atlas
        this.atlas.repeat.set(0.5, 0.5)
        this.atlas.offset.copy(this._uvOpen)

        this.model.traverse((child) => {
            if (!child.isMesh) return
            child.castShadow = true
            child.receiveShadow = true

            child.material = new THREE.MeshLambertMaterial({
                map: this.atlas
            })
        })
    }

    // ─── Animations ─────────────────────────────────────────────────────

    setAnimation() {
        // Capture the Mixamo bind pose BEFORE the mixer writes idle into the
        // legs/hips. While seated we overwrite those bones from this rest + a
        // sit offset, so the idle clip's loop hitch cannot pop the pose.
        this._cacheSitBind()

        const clips = this.resource?.animations
        if (!clips?.length) return

        this.mixer = new THREE.AnimationMixer(this.model)
        this.actions = {}

        for (const clip of clips) {
            const n = clip.name.toLowerCase()
            if (n.includes('freesby') || n.includes('frisbee') || n.includes('throw')) {
                this.actions.throw = this.mixer.clipAction(clip)
                this.throwClipDuration = clip.duration
            } else if (n.includes('walk')) this.actions.walk = this.mixer.clipAction(clip)
            else if (n.includes('happy')) this.actions.happy = this.mixer.clipAction(clip)
            else if (n.includes('run')) this.actions.running = this.mixer.clipAction(clip)
            else if (n.includes('rest')) this.actions.rest = this.mixer.clipAction(clip)
        }

        for (const [key, action] of Object.entries(this.actions)) {
            if (key === 'rest' || key === 'throw') {
                action.setLoop(THREE.LoopOnce)
                action.clampWhenFinished = true
            } else {
                action.setLoop(THREE.LoopRepeat)
            }
            action.play()
            action.setEffectiveWeight(0)
        }

        this.activeAction = this.actions.happy ?? Object.values(this.actions)[0]
        if (this.activeAction) this.activeAction.setEffectiveWeight(1)

        this.mixer.addEventListener('finished', (e) => {
            if (e.action === this.actions.rest) this._transitionTo('idle')
        })
    }

    _transitionTo(newState) {
        const map = { idle: 'happy', walking: 'walk', running: 'running', resting: 'rest' }
        const newAction = this.actions?.[map[newState]]
        if (!newAction) return
        if (newAction === this.activeAction) { this.state = newState; return }

        const fade = newState === 'resting' ? 0.4 : 0.25
        newAction.reset()
        const animScale = newState === 'walking' ? this.walkAnimSpeed
            : newState === 'running' ? this.runAnimSpeed : 1
        newAction.setEffectiveTimeScale(animScale)
        newAction.setEffectiveWeight(1)
        if (this.activeAction) newAction.crossFadeFrom(this.activeAction, fade, true)

        this.activeAction = newAction
        this.state = newState
    }

    // ─── Input ──────────────────────────────────────────────────────────

    setInput() {
        this._onKeyDownBound = (e) => this._onKeyChange(e, true)
        this._onKeyUpBound = (e) => this._onKeyChange(e, false)
        window.addEventListener('keydown', this._onKeyDownBound)
        window.addEventListener('keyup', this._onKeyUpBound)
    }

    _onKeyChange(event, pressed) {
        // event.code first, and this is not a detail: it reports the PHYSICAL
        // key, while event.key reports the letter the layout produces. On
        // AZERTY the key where W sits produces 'z', on Dvorak it produces ','
        // -- so matching on the letter meant that anyone not on QWERTY pressed
        // the key under their finger and the character did not move. They had
        // no way of knowing the site was not simply broken.
        //
        // Arrows are in the same table because they cost nothing and they are
        // the first thing a lot of people try.
        const mapped = MOVEMENT_KEYS[event.code]
        if (mapped) {
            this.keys[mapped] = pressed

            // Arrows scroll the page as well as walking. Suppress that -- but
            // never while someone is typing, or entering a name into the
            // leaderboard would stop working.
            const el = event.target
            const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
                || el.isContentEditable)
            if (!typing && event.code.startsWith('Arrow')) event.preventDefault()
            return
        }

        // Fallback for anything that reports no code -- some virtual keyboards
        // and remote-desktop clients send key only. QWERTY letters still work.
        const key = event.key?.toLowerCase()
        if (key && key in this.keys) this.keys[key] = pressed
    }

    // ─── Physics ────────────────────────────────────────────────────────

    /**
     * Character controller must not start until patio static colliders exist;
     * otherwise the capsule spawns into partial geometry, sinks, and horizontal
     * slide hits as zero (appears “stuck”).
     */
    _schedulePhysicsInit() {
        const world = this.experience.world
        if (world?.patioScene) {
            const start = () => {
                if (this.rigidBody) return
                this.setPhysics()
            }
            this.resources.on('patioCollidersReady', start)
            setTimeout(() => {
                if (!this.rigidBody) {
                    console.warn('Character: patioCollidersReady timeout — starting physics anyway')
                    start()
                }
            }, 15000)
        } else {
            setTimeout(() => this.setPhysics(), 200)
        }
    }

    setPhysics() {
        if (!this.physics.world) return
        const RAPIER = this.physics.RAPIER

        this.position.y = this.capsuleCenterY + this.spawnOffsetY

        const rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(this.position.x, this.position.y, this.position.z)
        this.rigidBody = this.physics.world.createRigidBody(rbDesc)

        const colDesc = RAPIER.ColliderDesc.capsule(this.capsuleHalfHeight, this.capsuleRadius)
            .setActiveCollisionTypes(
                RAPIER.ActiveCollisionTypes.DEFAULT |
                RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED
            )
        this.collider = this.physics.world.createCollider(colDesc, this.rigidBody)

        this.characterController = this.physics.world.createCharacterController(0.02)
        this.characterController.setApplyImpulsesToDynamicBodies(true)
        this.characterController.setMaxSlopeClimbAngle(Math.PI * 0.25)
        this.characterController.setMinSlopeSlideAngle(Math.PI * 0.3)
        this.characterController.enableAutostep(0.25, 0.2, false)
        this.characterController.enableSnapToGround(0.1)

        this.previousPosition = this.position.clone()
        this.container.position.copy(this.position)
    }

    // ─── Procedural kick (no authored clip — bone offsets over the pose) ──

    /**
     * Play a short kick with the right leg. Purely procedural: additive
     * rotations on the thigh/shin bones layered AFTER the mixer writes the
     * current pose each frame (wind-up → strike → recover, ~0.62s).
     */
    playKick() {
        if (!this._kickBones) {
            const find = (name) => {
                let bone = null
                this.model.traverse((c) => { if (!bone && c.isBone && c.name === name) bone = c })
                return bone
            }
            this._kickBones = {
                upLeg: find('mixamorigRightUpLeg'),
                leg: find('mixamorigRightLeg')
            }
        }
        if (!this._kickBones.upLeg) return false
        this._kickT = 0
        return true
    }

    get isKicking() { return this._kickT !== null && this._kickT !== undefined }

    /**
     * Volleyball bump — both arms swing overhead to meet the ball, then settle.
     * Same layering trick as playKick(): pure bone rotations applied AFTER the
     * mixer writes the frame, so it blends over the running locomotion clip.
     *
     * Anticipation matters more than amplitude here: the arms dip slightly
     * BEFORE swinging up, which is what makes a 0.4 s pose read as a hit
     * instead of a twitch.
     */
    playBump() {
        if (!this._bumpBones) {
            const find = (name) => {
                let bone = null
                this.model.traverse((c) => { if (!bone && c.isBone && c.name === name) bone = c })
                return bone
            }
            this._bumpBones = {
                lArm: find('mixamorigLeftArm'),
                rArm: find('mixamorigRightArm'),
                lFore: find('mixamorigLeftForeArm'),
                rFore: find('mixamorigRightForeArm'),
                spine: find('mixamorigSpine1') || find('mixamorigSpine')
            }
        }
        if (!this._bumpBones.lArm && !this._bumpBones.rArm) return false
        this._bumpT = 0
        return true
    }

    /** Layered after mixer.update — see update(). */
    _applyBumpPose(dt) {
        if (this._bumpT === null || this._bumpT === undefined) return
        const B = this._bumpBones
        if (!B) { this._bumpT = null; return }

        this._bumpT += dt
        const p = this._bumpT / 0.5
        if (p >= 1) { this._bumpT = null; return }

        // −0.18 dip (anticipation) → 1 (contact) → 0 (settle)
        let k
        if (p < 0.16) {
            k = -0.18 * Math.sin((p / 0.16) * Math.PI)
        } else if (p < 0.42) {
            const e = (p - 0.16) / 0.26
            k = 1 - Math.pow(1 - e, 2)          // fast swing up
        } else {
            const e = (p - 0.42) / 0.58
            k = (1 - (e * e * (3 - 2 * e)))     // smooth settle
        }

        // 1.05 rad is this rig's SWEET SPOT: swinging further actually lowers
        // the hands again (measured — the arm passes its highest point and
        // starts coming back down), so more amplitude would look like less.
        const swing = 1.05 * k
        if (B.lArm) { B.lArm.rotation.z += swing; B.lArm.rotation.y -= swing * 0.2 }
        if (B.rArm) { B.rArm.rotation.z -= swing; B.rArm.rotation.y += swing * 0.2 }
        if (B.lFore) B.lFore.rotation.z += swing * 0.45
        if (B.rFore) B.rFore.rotation.z -= swing * 0.45
        // A touch of back-arch sells the reach.
        if (B.spine) B.spine.rotation.x -= swing * 0.12
    }

    /** Layered after mixer.update — see update(). */
    _applyKickPose(dt) {
        if (this._kickT === null || this._kickT === undefined) return
        const B = this._kickBones
        if (!B?.upLeg) { this._kickT = null; return }

        this._kickT += dt
        const p = this._kickT / 0.62
        if (p >= 1) { this._kickT = null; return }

        let thigh = 0
        let shin = 0
        if (p < 0.38) {
            // Wind-up: leg swings back, shin folds.
            const k = Math.sin((p / 0.38) * Math.PI * 0.5)
            thigh = 0.55 * k
            shin = 1.0 * k
        } else if (p < 0.6) {
            // Strike: fast forward swing, shin extends.
            const k = (p - 0.38) / 0.22
            const e = 1 - Math.pow(1 - k, 2)
            thigh = 0.55 - 1.75 * e
            shin = 1.0 * (1 - e) * 0.65
        } else {
            // Recover: ease back to the underlying pose.
            const k = (p - 0.6) / 0.4
            const e = k * k * (3 - 2 * k)
            thigh = -1.2 * (1 - e)
            shin = 0.25 * (1 - e)
        }

        B.upLeg.rotation.x += thigh
        if (B.leg) B.leg.rotation.x += shin
    }

    // ─── Sitting ─────────────────────────────────────────────────────────

    /**
     * Sit down / stand up. The rig has no sit clip, so the idle ("happy") clip
     * keeps running for the torso, head and arms — which is what makes the pose
     * read as alive rather than frozen — and only the legs are overridden, by
     * the same additive-bone trick playKick() uses.
     *
     * @param {boolean} on true to sit, false to stand
     * @param {number} [recline] radians the seat itself tips back (a deckchair
     *   scores ~0.22, a log 0) — leans the whole body to match
     */
    setSitting(on, recline = 0) {
        if (on === this.isSitting) return
        this.isSitting = on
        if (on) {
            this._sitRecline = recline
            // Whatever was playing (walk/run) has to stop, or the seated legs
            // would still be striding underneath the override.
            this._transitionTo('idle')
            this.movementLocked = true
        } else {
            this.movementLocked = false
        }
    }

    _cacheSitBind() {
        if (this._sitBind || !this.model) return
        const names = new Set([
            'mixamorigHips',
            'mixamorigLeftUpLeg', 'mixamorigRightUpLeg',
            'mixamorigLeftLeg', 'mixamorigRightLeg',
            'mixamorigLeftFoot', 'mixamorigRightFoot'
        ])
        const bind = {}
        this.model.traverse((c) => {
            if (!c.isBone || !names.has(c.name)) return
            bind[c.name] = {
                rx: c.rotation.x, ry: c.rotation.y, rz: c.rotation.z,
                px: c.position.x, py: c.position.y, pz: c.position.z
            }
        })
        this._sitBind = bind
    }

    _sitBone(bone, name, extraX = 0, extraZ = 0, overwrite) {
        if (!bone) return
        if (overwrite) {
            const rest = this._sitBind?.[name]
            if (!rest) return
            bone.rotation.set(rest.rx + extraX, rest.ry, rest.rz + extraZ)
        } else {
            bone.rotation.x += extraX
            if (extraZ) bone.rotation.z += extraZ
        }
    }

    /**
     * Layered after mixer.update — see update().
     *
     * While fully seated the idle clip's loop hitch (a one-frame pop in the
     * hips/legs) is very visible, so those bones are overwritten from the bind
     * rest + sit offsets. During the sit/stand blend they stay additive so the
     * fold still eases instead of snapping. Torso/arms/head keep the idle clip
     * either way, which is the breathing that keeps the pose alive.
     */
    _applySitPose(dt) {
        const target = this.isSitting ? 1 : 0
        if (this._sitBlend === target && target === 0) return

        // ~0.3 s to fold or unfold.
        const step = dt / 0.3
        this._sitBlend += THREE.MathUtils.clamp(target - this._sitBlend, -step, step)
        if (Math.abs(target - this._sitBlend) < 0.001) this._sitBlend = target
        if (this._sitBlend <= 0) return

        if (!this._sitBones) {
            const find = (name) => {
                let bone = null
                this.model.traverse((c) => { if (!bone && c.isBone && c.name === name) bone = c })
                return bone
            }
            this._sitBones = {
                hips: find('mixamorigHips'),
                lUpLeg: find('mixamorigLeftUpLeg'),
                rUpLeg: find('mixamorigRightUpLeg'),
                lLeg: find('mixamorigLeftLeg'),
                rLeg: find('mixamorigRightLeg'),
                lFoot: find('mixamorigLeftFoot'),
                rFoot: find('mixamorigRightFoot')
            }
        }
        const B = this._sitBones
        if (!B.lUpLeg && !B.rUpLeg) return

        const k = this._sitBlend
        const rec = this._sitRecline
        // Negative X on the thigh swings the leg FORWARD — the same sign
        // playKick() strikes with.
        const thigh = -(SIT_THIGH + rec * RECLINE_EXTEND_THIGH) * k
        const shin = Math.min(0, SIT_SHIN + rec * RECLINE_STRAIGHTEN_SHIN) * k
        const splay = SIT_SPLAY * k
        const ankle = SIT_ANKLE * k
        const overwrite = k >= 0.999

        // Hips is the root of the skeleton, so tipping it back carries torso,
        // head AND legs together — which is exactly how a body settles into a
        // sloped seat. Overwriting also freezes the idle hip bob that caused
        // the seated loop glitch.
        if (B.hips) {
            if (overwrite) {
                const rest = this._sitBind?.mixamorigHips
                if (rest) {
                    B.hips.rotation.set(rest.rx + rec * k, rest.ry, rest.rz)
                    B.hips.position.set(rest.px, rest.py, rest.pz)
                }
            } else if (rec) {
                B.hips.rotation.x += rec * k
            }
        }

        this._sitBone(B.lUpLeg, 'mixamorigLeftUpLeg', thigh, splay, overwrite)
        this._sitBone(B.rUpLeg, 'mixamorigRightUpLeg', thigh, -splay, overwrite)
        this._sitBone(B.lLeg, 'mixamorigLeftLeg', shin, 0, overwrite)
        this._sitBone(B.rLeg, 'mixamorigRightLeg', shin, 0, overwrite)
        this._sitBone(B.lFoot, 'mixamorigLeftFoot', ankle, 0, overwrite)
        this._sitBone(B.rFoot, 'mixamorigRightFoot', ankle, 0, overwrite)
    }

    /**
     * Instant teleport (house enter/exit — hidden behind the iris).
     * @param {number} x world X
     * @param {number} groundY world Y of the FLOOR at the destination
     * @param {number} z world Z
     * @param {number} [yaw] facing after the jump
     * @param {number} [settleMargin] how far ABOVE the floor to drop the
     *   capsule, for physics to resolve on the next step. Pass 0 where nothing
     *   will resolve it — during the frisbee session movement is locked for
     *   the whole round, so the default margin would leave the player hovering
     *   15cm over the pitch for as long as it lasts.
     */
    teleportTo(x, groundY, z, yaw, settleMargin = 0.15) {
        this.position.set(x, groundY + this.capsuleCenterY + settleMargin, z)
        this.verticalVelocity = 0
        if (this.rigidBody) {
            this.rigidBody.setTranslation(
                { x: this.position.x, y: this.position.y, z: this.position.z }, true
            )
        }
        this.container.position.copy(this.position)
        if (yaw !== undefined) this.container.rotation.y = yaw
        this.previousPosition.copy(this.position)
        this._strideAcc = 0
        this._strideFresh = true
    }

    // ─── Throw animation ─────────────────────────────────────────────────

    startThrowAnimation(pauseAtTime) {
        if (!this.actions.throw) return false
        this.movementLocked = true
        this.throwPaused = false
        this.throwPauseTime = pauseAtTime ?? this.throwClipDuration

        const action = this.actions.throw
        action.reset()
        action.setEffectiveWeight(1)
        action.setEffectiveTimeScale(1)
        action.paused = false

        if (this.activeAction && this.activeAction !== action) {
            action.crossFadeFrom(this.activeAction, 0.2, true)
        }

        this.activeAction = action
        this.state = 'throwing'
        return true
    }

    continueThrowAnimation() {
        if (!this.actions.throw) return
        this.actions.throw.paused = false
        this.throwPaused = false
        this.throwPauseTime = null
    }

    resetAfterThrow() {
        this.movementLocked = false
        this.throwPaused = false
        this.throwPauseTime = null
        if (this.actions.throw) {
            this.actions.throw.paused = false
        }
        this._transitionTo('idle')
    }

    // ─── Per-frame helpers ──────────────────────────────────────────────

    _updateState(deltaTime, isMoving) {
        const mobileActions = this.experience.mobileControls?.getActions()
        const padActions = this.experience.gamepad?.getActions()
        this.isSprinting = this.keys.shift ||
            (mobileActions?.button1 ?? false) || (padActions?.button1 ?? false)

        if (this.state === 'running') this.runDuration += deltaTime

        // Allow interrupting rest by moving
        if (this.state === 'resting') {
            if (isMoving) this._transitionTo(this.isSprinting ? 'running' : 'walking')
            return
        }

        if (isMoving) {
            if (this.isSprinting) {
                if (this.state !== 'running') this._transitionTo('running')
            } else {
                if (this.state !== 'walking') this._transitionTo('walking')
            }
        } else {
            if (this.runDuration >= this.restAfterRunThreshold) {
                this._transitionTo('resting')
            } else if (this.state !== 'idle') {
                this._transitionTo('idle')
            }
            this.runDuration = 0
        }
    }

    _updateBlinking(deltaTime) {
        if (!this.atlas) return

        // Tired after running: hold the closed-eye (top-right) face, no blinking.
        if (this.state === 'resting') {
            this.atlas.offset.copy(this._uvClosed)
            return
        }

        // While idle long enough for the music notes to appear, swap to the
        // "singing" face pair. Blinking works the same on either pair: it just
        // alternates between the open and closed variant of the active face.
        const singing = this.experience.world?.musicNotes?.isSinging === true
        const openUV = singing ? this._uvSingOpen : this._uvOpen
        const closedUV = singing ? this._uvSingClosed : this._uvClosed

        // Subtly speed up the idle (humming) loop while singing.
        if (this.actions?.happy) {
            this.actions.happy.setEffectiveTimeScale(singing ? this.singIdleSpeed : 1.0)
        }

        this.blinkTimer += deltaTime

        if (this.isBlinking) {
            if (this.blinkTimer >= this.blinkDuration) {
                this.isBlinking = false
                this.blinkTimer = 0
                this.nextBlinkTime = this._randomBlinkInterval()
            }
        } else {
            if (this.blinkTimer >= this.nextBlinkTime) {
                this.isBlinking = true
                this.blinkTimer = 0
            }
        }

        this.atlas.offset.copy(this.isBlinking ? closedUV : openUV)
    }

    // ─── Main update ────────────────────────────────────────────────────

    update() {
        // Clamp to 50 ms: after a real hitch (GC, shader compile, tab switch)
        // an unclamped dt would make the capsule leap a big step in one frame.
        const dt = Math.min(this.time.delta * 0.001, 0.05)
        if (!this.container) return

        // Frozen while a modal (tutorial/help) is open mid-throw — hold the pose
        // so the wind-up animation doesn't play out (clip) behind the modal.
        if (this.animationPaused) { this.idleTime = 0; return }

        // Check throw pause
        if (this.state === 'throwing' && this.throwPauseTime != null && this.actions.throw) {
            if (this.actions.throw.time >= this.throwPauseTime && !this.throwPaused) {
                this.actions.throw.paused = true
                this.throwPaused = true
            }
        }

        // When movement is locked (minigame), only update mixer
        if (this.movementLocked) {
            this.idleTime = 0
            this._updateBlinking(dt)
            if (this.mixer) this.mixer.update(dt)
            this._applyKickPose(dt)
            this._applyBumpPose(dt)
            this._applySitPose(dt)
            return
        }

        // Gather input direction (reused vector — no per-frame alloc)
        const dir = this._dir.set(0, 0, 0)
        if (this.keys.w) dir.z -= 1
        if (this.keys.s) dir.z += 1
        if (this.keys.a) dir.x -= 1
        if (this.keys.d) dir.x += 1

        if (this.experience.mobileControls?.isActive()) {
            const m = this.experience.mobileControls.getMovement()
            dir.x += m.x * m.force
            dir.z -= m.y * m.force
        }

        if (this.experience.gamepad?.isActive()) {
            const g = this.experience.gamepad.getMovement()
            dir.x += g.x * g.force
            dir.z -= g.y * g.force
        }

        // Side-scroller mode: drop the depth axis and align "right" with what
        // reads as right ON SCREEN (the beach camera looks down −Z, which flips
        // world X).
        if (this.planarLock) {
            dir.z = 0
            dir.x *= (this.planarLock.inputSign ?? 1)
        }

        const isMoving = dir.lengthSq() > 0.0001

        // Idle timer — drives idle-only effects (e.g. MusicNotes).
        this.idleTime = isMoving ? 0 : this.idleTime + dt

        // State machine
        this._updateState(dt, isMoving)

        // Blinking
        this._updateBlinking(dt)

        // Animation mixer (+ procedural kick / bump layered on top)
        if (this.mixer) this.mixer.update(dt)
        this._applyKickPose(dt)
        this._applyBumpPose(dt)
        // Runs while standing too, so the legs unfold smoothly after standing up
        // instead of snapping straight the frame the lock is released.
        this._applySitPose(dt)

        // Speed
        const speed = (this.isSprinting && isMoving) ? this.runSpeed : this.walkSpeed

        // Physics movement
        if (this.characterController && this.collider && this.rigidBody) {
            if (this.isGrounded && this.verticalVelocity < 0) this.verticalVelocity = 0
            this.verticalVelocity += this.gravity * dt

            if (isMoving) dir.normalize()

            const desired = {
                x: isMoving ? dir.x * speed * dt : 0,
                y: this.verticalVelocity * dt,
                z: isMoving ? dir.z * speed * dt : 0
            }

            this.characterController.computeColliderMovement(this.collider, desired)
            const corrected = this.characterController.computedMovement()

            const cur = this.rigidBody.translation()
            const next = {
                x: cur.x + corrected.x,
                y: cur.y + corrected.y,
                z: cur.z + corrected.z
            }

            // Pin to the play line and keep the player inside the court.
            if (this.planarLock) {
                const L = this.planarLock
                next.x = Math.min(Math.max(next.x, L.minX), L.maxX)
                next.z = L.z
            }

            this.rigidBody.setNextKinematicTranslation(next)
            this.position.set(next.x, next.y, next.z)
            this.container.position.copy(this.position)

            this.isGrounded = this.characterController.computedGrounded()
            if (this.isGrounded && this.verticalVelocity < 0) this.verticalVelocity = 0

            // Footprints — every stride of ACTUAL horizontal movement while
            // grounded, alternating feet. World.stampFootprint() only stamps
            // when the spot is dirt/sand.
            if (isMoving && this.isGrounded) {
                this._strideAcc += Math.hypot(corrected.x, corrected.z)
                const strideLen = (this.isSprinting ? this.strideRun : this.strideWalk) +
                    (this._strideFresh ? this.strideStartDelay : 0)
                if (this._strideAcc >= strideLen) {
                    this._strideAcc = 0
                    this._strideFresh = false
                    this._footSide = -this._footSide
                    // Sound on the SAME stride that stamps a print, not on a
                    // timer: a timer drifts out of step with the animation as
                    // soon as you turn, hit a slope or brush a wall, and the
                    // mismatch reads as someone else walking nearby. The two
                    // clips alternate, so left and right sound different.
                    this.experience.audio?.playSfx?.(this.isSprinting ? 'run' : 'walk')
                    const yaw = this.container.rotation.y
                    const off = this.footSpacing * this._footSide
                    this.experience.world?.stampFootprint?.(
                        this.position.x + Math.cos(yaw) * off,
                        this.groundY + 0.03,
                        this.position.z - Math.sin(yaw) * off,
                        yaw
                    )
                }
            } else {
                this._strideAcc = 0
                this._strideFresh = true
            }

            // Smooth rotation — exponential decay, shortest path, no overshoot.
            // On the court: turn to face the way you RUN (there is no strafe
            // clip, so a forward-walk cycle played sideways slid horribly), and
            // swing back to face the camera once you stop.
            if (this.planarLock) {
                // Hysteresis: hold the last running facing briefly after input
                // stops. Without it a fast direction change (or a joystick
                // crossing its dead zone) snapped the character back toward the
                // camera for a frame or two — a visible animation "clip".
                if (isMoving) {
                    this._courtYaw = Math.sign(dir.x) * Math.PI * 0.5
                    this._courtIdle = 0
                } else {
                    this._courtIdle = (this._courtIdle ?? 0) + dt
                }
                const target = (this._courtIdle ?? 0) < 0.22 && this._courtYaw !== undefined
                    ? this._courtYaw
                    : (this.planarLock.faceYaw ?? 0)
                const diff = Math.atan2(Math.sin(target - this.container.rotation.y),
                                        Math.cos(target - this.container.rotation.y))
                this.container.rotation.y += diff * (1.0 - Math.exp(-this.rotationSpeed * dt))
            } else if (isMoving) {
                const target = Math.atan2(dir.x, dir.z)
                const diff = Math.atan2(Math.sin(target - this.container.rotation.y),
                                        Math.cos(target - this.container.rotation.y))
                this.container.rotation.y += diff * (1.0 - Math.exp(-this.rotationSpeed * dt))
            }
        } else {
            if (this.rigidBody) {
                const t = this.rigidBody.translation()
                this.position.set(t.x, t.y, t.z)
            }
            this.container.position.copy(this.position)
        }
    }

    // ─── Debug GUI ──────────────────────────────────────────────────────

    setDebug() {
        const f = this.debug.ui.addFolder('Character')
        f.close()

        f.add(this, 'walkSpeed', 0.5, 3.0, 0.1).name('Walk Speed')
        f.add(this, 'runSpeed', 1.5, 5.0, 0.1).name('Run Speed')
        f.add(this, 'walkAnimSpeed', 0.6, 2.0, 0.01).name('Walk Anim Speed')
        f.add(this, 'runAnimSpeed', 0.6, 2.0, 0.01).name('Run Anim Speed')
        f.add(this, 'rotationSpeed', 2.0, 30.0, 0.5).name('Rotation Smoothing')
        f.add(this, 'restAfterRunThreshold', 0.5, 5.0, 0.1).name('Rest After Run (s)')
        f.add(this, 'blinkDuration', 0.05, 0.5, 0.01).name('Blink Duration')
    }
}
