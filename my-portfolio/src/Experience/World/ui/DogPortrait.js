/**
 * DogPortrait — the dog, sat at the very bottom of the Quick Overview.
 *
 * The hero opens the page with the character; the closing card shows his
 * companion, standing in the other half of it. Same idea as
 * HeroViewport and the same reasons for the choices made there: its own small
 * WebGPURenderer rather than a second scene on the world's (isolation, and the
 * world owns its device and canvas), fresh Lambert materials on a
 * SkeletonUtils clone rather than the GLB's own (the world is using those
 * material instances, and a plain .clone() of a SkinnedMesh keeps the original
 * skeleton), and a three-point light rig so shape comes from the difference
 * between lights rather than from speculars a diffuse material cannot show.
 *
 * Plays the GLB's plain `idle` loop, standing. The dog in the world sits at
 * its spot (DogSitPose lays a pose over the same clip); this one does not.
 */
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Matches DogCompanion.
const DOG_SCALE = 0.0075

// Where his feet should land down the frame. Solved for rather than dialled in
// as a camera offset, so the framing survives a change of pose or clip.
const GROUND_SCREEN_Y = 0.86

// Three-quarter view: dead-on reads as a diagram, full profile as a sticker.
const BASE_CAM_YAW = 0.62

export default class DogPortrait {
    constructor(canvas) {
        this.canvas = canvas
        this.active = false
        this.ready = false

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
        this._booted = this.renderer.init().catch((err) => {
            console.error('DogPortrait: renderer unavailable', err)
            this.failed = true
        })

        this.scene = new THREE.Scene()
        this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20)

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

    /** @param {object} gltf  Loaded dogModel ({ scene, animations }). */
    async setModel(gltf) {
        if (this.ready || !gltf?.scene) return
        await this._booted
        if (this.failed) return

        this.model = cloneSkinned(gltf.scene)
        // The world's DogCompanion transforms the shared gltf.scene in place, so
        // whatever it left behind comes along in the clone. Start from zero.
        this.model.position.set(0, 0, 0)
        this.model.rotation.set(0, 0, 0)
        this.model.scale.setScalar(DOG_SCALE)

        this.model.traverse((child) => {
            if (!child.isMesh && !child.isSkinnedMesh) return
            child.castShadow = false
            child.receiveShadow = false
            child.frustumCulled = false
            const map = child.material?.map
            if (map) {
                // Cloned, not shared: the image data still is, so this costs
                // nothing, and nothing here can touch the world's copy.
                this.texture = this.texture || map.clone()
                this.texture.needsUpdate = true
            }
            child.material = new THREE.MeshLambertMaterial({
                map: this.texture || null,
                color: this.texture ? 0xffffff : 0xc9b6a0
            })
        })

        this.model.updateMatrixWorld(true)
        const bind = new THREE.Box3().setFromObject(this.model)
        // Box3 on a SkinnedMesh measures the BIND pose and ignores the
        // skeleton, so it cannot say where the animated paws are. What it can
        // say is how far the paw skin hangs below the lowest joint — a
        // constant of the model, and the piece needed to plant the live pose.
        this._pawDrop = this._lowestBoneY() - bind.min.y
        this.model.position.y = -bind.min.y

        this.scene.add(this.model)

        this._setupIdle(gltf.animations)
        this._poseAndFrame()

        this.ready = true
        this.canvas.classList.add('is-live')
        this.render()
        if (this.active) this.start()
    }

    _setupIdle(clips) {
        const idle = clips?.find((c) => /idle/i.test(c.name))
        if (!idle) return
        this.mixer = new THREE.AnimationMixer(this.model)
        this.mixer.clipAction(idle).play()
    }

    /** World Y of the lowest joint in whatever pose the rig is holding. */
    _lowestBoneY() {
        let min = Infinity
        const p = new THREE.Vector3()
        this.model.traverse((c) => {
            if (c.isBone) min = Math.min(min, c.getWorldPosition(p).y)
        })
        return Number.isFinite(min) ? min : 0
    }

