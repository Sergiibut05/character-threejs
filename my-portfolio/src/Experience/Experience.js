import * as THREE from 'three'
import Debug from './Utils/Debug.js'
import Sizes from './Utils/Sizes.js'
import Time from './Utils/Time.js'
import Quality from './Utils/Quality.js'
import Camera from './Camera.js'
import Renderer from './Renderer.js'
import Resources from './Utils/Resources.js'
import World from './World/World.js'
import MobileControls from './Utils/MobileControls.js'
import GamepadControls from './Utils/GamepadControls.js'
import InputDevice from './Utils/InputDevice.js'
import AudioManager from './Utils/AudioManager.js'
import SettingsModal from './World/ui/SettingsModal.js'
import WorldMap from './World/ui/WorldMap.js'
import sources from './sources.js'
import i18n from './Utils/i18n.js'
import { t } from './Utils/gameText.js'
import MoveHint from './World/ui/MoveHint.js'
import FrameSpy from './Utils/FrameSpy.js'
import LoadSpy from './Utils/LoadSpy.js'

let instance = null

export default class Experience {
    constructor(canvas) {
        if (instance) {
            return instance
        }
        instance = this

        window.experience = this

        this.canvas = canvas
        this.ready = false
        // Nothing is rendered into the canvas while something opaque is on top
        // of it. See update().
        this._sceneCovered = true

        // The landing button is painted once and then sits there — and the
        // Quick Overview, reachable from that very screen, has its own language
        // toggle. Without this it would still read "Explorar" after a switch.
        i18n.on('change', () => {
            if (this.loadingEnterBtn?.classList.contains('ready') && this.progressBtnText) {
                this.progressBtnText.textContent = t('landing.explore')
            }
        })

        // Kick the catalog off FIRST. Everything below can render text, and
        // t() only works synchronously once a catalog is resident — so the
        // sooner this starts, the smaller the window in which a string could
        // fall back to its key. Anything that paints before it resolves is
        // re-rendered by the 'change' event that setLocale fires.
        i18n.init()

        // Setup
        this.debug = new Debug()
        this.quality = new Quality()
        // First, so its longtask observer covers everything below. Only exists
        // when the URL asks for it -- see Utils/LoadSpy.js.
        this.loadSpy = LoadSpy.wanted() ? new LoadSpy() : null
        window.loadSpy = this.loadSpy

        this.sizes = new Sizes()
        this.time = new Time()
        this.scene = new THREE.Scene()
        this.resources = new Resources(sources)

        // Physics shares this Rapier load; must exist before World constructs Physics.
        // Rapier 0.19 ships WASM bound at import time (see rapier_wasm3d.js) — there is no init().
        this._rapierPromise = import('@dimforge/rapier3d').then((mod) => mod.default ?? mod)

        this.camera = new Camera()
        this.renderer = new Renderer()
        this.input = new InputDevice() // before World so UI can read the active device
        this.world = new World()
        this.mobileControls = new MobileControls()
        this.gamepad = new GamepadControls()
        this.audio = new AudioManager(this)
        this.settingsUi = new SettingsModal(this)
        // Only binds a key here; the panel and its picture are built the first
        // time it is opened, so it costs nothing on the loading path.
        this.worldMap = new WorldMap(this)

        // Cloud transition elements
        this.cloudTransition = document.getElementById('cloud-transition')
        this.progressFill = document.getElementById('progress-fill')
        this.progressBtnText = document.getElementById('progress-btn-text')
        this.loadingEnterBtn = document.getElementById('loading-enter-btn')
        this.loadingOverviewBtn = document.getElementById('loading-overview-btn')
        this.initialCover = document.getElementById('initial-cover')
        this.bootScreen = document.getElementById('boot-screen')
        this._setupOverviewButton()

        // State tracking
        this.resourcesReady = false
        this.rendererReady = false
        this.allReadyHandled = false

        // Show overlay from start (skip intro scene).
        if (this.cloudTransition) {
            this.cloudTransition.style.pointerEvents = 'auto'
            this.cloudTransition.classList.add('visible')
        }

        // Resource loading progress.
        //
        // This subscription did not exist. updateLoadingBar was written, and
        // Resources emitted 'progress' the whole time, and the two were never
        // introduced -- so the bar sat at zero for the entire load and jumped
        // to full when the button turned into "Explorar". Weighing that
        // progress by bytes, as the commit before this one did, changed a
        // number nobody was reading.
        this.resources.on('progress', (value) => this.updateLoadingBar(value))

        this.resources.on('ready', () => {
            this.resourcesReady = true
            this.loadSpy?.mark('recursos listos')
            this.checkAllReady()
        })

        // Renderer init
        this.renderer.init().then(() => {
            this.rendererReady = true
            this.loadSpy?.mark('renderer listo (GPU)')
            const backendName = this.renderer.instance?.backend?.constructor?.name || 'Unknown'
            console.log('✅ Renderer backend ready:', backendName)

            this.resources.setRenderer(this.renderer.instance)

            // Fade out the initial dark cover once renderer starts.
            setTimeout(() => {
                if (this.initialCover) {
                    this.initialCover.classList.add('fade-out')
                    setTimeout(() => this.initialCover?.remove(), 1000)
                }
            }, 80)

            this.checkAllReady()
        })

        // Resize
        this.sizes.on('resize', () => {
            this.resize()
        })

        // Tick
        this.time.on('tick', () => {
            this.update()
        })
    }

