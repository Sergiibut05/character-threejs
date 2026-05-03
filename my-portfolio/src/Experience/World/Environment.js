import * as THREE from 'three'
import Experience from '../Experience.js'
import { uniform, mix, positionWorld, cameraPosition, smoothstep, vec3 } from 'three/tsl'
import {
    syncPropStylizedSunDirection,
    propLitTint,
    propShadowTint,
    propCoreLit0,
    propCoreLit1
} from './scene/StylizedPropMaterial.js'

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
        this.sunLight.castShadow = quality.shadowsEnabled
        this.sunLight.shadow.camera.near = 0.5
        this.sunLight.shadow.bias = -0.0001
        this.sunLight.shadow.normalBias = 0.04
        
        this._applyShadowQuality()
        
        this.sunLight.position.set(4, 5, -3)
        this.sunLight.target.position.set(0, 0, 0)
        this.scene.add(this.sunLight.target)
        this.scene.add(this.sunLight)

        this.skyLight = new THREE.HemisphereLight('#dbeafe', '#fef3c7', 0.7)
        this.scene.add(this.skyLight)

        // React to live quality changes
        quality.on('change', () => {
            this._applyShadowQuality()
        })
    }

    _applyShadowQuality() {
        const quality = this.experience.quality
        const sc = quality.shadowCameraSize
        const cam = this.sunLight.shadow.camera
        cam.left = -sc; cam.right = sc; cam.top = sc; cam.bottom = -sc
        cam.far = quality.shadowCameraFar
        cam.updateProjectionMatrix()

        // Shadow map size is locked to 1024x1024 to avoid reallocation crashes
        this.sunLight.shadow.mapSize.width = quality.shadowMapSize
        this.sunLight.shadow.mapSize.height = quality.shadowMapSize
        this.sunLight.shadow.radius = quality.shadowRadius
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
        syncPropStylizedSunDirection(this.sunLight)
    }

    setDebug() {
        const f = this.debug.ui.addFolder('Environment')
        f.close()
        f.add(this.sunLight, 'intensity', 0, 10, 0.01).name('Sun Intensity')
        f.add(this.sunLight.position, 'x', -10, 10, 0.01).name('Sun X')
        f.add(this.sunLight.position, 'y', -10, 10, 0.01).name('Sun Y')
        f.add(this.sunLight.position, 'z', -10, 10, 0.01).name('Sun Z')

        const sp = this.debug.ui.addFolder('Stylized props (TSL)')
        sp.close()
        const spCtrls = []
        spCtrls.push(sp.add(propCoreLit0, 'value', -1, 1, 0.01).name('Core shadow · edge 0 (N·L)'))
        spCtrls.push(sp.add(propCoreLit1, 'value', -1, 1, 0.01).name('Core shadow · edge 1 (N·L)'))
        const lit = propLitTint.value
        spCtrls.push(sp.add(lit, 'x', 0.5, 2.5, 0.01).name('Lit tint · X'))
        spCtrls.push(sp.add(lit, 'y', 0.5, 2.5, 0.01).name('Lit tint · Y'))
        spCtrls.push(sp.add(lit, 'z', 0.5, 2.5, 0.01).name('Lit tint · Z'))
        const sh = propShadowTint.value
        spCtrls.push(sp.add(sh, 'x', 0.2, 1.2, 0.01).name('Shadow tint · X'))
        spCtrls.push(sp.add(sh, 'y', 0.2, 1.2, 0.01).name('Shadow tint · Y'))
        spCtrls.push(sp.add(sh, 'z', 0.2, 1.2, 0.01).name('Shadow tint · Z'))
        const resetStylized = {
            reset() {
                propCoreLit0.value = -0.22
                propCoreLit1.value = 0.52
                lit.set(1.04, 1.01, 0.96)
                sh.set(0.58, 0.56, 0.68)
                for (const c of spCtrls) c.updateDisplay()
            }
        }
        sp.add(resetStylized, 'reset').name('Reset stylized props')
    }
}