    /**
     * Frame the dog off its POSED bones. Box3.setFromObject would measure the
     * bind pose and ignore the clip entirely, which is how the cast shadow
     * ended up drawn a paw's width above where he actually stands.
     */
    _poseAndFrame() {
        this._poseFrame(0)
        this.model.updateMatrixWorld(true)

        // Plant the live pose on y = 0. He was placed off the bind pose, and
        // idle carries the paws lower than that.
        this.model.position.y -= this._lowestBoneY() - this._pawDrop
        this.model.updateMatrixWorld(true)

        const box = new THREE.Box3()
        const p = new THREE.Vector3()
        this.model.traverse((child) => {
            if (!child.isBone) return
            box.expandByPoint(child.getWorldPosition(p))
        })
        if (box.isEmpty()) box.setFromObject(this.model)

        const size = box.getSize(new THREE.Vector3())
        // The skull, muzzle, ruff and tail all hang off the last bone in their
        // chain, so the bone cloud undershoots the silhouette by a good margin —
        // pad it rather than crop his nose.
        const height = Math.max(size.y, size.z) * 1.35

        this._target = box.getCenter(new THREE.Vector3())
        this._radius = height * 1.92
        this._groundY = 0
        // Half the footprint, for the cast shadow.
        this._footRadius = Math.max(size.x, size.z) * 0.45

        this._aimGroundLine()
        this._updateGroundMarker()
    }

    /**
     * Nudge the aim point until his feet land on GROUND_SCREEN_Y. Raising the
     * aim pushes the subject down the frame, so this is a damped fixed point —
     * a handful of projections, once, at setup.
     */
    _aimGroundLine() {
        const p = new THREE.Vector3()
        for (let i = 0; i < 12; i++) {
            this._updateCamera(0)
            this.camera.updateMatrixWorld()
            p.set(this._target.x, this._groundY, this._target.z).project(this.camera)
            const frac = (1 - p.y) / 2
            const err = GROUND_SCREEN_Y - frac
            if (Math.abs(err) < 0.002) break
            this._target.y += err * this._radius * 0.35
        }
    }

    /** Project the cast shadow through the same camera that draws him. */
    _updateGroundMarker() {
        const host = this.canvas?.parentElement
        if (!host || !this._target) return

        this.camera.updateMatrixWorld()
        const foot = _v.set(this._target.x, this._groundY, this._target.z)
            .project(this.camera)
        host.style.setProperty('--ground-y', `${((1 - foot.y) / 2 * 100).toFixed(2)}%`)

        // Width comes from his FOOTPRINT, not from how tall he is. Scaling off
        // height (as the hero portal does for a standing person) made the
        // shadow half the card wide the moment he went from sitting to
        // standing, because standing made him taller, not wider.
        const right = _v2.set(1, 0, 0).applyQuaternion(this.camera.quaternion)
        right.y = 0
        if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
        right.normalize()

        const a = _v3.set(this._target.x, this._groundY, this._target.z)
            .addScaledVector(right, -this._footRadius).project(this.camera)
        const b = _v4.set(this._target.x, this._groundY, this._target.z)
            .addScaledVector(right, this._footRadius).project(this.camera)
        host.style.setProperty('--ground-w', `${(Math.abs(b.x - a.x) / 2 * 100).toFixed(1)}%`)
    }

    _updateCamera(t) {
        const sway = this.reduceMotion ? 0 : Math.sin(t * 0.28) * 0.12
        const angle = BASE_CAM_YAW + sway
        this.camera.position.set(
            this._target.x + Math.sin(angle) * this._radius,
            this._target.y + this._radius * 0.15,
            this._target.z + Math.cos(angle) * this._radius
        )
        this.camera.lookAt(this._target)
    }

    _tick() {
        if (!this.active) return
        this._frame = requestAnimationFrame(this._tick)
        const dt = Math.min(this._clock.getDelta(), 0.1)

        this._poseFrame(dt)

        this._updateCamera(this._clock.elapsedTime)
        this.renderer.render(this.scene, this.camera)
    }

    render() {
        if (!this.ready) return
        this._poseFrame(0)
        this._updateCamera(this._clock.elapsedTime)
        this.renderer.render(this.scene, this.camera)
    }

    _poseFrame(dt) {
        this.mixer?.update(dt)
    }

    start() {
        if (this.active || !this.ready) return
        this.active = true
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
        this.texture?.dispose?.()
        this.renderer.dispose()
    }
}

const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _v4 = new THREE.Vector3()