    /**
     * "Quick overview" — the reading of this portfolio for people who do not
     * want to walk a 3D world. It needs none of the loaded assets, so it is
     * clickable from the first frame while the world keeps downloading.
     *
     * The module and its stylesheet are imported on demand, so visitors who go
     * straight to the world never pay for any of it.
     */
    _setupOverviewButton() {
        if (!this.loadingOverviewBtn) return

        this.loadingOverviewBtn.addEventListener('click', async () => {
            this.loadingOverviewBtn.disabled = true
            try {
                if (!this.overview) {
                    const { default: Overview } = await import('./World/ui/Overview.js')
                    this.overview = new Overview({
                        worldReady: this.loadingEnterBtn?.classList.contains('ready') === true,
                        onExplore: () => this.startExperience(),
                        // Lets the hero upgrade to the live character as soon as
                        // the model lands, without ever waiting for it.
                        resources: this.resources
                    })
                    await this.overview.init()
                }
                this.overview.open()
            } catch (err) {
                console.error('Overview failed to open:', err)
            } finally {
                this.loadingOverviewBtn.disabled = false
            }
        })
    }

    updateLoadingBar(progress) {
        if (this.progressFill) {
            // scaleX, not width: this runs while the loader is mid-parse, and a
            // width change is a layout the browser has to queue behind it. See
            // .cloud-btn-fill.
            this.progressFill.style.transform = `scaleX(${progress})`
        }
        if (this.progressBtnText && !this.loadingEnterBtn?.classList.contains('ready')) {
            this.progressBtnText.textContent = `${Math.round(progress * 100)}%`
        }
    }

    /**
     * Show loading overlay immediately (no preloader intro scene).
     */
    showCloudOverlay() {
        if (!this.cloudTransition || !this.rendererReady) return
        this.cloudTransition.style.pointerEvents = 'auto'
        this.cloudTransition.classList.add('visible')
    }

    /**
     * Check if we can proceed to show the enter button.
     * Requires: resources loaded and renderer ready.
     */
    checkAllReady() {
        if (this.allReadyHandled) return
        if (!this.resourcesReady || !this.rendererReady) return

        this.allReadyHandled = true
        this.showCloudOverlay()
        // Straight to the button. The warm-up used to happen HERE, which meant
        // the loading screen sat frozen for its whole duration -- and a frozen
        // animation is the loudest possible way to stall, because the motion
        // stopping is the thing you notice. It now runs behind the iris
        // instead, where the screen is black and nothing is moving anyway.
        // See warmUpBehindIris().
        this.showEnterButton()
    }

