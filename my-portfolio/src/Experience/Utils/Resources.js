import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import EventEmitter from './EventEmitter.js'

/**
 * Resources — tiered asset loader.
 *
 * Sources are split by `priority`:
 *   - 'critical'   (default) → must finish before the experience can start.
 *                              When all critical items finish → fires 'ready'.
 *   - 'decorative'           → streamed in *after* critical, so the player
 *                              can already roam. Each one fires 'sourceLoaded'
 *                              and the batch fires 'allReady' when done.
 *
 * Critical assets get all the bandwidth first; decorative assets only start
 * loading once critical is done, so progress to "Explorar" is as fast as
 * possible.
 *
 * Subscribers to 'sourceLoaded' (e.g. `PatioScene`, `World`) can hook into
 * specific decorative items to instantiate their meshes lazily.
 */
export default class Resources extends EventEmitter {
    constructor(sources) {
        super()

        this.sources = sources

        this.criticalSources = sources.filter(s => s.priority !== 'decorative')
        this.decorativeSources = sources.filter(s => s.priority === 'decorative')

        this.items = {}
        this.criticalToLoad = this.criticalSources.length
        this.decorativeToLoad = this.decorativeSources.length
        this.criticalLoaded = 0
        this.decorativeLoaded = 0
        this.criticalDone = false
        this.allDone = false

        this.cache = new Map()
        this.loaders = {}
        this.rendererReady = false
        // KTX2 sources can't load until setRenderer() runs (transcoder support).
        this.deferredKtx = []

        this.setLoaders()
        this.startLoadingCritical()
    }

    setLoaders() {
        this.loaders.textureLoader = new THREE.TextureLoader()
        this.loaders.cubeTextureLoader = new THREE.CubeTextureLoader()

        this.loaders.dracoLoader = new DRACOLoader()
        this.loaders.dracoLoader.setDecoderPath('/draco/')
        this.loaders.dracoLoader.preload()

        this.loaders.gltfLoader = new GLTFLoader()
        this.loaders.gltfLoader.setDRACOLoader(this.loaders.dracoLoader)
    }

    /**
     * Call after renderer.init() so KTX2Loader can detect GPU texture support.
     * Loads any deferred KTX sources and wires the KTX2 loader into GLTF.
     */
    setRenderer(renderer) {
        this.loaders.ktx2Loader = new KTX2Loader()
        this.loaders.ktx2Loader.setTranscoderPath('/basis/')
        this.loaders.ktx2Loader.detectSupport(renderer)

        this.loaders.gltfLoader.setKTX2Loader(this.loaders.ktx2Loader)
        this.rendererReady = true

        for (const source of this.deferredKtx) {
            this.loadSource(source)
        }
        this.deferredKtx = []
    }

    startLoadingCritical() {
        if (this.criticalToLoad === 0) {
            this._onCriticalDone()
            return
        }
        for (const source of this.criticalSources) {
            this._scheduleLoad(source)
        }
    }

    startLoadingDecorative() {
        if (this.decorativeToLoad === 0) {
            this._onAllDone()
            return
        }
        for (const source of this.decorativeSources) {
            this._scheduleLoad(source)
        }
    }

    _scheduleLoad(source) {
        if (source.type === 'textureKtx' && !this.rendererReady) {
            this.deferredKtx.push(source)
            return
        }
        this.loadSource(source)
    }

    loadSource(source) {
        if (this.cache.has(source.path)) {
            this.sourceLoaded(source, this.cache.get(source.path))
            return
        }

        if (source.type === 'gltfModel') {
            this.loaders.gltfLoader.load(
                source.path,
                (file) => { this.sourceLoaded(source, file) }
            )
        }
        else if (source.type === 'texture') {
            this.loaders.textureLoader.load(
                source.path,
                (file) => {
                    if (source.modifier) source.modifier(file)
                    this.sourceLoaded(source, file)
                }
            )
        }
        else if (source.type === 'textureKtx') {
            this.loaders.ktx2Loader.load(
                source.path,
                (file) => {
                    if (source.modifier) source.modifier(file)
                    this.sourceLoaded(source, file)
                }
            )
        }
        else if (source.type === 'cubeTexture') {
            this.loaders.cubeTextureLoader.load(
                source.path,
                (file) => { this.sourceLoaded(source, file) }
            )
        }
        else if (source.type === 'json') {
            fetch(source.path)
                .then((res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status} for ${source.path}`)
                    return res.json()
                })
                .then((file) => {
                    if (source.modifier) source.modifier(file)
                    this.sourceLoaded(source, file)
                })
                .catch((err) => {
                    console.error(`Resources: failed to load JSON ${source.path}`, err)
                    this.sourceLoaded(source, null)
                })
        }
    }

    sourceLoaded(source, file) {
        this.items[source.name] = file
        this.cache.set(source.path, file)

        const isCritical = source.priority !== 'decorative'
        if (isCritical) this.criticalLoaded++
        else this.decorativeLoaded++

        // Progress only counts critical for the "Explorar" loading bar.
        if (!this.criticalDone) {
            this.trigger('progress', [this.criticalLoaded / Math.max(this.criticalToLoad, 1)])
        }

        // Fire per-source event so consumers can lazy-instantiate decorative pieces.
        this.trigger('sourceLoaded', [source.name, file])

        if (!this.criticalDone && this.criticalLoaded === this.criticalToLoad) {
            this._onCriticalDone()
        }
        if (this.criticalDone && !this.allDone &&
            this.decorativeLoaded === this.decorativeToLoad) {
            this._onAllDone()
        }
    }

    _onCriticalDone() {
        this.criticalDone = true
        this.trigger('ready')
        // Kick off decorative AFTER critical is done so it doesn't slow it.
        this.startLoadingDecorative()
    }

    _onAllDone() {
        this.allDone = true
        this.trigger('allReady')
    }

    // ── Back-compat helpers ──────────────────────────────────────
    /** @deprecated use criticalToLoad / decorativeToLoad instead. */
    get toLoad() { return this.criticalToLoad }
    get loaded() { return this.criticalLoaded }
}
