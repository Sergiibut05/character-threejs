/**
 * Floor — applies the hybrid grass/dirt + slabs material to the four floor
 * meshes inside `floor.glb`:
 *   - "grass-floor-1" / "grass-floor-2" → full hybrid (grass + dirt + slabs).
 *   - "ground-floor-1" / "ground-floor-2" → pure dirt (no masks).
 *
 * Grass-floor meshes carry baked masks (KTX2 textures sampled by UV in the
 * shader). For CPU-side grass spawn distribution we additionally accept the
 * raw PNG (`maskCpuImages`) since KTX2 is GPU-only and can't be drawn to
 * a 2D canvas.
 *
 * Slabs overlay is driven by a vertex color attribute. Blender can export
 * up to two color attributes (COLOR_0 → "color", COLOR_1 → "color_1"); the
 * "right" one depends on the user's setup, so the attribute and channel
 * are configurable both via constructor options and the debug GUI.
 */
import * as THREE from 'three'
import { uniform, vec4 } from 'three/tsl'
import Experience from '../../Experience.js'
import { createFloorColorNode } from '../TSL/FloorShader.js'
import { dayNightLitTint } from '../DayNight.js'
import { REAL_SHADOWS_SUPPORTED } from '../../Utils/DeviceCaps.js'

const _vA = new THREE.Vector3()
const _vB = new THREE.Vector3()
const _vC = new THREE.Vector3()

const GRASS_MESH_NAMES = ['grass-floor-1', 'grass-floor-2']
const DIRT_MESH_NAMES = ['ground-floor-1', 'ground-floor-2']

// No vegetation at (or below) water level: the river surface sits at world
// y ≈ -0.5 (agua plane -0.61 + lift), so blades spawned on the lower bank
// would poke through the water. Anything under this Y is skipped.
const GRASS_MIN_WORLD_Y = -0.3
const SLABS_CHANNELS = ['lum', 'r', 'g', 'b', 'a']

/** Same response as shader `smoothstep(uGrassMaskLow, uGrassMaskHigh, lum)` — CPU-side. */
function grassMaskBlendCpu(lum, low, high) {
    const denom = Math.max(1e-6, high - low)
    const t = THREE.MathUtils.clamp((lum - low) / denom, 0, 1)
    return t * t * (3 - 2 * t)
}

export default class Floor {
    constructor(gltf, options = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug
        this.isLow = this.experience.quality.isLow

        if (!gltf || !gltf.scene) {
            console.warn('Floor: missing gltf.scene')
            return
        }

        this.root = gltf.scene
        this.root.name = 'Floor'

        this.grassFloorMasks = options.grassFloorMasks || {}
        this.maskCpuImages = options.maskCpuImages || {}
        this.slabsTexture = options.slabsTexture || null

        this.grassMeshes = []
        this.dirtMeshes = []

        this.uniforms = options.sharedUniforms || createDefaultFloorUniforms()
        // User-tuned slabs config (frozen from the runtime GUI session).
        this.slabsConfig = {
            attribute: options.slabsAttribute || 'color_1',
            channel: options.slabsChannel || 'lum',
            debug: false
        }

        this._diagnoseColorAttributes()
        this._setupMeshes()
        this.scene.add(this.root)

        if (this.debug?.active) this._setupGUI()
    }

    _diagnoseColorAttributes() {
        for (const name of GRASS_MESH_NAMES) {
            const mesh = this.root.getObjectByName(name)
            if (!mesh) continue
            const attrs = mesh.geometry.attributes
            const summary = {}
            for (const key of ['color', 'color_1']) {
                const a = attrs[key]
                if (!a) { summary[key] = 'missing'; continue }
                const sx = a.getX?.(0) ?? '?'
                const sy = a.getY?.(0) ?? '?'
                const sz = a.getZ?.(0) ?? '?'
                const sw = a.itemSize >= 4 ? a.getW?.(0) : '-'
                summary[key] = `itemSize=${a.itemSize}, count=${a.count}, sample[0]=(${sx}, ${sy}, ${sz}, ${sw})`
            }
            console.log(`🎨 ${name} color attrs:`, summary)
        }
    }