    /**
     * Compile everything that would otherwise stall, while the screen is fully
     * black -- and compile far more of it than a plain render would.
     *
     * WHY IT MOVED HERE. Pipeline compilation is not main-thread work; it is
     * the GPU process and the driver, which the browser's compositor shares.
     * Measured on a phone: a 1.6 second gap between two warm-up frames with the
     * main thread completely idle through it. Nothing can make that cheaper
     * from JavaScript -- compileAsync was tried three times and cannot be used
     * in this project, see the note at the end. So the only thing left to
     * choose is WHEN it is paid, and this is the moment: the iris is at 0, the
     * screen is solid black, and a stall against black is invisible where the
     * same stall against a drifting sky reads as the page hanging.
     *
     * WHY IT IS MORE AGGRESSIVE THAN A RENDER. A normal frame only compiles
     * what it actually draws, and that leaves out most of the island: anything
     * behind the camera, anything past the far plane, anything switched off
     * until you walk up to it. Those all compiled later, one at a time, which
     * is the hitching in the first seconds of play. Behind a black screen there
     * is no reason to respect any of that, so for these frames every object is
     * made visible and unculled, an object is put through the outline pass, and
     * the camera is spun so the rest of the shadow atlas gets touched too.
     * Everything is restored exactly afterwards.
     */
    async warmUpBehindIris() {
        const spy = this.loadSpy
        const t0 = performance.now()

        // Remember, then override. Recorded per object rather than blanket-set,
        // because plenty of things here are deliberately unculled or hidden and
        // must go back to being exactly that.
        //
        // Colliders are pruned, subtree and all. They are invisible geometry
        // the physics reads and the camera never sees, and there are 86 of
        // them -- forcing those visible compiles a pipeline apiece for meshes
        // that will not be drawn once in the whole session, which is the exact
        // cost this method exists to avoid paying.
        const saved = []
        const isCollider = (o) => /collider|collaider/i.test(o.name || '')
        const walk = (o) => {
            if (isCollider(o)) return
            saved.push([o, o.frustumCulled, o.visible])
            o.frustumCulled = false
            o.visible = true
            for (const c of o.children) walk(c)
        }
        for (const c of this.scene.children) walk(c)

        // The outline pass builds its own variant of an object's shader, and it
        // never runs with an empty selection -- so the first time you walked up
        // to anything, it compiled then. One mesh through it now covers it.
        const outlined = this.world?.controllerProp?.meshes?.[0]
            || this.world?.mailbox?.mesh
            || null
        if (outlined) this.renderer.addOutlinedObject(outlined)

        const camera = this.camera.instance
        const yaw0 = camera.rotation.y
        const FRAMES = 4

        try {
            for (let i = 0; i < FRAMES; i++) {
                // Spin between frames: the sun's shadow camera and the frustum
                // both follow where we look, so four quarters cover far more of
                // the island than four identical frames would.
                camera.rotation.y = yaw0 + (i / FRAMES) * Math.PI * 2
                camera.updateMatrixWorld(true)

                const t = performance.now()
                try {
                    this.renderer.update()
                } catch (err) {
                    console.warn('warmUpBehindIris: frame failed', err)
                }
                spy?.mark(`  iris f${i + 1}: ${Math.round(performance.now() - t)} ms`)

                // Hand the frame back so the driver can chew on what was just
                // submitted instead of queueing four submissions at once.
                //
                // Raced against a timer, because requestAnimationFrame stops
                // firing in a backgrounded tab -- and the one thing worse than
                // a stall behind a black screen is being stuck behind it
                // because someone checked a message mid-transition. Measured
                // at 14.9 s that way, against 1.4 s in the foreground.
                await new Promise((r) => {
                    let done = false
                    const go = () => { if (!done) { done = true; r() } }
                    requestAnimationFrame(go)
                    setTimeout(go, 150)
                })
            }
        } finally {
            if (outlined) this.renderer.removeOutlinedObject(outlined)
            for (const [o, culled, visible] of saved) {
                o.frustumCulled = culled
                o.visible = visible
            }
            camera.rotation.y = yaw0
            camera.updateMatrixWorld(true)
        }

        spy?.mark(`calentamiento tras el iris: ${Math.round(performance.now() - t0)} ms`)
    }

