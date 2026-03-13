import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import {
    Fn, float, vec2, vec3, uv, time,
    floor, fract, dot, mix, clamp, smoothstep, hash
} from 'three/tsl'

export default class Preloader {
    constructor(renderer, sizes, quality) {
        this.renderer = renderer
        this.sizes = sizes
        this.quality = quality
        this.active = true
        this.disposed = false
        this.modelLoaded = false

        // Orbit — slow cinematic sweep
        this.orbitElapsed = 0
        this.orbitDuration = 8.5
        this.orbitStartAngle = Math.PI * 0.2
        this.orbitTotalRotation = Math.PI * 1.6
        this.orbitDone = false
        this.onOrbitComplete = null

        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color('#e4ecf4')

        this.camera = new THREE.PerspectiveCamera(
            36, sizes.width / sizes.height, 0.1, 50
        )
        this.orbitRadius = 3.5
        this.orbitHeight = 1.5
        this.lookAtY = 0.9

        this.setLights()

        if (quality.isLow) {
            this.setSimpleCloudCylinder()
        } else {
            this.setCloudCylinder()
        }

        this.loadCharacter()
        this.updateCamera(0)
    }

    setLights() {
        this.scene.add(new THREE.AmbientLight('#ffffff', 0.85))

        const sun = new THREE.DirectionalLight('#fff4e6', 1.3)
        sun.position.set(3, 5, -2)
        this.scene.add(sun)

        this.scene.add(new THREE.HemisphereLight('#86b8ff', '#fef3c7', 0.5))
    }

    setSimpleCloudCylinder() {
        const geo = new THREE.CylinderGeometry(5, 5, 14, 32, 1, true)
        const mat = new THREE.MeshBasicMaterial({
            side: THREE.BackSide,
            color: '#dbe3ed',
            transparent: true,
            opacity: 0.85
        })
        this.cylinder = new THREE.Mesh(geo, mat)
        this.cylinder.position.y = 2
        this.scene.add(this.cylinder)
    }

