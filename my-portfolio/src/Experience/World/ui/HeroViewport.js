/**
 * HeroViewport — the live character in the Quick Overview's hero.
 *
 * The page's thesis is "this is the shortcut; behind it there's a real place",
 * so the hero shows the actual character from that place rather than a picture
 * of one. It is also the door: clicking the frame enters the world.
 *
 * Progressive by design. The overview opens instantly with an empty frame and
 * only upgrades to the live character once `humanModel` has finished
 * downloading for the world anyway — reading this page never waits on 3D.
 *
 * Runs its own small renderer rather than borrowing the world's: a second scene
 * on the main one would mean sharing a device and a canvas with a system that
 * owns both. One skinned character costs almost nothing, and the isolation
 * means nothing here can disturb the world.
 *
 * WebGPURenderer, not WebGL: this project aliases bare `three` to the WebGPU
 * build, which does not ship WebGLRenderer. It also falls back to a WebGL2
 * backend on its own where WebGPU is missing, and it keeps the character's
 * KTX2 atlas in the format it was already transcoded to for the world.
 */
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Mixamo rig — the character is the same one the world uses.
const NECK_BONE = 'mixamorigNeck'
const HEAD_BONE = 'mixamorigHead'

// Where the camera sits around the character. The head needs the same value as
// a neutral offset, or 'looking straight ahead' means looking past the viewer.
const BASE_CAM_YAW = 0.34

export default class HeroViewport {
    constructor(canvas) {
        this.canvas = canvas
        this.active = false
        this.ready = false

        this._pointer = new THREE.Vector2(0, 0)
        this._aim = new THREE.Vector2(0, 0)
        this._clock = new THREE.Clock()
        this._frame = null
        this._tick = this._tick.bind(this)

        this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

        this.renderer = new THREE.WebGPURenderer({
            canvas,
            alpha: true,
            antialias: true,
            powerPreference: 'low-power'
        })
        this.renderer.setClearColor(0x000000, 0)
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        // The device is acquired asynchronously; nothing may render before it
        // resolves. Kept as a promise so setModel can simply await it.
        this._booted = this.renderer.init().catch((err) => {
            console.error('HeroViewport: renderer unavailable', err)
            this.failed = true
        })

        this.scene = new THREE.Scene()
        this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)

        // Three-point rig rather than one flat bounce. The material is Lambert
        // (diffuse only), so shape has to come from the difference between the
        // lights, not from speculars: a warm key does the modelling, a cool fill
        // keeps the shadow side from going muddy, and a back rim separates the
        // silhouette from the pale card behind it.
        this.scene.add(new THREE.HemisphereLight(0xeaf6ff, 0xa9dcc4, 1.15))

        const key = new THREE.DirectionalLight(0xfff4e0, 2.35)
        key.position.set(2.6, 3.4, 3.6)
        this.scene.add(key)

        const fill = new THREE.DirectionalLight(0xd4ecff, 0.75)
        fill.position.set(-3.4, 1.2, 2.2)
        this.scene.add(fill)

        const rim = new THREE.DirectionalLight(0xffffff, 1.15)
        rim.position.set(-1.6, 2.8, -3.4)
        this.scene.add(rim)