    showEnterButton() {
        // Marked, but NOT finished: the button appearing is no longer the end
        // of loading, it is the end of the first half. The boot screen after
        // the click is where the expensive half happens, and stopping the
        // report here meant its numbers were collected and never shown.
        this.loadSpy?.mark('listo para entrar')
        if (this.progressFill) {
            this.progressFill.style.transform = 'scaleX(1)'
        }
        if (this.progressBtnText) {
            this.progressBtnText.textContent = t('landing.explore')
        }
        if (this.loadingEnterBtn) {
            this.loadingEnterBtn.disabled = false
            this.loadingEnterBtn.classList.add('ready')
            this.loadingEnterBtn.addEventListener('click', () => {
                this.startExperience()
            }, { once: true })
        }
        // Someone may already be reading the overview — let its Explore CTAs go live.
        this.overview?.setWorldReady(true)
    }

    /**
     * User clicked "Explorar" → slide cloud out, reveal main scene.
     */
    async startExperience() {
        if (!this.rendererReady) return
        // Three things can call this -- the button, the overview's CTA and a
        // keypress -- and it is now a long await chain, so a second call could
        // land in the middle of the first and run the whole transition twice.
        if (this._starting) return
        this._starting = true
        if (this.loadingEnterBtn) {
            this.loadingEnterBtn.disabled = true
            this.loadingEnterBtn.classList.remove('ready')
        }

        // ── The boot screen goes up FIRST, and gets a frame to paint ──────
        // Everything below it is expensive and blocking, so the mark has to be
        // on screen and already beating before any of it starts -- otherwise
        // the first thing the player sees after clicking is a frozen white
        // shape, which is worse than the frozen sky it replaced.
        this.bootScreen?.classList.add('is-visible')
        this.bootScreen?.setAttribute('aria-hidden', 'false')
        await this._nextPaint()

        // Reveals the world-only chrome (the map button); the start screen has
        // nothing to travel around.
        document.body.classList.add('is-in-world')

        // Kick off the soundtrack — this click is the user gesture that unlocks
        // audio autoplay, and it is also the only signal the player gets that
        // the press registered while the island is being built.
        this.audio?.startSoundtrack()

        // The start screen is gone from underneath.
        this.cloudTransition?.remove()
        this.cloudTransition = null
        this.overview?.destroy()
        this.overview = null

        // ── Everything that stalls, paid here ──────────────────────────────
        // Behind the mark: the island gets built, then every shader it needs
        // gets compiled. Both block the main thread and stall the GPU, and
        // neither can be made cheap -- see warmUpBehindIris(). What CAN be
        // chosen is where they land, and this is the one screen in the whole
        // run whose only moving part is animated by the compositor and does
        // not care that this thread has stopped.
        await this.world.build()
        this.loadSpy?.mark('mundo construido (tras el boton)')

        this.ready = true
        this.renderer.setIrisTransitionEnabled(true)
        this.renderer.setIrisTransitionSize(0.0)
        await this.warmUpBehindIris()

        // Hand over. The iris underneath is already solid black, so the mark
        // simply fades out over it and the hole opens in the same black --
        // there is no seam between the two screens to notice.
        this._sceneCovered = false
        await this._nextPaint()
        this.bootScreen?.classList.remove('is-visible')
        this.bootScreen?.setAttribute('aria-hidden', 'true')
        this.loadSpy?.finish()

        // Iris: open to a small hole, hold, breathe in, then open fully.
        //
        // The size is a RADIUS in units where the screen's half-height is 0.5 --
        // so 0.25 is a hole half the screen tall, which on a portrait phone is
        // most of the view and stops reading as a peephole at all. The phone
        // value exists because the desktop one really is too small there, not
        // because it wanted to be big.
        //
        // Keyed off the user agent rather than the quality tier: the tier was
        // only ever standing in for "is this a phone", and it gets it wrong the
        // moment someone picks high quality on one.
        const isMobile = this.quality.isMobile
        const holeSize = isMobile ? 0.14 : 0.075
        const shrinkSize = isMobile ? 0.10 : 0.058

        await this.animateValue(0.0, holeSize, 420, (v) => this.renderer.setIrisTransitionSize(v))
        await this.waitMs(1000)
        await this.animateValue(holeSize, shrinkSize, 150, (v) => this.renderer.setIrisTransitionSize(v))
        await this.animateValue(shrinkSize, 1.35, 1650, (v) => this.renderer.setIrisTransitionSize(v))
        this.renderer.setIrisTransitionEnabled(false)

        // Only now, with the iris out of the way and the island fully visible,
        // is there room to say anything -- and the one thing worth saying is
        // how to walk. It leaves on the first keypress. See ui/MoveHint.js.
        this.moveHint = new MoveHint()
        this.moveHint.show()

        // Frame profiler, off unless asked for. `#spy` in the URL starts it
        // immediately; otherwise it waits on window.frameSpy.start(). See
        // Utils/FrameSpy.js -- it exists to name whoever is behind the one-off
        // hitch a couple of seconds into the first walk.
        this.frameSpy = new FrameSpy(this)
        window.frameSpy = this.frameSpy
        if (window.location.hash.includes('spy')) this.frameSpy.start()
    }

