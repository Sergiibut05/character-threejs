import * as THREE from 'three'
import {
    Fn, attribute, uniform, vec3, vec4, color,
    positionGeometry, cameraViewMatrix, cameraProjectionMatrix, modelWorldMatrix,
    smoothstep
} from 'three/tsl'
import Experience from '../Experience.js'
import { ignoreAO } from './aoMask.js'

/**
 * WindLines — cartoon "gust" ribbons drifting through the air.
 *
 * Technique borrowed from Bruno Simon's folio (sources/Game/World/WindLines.js):
 * a flat ribbon built along a wavy curve, whose WIDTH is animated in the vertex
 * shader so a bulge travels from head to tail. That travelling bulge is what
 * reads as a gust whooshing past, and it costs one uniform per ribbon — no
 * texture, no particles, no per-frame CPU work on the geometry.
 *
 * Differences from the original: no GSAP (this project animates off `Time`),
 * a baked `side` attribute instead of `vertexIndex` parity, and the pool
 * recycles itself from update() instead of setTimeout chains.
 */

/** Ribbon along +Z, gently waving in Y. Two verts per point (side = ∓0.5). */
function buildRibbonGeometry(length = 3.2, handles = 4, amplitude = 0.3, divisions = 24) {
    const pts = []
    const half = length / 2
    const span = length / (handles - 1)
    for (let i = 0; i < handles; i++) {
        pts.push(new THREE.Vector3(0, (i % 2 - 0.5) * amplitude, -half + i * span))
    }
    const points = new THREE.CatmullRomCurve3(pts).getPoints(divisions)

    const count = points.length
    const positions = new Float32Array(count * 6)
    const ratios = new Float32Array(count * 2)
    const sides = new Float32Array(count * 2)
    const indices = new Uint16Array((count - 1) * 6)

    for (let i = 0; i < count; i++) {
        const p = points[i]
        const i6 = i * 6
        const i2 = i * 2

        positions[i6 + 0] = p.x; positions[i6 + 1] = p.y; positions[i6 + 2] = p.z
        positions[i6 + 3] = p.x; positions[i6 + 4] = p.y; positions[i6 + 5] = p.z

        const r = i / (count - 1)
        ratios[i2] = r; ratios[i2 + 1] = r
        sides[i2] = -0.5; sides[i2 + 1] = 0.5

        if (i < count - 1) {
            indices[i6 + 0] = i2 + 2
            indices[i6 + 1] = i2
            indices[i6 + 2] = i2 + 1
            indices[i6 + 3] = i2 + 1
            indices[i6 + 4] = i2 + 3
            indices[i6 + 5] = i2 + 2
        }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('ratio', new THREE.Float32BufferAttribute(ratios, 1))
    geo.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1))
    geo.setIndex(new THREE.Uint16BufferAttribute(indices, 1))
    // Ribbons are placed by hand and always near the action; skipping frustum
    // culling avoids a wrong bounding volume hiding them mid-flight.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), length)
    return geo
}

class Ribbon {
    constructor(scene, geometry, thickness) {
        this.uProgress = uniform(0)
        this.uThickness = uniform(thickness)
        this.uOpacity = uniform(0.3)

        const material = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        // No depth write means no say over ambient occlusion -- it abstains
        // rather than overriding what is behind it. See aoMask.js.
        ignoreAO(material)

        material.vertexNode = Fn(() => {
            const world = modelWorldMatrix.mul(vec4(positionGeometry, 1)).toVar()
            const ratio = attribute('ratio', 'float')
            const side = attribute('side', 'float')

            // Taper to nothing at both tips…
            const taper = smoothstep(0.0, 1.0, ratio.sub(0.5).abs().mul(2.0).oneMinus())
            // …and a bulge that travels head → tail as progress goes 0 → 1.
            const head = this.uProgress.mul(3.0).sub(1.0)
            const bulge = smoothstep(0.0, 1.0, ratio.sub(head).abs().oneMinus())

            const width = taper.mul(bulge).mul(this.uThickness)
            world.addAssign(vec4(vec3(0, 1, 0).mul(side.mul(width)), 0))

            return cameraProjectionMatrix.mul(cameraViewMatrix.mul(world))
        })()

        material.colorNode = color(0xffffff)
        material.opacityNode = this.uOpacity

        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.frustumCulled = false
        this.mesh.renderOrder = 3
        this.mesh.visible = false
        scene.add(this.mesh)

        this.available = true
        this.t = 0
        this.duration = 1
        this.drift = new THREE.Vector3()
    }

