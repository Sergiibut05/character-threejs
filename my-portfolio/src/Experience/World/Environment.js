import * as THREE from 'three'
import Experience from '../Experience.js'
import { uniform, mix, positionWorld, cameraPosition, smoothstep, vec3 } from 'three/tsl'

export default class Environment {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        this.setAmbientLight()
        this.setSunLight()
        this.setSky()

        if (this.debug.active) {
            this.setDebug()
        }
    }

    setAmbientLight() {
        this.ambientLight = new THREE.AmbientLight('#ffffff', 1.0)
        this.scene.add(this.ambientLight)
    }

    setSunLight() {
        const quality = this.experience.quality

        this.sunLight = new THREE.DirectionalLight('#fff4e6', 1.6)
        this.sunLight.castShadow = true
        this.sunLight.shadow.camera.near = 0.5
        this.sunLight.shadow.camera.far = 60
        this.sunLight.shadow.camera.left = -20
        this.sunLight.shadow.camera.right = 20
        this.sunLight.shadow.camera.top = 20
        this.sunLight.shadow.camera.bottom = -20
        this.sunLight.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize)
        this.sunLight.shadow.bias = -0.0001
        this.sunLight.shadow.normalBias = 0.04
        this.sunLight.shadow.radius = quality.shadowRadius
        this.sunLight.position.set(4, 5, -3)
        this.sunLight.target.position.set(0, 0, 0)
        this.scene.add(this.sunLight.target)
        this.scene.add(this.sunLight)

        this.skyLight = new THREE.HemisphereLight('#dbeafe', '#fef3c7', 0.7)
        this.scene.add(this.skyLight)
    }

    setSky() {
        this.skyTopColor = uniform(new THREE.Color('#86b8ff'))
        this.skyBottomColor = uniform(new THREE.Color('#f7fbff'))
        this.skySunColor = uniform(new THREE.Color('#fff4d8'))
        this.skySunDirection = uniform(this.sunLight.position.clone().normalize())
        this.skySunIntensity = uniform(0.25)
        this.skySunSharpness = uniform(640.0)
        this.skyHorizonOffset = uniform(0.08)

        const viewDir = positionWorld.sub(cameraPosition).normalize()
        const height01 = viewDir.y.mul(0.5).add(0.5).add(this.skyHorizonOffset).clamp(0.0, 1.0)
        const gradient = smoothstep(0.0, 1.0, height01)
        const baseSky = mix(this.skyBottomColor, this.skyTopColor, gradient)
        const sunDisk = viewDir.dot(this.skySunDirection.normalize()).max(0.0).pow(this.skySunSharpness).mul(this.skySunIntensity)
        const skyColor = baseSky.add(this.skySunColor.mul(sunDisk))

        const material = new THREE.MeshBasicNodeMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            fog: false
        })
        material.colorNode = vec3(skyColor)

        const geometry = new THREE.SphereGeometry(1, 32, 16)
        this.sky = new THREE.Mesh(geometry, material)
        // Camera far plane is 100, keep sky dome comfortably inside it.
        this.sky.scale.setScalar(60)
        this.sky.frustumCulled = false
        this.scene.add(this.sky)
    }

    update() {
        const camera = this.experience.camera.instance

        if (this.sky) {
            this.sky.position.copy(camera.position)
            this.skySunDirection.value.copy(this.sunLight.position).normalize()
        }
    }

    setDebug() {
        this.debugFolder = this.debug.ui.addFolder('Environment')
        this.debugFolder.close()

        this.debugFolder.add(this.sunLight.position, 'x', -20, 20, 0.1).name('Sun X')
            .onChange(() => this.update())
        this.debugFolder.add(this.sunLight.position, 'y', 0.1, 30, 0.1).name('Sun Y')
            .onChange(() => this.update())
        this.debugFolder.add(this.sunLight.position, 'z', -20, 20, 0.1).name('Sun Z')
            .onChange(() => this.update())
        this.debugFolder.add(this.sunLight, 'intensity', 0, 6, 0.01).name('Sun Intensity')
        this.debugFolder.add(this.ambientLight, 'intensity', 0, 2, 0.01).name('Ambient Intensity')
        this.debugFolder.add(this.skyLight, 'intensity', 0, 2, 0.01).name('Hemisphere Intensity')

        this.debugFolder.addColor({ value: this.skyTopColor.value }, 'value').name('Sky Top')
            .onChange((v) => this.skyTopColor.value.copy(v))
        this.debugFolder.addColor({ value: this.skyBottomColor.value }, 'value').name('Sky Bottom')
            .onChange((v) => this.skyBottomColor.value.copy(v))
        this.debugFolder.addColor({ value: this.skySunColor.value }, 'value').name('Sun Color')
            .onChange((v) => this.skySunColor.value.copy(v))
        this.debugFolder.add(this.skySunIntensity, 'value', 0, 2, 0.01).name('Sun Disk Intensity')
        this.debugFolder.add(this.skySunSharpness, 'value', 64, 2048, 1).name('Sun Disk Sharpness')
        this.debugFolder.add(this.skyHorizonOffset, 'value', -0.4, 0.4, 0.001).name('Horizon Offset')
    }
}
