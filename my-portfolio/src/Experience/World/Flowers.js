import * as THREE from 'three'
import {
    Fn, float, vec3, vec4, attribute, uniform, uv, texture,
    positionLocal, sin, cos, length, smoothstep, clamp, mix, step,
    If, Discard
} from 'three/tsl'
import Experience from '../Experience.js'

/**
 * Flowers
 * -------
 * Billboard-style flowers scattered across the grass.
 * Uses 3 textures (violet, white, yellow) with crossed quads for the flower heads,
 * and crossed quads for the green stems.
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

        this.palette = [0, 1, 2, 3] // 0: violet, 1: white, 2: yellow, 3: blue

        this._stemTop = 0.0 // Removed procedural stem
        this._topY = 0.20 // Adjust top limit for wind

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
        const uvs = []
        const indices = []

        const addVertex = (x, y, z, u, v) => {
            positions.push(x, y, z)
            uvs.push(u, v)
            return positions.length / 3 - 1
        }

        const baseY = this._stemTop

        // ── Flower: segmented quad mapped with texture ──
        // Subdivided into 3 vertical segments so the wind bends it smoothly (volumetric effect)
        const hwTop = 0.10
        const topH = 0.20
        const segments = 3
        const addTopQuad = () => {
            for (let i = 0; i < segments; i++) {
                const v1 = i / segments
                const v2 = (i + 1) / segments
                const y1 = baseY + topH * v1
                const y2 = baseY + topH * v2

                const b0 = addVertex(-hwTop, y1, 0, 0, v1)
                const b1 = addVertex(hwTop, y1, 0, 1, v1)
                const t1 = addVertex(hwTop, y2, 0, 1, v2)
                const t0 = addVertex(-hwTop, y2, 0, 0, v2)
                
                indices.push(b0, b1, t1, b0, t1, t0)
            }
        }
        addTopQuad()

        this.geometry = new THREE.BufferGeometry()
        this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
        this.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
        this.geometry.setIndex(indices)
        this.geometry.computeVertexNormals()
    }

    _bedMask(x, z) {
        const s = this.bedScale
        const n =
            Math.sin(x * s + 1.3) * Math.cos(z * s * 0.9 - 0.7) * 0.5 +
            Math.sin((x + z) * s * 1.7 + 2.1) * 0.3 +
            0.5
        return THREE.MathUtils.clamp(n, 0, 1)
    }

    _zoneColorIndex(x, z) {
        // Zonas de color más pequeñas
        const s = this.zoneScale * 4.0
        let field =
            0.6 * Math.sin(x * s + 1.3) * Math.cos(z * s * 0.9 - 0.7) +
            0.4 * Math.sin((x + z) * s * 0.5 + 2.1)
        field = THREE.MathUtils.clamp(field * 0.5 + 0.5, 0, 0.9999)
        
        const zoneColor = Math.floor(field * this.palette.length) % this.palette.length
        
        // 25% de probabilidad de que sea un color aleatorio para dar variedad
        if (Math.random() < 0.25) {
            return Math.floor(Math.random() * this.palette.length)
        }
        
        return zoneColor
    }

    buildPlacements() {
        this._positions = []
        this._types = []
        this._clusterPositions = []

        if (this.candidates.length === 0) return

        for (let i = 0; i < this.candidates.length && this._positions.length < this.maxCount; i++) {
            const p = this.candidates[i]
            if (this._bedMask(p.x, p.z) < this.bedThreshold) continue
            if (Math.random() > 0.62) continue

            this._positions.push(new THREE.Vector3(p.x, p.y, p.z))

            const idx = this._zoneColorIndex(p.x, p.z)
            this._types.push(idx)

            if (this._clusterPositions.length < 64 && Math.random() > 0.85) {
                this._clusterPositions.push(this._positions[this._positions.length - 1].clone())
            }
        }
    }

    setMaterial() {
        this.uTime = uniform(0)
        this.uWindStrength = uniform(0.05)
        this.uWindSpeed = uniform(1.9)
        this.uCharacterPosition = uniform(new THREE.Vector3(0, 0, 0))
        this.uViewRadius = uniform(this.viewRadius)
        this.uViewFadeBand = uniform(this.viewFadeBand)

        const texViolet = this.experience.resources.items.flowerViolet
        const texWhite = this.experience.resources.items.flowerWhite
        const texYellow = this.experience.resources.items.flowerYellow
        const texBlue = this.experience.resources.items.flowerBlue

        ;[texViolet, texWhite, texYellow, texBlue].forEach(tex => {
            if (tex) {
                tex.colorSpace = THREE.SRGBColorSpace
            }
        })

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

        const colorNode = Fn(() => {
            const aFlowerType = attribute('aFlowerType', 'float')
            const uvCoord = uv()

            const sampleViolet = texture(texViolet, uvCoord)
            const sampleWhite = texture(texWhite, uvCoord)
            const sampleYellow = texture(texYellow, uvCoord)
            const sampleBlue = texture(texBlue, uvCoord)

            const isType1 = step(0.5, aFlowerType).sub(step(1.5, aFlowerType))
            const isType2 = step(1.5, aFlowerType).sub(step(2.5, aFlowerType))
            const isType3 = step(2.5, aFlowerType)
            
            const texColor = mix(sampleViolet, sampleWhite, isType1).toVar()
            texColor.assign(mix(texColor, sampleYellow, isType2))
            texColor.assign(mix(texColor, sampleBlue, isType3))

            const finalColor = texColor
            
            If(finalColor.a.lessThan(0.5), () => { Discard() })
            
            return finalColor
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
        const types = new Float32Array(count)
        const worldPos = new Float32Array(count * 3)

        for (let i = 0; i < count; i++) {
            const p = this._positions[i]
            
            // Base size slightly bigger, increased minimum size
            const baseScale = (0.7 + Math.random() * 0.3) * this.flowerScale
            
            // Make it slightly wider
            const scaleX = baseScale * (1.15 + Math.random() * 0.15)
            
            // Height variation (minimum height raised to avoid very small flowers)
            const scaleY = baseScale * (0.85 + Math.random() * 0.4)
            
            dummy.position.copy(p)
            dummy.rotation.set(0, 0, 0)
            dummy.scale.set(scaleX, scaleY, scaleX)
            dummy.updateMatrix()
            this.mesh.setMatrixAt(i, dummy.matrix)

            seeds[i] = Math.random()
            types[i] = this._types[i]
            worldPos[i * 3] = p.x
            worldPos[i * 3 + 1] = p.y
            worldPos[i * 3 + 2] = p.z
        }

        this.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
        this.geometry.setAttribute('aFlowerType', new THREE.InstancedBufferAttribute(types, 1))
        this.geometry.setAttribute('aInstanceWorldPos', new THREE.InstancedBufferAttribute(worldPos, 3))

        this.mesh.instanceMatrix.needsUpdate = true
        this.scene.add(this.mesh)
    }

    update() {
        if (this.uTime) this.uTime.value = this.time.elapsed * 0.001
        const character = this.experience.world.character
        if (this.uCharacterPosition && character) {
            // This uniform only feeds view culling (no parting), so push it
            // toward the view direction — same trick as Grass.uViewCenter.
            const cam = this.experience.camera.instance.position
            const ahead = this.experience.quality.grassViewAhead
            let dx = character.position.x - cam.x
            let dz = character.position.z - cam.z
            const len = Math.hypot(dx, dz) || 1
            this.uCharacterPosition.value.set(
                character.position.x + (dx / len) * ahead,
                character.position.y,
                character.position.z + (dz / len) * ahead
            )
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
