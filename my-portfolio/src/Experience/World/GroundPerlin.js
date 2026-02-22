import * as THREE from 'three'
import { Fn, uniform, vec3, vec4, positionWorld, vertexStage } from 'three/tsl'
import Experience from '../Experience.js'
import { fbm, colorRamp } from './TSL/NoiseNodes.js'

export default class GroundPerlin {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.physics = this.experience.world.physics
        this.debug = this.experience.debug

        this.size = { x: 50, y: 0.1, z: 50 }
        this.position = { x: 0, y: 0, z: 0 }

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setPhysics()

        if (this.debug.active) {
            this.setDebug()
        }
    }

    setGeometry() {
        this.geometry = new THREE.PlaneGeometry(this.size.x, this.size.z, 64, 64)
    }

    setMaterial() {
        // TSL uniforms — same values as the original GLSL version
        this.uColor0 = uniform(new THREE.Color(0x4B9B82))
        this.uColor1 = uniform(new THREE.Color(0x7ACC56))
        this.uColor2 = uniform(new THREE.Color(0xC9F547))
        this.uColor3 = uniform(new THREE.Color(0xE6FF91))
        this.uScale = uniform(0.2)
        this.uEmissionStrength = uniform(0.49)
        this.uRampStop1 = uniform(0.05)
        this.uRampStop2 = uniform(0.8)

        // Compute world position in vertex stage and pass as varying
        const worldPos = vertexStage(positionWorld)

        // Build the color node using shared TSL noise functions
        const colorNode = Fn(() => {
            const p = worldPos.mul(this.uScale)
            const raw = fbm(p)

            // ColorRamp with 4 colors (same as Blender node setup)
            const result = colorRamp(
                raw,
                this.uColor0, this.uColor1, this.uColor2, this.uColor3,
                this.uRampStop1, this.uRampStop2
            )

            return vec4(result.mul(this.uEmissionStrength), 1.0)
        })()

        // Use MeshBasicNodeMaterial (unlit, like the original ShaderMaterial)
        this.material = new THREE.MeshBasicNodeMaterial({
            side: THREE.DoubleSide,
            depthWrite: true
        })
        this.material.fragmentNode = colorNode
    }

    setMesh() {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.rotation.x = -Math.PI * 0.5
        this.mesh.position.set(this.position.x, this.position.y, this.position.z)
        this.scene.add(this.mesh)
    }

    setPhysics() {
        setTimeout(() => {
            if (this.physics.world) {
                this.physics.createGround(this.size, this.position)
            }
        }, 100)
    }

    setDebug() {
        this.debugFolder = this.debug.ui.addFolder('Ground Perlin')

        this.debugFolder
            .add(this.uEmissionStrength, 'value')
            .min(0)
            .max(3)
            .step(0.01)
            .name('Emission Strength')

        this.debugFolder
            .add(this.uScale, 'value')
            .min(0.1)
            .max(10)
            .step(0.05)
            .name('Tamaño patrón (↓ más grande)')

        this.debugFolder
            .add(this.uRampStop1, 'value')
            .min(0.05)
            .max(0.95)
            .step(0.01)
            .name('ColorRamp Stop 1')

        this.debugFolder
            .add(this.uRampStop2, 'value')
            .min(0.05)
            .max(0.95)
            .step(0.01)
            .name('ColorRamp Stop 2')
    }
}
