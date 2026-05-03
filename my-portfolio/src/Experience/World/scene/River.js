/**
 * River — applies the cel-shaded water shader to the three planes of
 * `river.glb`:
 *   - "agua"      → main water surface (caustics + depth intersection)
 *   - "agua.001"  → shadow / shallow layer
 *   - "agua.002"  → second shadow / shallow layer
 */
import * as THREE from 'three'
import { uniform } from 'three/tsl'
import Experience from '../../Experience.js'
import { createWaterColorNode, createWaterShadowColorNode } from '../TSL/WaterShader.js'

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
            uScale: uniform(1.17),
            uSmoothness: uniform(0.53),
            uEdgeThreshold: uniform(0.09),
            uEdgeSoftness: uniform(0.10),
            uFlowX: uniform(0.07),
            uFlowZ: uniform(-0.23),
            uCellSpeed: uniform(0.55),
            uNoiseScale: uniform(2.58),
            uNoiseFlowSpeed: uniform(0.11),
            uDistortAmount: uniform(0.26),
            uDeepColor: uniform(new THREE.Color('#27a3d8')),
            uMidColor: uniform(new THREE.Color('#59c0e8')),
            uMidPos: uniform(0.31),
            uHighlight: uniform(new THREE.Color('#ffffff')),
            uOpacity: uniform(1.0),
            uDeepOpacity: uniform(0.78),
            uFadeDistance: uniform(275),
            uFadeStrength: uniform(1.3),
            uCamXZ: uniform(new THREE.Vector2(0, 0)),
            // Depth intersection
            uLineWidth: uniform(0.25),
            uGlowWidth: uniform(1.2),
            uLineColor: uniform(new THREE.Color('#ffffff')),
            uLineOpacity: uniform(1.0),
            uGlowColor: uniform(new THREE.Color('#88ccff')),
            uGlowOpacity: uniform(0.25)
        }

        const shadowUniforms = {
            uTime: this.uTime,
            uScale: this.uniforms.uScale,
            uSmoothness: this.uniforms.uSmoothness,
            uCellSpeed: this.uniforms.uCellSpeed,
            uFlowX: this.uniforms.uFlowX,
            uFlowZ: this.uniforms.uFlowZ,
            uNoiseScale: this.uniforms.uNoiseScale,
            uNoiseFlowSpeed: this.uniforms.uNoiseFlowSpeed,
            uDistortAmount: this.uniforms.uDistortAmount
        }

        this._applyWater(this.root.getObjectByName('agua'), shadowUniforms)
        const shadowNames = ['agua.001', 'agua001', 'agua.002', 'agua002']
        const seen = new Set()
        for (const name of shadowNames) {
            const mesh = this.root.getObjectByName(name)
            if (!mesh || seen.has(mesh.uuid)) continue
            seen.add(mesh.uuid)
            this._applyShadow(mesh, shadowUniforms)
        }

        this.scene.add(this.root)

        if (this.debug?.active) this._setupGUI()
    }

    _applyWater(mesh, _shadowUniforms) {
        if (!mesh) {
            console.warn('River: agua mesh not found')
            return
        }
        const mat = new THREE.MeshBasicNodeMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        })
        mat.fragmentNode = createWaterColorNode(this.uniforms)
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

    _applyShadow(mesh, shadowUniforms) {
        const mat = new THREE.MeshBasicNodeMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        })
        mat.fragmentNode = createWaterShadowColorNode(shadowUniforms)
        mat.blending = THREE.CustomBlending
        mat.blendSrc = THREE.SrcAlphaFactor
        mat.blendDst = THREE.OneMinusSrcAlphaFactor

        mesh.material?.dispose?.()
        mesh.material = mat
        mesh.castShadow = false
        mesh.receiveShadow = false
        mesh.renderOrder = 0
    }

    update() {
        if (this.uTime) this.uTime.value = this.time.elapsed * 0.001
        if (this.uniforms.uCamXZ) {
            const cam = this.experience.camera.instance.position
            this.uniforms.uCamXZ.value.set(cam.x, cam.z)
        }
    }

    _setupGUI() {
        const waterFolder = this.debug.ui.addFolder('Water')
        waterFolder.close()

        const wu = this.uniforms
        waterFolder.add(wu.uScale, 'value', 0.01, 3.0, 0.01).name('Scale')
        waterFolder.add(wu.uSmoothness, 'value', 0.0, 2.0, 0.01).name('Cell Smoothness')
        waterFolder.add(wu.uEdgeThreshold, 'value', 0.0, 0.3, 0.005).name('Edge Threshold')
        waterFolder.add(wu.uEdgeSoftness, 'value', 0.0, 0.1, 0.005).name('Edge Softness')
        waterFolder.add(wu.uFlowX, 'value', -0.5, 0.5, 0.01).name('Flow X')
        waterFolder.add(wu.uFlowZ, 'value', -0.5, 0.5, 0.01).name('Flow Z')
        waterFolder.add(wu.uCellSpeed, 'value', 0.0, 3.0, 0.05).name('Cell Anim Speed')
        waterFolder.add(wu.uNoiseScale, 'value', 0.1, 10.0, 0.01).name('Noise Scale')
        waterFolder.add(wu.uNoiseFlowSpeed, 'value', 0.0, 2.0, 0.01).name('Noise Flow Speed')
        waterFolder.add(wu.uDistortAmount, 'value', 0.0, 3.0, 0.01).name('Distort Amount')
        waterFolder.add(wu.uMidPos, 'value', 0.001, 0.999, 0.001).name('Mid Color Position')
        waterFolder.add(wu.uOpacity, 'value', 0.0, 1.0, 0.01).name('Opacity')
        waterFolder.add(wu.uDeepOpacity, 'value', 0.0, 1.0, 0.01).name('Deep Opacity')
        waterFolder.add(wu.uFadeDistance, 'value', 10, 300, 5).name('Fade Distance')
        waterFolder.add(wu.uFadeStrength, 'value', 0.1, 5.0, 0.1).name('Fade Strength')
        waterFolder.addColor({ value: wu.uDeepColor.value }, 'value').name('Deep Color')
            .onChange(v => wu.uDeepColor.value.copy(v))
        waterFolder.addColor({ value: wu.uMidColor.value }, 'value').name('Mid Color')
            .onChange(v => wu.uMidColor.value.copy(v))
        waterFolder.addColor({ value: wu.uHighlight.value }, 'value').name('Highlight Color')
            .onChange(v => wu.uHighlight.value.copy(v))

        const intersectionFolder = this.debug.ui.addFolder('Water Intersection')
        intersectionFolder.close()
        intersectionFolder.add(wu.uLineWidth, 'value', 0.0, 2.0, 0.01).name('Line Width')
        intersectionFolder.add(wu.uGlowWidth, 'value', 0.0, 5.0, 0.1).name('Glow Width')
        intersectionFolder.add(wu.uLineOpacity, 'value', 0.0, 1.0, 0.01).name('Line Opacity')
        intersectionFolder.add(wu.uGlowOpacity, 'value', 0.0, 1.0, 0.01).name('Glow Opacity')
        intersectionFolder.addColor({ value: wu.uLineColor.value }, 'value').name('Line Color')
            .onChange(v => wu.uLineColor.value.copy(v))
        intersectionFolder.addColor({ value: wu.uGlowColor.value }, 'value').name('Glow Color')
            .onChange(v => wu.uGlowColor.value.copy(v))
    }
}