    _setupMeshes() {
        for (const name of GRASS_MESH_NAMES) {
            const mesh = this.root.getObjectByName(name)
            if (!mesh) {
                console.warn(`Floor: ${name} not found`)
                continue
            }
            this._applyGrassFloorMaterial(mesh, name)
            this.grassMeshes.push(mesh)
        }

        for (const name of DIRT_MESH_NAMES) {
            const mesh = this.root.getObjectByName(name)
            if (!mesh) {
                console.warn(`Floor: ${name} not found`)
                continue
            }
            this._applyDirtFloorMaterial(mesh)
            this.dirtMeshes.push(mesh)
        }
    }

    _applyGrassFloorMaterial(mesh, key) {
        const maskTex = this.grassFloorMasks[key] || null

        // Pick attribute that actually exists; fall back to whichever is
        // available so the shader never references a missing attribute.
        const attrs = mesh.geometry.attributes
        const requested = this.slabsConfig.attribute
        const slabsAttribute = attrs[requested]
            ? requested
            : (attrs.color ? 'color' : (attrs.color_1 ? 'color_1' : null))

        if (!slabsAttribute) {
            console.warn(`Floor: ${key} has no color attribute — slabs disabled`)
        }

        const material = new THREE.MeshLambertNodeMaterial({
            side: THREE.DoubleSide,
            depthWrite: true
        })
        material.colorNode = createFloorColorNode(this.uniforms, {
            mode: 'floor',
            grassMaskTexture: maskTex,
            slabsTexture: slabsAttribute ? this.slabsTexture : null,
            slabsAttribute: slabsAttribute || 'color',
            slabsChannel: this.slabsConfig.channel,
            debugSlabsMask: this.slabsConfig.debug
        }).mul(vec4(dayNightLitTint, 1.0))

        mesh.material?.dispose?.()
        mesh.material = material
        mesh.castShadow = false
        // Quality-independent, but only where the real shadow pipeline exists
        // (on Android it is disabled entirely — see Utils/DeviceCaps.js).
        mesh.receiveShadow = REAL_SHADOWS_SUPPORTED
    }

    _applyDirtFloorMaterial(mesh) {
        const material = new THREE.MeshLambertNodeMaterial({
            side: THREE.DoubleSide,
            depthWrite: true
        })
        material.colorNode = createFloorColorNode(this.uniforms, { mode: 'dirt' })
            .mul(vec4(dayNightLitTint, 1.0))

        mesh.material?.dispose?.()
        mesh.material = material
        mesh.castShadow = false
        // Quality-independent, but only where the real shadow pipeline exists
        // (on Android it is disabled entirely — see Utils/DeviceCaps.js).
        mesh.receiveShadow = REAL_SHADOWS_SUPPORTED
    }

    /** Re-create the grass-floor material with the current slabs config. */
    _rebuildGrassMaterials() {
        for (const mesh of this.grassMeshes) {
            this._applyGrassFloorMaterial(mesh, mesh.name)
        }
    }

    /**
     * Re-run CPU grass placement (uses current mask + spawn uniforms).
     * Only when debug World already created `grass` with `spawnFunction`.
     */
    _rebuildGrassInstances() {
        const world = this.experience.world
        const grass = world?.grass
        if (!grass?.spawnFunction) return

        const target = this.experience.quality.grassCount
        const positions = this.getGrassSpawnPositions(target)
        if (positions.length === 0) {
            console.warn(
                '[Floor] Re-bake: 0 grass positions — baja «Min blade grass» o «Triangle peak scale», o revisa mascaras CPU (*.png)'
            )
            return
        }

        grass.spawnPositions = positions
        grass.count = positions.length
        grass.setMesh()
    }

    _refreshGrassMaskShaderAndSpawn() {
        this._rebuildGrassMaterials()
        this._rebuildGrassInstances()
    }

