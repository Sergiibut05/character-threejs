import * as THREE from 'three'
import {
    instancedArray, instanceIndex,
    hash, sin, vec3, vec4, float, uniform,
    uv, length, time, clamp, smoothstep
} from 'three/tsl'
import Experience from '../Experience.js'

/**
 * Fireflies — Bruno Simon pattern, extended with view-distance culling
 * ---------------------------------------------------------------------
 * Core technique from Three.js Journey "Adding details":
 *   - SpriteNodeMaterial + instancedArray → world positions on GPU
 *   - THREE.Mesh with mesh.count = N → N billboarded quads, 1 draw call
 *   - Glow: 0.05 / distanceToCenter – 0.1 (Bruno Simon formula)
 *   - Animation & blink: 100 % GPU via TSL time + hash(instanceIndex)
 *
 * View-distance culling (same trick as Grass):
 *   - scaleNode is multiplied by a smoothstep that collapses distant sprites
 *     to scale 0 → degenerate triangle → GPU discards them for free.
 *   - uCharacterPosition is updated each frame in update() (cheap uniform write).
 *
 * This lets us use a high total count (200+) while only paying for the ~60
 * sprites that are near the camera at any given moment.
 */
export default class Fireflies {
    constructor(options = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        this.grassPositions = options.grassPositions || []
        this.count = options.count ?? (this.experience.quality?.isLow ? 80 : 200)
        this.groundY = options.groundY ?? 0

        // View-distance culling radius (match grass)
        const grassRadius = this.experience.quality?.grassViewRadius ?? 20
        this.viewRadius = options.viewRadius ?? grassRadius
        this.viewFadeBand = options.viewFadeBand ?? 4.0

        // GPU uniforms
        this.uScale = uniform(0.055)
        this.uBrightness = uniform(1.1)
        this.uBlinkSpeed = uniform(0.9)
        this.uColor = uniform(new THREE.Color('#78ff72'))   // Zelda lime-green
        this.uCharacterPos = uniform(new THREE.Vector3(0, 0, 0))
        this.uViewRadius = uniform(this.viewRadius)
        this.uViewFadeBand = uniform(this.viewFadeBand)

        this._build()

        if (this.debug.active) this.setDebug()
    }

    _build() {
        const count = this.count
        const src = this.grassPositions

        // ── Scatter fireflies randomly across all grass positions ──
        const positions = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
            const p = src.length > 0
                ? src[Math.floor(Math.random() * src.length)]
                : { x: (Math.random() - 0.5) * 30, y: this.groundY, z: (Math.random() - 0.5) * 30 }
            // Small jitter so they don't stack exactly on grass blade positions
            positions[i * 3 + 0] = p.x + (Math.random() - 0.5) * 0.8
            positions[i * 3 + 1] = (p.y ?? this.groundY) + 0.12 + Math.random() * 0.55
            positions[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.8
        }

        const posAttr = instancedArray(positions, 'vec3').toAttribute()

        // ── Bruno Simon glow: 0.05 / d – 0.1 ──
        const d = length(uv().sub(0.5))
        const glow = clamp(float(0.05).div(d).sub(0.1), 0.0, 1.0)

        // Per-instance independent blink via hash(instanceIndex)
        const baseTime = time.add(hash(instanceIndex).mul(999))
        const blink = sin(baseTime.mul(this.uBlinkSpeed))
            .mul(0.5).add(0.5)   // remap → 0..1
            .mul(0.7).add(0.3)   // clamp floor → 0.3..1.0 (never fully off)

        // Slow, low XYZ drift (stays near the ground)
        const flyOffset = vec3(
            sin(baseTime.mul(0.35)).mul(0.55),
            sin(baseTime.mul(0.70)).mul(0.18),
            sin(baseTime.mul(0.28)).mul(0.55)
        )

        const worldPos = posAttr.add(flyOffset)

        // ── View-distance culling ──
        // Distance from character in the XZ plane (same as grass).
        // smoothstep → 1 when close, 0 when beyond viewRadius.
        // Multiply scaleNode by this → distant sprites collapse to 0 → GPU skips them.
        const distXZ = length(worldPos.xz.sub(this.uCharacterPos.xz))
        const viewFade = smoothstep(
            this.uViewRadius,
            this.uViewRadius.sub(this.uViewFadeBand),
            distXZ
        )

        // ── Material (SpriteNodeMaterial auto-billboards) ──
        const material = new THREE.SpriteNodeMaterial()
        material.positionNode = worldPos
        material.scaleNode = this.uScale.mul(viewFade)
        material.outputNode = vec4(
            this.uColor.mul(glow).mul(this.uBrightness),
            glow.mul(blink)
        )
        material.blending = THREE.AdditiveBlending
        material.transparent = true
        material.depthWrite = false

        // ── Mesh: WebGPU multi-instance via mesh.count ──
        const geometry = new THREE.CircleGeometry(1, 8)
        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.count = count
        this.mesh.frustumCulled = false  // culling is done via scaleNode collapse
        this.mesh.renderOrder = 5

        this.scene.add(this.mesh)
        this.material = material
    }

    update() {
        // Only uniform update needed — all animation is on GPU
        if (this.experience.world?.character) {
            this.uCharacterPos.value.copy(this.experience.world.character.position)
        }
    }

    setDebug() {
        const f = this.debug.ui.addFolder('Fireflies')
        f.close()
        f.add(this.uScale, 'value', 0.005, 0.2, 0.002).name('Size')
        f.add(this.uBrightness, 'value', 0.1, 3.0, 0.05).name('Brightness')
        f.add(this.uBlinkSpeed, 'value', 0.1, 5.0, 0.1).name('Blink Speed')
        f.add(this, 'viewRadius', 5, 40, 0.5).name('View Radius')
            .onChange(v => { this.uViewRadius.value = v })
        f.addColor({ value: this.uColor.value }, 'value').name('Color')
            .onChange(v => this.uColor.value.copy(v))
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