    waitMs(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Wait for the browser to actually put a frame up.
     *
     * Raced against a timer because requestAnimationFrame does not fire in a
     * backgrounded tab, and a transition that waits on it forever is a hang.
     */
    _nextPaint() {
        return new Promise((resolve) => {
            let done = false
            const go = () => { if (!done) { done = true; resolve() } }
            requestAnimationFrame(() => requestAnimationFrame(go))
            setTimeout(go, 200)
        })
    }

    animateValue(from, to, duration, onUpdate) {
        return new Promise((resolve) => {
            const start = performance.now()

            const tick = () => {
                const elapsed = performance.now() - start
                const t = Math.min(elapsed / duration, 1)
                const eased = t < 0.5
                    ? 2 * t * t
                    : 1 - Math.pow(-2 * t + 2, 2) / 2

                const value = from + (to - from) * eased
                onUpdate(value)

                if (t < 1) {
                    requestAnimationFrame(tick)
                } else {
                    resolve()
                }
            }

            requestAnimationFrame(tick)
        })
    }

    resize() {
        this.camera.resize()
        this.renderer.resize()
    }

    update() {
        // Prevent any render call before WebGPU backend init finishes.
        if (!this.rendererReady) return

        // AND NOT WHILE SOMETHING OPAQUE IS COVERING THE CANVAS.
        //
        // This used to render the whole island every frame from the moment the
        // backend was up -- underneath the start screen, which is a solid sky
        // gradient, and then underneath the boot screen, which is solid black.
        // Full scene, full pixel ratio, every post-processing pass, sixty times
        // a second, for pixels that could not reach a display. On a phone it
        // was competing for the GPU with the only thing anyone could actually
        // see: the loading screen's own animation.
        if (this._sceneCovered) return

        // Render main scene behind transition while locked.
        // NOTE the order: world BEFORE camera — the camera must frame the
        // character's CURRENT position. The old camera-first order made it
        // chase last frame's position (one frame of lag → visible rubber-band
        // jitter on the character, worse at variable frame rates).
        if (!this.ready) {
            this.world.update()
            this.camera.update()
            this.renderer.update()
            return
        }

        // Full interactive experience
        this.mobileControls.update()
        this.gamepad.update()
        this.world.update()
        this.audio?.update()
        this.camera.update()
        this.renderer.update()
    }
}
