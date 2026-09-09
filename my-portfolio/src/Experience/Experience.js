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
        this.warmUpRender()
    }

    /**
     * Render a few frames of the main scene behind the cloud overlay to compile
     * shaders, then reveal the enter button.
     *
     * THIS IS WHERE THE LOADING SCREEN FREEZES, AND IT CANNOT BE FIXED HERE.
     *
     * These frames exist to force every shader in the scene to compile now,
     * where a stall is hidden, rather than during the first seconds of play.
     * The stall is real, and it is not on this thread: compiling a pipeline is
     * the GPU process and the graphics driver, which the browser's compositor
     * shares. So while it runs the compositor cannot present, and the loading
     * screen's animation stops dead with nothing blocking the main thread.
     *
     * Measured rather than assumed -- LoadSpy, cold cache, on a desktop:
     *
     *     TAREAS LARGAS  5  ·  bloqueado 648 ms      SALTOS ENTRE FRAMES
     *       199 ms  a los 2.1s                         1254 ms  a los 2.0s
     *       143 ms  a los 0.7s                          223 ms  a los 2.2s
     *
     * A frame gap of 1254 ms with only 199 ms of main-thread work under it, in
     * the middle of this method's window. The three frames below cost 17, 6 and
     * 7 ms of JavaScript. Everything else was the driver.
     *
     * The same page reloaded, with Chrome's shader cache now warm, reaches the
     * enter button in 0.9 s with no gap over 200 ms. So this is a COLD-CACHE
     * cost, which is to say it is what a first-time visitor gets -- and on a
     * mid-range phone, with a slower driver and no spare core to hide it on,
     * that same second becomes several.
     *
     * The textbook remedy is compileAsync, which builds the same pipelines
     * through createRenderPipelineAsync, off the driver's critical path. It
     * does not work here, and it is worth writing down why so nobody spends
     * the afternoon again:
     *
     *   - renderer.compileAsync(scene, camera) compiles with NO render target
     *     bound. Every material here writes to a multi-target attachment, so
     *     MRTNode.setup() asks which target it is writing into, gets null, and
     *     the shader cannot be built: "Cannot read properties of null
     *     (reading 'textures')".
     *   - scenePass.compileAsync(renderer) does bind the target and the MRT,
     *     and gets further -- straight into a worse failure. It fills the
     *     pipeline cache with variants shaped for the scene pass's two colour
     *     attachments, and the SHADOW pass then draws the same objects into a
     *     target that has one. Dawn rejects the pipeline ("target has no
     *     corresponding fragment stage output but writeMask is not zero") and
     *     the next frame throws "parameter 1 is not of type GPURenderPipeline".
     *
     * A third attempt narrowed it to "only where there is no shadow pass",
     * since Android has none and Android is where this hurts. That is not
     * enough either: the same two errors came back on low quality with the sun
     * casting nothing. The shadow pass is not the only thing that re-renders
     * these objects into a target of its own shape -- the outline pass does,
     * and so does anything built on RTTNode, both from inside updateBefore,
     * which is where the failing stack ends. Precompiling would have to build a
     * variant for every one of those target shapes, and in r183 there is no way
     * to ask it to.
     *
     * So: three attempts, three failures, and the conclusion is that this stall
     * is paid here or it is paid in the first seconds of play. Here is better.
     */
    warmUpRender() {
        this.loadSpy?.mark('calentamiento (compila shaders)')
        let frames = 0
        const totalFrames = 3

        const doWarmUp = () => {
            const spy = this.loadSpy
            if (frames === 0) spy?.mark('  (primer frame del calentamiento empieza)')
            const t0 = spy ? performance.now() : 0
            this.camera.update()
            const t1 = spy ? performance.now() : 0
            this.world.update()
            const t2 = spy ? performance.now() : 0
            this.renderer.update()
            frames++
            if (spy) {
                const t3 = performance.now()
                const ms = (a, b) => String(Math.round(b - a)).padStart(4)
                spy.mark(
                    `  f${frames}: total ${ms(t0, t3)}  ·  cam ${ms(t0, t1)}` +
                    `  mundo ${ms(t1, t2)}  render ${ms(t2, t3)}`
                )
            }

            if (frames < totalFrames) {
                requestAnimationFrame(doWarmUp)
            } else {
                this.showEnterButton()
            }
        }

        requestAnimationFrame(doWarmUp)
    }

    showEnterButton() {
        this.loadSpy?.mark('listo para entrar')
        this.loadSpy?.finish()
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
        if (this.loadingEnterBtn) {
            this.loadingEnterBtn.disabled = true
            this.loadingEnterBtn.classList.remove('ready')
        }

        // Start rendering scene immediately under the iris.
        this.ready = true
        // Reveals the world-only chrome (the map button); the start screen has
        // nothing to travel around.
        document.body.classList.add('is-in-world')

        // Kick off the soundtrack — this click is the user gesture that unlocks
        // audio autoplay. AudioManager handles its own delay + fade-in so the
        // music swells in just as the iris opens.
        this.audio?.startSoundtrack()

        // Start from full black instantly to avoid a visible frame leak.
        this.renderer.setIrisTransitionEnabled(true)
        this.renderer.setIrisTransitionSize(0.0)

        // Remove white UI overlay after iris is active.
        this.cloudTransition?.remove()
        this.cloudTransition = null

        // The overview belongs to the start screen; once we are in the world
        // there is nothing to go back to.
        this.overview?.destroy()
        this.overview = null

        // Iris transition: open to a small hole, hold, anticipation in, open fully.
        // Total ~3.2 s — shaders compile naturally in the render loop during this time.
        // On mobile, we make the hole significantly bigger because 0.075 is microscopic 
        // on a phone screen, which makes it look like a "black screen bug" to the user.
        const isMobile = this.quality.isLow
        const holeSize = isMobile ? 0.25 : 0.075
        const shrinkSize = isMobile ? 0.18 : 0.058

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
