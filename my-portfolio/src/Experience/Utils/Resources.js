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

        /**
         * Bytes per critical source, for a loading bar that tells the truth.
         *
         * It used to be criticalLoaded / criticalToLoad -- a count of FILES.
         * With 25 critical sources over 3.7 MB that is wildly uneven: the
         * character atlas alone is 33% of the download and 4% of the bar,
         * and the four biggest files are 81% of the wait against 16% of the
         * movement. So the bar sat at nothing while the heavy things came
         * down, then leapt as the small ones landed together, and the first
         * thing anyone saw of this site looked broken.
         */
        this._bytes = new Map()
        /** The bar never goes backwards -- see _reportProgress. */
        this._progressShown = 0

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

        // On error we still call sourceLoaded(null) so the critical counter
        // advances and 'ready' can never stall on a single bad asset. The error
        // is logged loudly so missing/404 assets are obvious in the console.
        const onError = (err) => {
            console.error(`Resources: failed to load ${source.type} "${source.name}" @ ${source.path}`, err)
            this.sourceLoaded(source, null)
        }

        if (source.type === 'gltfModel') {
            this.loaders.gltfLoader.load(
                source.path,
                (file) => { this.sourceLoaded(source, file) },
                this._trackBytes(source),
                onError
            )
        }
        else if (source.type === 'texture') {
            this.loaders.textureLoader.load(
                source.path,
                (file) => {
                    if (source.modifier) source.modifier(file)
                    this.sourceLoaded(source, file)
                },
                this._trackBytes(source),
                onError
            )
        }
        else if (source.type === 'textureKtx') {
            this.loaders.ktx2Loader.load(
                source.path,
                (file) => {
                    if (source.modifier) source.modifier(file)
                    this.sourceLoaded(source, file)
                },
                this._trackBytes(source),
                onError
            )
        }
        else if (source.type === 'cubeTexture') {
            this.loaders.cubeTextureLoader.load(
                source.path,
                (file) => { this.sourceLoaded(source, file) },
                this._trackBytes(source),
                onError
            )
        }
        else if (source.type === 'json') {
            fetch(source.path)
                .then((res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status} for ${source.path}`)
                    // fetch has no progress events, but the header alone is
                    // enough to weigh it correctly against the big models.
                    const len = Number(res.headers.get('content-length'))
                    if (len > 0 && source.priority !== 'decorative') {
                        this._bytes.set(source.name, { loaded: 0, total: len })
                        this._reportProgress()
                    }
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

    /**
     * An onProgress for a loader, recording bytes against its source.
     *
     * @param {object} source
     * @returns {(event: ProgressEvent) => void}
     */
    _trackBytes(source) {
        if (source.priority === 'decorative') return undefined
        return (event) => {
            this._bytes.set(source.name, {
                loaded: event.loaded || 0,
                // lengthComputable is false when the server sends no
                // Content-Length; the estimate below covers that case.
                total: event.lengthComputable ? event.total : 0
            })
            this._reportProgress()
        }
    }

    /**
     * Weighted by size, and monotonic.
     *
     * Sources that have not reported a size yet are counted at a nominal one
     * so the denominator does not grow as totals trickle in -- and even so the
     * result is clamped to never fall, because a bar that goes backwards looks
     * worse than one that is slightly optimistic.
     */
    _reportProgress() {
        if (this.criticalDone) return
        // Not every loader can report bytes. GLTFLoader and KTX2Loader go
        // through FileLoader/XHR and give real numbers; TextureLoader builds
        // an Image element, which fires no progress at all. That is fine here
        // because the four sources that dominate the wait are all models and
        // KTX2 -- measured: 23 of 23 critical sources ended up weighed, and
        // the ones falling back are small textures.
        const NOMINAL = 150 * 1024   // ≈ the mean critical source

        let loaded = 0
        let total = 0
        for (const source of this.criticalSources) {
            const entry = this._bytes.get(source.name)
            const size = entry?.total || NOMINAL
            total += size
            loaded += Math.min(entry?.loaded || 0, size)
        }

        const value = total > 0 ? loaded / total : 0
        this._progressShown = Math.max(this._progressShown, Math.min(value, 1))
        this.trigger('progress', [this._progressShown])
    }

    sourceLoaded(source, file) {
        this.items[source.name] = file
        this.cache.set(source.path, file)

        const isCritical = source.priority !== 'decorative'
        if (isCritical) this.criticalLoaded++
        else this.decorativeLoaded++

        // Progress only counts critical for the "Explorar" loading bar.
        if (isCritical && !this.criticalDone) {
            // Finished means finished, whatever the byte reports said -- a
            // loader that never fired onProgress (cached, or no
            // Content-Length) would otherwise hold the bar back forever.
            const entry = this._bytes.get(source.name)
            const size = entry?.total || entry?.loaded || 150 * 1024
            this._bytes.set(source.name, { loaded: size, total: size })
            this._reportProgress()
        }

        // Fire per-source event so consumers can lazy-instantiate decorative pieces.
        try {
            this.trigger('sourceLoaded', [source.name, file])
        } catch (err) {
            console.error(`Resources: a "sourceLoaded" listener threw for ${source.name}`, err)
        }

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
        // A throwing 'ready' listener must NOT prevent decorative streaming.
        try {
            this.trigger('ready')
        } catch (err) {
            console.error('Resources: a "ready" listener threw', err)
        }
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