    setCloudCylinder() {
        const valueNoise2D = Fn(([p]) => {
            const i = vec2(floor(p))
            const f = vec2(fract(p))
            const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)))
            const a = hash(dot(i, vec2(127.1, 311.7)))
            const b = hash(dot(i.add(vec2(1.0, 0.0)), vec2(127.1, 311.7)))
            const c = hash(dot(i.add(vec2(0.0, 1.0)), vec2(127.1, 311.7)))
            const d = hash(dot(i.add(vec2(1.0, 1.0)), vec2(127.1, 311.7)))
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y)
        })

        const fbm2 = Fn(([p]) => {
            const pos = vec2(p).toVar()
            const r = valueNoise2D(pos).mul(0.5).toVar()
            pos.addAssign(vec2(1.7, 9.2))
            r.addAssign(valueNoise2D(pos.mul(2.0)).mul(0.25))
            return r
        })

        const colorNode = Fn(() => {
            const c = uv()
            const n1 = fbm2(c.mul(5.0).add(vec2(time.mul(0.1), time.mul(0.04))))
            const n2 = fbm2(c.mul(5.5).add(vec2(time.mul(-0.08), time.mul(0.06))))
            const n = clamp(n1.add(n2).mul(0.55), 0.0, 1.0)
            const base = vec3(0.4, 0.64, 1.0) // #66a3ff
            const cloud = vec3(0.92, 0.95, 1.0)
            const warm = vec3(1.0, 1.0, 1.0)
            return mix(mix(base, cloud, n), warm, n.mul(n))
        })()

        const opacityNode = Fn(() => {
            const y = uv().y
            return smoothstep(0.0, 0.25, y).mul(smoothstep(1.0, 0.75, y)).mul(0.9)
        })()

        const geo = new THREE.CylinderGeometry(5, 5, 14, 48, 1, true)
        const mat = new THREE.MeshBasicNodeMaterial({
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false
        })
        mat.colorNode = colorNode
        mat.opacityNode = opacityNode

        this.cylinder = new THREE.Mesh(geo, mat)
        this.cylinder.position.y = 2
        this.scene.add(this.cylinder)
    }

    async loadCharacter() {
        const draco = new DRACOLoader()
        draco.setDecoderPath('/draco/')

        const gltfLoader = new GLTFLoader()
        gltfLoader.setDRACOLoader(draco)

        const ktx2Loader = new KTX2Loader()
        ktx2Loader.setTranscoderPath('/basis/')
        ktx2Loader.detectSupport(this.renderer)

        try {
            const [gltf, atlas] = await Promise.all([
                gltfLoader.loadAsync('/models/human/human-walk-draco.glb'),
                ktx2Loader.loadAsync('/models/human/human-atlas.ktx2')
            ])

            if (this.disposed) { draco.dispose(); ktx2Loader.dispose(); return }

            atlas.colorSpace = THREE.SRGBColorSpace
            atlas.wrapS = THREE.ClampToEdgeWrapping
            atlas.wrapT = THREE.ClampToEdgeWrapping
            atlas.generateMipmaps = false
            atlas.minFilter = THREE.LinearFilter
            atlas.magFilter = THREE.LinearFilter
            atlas.repeat.set(0.5, 0.5)
            atlas.offset.set(0, 0)

            this.model = gltf.scene
            this.model.traverse(c => {
                if (c.isMesh) {
                    c.material = new THREE.MeshLambertMaterial({ map: atlas })
                }
            })

            const box = new THREE.Box3().setFromObject(this.model)
            this.model.position.y = -box.min.y

            this.mixer = new THREE.AnimationMixer(this.model)
            let foundStand = false
            for (const clip of gltf.animations) {
                if (clip.name.toLowerCase().includes('stand')) {
                    const action = this.mixer.clipAction(clip)
                    action.setLoop(THREE.LoopOnce)
                    action.clampWhenFinished = true
                    action.play()
                    foundStand = true
                    break
                }
            }
            if (!foundStand && gltf.animations.length > 0) {
                const action = this.mixer.clipAction(gltf.animations[0])
                action.setLoop(THREE.LoopOnce)
                action.clampWhenFinished = true
                action.play()
            }

            this.scene.add(this.model)
            this.modelLoaded = true
        } catch (err) {
            console.warn('Preloader: load failed', err)
        }

        draco.dispose()
        ktx2Loader.dispose()
    }

    updateCamera(progress) {
        // Smoothstep easing — gentle acceleration and deceleration
        const eased = progress * progress * (3 - 2 * progress)
        const angle = this.orbitStartAngle + eased * this.orbitTotalRotation

        // Gentle height wave (up-down-up over the orbit)
        const heightWave = Math.sin(progress * Math.PI * 2) * 0.18
        const height = this.orbitHeight + heightWave

        // Slight radius breathing (closer at midpoint)
        const radiusWave = Math.sin(progress * Math.PI) * 0.25
        const radius = this.orbitRadius - radiusWave

        this.camera.position.set(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius
        )
        this.camera.lookAt(0, this.lookAtY, 0)
    }

    update(delta) {
        if (!this.active || this.disposed) return

        const dt = delta * 0.001

        if (this.modelLoaded && !this.orbitDone) {
            this.orbitElapsed += dt
            const p = Math.min(this.orbitElapsed / this.orbitDuration, 1)
            this.updateCamera(p)
            if (p >= 1) {
                this.orbitDone = true
                if (this.onOrbitComplete) this.onOrbitComplete()
            }
        }

        if (this.mixer) this.mixer.update(dt)

        this.renderer.render(this.scene, this.camera)
    }

    resize(width, height) {
        this.camera.aspect = width / height
        this.camera.updateProjectionMatrix()
    }

    dispose() {
        this.disposed = true
        this.active = false

        this.scene.traverse(c => {
            if (c.isMesh) {
                c.geometry?.dispose()
                const mat = c.material
                if (Array.isArray(mat)) mat.forEach(m => m.dispose())
                else mat?.dispose()
            }
        })

        this.scene.clear()
        this.mixer = null
        this.model = null
        this.cylinder = null
    }
}
