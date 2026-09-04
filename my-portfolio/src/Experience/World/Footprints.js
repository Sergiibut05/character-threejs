import * as THREE from 'three'
import {
    instancedArray, uniform, positionLocal, uv,
    vec2, vec3, vec4, float,
    sin, cos, length, smoothstep, min
} from 'three/tsl'
import Experience from '../Experience.js'
import { ignoreAO } from './aoMask.js'

/**
 * Footprints — Animal-Crossing style prints the character leaves on dirt/sand.
 *
 * Same GPU pattern as Fire/Fireflies: ONE mesh + instancedArray ring buffer →
 * 1 draw call for every print in the world. CPU work is a single tiny buffer
 * write per footstep (~2-4 times/second while walking on dirt).
 *
 *   - Per instance: vec4 (x, y, z, yaw) + float birthTime.
 *   - Shape: procedural SDF (sole + heel ellipses) — no texture asset.
 *   - Look: subtle multiplicative-style darkening (translucent dark quad).
 *   - Fade: quick pop-in, slow fade-out — 100% on GPU from age. Recycled
 *     slots simply get a new birthTime; empty slots have birth = -1e9 so
 *     their age is huge and alpha is 0.
 *
 * WHO stamps: Character.update() accumulates walked distance and calls
 * World.stampFootprint(), which first checks World.isDirtAt(x, z)
 * (pure-dirt floor meshes, grass-mask dirt patches, pitch sand + fringe).
 */
export default class Footprints {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        this.capacity = this.experience.quality?.isLow ? 28 : 48
        this._next = 0

        // Tunables
        this.uSize = uniform(0.17)      // quad size (world units)
        this.uOpacity = uniform(0.28)   // max darkening
        this.uLife = uniform(5.0)       // seconds before fully gone
        this.uTime = uniform(0)

        this._build()

        if (this.debug?.active) this._setDebug()
    }

    _build() {
        // Instance data
        this._posArr = new Float32Array(this.capacity * 4)      // x, y, z, yaw
        this._birthArr = new Float32Array(this.capacity).fill(-1e9)
        this._posBuf = instancedArray(this._posArr, 'vec4')
        this._birthBuf = instancedArray(this._birthArr, 'float')

        const d = this._posBuf.toAttribute()
        const birth = this._birthBuf.toAttribute()

        // Flat unit quad, rotated per-instance around Y by the stored yaw.
        const geo = new THREE.PlaneGeometry(1, 1)
        geo.rotateX(-Math.PI / 2)

        const yaw = d.w
        const c = cos(yaw)
        const s = sin(yaw)
        const lx = positionLocal.x.mul(this.uSize)
        const lz = positionLocal.z.mul(this.uSize)
        const wx = lx.mul(c).add(lz.mul(s))
        const wz = lz.mul(c).sub(lx.mul(s))

        const material = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false
        })
        // No depth write means no say over ambient occlusion -- it abstains
        // rather than overriding what is behind it. See aoMask.js.
        ignoreAO(material)
        material.positionNode = vec3(d.x.add(wx), d.y, d.z.add(wz))

        // ── Shape: sole + heel ellipses (SDF union) in quad UV space ──
        // NOTE: rotateX(-π/2) maps UV +v to local -Z (backward), so the sole
        // offset is NEGATIVE in p-space to point along the walking direction.
        const p = uv().sub(0.5)
        const sole = length(p.add(vec2(0.0, 0.10)).mul(vec2(3.4, 2.5)))
        const heel = length(p.sub(vec2(0.0, 0.24)).mul(vec2(4.6, 5.4)))
        const shape = float(1.0).sub(smoothstep(float(0.78), float(1.0), min(sole, heel)))

        // ── Age fade (empty slots: birth=-1e9 → huge age → alpha 0) ──
        const age = this.uTime.sub(birth)
        const fadeIn = smoothstep(float(0.0), float(0.12), age)
        const fadeOut = float(1.0).sub(smoothstep(this.uLife.mul(0.5), this.uLife, age))

        // Dark warm print that reads as pressed dirt.
        material.outputNode = vec4(
            vec3(0.06, 0.045, 0.02),
            shape.mul(fadeIn).mul(fadeOut).mul(this.uOpacity)
        )
        // Above the floor, the field decal (-1) and the fringe (-0.5).
        material.polygonOffset = true
        material.polygonOffsetFactor = -2
        material.polygonOffsetUnits = -2

        this.mesh = new THREE.Mesh(geo, material)
        this.mesh.name = 'Footprints'
        this.mesh.count = this.capacity
        this.mesh.frustumCulled = false // instances are scattered world-wide
        this.mesh.renderOrder = 3
        this.scene.add(this.mesh)
    }

    /** Stamp one print. (x,z) ground point, y slightly above the surface. */
    stamp(x, y, z, yaw) {
        const i = this._next
        this._next = (this._next + 1) % this.capacity
        this._posArr[i * 4 + 0] = x
        this._posArr[i * 4 + 1] = y
        this._posArr[i * 4 + 2] = z
        this._posArr[i * 4 + 3] = yaw
        this._birthArr[i] = this.experience.time.elapsed * 0.001
        this._posBuf.value.needsUpdate = true
        this._birthBuf.value.needsUpdate = true
    }

    update() {
        // Single uniform write — all fading happens on the GPU.
        this.uTime.value = this.experience.time.elapsed * 0.001
    }

    _setDebug() {
        const f = this.debug.ui.addFolder('👣 Footprints')
        f.close()
        f.add(this.uSize, 'value', 0.08, 0.5, 0.01).name('Size')
        f.add(this.uOpacity, 'value', 0.05, 0.8, 0.01).name('Darkness')
        f.add(this.uLife, 'value', 2, 20, 0.5).name('Lifetime (s)')

        // Stamp rhythm lives on the Character (stride distances in metres).
        const char = this.experience.world?.character
        if (char) {
            f.add(char, 'strideWalk', 0.2, 1.5, 0.05).name('Paso andar (m)')
            f.add(char, 'strideRun', 0.3, 2.0, 0.05).name('Paso correr (m)')
            f.add(char, 'strideStartDelay', 0, 2.0, 0.05).name('Delay inicio (m)')
            f.add(char, 'footSpacing', 0.0, 0.3, 0.01).name('Separación pies (m)')
        }
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
