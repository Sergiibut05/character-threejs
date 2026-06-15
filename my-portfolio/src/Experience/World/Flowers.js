import * as THREE from 'three'
import {
    Fn, float, vec3, attribute, uniform,
    positionLocal, sin, cos, length, smoothstep, clamp, mix, step
} from 'three/tsl'
import Experience from '../Experience.js'

/**
 * Flowers
 * -------
 * Stylized low-poly flowers scattered across the grass in single-colour ZONES.
 * Each flower is real (tiny) 3D geometry — a short green stem + a bloom made of
 * rounded petals arranged in a shallow cup, plus a domed yellow center. This
 * reads as an actual flower from the game's 3/4 camera (not a flat painted
 * sprite), while staying very cheap (~40 tris, one InstancedMesh draw call).
 *
 * References:
 *   - three.js official "instanced flower" pattern: split stem (uniform green)
 *     vs blossom (per-instance colour). Here both live in one mesh, separated
 *     by an `aPart` vertex attribute so we keep a single draw call.
 *
 * Colour ZONES: a low-frequency noise field picks ONE palette colour per region
 * so you get contiguous beds of a specific colour (red bed, blue bed, ...),
 * while a mid-frequency mask carves the actual flower beds out of the lawn.
 */
export default class Flowers {
    constructor(options = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.time = this.experience.time
        this.debug = this.experience.debug

        this.candidates = options.candidates || []
        this.maxCount = options.maxCount ?? 700

        // Bed mask (where flowers grow) — mid frequency
        this.bedScale = options.bedScale ?? 0.16
        this.bedThreshold = options.bedThreshold ?? 0.52
        // Colour zones — low frequency (big contiguous single-colour regions)
        this.zoneScale = options.zoneScale ?? 0.05

        this.flowerScale = options.flowerScale ?? 1.0

        this.viewRadius = options.viewRadius ?? 24
        this.viewFadeBand = options.viewFadeBand ?? 5.0

        this.palette = (options.palette || [
            '#FF7AA2', // pink
            '#FFFFFF', // white
            '#FFD93D', // yellow
            '#FF5C5C', // red
            '#B57BEE', // purple
            '#6FB7FF'  // sky blue
        ]).map(c => new THREE.Color(c))

        this._stemTop = 0.14
        this._topY = 0.24

        this.setGeometry()
        this.buildPlacements()
        this.setMaterial()
        this.setMesh()

        this.clusterPositions = this._clusterPositions

        if (this.debug.active) this.setDebug()
    }