    /**
     * Sample triangles of grass meshes by UV against the baked grass mask
     * (PNG, CPU-readable) and return random spawn positions for the Grass
     * system. If no mask image is available, returns ALL triangles as grass.
     *
     * When masks exist: (1) drop triangles wholly on dirt vs shared floor uniforms;
     * (2) rejection sample each blade — only place where mask blend matches shader.
     */
    getGrassSpawnPositions(count = 3000) {
        const positions = []
        if (this.grassMeshes.length === 0) return positions

        const grassLow = this.uniforms.uGrassMaskLow?.value ?? 0.45
        const grassHigh = this.uniforms.uGrassMaskHigh?.value ?? 0.62
        const minBladeGrass = this.uniforms.uGrassSpawnMinBlade?.value ?? 0.16
        const triPeakScale = this.uniforms.uGrassSpawnTriPeakScale?.value ?? 0.88
        const attemptsMult = this.uniforms.uGrassSpawnAttemptsMult?.value ?? 56
        const triMinPeak = grassLow * triPeakScale

        const meshData = []
        let grandTotalArea = 0

        for (const mesh of this.grassMeshes) {
            const geometry = mesh.geometry
            const posAttr = geometry.attributes.position
            const uvAttr = geometry.attributes.uv
            if (!posAttr || !uvAttr) continue

            const cpuImage = this.maskCpuImages[mesh.name] || null
            const flipCpuV = (this.uniforms.uGrassSpawnFlipMaskV?.value ?? 0) > 0.5
            const sampleMask = cpuImage ? this._buildMaskSampler(cpuImage, flipCpuV) : null

            mesh.updateWorldMatrix(true, false)
            const worldMatrix = mesh.matrixWorld
            const indexArray = geometry.index ? geometry.index.array : null
            const faceCount = indexArray ? indexArray.length / 3 : posAttr.count / 3

            const grassTriangles = []
            let totalArea = 0

            for (let f = 0; f < faceCount; f++) {
                const iA = indexArray ? indexArray[f * 3]     : f * 3
                const iB = indexArray ? indexArray[f * 3 + 1] : f * 3 + 1
                const iC = indexArray ? indexArray[f * 3 + 2] : f * 3 + 2

                const ua = uvAttr.getX(iA)
                const va = uvAttr.getY(iA)
                const ub = uvAttr.getX(iB)
                const vb = uvAttr.getY(iB)
                const uc = uvAttr.getX(iC)
                const vc = uvAttr.getY(iC)

                if (sampleMask) {
                    const lA = sampleMask(ua, va)
                    const lB = sampleMask(ub, vb)
                    const lC = sampleMask(uc, vc)
                    const peak = Math.max(lA, lB, lC)
                    if (peak < triMinPeak) continue
                }

                _vA.set(posAttr.getX(iA), posAttr.getY(iA), posAttr.getZ(iA)).applyMatrix4(worldMatrix)
                _vB.set(posAttr.getX(iB), posAttr.getY(iB), posAttr.getZ(iB)).applyMatrix4(worldMatrix)
                _vC.set(posAttr.getX(iC), posAttr.getY(iC), posAttr.getZ(iC)).applyMatrix4(worldMatrix)

                const ab = new THREE.Vector3().subVectors(_vB, _vA)
                const ac = new THREE.Vector3().subVectors(_vC, _vA)
                const area = ab.cross(ac).length() * 0.5
                if (area > 0.0001) {
                    grassTriangles.push({
                        a: _vA.clone(),
                        b: _vB.clone(),
                        c: _vC.clone(),
                        ua, va, ub, vb, uc, vc,
                        area
                    })
                    totalArea += area
                }
            }

            if (grassTriangles.length > 0 && totalArea > 0) {
                // Precalculate cumulative areas for O(log M) binary search
                const cumulativeAreas = new Float32Array(grassTriangles.length)
                let runningArea = 0
                for (let i = 0; i < grassTriangles.length; i++) {
                    runningArea += grassTriangles[i].area
                    cumulativeAreas[i] = runningArea
                }
                meshData.push({
                    mesh,
                    grassTriangles,
                    cumulativeAreas,
                    totalArea,
                    sampleMask
                })
                grandTotalArea += totalArea
            }
        }

        if (grandTotalArea === 0) return positions

        const pickTriangle = (grassTriangles, cumulativeAreas, totalArea) => {
            const r = Math.random() * totalArea
            let lo = 0
            let hi = cumulativeAreas.length - 1
            while (lo < hi) {
                const mid = (lo + hi) >> 1
                if (r <= cumulativeAreas[mid]) hi = mid
                else lo = mid + 1
            }
            return grassTriangles[lo]
        }

        for (const { mesh, grassTriangles, cumulativeAreas, totalArea, sampleMask } of meshData) {
            const meshCount = Math.round(count * (totalArea / grandTotalArea))
            console.log(`🌿 ${mesh.name}: ${grassTriangles.length} tris, area ${totalArea.toFixed(2)} m², ${meshCount} blades`)

            const attemptsCap = Math.max(meshCount * attemptsMult, meshCount + attemptsMult)

            for (let i = 0; i < meshCount; i++) {
                let placed = false
                let tries = 0

                while (!placed && tries < attemptsCap) {
                    tries++
                    const tri = pickTriangle(grassTriangles, cumulativeAreas, totalArea)
                    let u = Math.random()
                    let vv = Math.random()
                    if (u + vv > 1) { u = 1 - u; vv = 1 - vv }
                    const ww = 1 - u - vv

                    const x = tri.a.x * u + tri.b.x * vv + tri.c.x * ww
                    const y = tri.a.y * u + tri.b.y * vv + tri.c.y * ww
                    const z = tri.a.z * u + tri.b.z * vv + tri.c.z * ww

                    // Never at/below the water surface (see GRASS_MIN_WORLD_Y).
                    if (y < GRASS_MIN_WORLD_Y) continue

                    if (!sampleMask) {
                        positions.push({ x, y, z })
                        placed = true
                        break
                    }

                    // Same barycentric weights as position: u·A + vv·B + ww·C
                    const sampU = tri.ua * u + tri.ub * vv + tri.uc * ww
                    const sampV = tri.va * u + tri.vb * vv + tri.vc * ww
                    const lum = sampleMask(sampU, sampV)
                    const g = grassMaskBlendCpu(lum, grassLow, grassHigh)

                    if (g >= minBladeGrass) {
                        positions.push({ x, y, z })
                        placed = true
                    }
                }
            }
        }

        console.log(`🌿 Total grass positions: ${positions.length} (density: ${(positions.length / grandTotalArea).toFixed(1)} blades/m²)`)
        return positions
    }

