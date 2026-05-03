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
import { uniform } from 'three/tsl'
import Experience from '../../Experience.js'
import { createFloorColorNode } from '../TSL/FloorShader.js'

const _vA = new THREE.Vector3()
const _vB = new THREE.Vector3()
const _vC = new THREE.Vector3()

const GRASS_MESH_NAMES = ['grass-floor-1', 'grass-floor-2']
const DIRT_MESH_NAMES = ['ground-floor-1', 'ground-floor-2']
const SLABS_CHANNELS = ['lum', 'r', 'g', 'b', 'a']

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
        })

        mesh.material?.dispose?.()
        mesh.material = material
        mesh.castShadow = false
        // Force receiveShadow to true regardless of quality to ensure shadows are always visible
        mesh.receiveShadow = true
    }

    _applyDirtFloorMaterial(mesh) {
        const material = new THREE.MeshLambertNodeMaterial({
            side: THREE.DoubleSide,
            depthWrite: true
        })
        material.colorNode = createFloorColorNode(this.uniforms, { mode: 'dirt' })

        mesh.material?.dispose?.()
        mesh.material = material
        mesh.castShadow = false
        // Force receiveShadow to true regardless of quality to ensure shadows are always visible
        mesh.receiveShadow = true
    }

    /** Re-create the grass-floor material with the current slabs config. */
    _rebuildGrassMaterials() {
        for (const mesh of this.grassMeshes) {
            this._applyGrassFloorMaterial(mesh, mesh.name)
        }
    }

    /**
     * Sample triangles of grass meshes by UV against the baked grass mask
     * (PNG, CPU-readable) and return random spawn positions for the Grass
     * system. If no mask image is available, returns ALL triangles as grass.
     */
    getGrassSpawnPositions(count = 3000) {
        const positions = []
        if (this.grassMeshes.length === 0) return positions

        const meshData = []
        let grandTotalArea = 0

        for (const mesh of this.grassMeshes) {
            const geometry = mesh.geometry
            const posAttr = geometry.attributes.position
            const uvAttr = geometry.attributes.uv
            if (!posAttr || !uvAttr) continue

            const cpuImage = this.maskCpuImages[mesh.name] || null
            const sampleMask = cpuImage ? this._buildMaskSampler(cpuImage) : null

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

                if (sampleMask) {
                    const lA = sampleMask(uvAttr.getX(iA), uvAttr.getY(iA))
                    const lB = sampleMask(uvAttr.getX(iB), uvAttr.getY(iB))
                    const lC = sampleMask(uvAttr.getX(iC), uvAttr.getY(iC))
                    if (lA < 0.4 && lB < 0.4 && lC < 0.4) continue
                }

                _vA.set(posAttr.getX(iA), posAttr.getY(iA), posAttr.getZ(iA)).applyMatrix4(worldMatrix)
                _vB.set(posAttr.getX(iB), posAttr.getY(iB), posAttr.getZ(iB)).applyMatrix4(worldMatrix)
                _vC.set(posAttr.getX(iC), posAttr.getY(iC), posAttr.getZ(iC)).applyMatrix4(worldMatrix)

                const ab = new THREE.Vector3().subVectors(_vB, _vA)
                const ac = new THREE.Vector3().subVectors(_vC, _vA)
                const area = ab.cross(ac).length() * 0.5
                if (area > 0.0001) {
                    grassTriangles.push({ a: _vA.clone(), b: _vB.clone(), c: _vC.clone(), area })
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
                meshData.push({ mesh, grassTriangles, cumulativeAreas, totalArea })
                grandTotalArea += totalArea
            }
        }

        if (grandTotalArea === 0) return positions

        for (const { mesh, grassTriangles, cumulativeAreas, totalArea } of meshData) {
            const meshCount = Math.round(count * (totalArea / grandTotalArea))
            console.log(`🌿 ${mesh.name}: ${grassTriangles.length} tris, area ${totalArea.toFixed(2)} m², ${meshCount} blades`)

            for (let i = 0; i < meshCount; i++) {
                const r = Math.random() * totalArea
                
                // Binary Search (O(log M) instead of O(M))
                let low = 0
                let high = cumulativeAreas.length - 1
                while (low < high) {
                    const mid = (low + high) >> 1
                    if (r <= cumulativeAreas[mid]) high = mid
                    else low = mid + 1
                }
                const chosenTri = grassTriangles[low]

                let u = Math.random()
                let v = Math.random()
                if (u + v > 1) { u = 1 - u; v = 1 - v }
                const w = 1 - u - v
                positions.push({
                    x: chosenTri.a.x * u + chosenTri.b.x * v + chosenTri.c.x * w,
                    y: chosenTri.a.y * u + chosenTri.b.y * v + chosenTri.c.y * w,
                    z: chosenTri.a.z * u + chosenTri.b.z * v + chosenTri.c.z * w
                })
            }
        }

        console.log(`🌿 Total grass positions: ${positions.length} (density: ${(positions.length / grandTotalArea).toFixed(1)} blades/m²)`)
        return positions
    }

    _buildMaskSampler(imageOrTexture) {
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
                const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((1 - v) * canvas.height)))
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

        const grassFolder = folder.addFolder('Grass mask (UV-baked)')
        grassFolder.add(u.uGrassMaskLow, 'value', 0, 1, 0.01).name('Mask Low')
        grassFolder.add(u.uGrassMaskHigh, 'value', 0, 1, 0.01).name('Mask High')

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

        // Slabs overlay — values tuned in the live GUI.
        uSlabsMaskLow: uniform(0.0),
        uSlabsMaskHigh: uniform(0.29),
        uSlabsScale: uniform(1.0),
        uSlabsStrength: uniform(0.24)
    }
}
