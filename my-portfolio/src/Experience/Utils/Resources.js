import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import EventEmitter from './EventEmitter.js'

export default class Resources extends EventEmitter {
    constructor(sources) {
        super()

        this.sources = sources
        this.items = {}
        this.toLoad = this.sources.length
        this.loaded = 0

        this.cache = new Map()
        this.loaders = {}
        this.rendererReady = false
        this.deferredSources = []

        this.setLoaders()
        this.startLoading()
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

        for (const source of this.deferredSources) {
            this.loadSource(source)
        }
        this.deferredSources = []
    }

    startLoading() {
        for (const source of this.sources) {
            if (source.type === 'textureKtx' && !this.rendererReady) {
                this.deferredSources.push(source)
                continue
            }
            this.loadSource(source)
        }
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
    }

    sourceLoaded(source, file) {
        this.items[source.name] = file
        this.cache.set(source.path, file)
        this.loaded++

        this.trigger('progress', [this.loaded / this.toLoad])

        if (this.loaded === this.toLoad) {
            this.trigger('ready')
        }
    }
}