    dispose(scene) {
        scene.remove(this.mesh)
        this.mesh.material.dispose()
    }
}

export default class WindLines {
    /**
     * @param {object} [o]
     * @param {THREE.Vector3} [o.center] Area the gusts spawn around.
     * @param {number} [o.radius]  Spawn spread.
     * @param {number} [o.count]   Pool size (concurrent gusts).
     */
    constructor(o = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.time = this.experience.time

        this.center = o.center ? o.center.clone() : new THREE.Vector3()
        this.radius = o.radius ?? 7
        // Depth band, split because it is NOT symmetric: the camera sits on the
        // +Z side, so a ribbon spawned there flies straight past the lens. Keep
        // them behind the play plane, with only a sliver allowed in front.
        this.zBehind = o.zBehind ?? 8
        this.zFront = o.zFront ?? 0.5
        this.height = o.height ?? 2.2
        this.heightSpread = o.heightSpread ?? 1.8
        this.duration = o.duration ?? 2.4
        this.travel = o.travel ?? 3.2
        this.spawnEvery = o.spawnEvery ?? 0.55
        this.angle = o.angle ?? 0          // rotation around Y (wind heading)
        this.strength = 1                  // 0..1 → density + speed

        const geometry = buildRibbonGeometry(o.length ?? 6)
        this.geometry = geometry
        this.pool = []
        for (let i = 0; i < (o.count ?? 5); i++) {
            this.pool.push(new Ribbon(this.scene, geometry, o.thickness ?? 0.11))
        }

        this._spawnTimer = 0
        this.enabled = false
    }

    setEnabled(on) {
        this.enabled = on
        if (!on) {
            for (const r of this.pool) { r.mesh.visible = false; r.available = true }
        }
    }

    setCenter(v) { this.center.copy(v) }
    /** @param {number} a heading in radians  @param {number} s 0..1 */
    setWind(a, s) { this.angle = a; this.strength = THREE.MathUtils.clamp(s, 0, 1) }

    _spawn() {
        const r = this.pool.find((x) => x.available)
        if (!r) return

        r.available = false
        r.t = 0
        r.duration = this.duration * THREE.MathUtils.lerp(1.5, 0.7, this.strength)
        r.uProgress.value = 0
        r.mesh.visible = true

        r.mesh.position.set(
            this.center.x + (Math.random() - 0.5) * this.radius * 2,
            this.center.y + this.height + (Math.random() - 0.5) * this.heightSpread,
            this.center.z + this.zFront - Math.random() * (this.zBehind + this.zFront)
        )
        r.mesh.rotation.y = this.angle
        r.drift.set(Math.sin(this.angle), 0, Math.cos(this.angle)).multiplyScalar(this.travel)
    }

    update() {
        if (!this.enabled) return
        const dt = Math.min(this.time.delta * 0.001, 0.1)

        this._spawnTimer -= dt
        if (this._spawnTimer <= 0) {
            this._spawn()
            this._spawnTimer = this.spawnEvery * THREE.MathUtils.lerp(2.2, 0.7, this.strength)
                * (0.7 + Math.random() * 0.6)
        }

        for (const r of this.pool) {
            if (r.available) continue
            r.t += dt
            const p = r.t / r.duration
            if (p >= 1) {
                r.mesh.visible = false
                r.available = true
                continue
            }
            r.uProgress.value = p
            r.mesh.position.addScaledVector(r.drift, dt / r.duration)
        }
    }

    dispose() {
        for (const r of this.pool) r.dispose(this.scene)
        this.pool = []
        this.geometry.dispose()
    }
}