    // ─── CPU dirt query (footprints) ─────────────────────────────────────

    /**
     * True when world (x,z) lands on dirt: on a pure-dirt floor mesh, or on a
     * grass-floor mesh where the baked mask says "dirt" (low grass blend —
     * the exact same response the shader and the grass spawner use).
     */
    isDirtAt(x, z) {
        if (this._surfCache === undefined) this._surfCache = this._buildSurfaceCache()
        const C = this._surfCache
        if (!C) return false

        for (const m of C.dirt) {
            if (x < m.minX || x > m.maxX || z < m.minZ || z > m.maxZ) continue
            if (this._findTriangle2D(m.tris, x, z)) return true
        }

        for (const m of C.grass) {
            if (x < m.minX || x > m.maxX || z < m.minZ || z > m.maxZ) continue
            const hit = this._findTriangle2D(m.tris, x, z)
            if (!hit) continue
            if (!m.sampler) return false
            const { tri, w0, w1, w2 } = hit
            const u = tri.ua * w0 + tri.ub * w1 + tri.uc * w2
            const v = tri.va * w0 + tri.vb * w1 + tri.vc * w2
            const low = this.uniforms.uGrassMaskLow?.value ?? 0.45
            const high = this.uniforms.uGrassMaskHigh?.value ?? 0.62
            return grassMaskBlendCpu(m.sampler(u, v), low, high) < 0.3
        }
        return false
    }

