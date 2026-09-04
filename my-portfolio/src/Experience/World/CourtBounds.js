import * as THREE from 'three'
import {
    Fn, float, vec2, vec3, vec4, uniform, uv, time,
    smoothstep, fract, abs, length, max, sin
} from 'three/tsl'
import Experience from '../Experience.js'
import { ignoreAO } from './aoMask.js'

/**
 * CourtBounds — the two side walls of the beach court, drawn as a soft
 * "force field": normally almost invisible, they light up where the ball
 * strikes them and glow as the player runs into them.
 *
 * The point is legibility: a rally that bounces off thin air feels broken, and
 * a player who stops walking for no visible reason feels stuck. Showing the
 * wall only at the moment it matters keeps the beach clean the rest of the time.
 *
 * One plane per side, additive, no depth write — 2 draw calls.
 */
export default class CourtBounds {
    /**
     * @param {object} o
     * @param {THREE.Vector3} o.center  Court centre (sand level).
     * @param {number} o.halfWidth      Distance from centre to each wall.
     * @param {number} [o.height]       Wall height.
     * @param {number} [o.depth]        Wall extent along Z.
     */
    constructor(o) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.time = this.experience.time

        this.center = o.center.clone()
        this.halfWidth = o.halfWidth
        this.height = o.height ?? 3.9
        this.depth = o.depth ?? 2.0

        this.color = new THREE.Color(0x6fe3ff)
        this.idleOpacity = 0.06      // barely-there hint while playing
        this.nearOpacity = 0.5       // when the player leans on the wall
        this.impactDecay = 1.5       // how fast a ball strike fades

        this.walls = []
        for (const side of [-1, 1]) this.walls.push(this._buildWall(side))

        this.visible = false
        this.setEnabled(false)
    }

    _buildWall(side) {
        const uOpacity = uniform(0)      // proximity glow
        const uImpact = uniform(0)       // 1 → 0 after a ball strike
        const uImpactY = uniform(0.5)    // where it was struck, in 0..1
        const uColor = uniform(new THREE.Vector3(this.color.r, this.color.g, this.color.b))

        const material = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        })
        // No depth write means no say over ambient occlusion -- it abstains
        // rather than overriding what is behind it. See aoMask.js.
        ignoreAO(material)

        material.colorNode = Fn(() => {
            const p = uv()

            // Fade out toward the top so the wall never reads as a hard box.
            const vFade = smoothstep(1.0, 0.05, p.y)

            // Slow scrolling scan lines + faint vertical bars = "hologram".
            const scan = fract(p.y.mul(16.0).sub(time.mul(0.5)))
            const scanBand = smoothstep(0.5, 0.1, abs(scan.sub(0.5)))
            const bars = smoothstep(0.5, 0.16, abs(fract(p.x.mul(9.0)).sub(0.5)))
            const grid = scanBand.mul(0.65).add(bars.mul(0.35))

            // Rim light along the bottom and both vertical edges.
            const edge = max(
                smoothstep(0.06, 0.0, p.y),
                smoothstep(0.04, 0.0, min2(p.x, float(1.0).sub(p.x)))
            )

            // Ball strike: a thin ring expanding from the contact point.
            const d = length(vec2(p.x.sub(0.5).mul(this.depth / this.height), p.y.sub(uImpactY)))
            const radius = uImpact.oneMinus().mul(0.42)
            const ring = smoothstep(0.06, 0.0, abs(d.sub(radius))).mul(uImpact)
            // Plus a short bright flash right at the contact point.
            const spark = smoothstep(0.14, 0.0, d).mul(uImpact).mul(uImpact)

            const base = grid.mul(0.5).add(edge.mul(0.9)).mul(vFade).mul(uOpacity)
            const alpha = base.add(ring.mul(0.7)).add(spark.mul(0.5)).clamp(0, 1)

            // Impact flashes brighter than the idle glow.
            const rgb = uColor.mul(float(1).add(ring.add(spark).mul(1.4)))
            return vec4(rgb, alpha)
        })()

        const geometry = new THREE.PlaneGeometry(this.depth, this.height)
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(
            this.center.x + side * this.halfWidth,
            this.center.y + this.height * 0.5,
            this.center.z
        )
        // Face inward, across the court.
        mesh.rotation.y = side * Math.PI * 0.5
        mesh.renderOrder = 4
        this.scene.add(mesh)

        return { mesh, side, uOpacity, uImpact, uImpactY, target: 0 }
    }

    setEnabled(on) {
        this.visible = on
        for (const w of this.walls) {
            w.mesh.visible = on
            if (!on) { w.uOpacity.value = 0; w.uImpact.value = 0 }
        }
    }

    /** Ball struck a wall. @param side -1 / +1  @param worldY impact height */
    hit(side, worldY) {
        const w = this.walls.find((x) => x.side === side)
        if (!w) return
        w.uImpact.value = 1
        w.uImpactY.value = THREE.MathUtils.clamp(
            (worldY - this.center.y) / this.height, 0.02, 0.98
        )
    }

    /** Reposition when the court is resized from the GUI. */
    layout(halfWidth) {
        this.halfWidth = halfWidth
        for (const w of this.walls) {
            w.mesh.position.x = this.center.x + w.side * halfWidth
        }
    }

    update(playerX) {
        if (!this.visible) return
        const dt = Math.min(this.time.delta * 0.001, 0.1)
        const a = 1 - Math.pow(1 - 0.12, dt * 60)

        for (const w of this.walls) {
            // Glow rises as the player closes on this wall.
            const wallX = this.center.x + w.side * this.halfWidth
            const dist = Math.abs(playerX - wallX)
            const near = 1 - THREE.MathUtils.clamp(dist / 1.6, 0, 1)
            const target = this.idleOpacity + near * near * (this.nearOpacity - this.idleOpacity)

            w.uOpacity.value += (target - w.uOpacity.value) * a
            if (w.uImpact.value > 0) {
                w.uImpact.value = Math.max(0, w.uImpact.value - dt * this.impactDecay)
            }
        }
    }

    dispose() {
        for (const w of this.walls) {
            this.scene.remove(w.mesh)
            w.mesh.geometry.dispose()
            w.mesh.material.dispose()
        }
        this.walls = []
    }
}

/** TSL has no 2-arg min export under a stable name across versions. */
function min2(a, b) { return a.min(b) }