    setGeometry() {
        if (this.geometry) this.geometry.dispose()

        const positions = []
        const parts = []
        const indices = []

        const addVertex = (x, y, z, part) => {
            positions.push(x, y, z)
            parts.push(part)
            return positions.length / 3 - 1
        }

        const baseY = this._stemTop

        // ── Petals: tessellated, width-profiled, gently curling up → smooth cup ──
        const petals = 6
        const N = 4               // segments along the petal length
        const M = 3               // segments across the petal width
        const baseTilt = (36 * Math.PI) / 180
        const L = 0.11            // petal length
        const rIn = 0.012         // where the petal attaches near the center
        const maxW = 0.075        // max full width of a petal
        const curl = 0.03         // upward curl at the tip

        for (let p = 0; p < petals; p++) {
            const az = (p * Math.PI * 2) / petals + (Math.random() - 0.5) * 0.05
            const cosA = Math.cos(az), sinA = Math.sin(az)
            const ct = Math.cos(baseTilt), st = Math.sin(baseTilt)

            const grid = []
            for (let i = 0; i <= N; i++) {
                const u = i / N
                // spine in the (radial, up) plane, with a slight upward curl at the tip
                const rad = rIn + ct * L * u
                const up = baseY + st * L * u + curl * (u * u)
                // petal silhouette: pointed at base & tip, widest around the middle
                const width = maxW * Math.pow(Math.sin(Math.PI * u), 0.6)
                const row = []
                for (let j = 0; j <= M; j++) {
                    const v = j / M - 0.5
                    const off = v * width
                    const x = rad * cosA - sinA * off
                    const z = rad * sinA + cosA * off
                    row.push(addVertex(x, up, z, 0))
                }
                grid.push(row)
            }
            for (let i = 0; i < N; i++) {
                for (let j = 0; j < M; j++) {
                    const a = grid[i][j], b = grid[i + 1][j]
                    const c = grid[i + 1][j + 1], d = grid[i][j + 1]
                    indices.push(a, b, d, b, c, d)
                }
            }
        }

        // ── Center: small domed disc (smooth fan) ──
        const seg = 12
        const rc = 0.03
        const yRim = baseY + 0.012
        const apex = addVertex(0, baseY + 0.034, 0, 1)
        const rim = []
        for (let s = 0; s < seg; s++) {
            const a = (s * Math.PI * 2) / seg
            rim.push(addVertex(Math.cos(a) * rc, yRim, Math.sin(a) * rc, 1))
        }
        for (let s = 0; s < seg; s++) {
            indices.push(apex, rim[s], rim[(s + 1) % seg])
        }

        // ── Stem: two crossed quads ──
        const hw = 0.011
        const addStemQuad = (axis) => {
            const b0 = axis === 0 ? addVertex(-hw, 0, 0, 2) : addVertex(0, 0, -hw, 2)
            const b1 = axis === 0 ? addVertex(hw, 0, 0, 2) : addVertex(0, 0, hw, 2)
            const t1 = axis === 0 ? addVertex(hw, baseY, 0, 2) : addVertex(0, baseY, hw, 2)
            const t0 = axis === 0 ? addVertex(-hw, baseY, 0, 2) : addVertex(0, baseY, -hw, 2)
            indices.push(b0, b1, t1, b0, t1, t0)
        }
        addStemQuad(0)
        addStemQuad(1)

        this.geometry = new THREE.BufferGeometry()
        this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
        this.geometry.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(parts), 1))
        this.geometry.setIndex(indices)
        // Indexed → computeVertexNormals yields SMOOTH normals across each petal
        this.geometry.computeVertexNormals()
    }

    // Mid-frequency mask → organic flower beds carved out of the lawn
    _bedMask(x, z) {
        const s = this.bedScale
        const n =
            Math.sin(x * s + 1.3) * Math.cos(z * s * 0.9 - 0.7) * 0.5 +
            Math.sin((x + z) * s * 1.7 + 2.1) * 0.3 +
            0.5
        return THREE.MathUtils.clamp(n, 0, 1)
    }

    // Low-frequency field → ONE palette colour per contiguous region
    _zoneColorIndex(x, z) {
        const s = this.zoneScale
        let field =
            0.6 * Math.sin(x * s + 1.3) * Math.cos(z * s * 0.9 - 0.7) +
            0.4 * Math.sin((x + z) * s * 0.5 + 2.1)
        field = THREE.MathUtils.clamp(field * 0.5 + 0.5, 0, 0.9999)
        return Math.floor(field * this.palette.length) % this.palette.length
    }

    buildPlacements() {
        this._positions = []
        this._colors = []
        this._clusterPositions = []

        if (this.candidates.length === 0) return

        for (let i = 0; i < this.candidates.length && this._positions.length < this.maxCount; i++) {
            const p = this.candidates[i]
            if (this._bedMask(p.x, p.z) < this.bedThreshold) continue
            if (Math.random() > 0.62) continue

            this._positions.push(new THREE.Vector3(p.x, p.y, p.z))

            const idx = this._zoneColorIndex(p.x, p.z)
            const base = this.palette[idx]
            // keep the same hue across the zone; only a tiny brightness jitter
            const c = base.clone().multiplyScalar(0.92 + Math.random() * 0.16)
            this._colors.push(c)

            if (this._clusterPositions.length < 64 && Math.random() > 0.85) {
                this._clusterPositions.push(this._positions[this._positions.length - 1].clone())
            }
        }
    }

    setMaterial() {
        this.uTime = uniform(0)
        this.uWindStrength = uniform(0.05)
        this.uWindSpeed = uniform(1.0)
        this.uCharacterPosition = uniform(new THREE.Vector3(0, 0, 0))
        this.uViewRadius = uniform(this.viewRadius)
        this.uViewFadeBand = uniform(this.viewFadeBand)

        const topY = this._topY

        const posNode = Fn(() => {
            const pos = positionLocal.toVar()
            const aSeed = attribute('aSeed', 'float')
            const aWorld = attribute('aInstanceWorldPos', 'vec3')

            const h = clamp(positionLocal.y.div(topY), 0.0, 1.0)
            const wx = aWorld.x.add(aSeed.mul(6.28))
            const wz = aWorld.z.add(aSeed.mul(2.72))
            const t = this.uTime.mul(this.uWindSpeed)
            const sway = sin(t.mul(1.1).add(wx.mul(0.7)).add(wz.mul(0.5)))
            const sway2 = cos(t.mul(0.8).add(wx.mul(0.5)))
            const hSq = h.mul(h)
            pos.x.addAssign(sway.mul(this.uWindStrength).mul(hSq))
            pos.z.addAssign(sway2.mul(this.uWindStrength).mul(0.6).mul(hSq))

            const viewDist = length(aWorld.xz.sub(this.uCharacterPosition.xz))
            const viewFade = smoothstep(this.uViewRadius, this.uViewRadius.sub(this.uViewFadeBand), viewDist)
            pos.mulAssign(viewFade)

            return pos
        })()

        // part: 0 = petal (instance colour), 1 = center (yellow), 2 = stem (green)
        const colorNode = Fn(() => {
            const aPart = attribute('aPart', 'float')
            const aColor = attribute('aFlowerColor', 'vec3')
            const isCenter = step(0.5, aPart).sub(step(1.5, aPart))
            const isStem = step(1.5, aPart)
            const col = mix(aColor, vec3(1.0, 0.84, 0.26), isCenter).toVar()
            col.assign(mix(col, vec3(0.18, 0.45, 0.16), isStem))
            return col
        })()

        this.material = new THREE.MeshLambertNodeMaterial({
            side: THREE.DoubleSide
        })
        this.material.positionNode = posNode
        this.material.colorNode = colorNode
    }

    setMesh() {
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh.dispose()
        }

        const count = this._positions.length
        if (count === 0) return

        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count)
        this.mesh.frustumCulled = false
        this.mesh.castShadow = false
        this.mesh.receiveShadow = false

        const dummy = new THREE.Object3D()
        const seeds = new Float32Array(count)
        const colors = new Float32Array(count * 3)
        const worldPos = new Float32Array(count * 3)

        for (let i = 0; i < count; i++) {
            const p = this._positions[i]
            const s = (0.4 + Math.random() * 0.3) * this.flowerScale
            dummy.position.copy(p)
            dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
            dummy.scale.setScalar(s)
            dummy.updateMatrix()
            this.mesh.setMatrixAt(i, dummy.matrix)

            seeds[i] = Math.random()
            const c = this._colors[i]
            colors[i * 3] = c.r
            colors[i * 3 + 1] = c.g
            colors[i * 3 + 2] = c.b
            worldPos[i * 3] = p.x
            worldPos[i * 3 + 1] = p.y
            worldPos[i * 3 + 2] = p.z
        }

        this.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
        this.geometry.setAttribute('aFlowerColor', new THREE.InstancedBufferAttribute(colors, 3))
        this.geometry.setAttribute('aInstanceWorldPos', new THREE.InstancedBufferAttribute(worldPos, 3))

        this.mesh.instanceMatrix.needsUpdate = true
        this.scene.add(this.mesh)
    }

    update() {
        if (this.uTime) this.uTime.value = this.time.elapsed * 0.001
        if (this.uCharacterPosition && this.experience.world.character) {
            this.uCharacterPosition.value.copy(this.experience.world.character.position)
        }
        this.uViewRadius.value = this.viewRadius
        this.uViewFadeBand.value = this.viewFadeBand
    }

    setDebug() {
        this.debugFolder = this.debug.ui.addFolder('Flowers')
        this.debugFolder.close()
        this.debugFolder.add(this.uWindStrength, 'value', 0.0, 0.2, 0.005).name('Wind Strength')
        this.debugFolder.add(this.uWindSpeed, 'value', 0.1, 3.0, 0.1).name('Wind Speed')
        this.debugFolder.add(this, 'viewRadius', 5.0, 40.0, 0.5).name('View Radius')
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh.dispose()
            this.mesh = null
        }
        this.geometry?.dispose()
        this.material?.dispose()
    }
}
