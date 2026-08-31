/**
 * River — applies the stylized water shader to the single "agua" mesh of
 * `river.glb`. The shader (TSL/StylizedWaterShader.js) is depth-driven, so the
 * same flat plane reads as river or sea shore and every intersection with the
 * ground/props gets a living white waterline instead of a raw geometric cut.
 */
import * as THREE from 'three'
import { uniform, vec4 } from 'three/tsl'
import Experience from '../../Experience.js'
import { createStylizedWaterNode, createStylizedWaterDefaults } from '../TSL/StylizedWaterShader.js'
import { dayNightTint } from '../DayNight.js'

// Lift of the whole water plane: separates it from near-coplanar ground
// (less z-precision stress at the seam) and reads better against the banks.
const WATER_LIFT = 0.11

export default class River {
    constructor(gltf, options = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.time = this.experience.time
        this.debug = this.experience.debug

        if (!gltf || !gltf.scene) {
            console.warn('River: missing gltf.scene')
            return
        }

        this.root = gltf.scene
        this.root.name = 'River'
        this.root.position.y += WATER_LIFT

        this.uniforms = createStylizedWaterDefaults(uniform, THREE)
        if (options.uTime) this.uniforms.uTime = options.uTime

        this._applyWater(this.root.getObjectByName('agua'))

        this.scene.add(this.root)

        if (this.debug?.active) this._setupGUI()
    }

    _applyWater(mesh) {
        if (!mesh) {
            console.warn('River: agua mesh not found')
            return
        }
        const mat = new THREE.MeshBasicNodeMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        })
        mat.fragmentNode = createStylizedWaterNode(this.uniforms).mul(vec4(dayNightTint, 1.0))

        mesh.material?.dispose?.()
        mesh.material = mat
        mesh.castShadow = false
        mesh.receiveShadow = false
        mesh.renderOrder = 1
        this.waterMesh = mesh
    }

    update() {
        if (this.uniforms.uTime) this.uniforms.uTime.value = this.time.elapsed * 0.001
        if (this.uniforms.uCamXZ) {
            const cam = this.experience.camera.instance.position
            this.uniforms.uCamXZ.value.set(cam.x, cam.z)
        }
    }

    _setupGUI() {
        const u = this.uniforms

        const root = this.debug.ui.addFolder('🌊 Water (stylized)')
        root.close()

        const colors = root.addFolder('Color')
        colors.close()
        colors.addColor({ v: u.uShallowColor.value }, 'v').name('Shallow')
            .onChange((v) => u.uShallowColor.value.copy(v))
        colors.addColor({ v: u.uDeepColor.value }, 'v').name('Deep')
            .onChange((v) => u.uDeepColor.value.copy(v))
        colors.add(u.uDepthMax, 'value', 0.2, 6.0, 0.05).name('Depth max (m)')
        colors.add(u.uDepthPower, 'value', 0.2, 3.0, 0.05).name('Depth curve')
        colors.add(u.uShallowOpacity, 'value', 0.0, 1.0, 0.01).name('Shallow opacity')
        colors.add(u.uDeepOpacity, 'value', 0.0, 1.0, 0.01).name('Deep opacity')

        const shore = root.addFolder('Shore line')
        shore.close()
        shore.add(u.uShoreWidth, 'value', 0.02, 0.6, 0.005).name('Width (m)')
        shore.add(u.uShoreNoiseScale, 'value', 0.3, 8.0, 0.1).name('Wobble scale')
        shore.add(u.uShoreNoiseAmp, 'value', 0.0, 0.2, 0.005).name('Wobble amount')

        const bands = root.addFolder('Flowing bands')
        bands.close()
        bands.add(u.uBandStrength, 'value', 0.0, 1.0, 0.02).name('Strength')
        bands.add(u.uBandZone, 'value', 0.1, 3.0, 0.05).name('Zone (m of depth)')
        bands.add(u.uBandCount, 'value', 0.5, 6.0, 0.1).name('Count')
        bands.add(u.uBandSpeed, 'value', 0.0, 1.5, 0.02).name('Flow speed')
        bands.add(u.uBandThickness, 'value', 0.05, 0.6, 0.01).name('Thickness')
        bands.add(u.uBandNoiseScale, 'value', 0.2, 5.0, 0.1).name('Bend scale')
        bands.add(u.uBandNoiseAmp, 'value', 0.0, 1.2, 0.02).name('Bend amount')

        const streaks = root.addFolder('Current streaks')
        streaks.close()
        streaks.add(u.uStreakStrength, 'value', 0.0, 1.0, 0.02).name('Strength')
        streaks.add(u.uStreakScale, 'value', 0.1, 4.0, 0.05).name('Scale')
        streaks.add(u.uStreakSpeed, 'value', 0.0, 0.4, 0.005).name('Drift speed')
        streaks.add(u.uStreakThreshold, 'value', 0.4, 0.95, 0.01).name('Sparseness')
    }
}
