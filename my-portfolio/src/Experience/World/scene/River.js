/**
 * River — applies the water shader to the single "agua" mesh of `river.glb`.
 */
import * as THREE from 'three'
import { uniform, vec4 } from 'three/tsl'
import Experience from '../../Experience.js'
import { createWaterColorNode } from '../TSL/WaterShader.js'
import { dayNightTint } from '../DayNight.js'

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

        this.uTime = options.uTime || uniform(0)

        this.uniforms = {
            uTime: this.uTime,
            // Depth-based color
            uShallowColor: uniform(new THREE.Color('#7fe3d4')),
            uDeepWaterColor: uniform(new THREE.Color('#0b3a6b')),
            uDepthMax: uniform(3.0),
            uDepthPower: uniform(1.0),
            // Foam color
            uFoamColor: uniform(new THREE.Color('#ffffff')),
            // Edge foam (depth-based, noise-shaped, animated)
            uFoamDepth: uniform(0.5),
            uFoamScale: uniform(2.5),
            uFoamShapeAmount: uniform(0.7),
            uFoamExponent: uniform(1.5),
            uFoamStrength: uniform(1.0),
            uFoamSpeed: uniform(0.15),
            // Cartoon noise specks (organic blobs, fade in place)
            uSpeckScale: uniform(3.67),
            uSpeckThreshold: uniform(0.88),
            uSpeckEdge: uniform(0.001),
            uSpeckStrength: uniform(1.0),
            uSpeckSpeed: uniform(0.0),
            // Opacity
            uOpacity: uniform(1.0),
            uShallowOpacity: uniform(0.25),
            uDeepOpacity: uniform(0.82),
            // Distance fade
            uFadeDistance: uniform(275),
            uFadeStrength: uniform(1.3),
            uCamXZ: uniform(new THREE.Vector2(0, 0))
        }

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
        mat.fragmentNode = createWaterColorNode(this.uniforms).mul(vec4(dayNightTint, 1.0))
        mat.blending = THREE.CustomBlending
        mat.blendSrc = THREE.SrcAlphaFactor
        mat.blendDst = THREE.OneMinusSrcAlphaFactor

        mesh.material?.dispose?.()
        mesh.material = mat
        mesh.castShadow = false
        mesh.receiveShadow = false
        mesh.renderOrder = 1
        this.waterMesh = mesh
    }

    update() {
        if (this.uTime) this.uTime.value = this.time.elapsed * 0.001
        if (this.uniforms.uCamXZ) {
            const cam = this.experience.camera.instance.position
            this.uniforms.uCamXZ.value.set(cam.x, cam.z)
        }
    }

    _setupGUI() {
        const wu = this.uniforms

        const depthFolder = this.debug.ui.addFolder('Water · Depth Color')
        depthFolder.close()
        depthFolder.addColor({ value: wu.uShallowColor.value }, 'value').name('Shallow Color')
            .onChange(v => wu.uShallowColor.value.copy(v))
        depthFolder.addColor({ value: wu.uDeepWaterColor.value }, 'value').name('Deep Color')
            .onChange(v => wu.uDeepWaterColor.value.copy(v))
        depthFolder.add(wu.uDepthMax, 'value', 0.1, 12.0, 0.1).name('Depth Max')
        depthFolder.add(wu.uDepthPower, 'value', 0.2, 4.0, 0.05).name('Depth Power')
        depthFolder.add(wu.uOpacity, 'value', 0.0, 1.0, 0.01).name('Opacity')
        depthFolder.add(wu.uShallowOpacity, 'value', 0.0, 1.0, 0.01).name('Shallow Opacity')
        depthFolder.add(wu.uDeepOpacity, 'value', 0.0, 1.0, 0.01).name('Deep Opacity')

        const foamFolder = this.debug.ui.addFolder('Water · Edge Foam')
        foamFolder.close()
        foamFolder.addColor({ value: wu.uFoamColor.value }, 'value').name('Foam Color')
            .onChange(v => wu.uFoamColor.value.copy(v))
        foamFolder.add(wu.uFoamStrength, 'value', 0.0, 1.0, 0.01).name('Foam Strength')
        foamFolder.add(wu.uFoamDepth, 'value', 0.0, 3.0, 0.01).name('Foam Width')
        foamFolder.add(wu.uFoamScale, 'value', 0.1, 10.0, 0.01).name('Foam Noise Scale')
        foamFolder.add(wu.uFoamShapeAmount, 'value', 0.0, 1.0, 0.01).name('Foam Clumping')
        foamFolder.add(wu.uFoamExponent, 'value', 0.2, 4.0, 0.05).name('Foam Sharpness')
        foamFolder.add(wu.uFoamSpeed, 'value', 0.0, 1.0, 0.01).name('Foam Anim Speed')

        const speckFolder = this.debug.ui.addFolder('Water · Specks')
        speckFolder.close()
        speckFolder.add(wu.uSpeckScale, 'value', 0.1, 10.0, 0.01).name('Speck Scale')
        speckFolder.add(wu.uSpeckThreshold, 'value', 0.0, 1.0, 0.01).name('Speck Amount')
        speckFolder.add(wu.uSpeckEdge, 'value', 0.001, 0.3, 0.001).name('Speck Edge (sharp→soft)')
        speckFolder.add(wu.uSpeckStrength, 'value', 0.0, 1.0, 0.01).name('Speck Strength')
        speckFolder.add(wu.uSpeckSpeed, 'value', 0.0, 4.0, 0.01).name('Speck Speed')

        const fadeFolder = this.debug.ui.addFolder('Water · Distance Fade')
        fadeFolder.close()
        fadeFolder.add(wu.uFadeDistance, 'value', 10, 400, 5).name('Fade Distance')
        fadeFolder.add(wu.uFadeStrength, 'value', 0.1, 5.0, 0.1).name('Fade Strength')
    }
}