    /** One-time CPU cache: XZ triangles (+uvs for grass meshes) per floor mesh. */
    _buildSurfaceCache() {
        const collect = (mesh, withUv) => {
            const geometry = mesh.geometry
            const posAttr = geometry.attributes.position
            const uvAttr = geometry.attributes.uv
            if (!posAttr || (withUv && !uvAttr)) return null

            mesh.updateWorldMatrix(true, false)
            const wm = mesh.matrixWorld
            const indexArray = geometry.index ? geometry.index.array : null
            const faceCount = indexArray ? indexArray.length / 3 : posAttr.count / 3

            const tris = []
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
            for (let f = 0; f < faceCount; f++) {
                const iA = indexArray ? indexArray[f * 3] : f * 3
                const iB = indexArray ? indexArray[f * 3 + 1] : f * 3 + 1
                const iC = indexArray ? indexArray[f * 3 + 2] : f * 3 + 2
                _vA.set(posAttr.getX(iA), posAttr.getY(iA), posAttr.getZ(iA)).applyMatrix4(wm)
                _vB.set(posAttr.getX(iB), posAttr.getY(iB), posAttr.getZ(iB)).applyMatrix4(wm)
                _vC.set(posAttr.getX(iC), posAttr.getY(iC), posAttr.getZ(iC)).applyMatrix4(wm)

                const denom = (_vB.z - _vC.z) * (_vA.x - _vC.x) + (_vC.x - _vB.x) * (_vA.z - _vC.z)
                if (Math.abs(denom) < 1e-8) continue

                const tri = {
                    ax: _vA.x, az: _vA.z, bx: _vB.x, bz: _vB.z, cx: _vC.x, cz: _vC.z,
                    invDenom: 1 / denom
                }
                if (withUv) {
                    tri.ua = uvAttr.getX(iA); tri.va = uvAttr.getY(iA)
                    tri.ub = uvAttr.getX(iB); tri.vb = uvAttr.getY(iB)
                    tri.uc = uvAttr.getX(iC); tri.vc = uvAttr.getY(iC)
                }
                tris.push(tri)
                minX = Math.min(minX, _vA.x, _vB.x, _vC.x)
                maxX = Math.max(maxX, _vA.x, _vB.x, _vC.x)
                minZ = Math.min(minZ, _vA.z, _vB.z, _vC.z)
                maxZ = Math.max(maxZ, _vA.z, _vB.z, _vC.z)
            }
            return tris.length ? { tris, minX, maxX, minZ, maxZ } : null
        }

        const dirt = []
        for (const mesh of this.dirtMeshes) {
            const d = collect(mesh, false)
            if (d) dirt.push(d)
        }
        const grass = []
        const flipCpuV = (this.uniforms.uGrassSpawnFlipMaskV?.value ?? 0) > 0.5
        for (const mesh of this.grassMeshes) {
            const g = collect(mesh, true)
            if (!g) continue
            const cpuImage = this.maskCpuImages[mesh.name] || null
            g.sampler = cpuImage ? this._buildMaskSampler(cpuImage, flipCpuV) : null
            grass.push(g)
        }
        if (!dirt.length && !grass.length) return null
        return { dirt, grass }
    }

    /** Barycentric point-in-triangle over XZ; returns weights for uv interpolation. */
    _findTriangle2D(tris, x, z) {
        for (const t of tris) {
            const w0 = ((t.bz - t.cz) * (x - t.cx) + (t.cx - t.bx) * (z - t.cz)) * t.invDenom
            if (w0 < -1e-4 || w0 > 1.0001) continue
            const w1 = ((t.cz - t.az) * (x - t.cx) + (t.ax - t.cx) * (z - t.cz)) * t.invDenom
            if (w1 < -1e-4) continue
            const w2 = 1 - w0 - w1
            if (w2 < -1e-4) continue
            return { tri: t, w0, w1, w2 }
        }
        return null
    }