        this.resize()
    }

    /**
     * @param {object} gltf   Loaded humanModel ({ scene, animations }).
     * @param {THREE.Texture} atlas  humanAtlas — shared with the world.
     */
    async setModel(gltf, atlas) {
        if (this.ready || !gltf?.scene) return
        await this._booted
        if (this.failed) return

        // SkeletonUtils, not .clone(): a plain clone of a SkinnedMesh keeps
        // pointing at the original skeleton, so the copy would collapse the
        // moment either one animates.
        this.model = cloneSkinned(gltf.scene)

        if (atlas) {
            // The world drives the shared atlas's offset to blink. Cloning the
            // texture keeps that decoupled — the image data is still shared, so
            // this costs no extra memory or download.
            this.atlas = atlas.clone()
            this.atlas.needsUpdate = true
            this.atlas.repeat.set(0.5, 0.5)
            this.atlas.offset.set(0, 0)   // top-left quadrant: eyes open
        }

        this.model.traverse((child) => {
            if (!child.isMesh && !child.isSkinnedMesh) return
            child.castShadow = false
            child.receiveShadow = false
            child.frustumCulled = false
            child.material = new THREE.MeshLambertMaterial({
                map: this.atlas || null,
                color: this.atlas ? 0xffffff : 0xbfd8c8
            })
        })

        this.neck = this.model.getObjectByName(NECK_BONE) || null
        this.head = this.model.getObjectByName(HEAD_BONE) || null
        this._neckRest = this.neck ? this.neck.rotation.clone() : null
        this._headRest = this.head ? this.head.rotation.clone() : null

        this.scene.add(this.model)
        this._frameCharacter()
        this._setupIdle(gltf.animations)
        this._setupNotes()

        this.ready = true
        this.canvas.classList.add('is-live')
        this.render()
        if (this.active) this.start()
    }

    /** Point the camera at the character, framed head-and-shoulders down to knee. */
    _frameCharacter() {
        const box = new THREE.Box3().setFromObject(this.model)
        const size = box.getSize(new THREE.Vector3())
        const height = size.y || 1.7

        // Frame the whole figure with air around it, rather than a tight bust:
        // cropping a character mid-thigh reads as a mistake, and the notes need
        // headroom to rise into.
        this._target = new THREE.Vector3(
            (box.min.x + box.max.x) * 0.5,
            box.min.y + height * 0.54,
            (box.min.z + box.max.z) * 0.5
        )
        // A touch further back than a tight portrait needs: the notes have to
        // have somewhere to go, and at 2.45 his feet already grazed the bottom
        // edge while the top note clipped.
        this._radius = height * 2.7
        this._baseY = this._target.y + height * 0.14
        this._headY = box.max.y
        // The rig origin sits at chest height, so box.max.y (~0.23) is NOT the
        // model height (~0.99). Scaling the notes off the former shrank every
        // dimension to a quarter — hence tiny notes clustered on his head.
        this._height = height
        this._updateCamera(0)
        this._updateGroundMarker()
    }

    /**
     * `happy` is the standing/humming loop the world uses as idle — `rest` is
     * the worn-out pose it drops into after running, which would read as odd
     * for someone just standing in a frame.
     */
    _setupIdle(clips) {
        if (!clips?.length) return
        const idle = clips.find((c) => /happy/i.test(c.name))
            || clips.find((c) => /idle|rest/i.test(c.name))
        if (!idle) return
        this.mixer = new THREE.AnimationMixer(this.model)
        this.idleAction = this.mixer.clipAction(idle)
        this.idleAction.play()
    }

    /**
     * The humming notes, ported from the world's MusicNotes emitter. That one
     * is bound to the Experience singleton's scene, so it cannot be reused here
     * directly — but the glyphs, motion and palette are deliberately identical.
     *
     * In the world this triggers after the player stands still. Here the
     * character is always still, so it runs on its own cycle instead: a quiet
     * stretch, then a burst of humming, forever.
     */
    _setupNotes() {
        const glyphs = ['♪', '♫', '♬']
        this._noteTextures = glyphs.map((glyph) => {
            const size = 128
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = size
            const ctx = canvas.getContext('2d')
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.font = `bold ${size * 0.72}px "Segoe UI Symbol", "Arial Unicode MS", sans-serif`
            ctx.lineWidth = size * 0.09
            ctx.strokeStyle = 'rgba(40, 30, 60, 0.45)'
            ctx.strokeText(glyph, size / 2, size / 2 + size * 0.04)
            ctx.fillStyle = '#ffffff'
            ctx.fillText(glyph, size / 2, size / 2 + size * 0.04)
            const tex = new THREE.CanvasTexture(canvas)
            tex.colorSpace = THREE.SRGBColorSpace
            return tex
        })

        this._noteColors = ['#ff8fb1', '#8fd3ff', '#ffd98f', '#b69bff', '#9be8a0']
        // Bigger than the world's notes relative to the character: this camera
        // sits much further back, and at the world's ratio they read as specks.
        // Between the two extremes this has been: 0.11 of body height read as
        // specks, 0.19 filled the frame. The game's absolute 0.16 is not the
        // target — its camera sits much further back, so the same size covers a
        // fraction of the screen there.
        this._noteScale = (this._height || 1.7) * 0.14

        this._notes = []
        const group = new THREE.Group()
        for (let i = 0; i < 8; i++) {
            const material = new THREE.SpriteMaterial({
                map: this._noteTextures[0],
                transparent: true,
                depthWrite: false,
                opacity: 0
            })
            const sprite = new THREE.Sprite(material)
            sprite.visible = false
            sprite.scale.setScalar(this._noteScale)
            group.add(sprite)
            this._notes.push({ sprite, material, active: false, age: 0, life: 1 })
        }
        this.scene.add(group)
        this._noteGroup = group

        this.singing = false
        this._singTimer = 0
        this._singFor = 0
        this._quietFor = 4 + Math.random() * 5
        this._emitTimer = 0
        this._nextEmit = 0
    }

    _spawnNote() {
        const note = this._notes.find((n) => !n.active)
        if (!note) return
        const spread = (this._height || 1.7) * 0.24

        note.active = true
        note.age = 0
        note.life = 2.3 * (0.85 + Math.random() * 0.4)
        note.swayPhase = Math.random() * Math.PI * 2
        note.swayFreq = 2.0 + Math.random() * 1.6
        note.swayDir = Math.random() < 0.5 ? -1 : 1
        note.spin = (Math.random() - 0.5) * 1.4
        note.startX = this._target.x + (Math.random() - 0.5) * spread * 2
        note.startY = (this._headY || 1.7) + (this._height || 1.7) * 0.05
        note.startZ = this._target.z + (Math.random() - 0.5) * spread

        note.material.map = this._noteTextures[(Math.random() * this._noteTextures.length) | 0]
        note.material.color.set(this._noteColors[(Math.random() * this._noteColors.length) | 0])
        note.material.rotation = (Math.random() - 0.5) * 0.5
        note.sprite.position.set(note.startX, note.startY, note.startZ)
        note.sprite.visible = true
    }

    _updateNotes(dt) {
        if (!this._notes) return

        // Alternate quiet and humming so it stays a surprise rather than a loop
        // you can time.
        this._singTimer += dt
        if (this.singing) {
            if (this._singTimer >= this._singFor) {
                this.singing = false
                this._singTimer = 0
                this._quietFor = 6 + Math.random() * 8
            }
        } else if (this._singTimer >= this._quietFor) {
            this.singing = true
            this._singTimer = 0
            this._singFor = 5 + Math.random() * 4
            this._emitTimer = 999   // pop the first note immediately
        }

        if (this.singing) {
            this._emitTimer += dt
            if (this._emitTimer >= this._nextEmit) {
                this._emitTimer = 0
                this._nextEmit = 0.75 + Math.random() * 0.75
                this._spawnNote()
            }
        }

        // The world lets notes climb a full body height, but that camera is far
        // back. Here there is only ~0.4 units of sky above his head, so a 1.1
        // climb sent them straight out of frame — they now travel the headroom
        // that actually exists and fade before reaching the edge.
        const rise = (this._height || 1.7) * 0.30
        const sway = (this._height || 1.7) * 0.18
        for (const note of this._notes) {
            if (!note.active) continue
            note.age += dt
            const t = note.age / note.life
            if (t >= 1) {
                note.active = false
                note.sprite.visible = false
                note.material.opacity = 0
                continue
            }
            const off = Math.sin(note.swayPhase + note.age * note.swayFreq) * sway * note.swayDir
            note.sprite.position.x = note.startX + off
            note.sprite.position.y = note.startY + rise * t
            note.sprite.position.z = note.startZ + off * 0.4

            let alpha = 1
            if (t < 0.18) alpha = t / 0.18
            else if (t > 0.6) alpha = 1 - (t - 0.6) / 0.4
            note.material.opacity = alpha

            const popT = Math.min(t / 0.18, 1)
            const pop = 1 + 0.25 * Math.sin(popT * Math.PI)
            note.sprite.scale.setScalar(this._noteScale * (0.4 + 0.6 * popT) * pop)
            note.material.rotation += note.spin * dt
        }
    }

    /**
     * Same blink the world runs: the face is four quadrants of one atlas, and
     * blinking just swaps to the closed-eye variant of whichever pair is active
     * (normal or singing).
     */
    _updateBlink(dt) {
        if (!this.atlas) return
        this._blinkTimer = (this._blinkTimer || 0) + dt

        if (this._blinking) {
            if (this._blinkTimer >= 0.12) {
                this._blinking = false
                this._blinkTimer = 0
                this._nextBlink = 2.0 + Math.random() * 4.0
            }
        } else if (this._blinkTimer >= (this._nextBlink || 2.5)) {
            this._blinking = true
            this._blinkTimer = 0
        }

        // Atlas quadrants (repeat 0.5): V is flipped, so v=0 is the TOP row.
        const v = this.singing ? 0.5 : 0
        this.atlas.offset.set(this._blinking ? 0.5 : 0, v)

        // The world speeds the humming loop up a touch while singing.
        this.idleAction?.setEffectiveTimeScale(this.singing ? 1.18 : 1.0)
    }

    /**
     * Place the CSS cast shadow where the feet ACTUALLY land on screen.
     *
     * The shadow used to be pinned at a fixed percentage of the frame, which
     * silently desynced the moment the camera framing changed — pull the camera
     * back and the feet rise while the shadow stays put, leaving him hovering.
     * Projecting the foot point through the same camera keeps the two locked
     * together through any reframe or resize.
     */
    _updateGroundMarker() {
        const host = this.canvas?.parentElement
        if (!host || !this._target) return

        this.camera.updateMatrixWorld()
        const foot = new THREE.Vector3(
            this._target.x,
            this._headY - this._height,
            this._target.z
        ).project(this.camera)
        const head = new THREE.Vector3(
            this._target.x, this._headY, this._target.z
        ).project(this.camera)

        // NDC y is +1 at the top; CSS wants a percentage from the top.
        host.style.setProperty('--ground-y', `${((1 - foot.y) / 2 * 100).toFixed(2)}%`)
        // Width tracks how tall he reads on screen, so the shadow keeps its
        // proportion instead of ballooning when the frame gets tighter.
        const screenHeight = Math.abs(head.y - foot.y) / 2
        host.style.setProperty('--ground-w', `${(screenHeight * 46).toFixed(1)}%`)
    }

    /** Normalised pointer position over the frame, -1..1 on both axes. */
    setPointer(nx, ny) {
        this._pointer.set(
            THREE.MathUtils.clamp(nx, -1, 1),
            THREE.MathUtils.clamp(ny, -1, 1)
        )
    }

    _updateCamera(t) {
        // A slow drift, not an orbit: enough to read as three-dimensional,
        // never enough to pull attention away from the text beside it.
        //
        // Deliberately NOT coupled to the pointer any more. It used to add
        // `_aim.x * 0.16` here, which swung the camera the same way the head
        // was turning — the camera chased the gaze and cancelled most of it,
        // leaving barely 0.14 rad of the 0.30 visible. Worse, the rig already
        // rests at +0.34, so the cancellation was lopsided and the rightward
        // look all but disappeared.
        const sway = this.reduceMotion ? 0 : Math.sin(t * 0.32) * 0.10
        const angle = BASE_CAM_YAW + sway
        this.camera.position.set(
            this._target.x + Math.sin(angle) * this._radius,
            this._baseY + (this.reduceMotion ? 0 : Math.sin(t * 0.5) * 0.02),
            this._target.z + Math.cos(angle) * this._radius
        )
        this.camera.lookAt(this._target)
    }

    _tick() {
        if (!this.active) return
        this._frame = requestAnimationFrame(this._tick)
        const dt = Math.min(this._clock.getDelta(), 0.1)
        const t = this._clock.elapsedTime

        // Ease toward the pointer so the head glides instead of snapping.
        const k = 1 - Math.pow(0.001, dt)
        this._aim.x += (this._pointer.x - this._aim.x) * k
        this._aim.y += (this._pointer.y - this._aim.y) * k

        this.mixer?.update(dt)
        this._updateBlink(dt)
        this._updateNotes(dt)

        // Applied AFTER the mixer writes the frame, otherwise the idle clip
        // overwrites it every tick.
        // Screen Y grows downward, and on this rig a positive bone X pitches the
        // head DOWN — the two cancelled out, so he looked away from the cursor
        // vertically. Adding instead of subtracting makes him follow it.
        if (this.neck && this._neckRest) {
            this.neck.rotation.y = this._neckRest.y + BASE_CAM_YAW * 0.46 + this._aim.x * 0.26
            this.neck.rotation.x = this._neckRest.x + this._aim.y * 0.14
        }
        if (this.head && this._headRest) {
            this.head.rotation.y = this._headRest.y + BASE_CAM_YAW * 0.54 + this._aim.x * 0.30
            this.head.rotation.x = this._headRest.x + this._aim.y * 0.18
        }

        this._updateCamera(t)
        this.renderer.render(this.scene, this.camera)
    }

    render() {
        if (!this.ready) return
        this.mixer?.update(0)
        this._updateCamera(this._clock.elapsedTime)
        this.renderer.render(this.scene, this.camera)
    }

    start() {
        if (this.active || !this.ready) return
        this.active = true
        // A still frame is the whole experience under reduced motion; spinning a
        // rAF loop to redraw the same pixels would just drain battery.
        if (this.reduceMotion) { this.render(); this.active = false; return }
        this._clock.getDelta()
        this._frame = requestAnimationFrame(this._tick)
    }

    stop() {
        this.active = false
        if (this._frame) cancelAnimationFrame(this._frame)
        this._frame = null
    }

    resize() {
        const w = this.canvas.clientWidth || 1
        const h = this.canvas.clientHeight || 1
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
        this.renderer.setSize(w, h, false)
        this.camera.aspect = w / h
        this.camera.updateProjectionMatrix()
        if (this.ready) this._updateGroundMarker()
        if (this.ready && !this.active) this.render()
    }

    dispose() {
        this.stop()
        this.mixer?.stopAllAction()
        this.scene.traverse((c) => {
            if (!c.isMesh && !c.isSkinnedMesh) return
            c.geometry?.dispose?.()
            c.material?.dispose?.()
        })
        this.atlas?.dispose?.()
        this.renderer.dispose()
    }
}
