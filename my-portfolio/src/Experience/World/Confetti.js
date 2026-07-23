import * as THREE from 'three'
import {
    instancedArray, uniform, float, vec2, vec3, vec4,
    sin, cos, mix, smoothstep, clamp, step
} from 'three/tsl'
import Experience from '../Experience.js'

/**
 * Confetti — a GPU burst of pastel paper strips (goal celebration).
 *
 * Same pattern as Fire/Fireflies: ONE mesh + instancedArray → 1 draw call.
 * All per-particle randoms (direction, speed, colour, size, spin) are baked
 * once; a burst is just two uniform writes (origin + burst time) and the
 * whole animation — launch, gravity, flutter, spin, fade — runs on the GPU
 * from the particle age. Idle cost: zero CPU, degenerate draw (alpha 0).
 */
const COUNT = 90
const LIFE = 1.7 // seconds

export default class Confetti {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene

        this.uTime = uniform(0)
        this.uBurstTime = uniform(-1e9)
        this.uOrigin = uniform(new THREE.Vector3(0, 0, 0))
        this.uStrength = uniform(1.0)

        this._build()
    }

    _build() {
        // Per-particle randoms: A = (dirX, dirY, dirZ, speed), B = (hue, size, spin, phase)
        const a = new Float32Array(COUNT * 4)
        const b = new Float32Array(COUNT * 4)
        for (let i = 0; i < COUNT; i++) {
            // Cone up-and-out
            const ang = Math.random() * Math.PI * 2
            const spread = 0.25 + Math.random() * 0.55
            const dx = Math.cos(ang) * spread
            const dz = Math.sin(ang) * spread
            const dy = 0.85 + Math.random() * 0.65
            const len = Math.hypot(dx, dy, dz)
            a[i * 4 + 0] = dx / len
            a[i * 4 + 1] = dy / len
            a[i * 4 + 2] = dz / len
            a[i * 4 + 3] = 2.6 + Math.random() * 2.4        // speed

            b[i * 4 + 0] = Math.random()                    // hue pick
            b[i * 4 + 1] = 0.028 + Math.random() * 0.026    // size (small strips)
            b[i * 4 + 2] = (Math.random() - 0.5) * 22.0     // spin speed
            b[i * 4 + 3] = Math.random() * Math.PI * 2      // phase
        }
        const bufA = instancedArray(a, 'vec4').toAttribute()
        const bufB = instancedArray(b, 'vec4').toAttribute()

        const age = this.uTime.sub(this.uBurstTime)
        const t = clamp(age.div(LIFE), 0.0, 1.0)
        const alive = step(float(0.0), age).mul(step(age, float(LIFE)))

        // Launch decelerating outward + gravity + lateral flutter
        const ease = float(1.0).sub(float(1.0).sub(t).pow(2.2))
        const travel = bufA.xyz.mul(bufA.w).mul(ease).mul(this.uStrength)
        const fall = t.mul(t).mul(2.6)
        const flutter = vec3(
            sin(age.mul(9.0).add(bufB.w)).mul(0.12).mul(t),
            0.0,
            cos(age.mul(7.3).add(bufB.w.mul(2.0))).mul(0.12).mul(t)
        )
        const worldPos = this.uOrigin.add(travel).add(flutter).sub(vec3(0.0, fall, 0.0))

        // Vivid palette by hue pick (4 stops). Saturated and a touch dark on
        // purpose: ACES tone mapping pushes bright pastels toward white.
        const h = bufB.x
        const c1 = vec3(0.95, 0.15, 0.35)  // punchy pink/red
        const c2 = vec3(0.98, 0.62, 0.05)  // orange/gold
        const c3 = vec3(0.05, 0.65, 0.35)  // green
        const c4 = vec3(0.12, 0.35, 0.95)  // blue
        const color = mix(
            mix(c1, c2, step(0.25, h)),
            mix(c3, c4, step(0.75, h)),
            step(0.5, h)
        )

        // Quick pop-in, fade at the end
        const fade = smoothstep(float(0.0), float(0.06), t)
            .mul(float(1.0).sub(smoothstep(float(0.72), float(1.0), t)))

        const material = new THREE.SpriteNodeMaterial()
        material.positionNode = worldPos
        material.scaleNode = vec2(bufB.y, bufB.y.mul(1.6)) // paper strip
        material.rotationNode = bufB.w.add(age.mul(bufB.z))
        material.outputNode = vec4(color, fade.mul(alive))
        material.transparent = true
        material.depthWrite = false

        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
        this.mesh.count = COUNT
        this.mesh.frustumCulled = false
        this.mesh.renderOrder = 6
        this.scene.add(this.mesh)
    }

    /** Fire a burst at a world position. */
    trigger(position, strength = 1.0) {
        this.uOrigin.value.copy(position)
        this.uStrength.value = strength
        this.uBurstTime.value = this.experience.time.elapsed * 0.001
    }

    update() {
        this.uTime.value = this.experience.time.elapsed * 0.001
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh.geometry?.dispose()
            this.mesh.material?.dispose()
            this.mesh = null
        }
    }
}