    /**
     * @param {boolean} flipV Use `v` instead of `(1-v)` for row index if PNG differs from GPU UV.
     */
    _buildMaskSampler(imageOrTexture, flipV = false) {
        try {
            const image = imageOrTexture?.image || imageOrTexture
            if (!image || (!image.width && !image.naturalWidth)) return null

            const isDrawable = (image instanceof HTMLImageElement)
                || (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement)
                || (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
            if (!isDrawable) return null

            const w = image.naturalWidth || image.width
            const h = image.naturalHeight || image.height
            const canvas = document.createElement('canvas')
            canvas.width = Math.min(w, 512)
            canvas.height = Math.min(h, 512)
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data

            return (u, v) => {
                const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(u * canvas.width)))
                const yNorm = flipV ? v : (1 - v)
                const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(yNorm * canvas.height)))
                const i = (y * canvas.width + x) * 4
                return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255
            }
        } catch (e) {
            console.warn('Floor: mask sampler unavailable —', e.message)
            return null
        }
    }

    _setupGUI() {
        const folder = this.debug.ui.addFolder('Floor')
        folder.close()

        const u = this.uniforms

        const grassFolder = folder.addFolder('Grass mask (GPU / floor shader)')
        grassFolder
            .add(u.uGrassMaskLow, 'value', 0, 1, 0.01)
            .name('Mask Low')
            .onFinishChange(() => this._refreshGrassMaskShaderAndSpawn())
        grassFolder
            .add(u.uGrassMaskHigh, 'value', 0, 1, 0.01)
            .name('Mask High')
            .onFinishChange(() => this._refreshGrassMaskShaderAndSpawn())

        const spawnCpu = folder.addFolder('Grass spawn (CPU · anti-dirt)')
        spawnCpu.close()
        spawnCpu.add(u.uGrassSpawnMinBlade, 'value', 0.02, 0.55, 0.01).name('Min blade grass blend')
            .onFinishChange(() => this._rebuildGrassInstances())
        spawnCpu.add(u.uGrassSpawnTriPeakScale, 'value', 0.5, 1.02, 0.01).name('Triangle peak × maskLow')
            .onFinishChange(() => this._rebuildGrassInstances())
        spawnCpu.add(u.uGrassSpawnAttemptsMult, 'value', 12, 160, 1).name('Reject tries multiplier')
            .onFinishChange(() => this._rebuildGrassInstances())
        spawnCpu.add(u.uGrassSpawnFlipMaskV, 'value', 0, 1, 1).name('Flip CPU mask V (0=no, 1=sí)')
            .onFinishChange(() => this._rebuildGrassInstances())

        spawnCpu.add(
            {
                rebakeGrass: () => this._rebuildGrassInstances()
            },
            'rebakeGrass'
        ).name('Re-bake grass positions NOW')

        const slabsFolder = folder.addFolder('Slabs overlay')
        slabsFolder
            .add(this.slabsConfig, 'attribute', ['color', 'color_1'])
            .name('Vertex attribute')
            .onChange(() => this._rebuildGrassMaterials())
        slabsFolder
            .add(this.slabsConfig, 'channel', SLABS_CHANNELS)
            .name('Channel')
            .onChange(() => this._rebuildGrassMaterials())
        slabsFolder
            .add(this.slabsConfig, 'debug')
            .name('Debug mask (B/W)')
            .onChange(() => this._rebuildGrassMaterials())
        slabsFolder.add(u.uSlabsMaskLow, 'value', 0, 1, 0.01).name('Threshold Low')
        slabsFolder.add(u.uSlabsMaskHigh, 'value', 0, 1, 0.01).name('Threshold High')
        slabsFolder.add(u.uSlabsScale, 'value', 1, 80, 0.5).name('Tile Scale')
        slabsFolder.add(u.uSlabsStrength, 'value', 0, 1, 0.01).name('Strength')
    }
}

export function createDefaultFloorUniforms() {
    return {
        // Grass palette (Ghibli-style)
        uScale: uniform(0.2),
        uGrassColor0: uniform(new THREE.Color(0x3E7E32)),
        uGrassColor1: uniform(new THREE.Color(0x5FB538)),
        uGrassColor2: uniform(new THREE.Color(0x8FCC3A)),
        uGrassColor3: uniform(new THREE.Color(0xBDE868)),
        uGrassRampStop1: uniform(0.18),
        uGrassRampStop2: uniform(0.68),
        uGrassMicroScale: uniform(1.4),
        uGrassAOStrength: uniform(0),
        uGrassSunStrength: uniform(0.28),
        uGrassSoilColor: uniform(new THREE.Color(0x2C4A1A)),

        // Dirt / sand palette
        uSandColor1: uniform(new THREE.Color(0.791, 0.352, 0.122)),
        uSandColor2: uniform(new THREE.Color(0.597, 0.266, 0.093)),
        uSandVoronoiScale: uniform(6.3),
        uSandNoiseScale: uniform(0.8),
        uSandDistortion: uniform(0.136),

        // Grass mask (UV-baked) — values tuned in the live GUI.
        uGrassMaskLow: uniform(0.45),
        uGrassMaskHigh: uniform(0.62),

        // CPU grass spawn (PNG masks vs shader) — see Floor → lil-gui «Grass spawn»
        uGrassSpawnMinBlade: uniform(0.16),
        uGrassSpawnTriPeakScale: uniform(0.88),
        uGrassSpawnAttemptsMult: uniform(56),
        /** Toggle if grass lines up on GPU but spawn still hits dirt (PNG V vs glTF UV). */
        uGrassSpawnFlipMaskV: uniform(1),

        // Slabs overlay — values tuned in the live GUI.
        uSlabsMaskLow: uniform(0.0),
        uSlabsMaskHigh: uniform(0.29),
        uSlabsScale: uniform(1.0),
        uSlabsStrength: uniform(0.24)
    }
}
