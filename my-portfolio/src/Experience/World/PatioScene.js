/**
 * PatioScene — main scene orchestrator.
 *
 * The old monolithic `Patio.glb` has been split into many small GLB files,
 * each loaded individually and wired up by a dedicated component class:
 *
 *   - Floor          (floor.glb)            grass + dirt + slabs
 *   - GrassBorders   (grass-borders.glb)    matches floor's grass palette
 *   - River          (river.glb)            cel-shaded water shader
 *   - Coblestone     (coblestone.glb + json) instanced cobblestones
 *   - Fence          (fence.glb + json)     instanced fences (Sushi atlas)
 *   - StaticPiece    (bridge / walls / InfoBoard / social-area / social-entrance / house)
 *   - BaseballPitch  (baseball-pitch.glb)   embedded baked field texture
 *   - BlackCave      (black-cave.glb)       pure-black planes, no lighting
 *   - Clouds         (still in environment) — kept here as a separate group of meshes
 *
 * This class only stitches things together and exposes:
 *   - getGrassSpawnPositions() for the Grass system
 *   - update() for animated shaders
 */
import * as THREE from 'three'
import Experience from '../Experience.js'
import Floor, { createDefaultFloorUniforms } from './scene/Floor.js'
import GrassBorders from './scene/GrassBorders.js'
import River from './scene/River.js'
import StaticPiece from './scene/StaticPiece.js'
import {
    setBlenderRotationMode,
    getBlenderRotationMode,
    getBlenderRotationModes
} from './scene/SceneUtils.js'
import { chunkedInBackground } from '../Utils/Scheduler.js'

// Lazy-imported (decorative-only): Coblestone, Fence, BaseballPitch, BlackCave.
// Pulled out of the main bundle to drop a few KB of parse cost on first visit.

export default class PatioScene {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.physics = this.experience.world.physics
        this.time = this.experience.time
        this.debug = this.experience.debug
        this.isLow = this.experience.quality.isLow

        this.pieces = {}
        this.colliderBodies = []
        this.floorUniforms = createDefaultFloorUniforms()

        this._setupAtlasTextureFlags()
        console.time('PatioScene · critical pieces')
        this._buildCriticalPieces()
        console.timeEnd('PatioScene · critical pieces')

        // River, house, bridge, infoBoard are now decorative-priority assets.
        // Hook sourceLoaded so each piece pops in as soon as its file arrives.
        this._setupProgressiveLoading()

        // Heavy work (colliders) is scheduled across animation frames so the
        // main thread keeps yielding to the browser. We use convexHull instead
        // of trimesh — same result for convex meshes but ~5-10x faster to build.
        this._buildCollidersAsync()

        // Decorative pieces (trees, fences, parkthings, baseball, blackcave,
        // social-area / social-entrance, coblestones) are streamed in *after*
        // the user already entered the patio. They pop in over the first few
        // seconds while the player roams.
        if (!this.resources.allDone) {
            this.resources.on('allReady', () => this._buildDecorativePieces())
        } else {
            this._buildDecorativePieces()
        }

        if (this.debug?.active) this._setupGUI()

        console.log('✅ PatioScene critical pieces loaded')
    }

    _setupGUI() {
        const folder = this.debug.ui.addFolder('PatioScene · Instances')
        folder.close()

        const state = { rotationMode: getBlenderRotationMode() }
        folder
            .add(state, 'rotationMode', getBlenderRotationModes())
            .name('Rotation mode (Blender→Three)')
            .onChange((mode) => {
                setBlenderRotationMode(mode)
                this.pieces.coblestone?.rebuildMatrices?.(mode)
                this.pieces.fence?.rebuildMatrices?.(mode)
                console.log(`🔄 Instance rotation mode → ${mode}`)
            })
    }

    _setupAtlasTextureFlags() {
        const r = this.resources.items
        // Atlas textures need RGB clamping + linear filter for atlas sampling
        for (const tex of [r.forestAtlas, r.sushiAtlas]) {
            if (!tex) continue
            tex.minFilter = THREE.LinearFilter
            tex.magFilter = THREE.LinearFilter
            tex.generateMipmaps = false
            tex.flipY = false
        }
        if (r.slabsTexture) r.slabsTexture.flipY = false
    }

    _buildCriticalPieces() {
        const r = this.resources.items

        // ── Floor (grass-floor-1, grass-floor-2, ground-floor-1, ground-floor-2)
        if (r.floorModel) {
            this.pieces.floor = new Floor(r.floorModel, {
                grassFloorMasks: {
                    'grass-floor-1': r.grassFloor1Mask || null,
                    'grass-floor-2': r.grassFloor2Mask || null
                },
                maskCpuImages: {
                    'grass-floor-1': r.grassFloor1MaskCpu || null,
                    'grass-floor-2': r.grassFloor2MaskCpu || null
                },
                slabsTexture: r.slabsTexture || null,
                sharedUniforms: this.floorUniforms
            })
        }

        // ── Grass borders (perimeter cliffs) — must blend with floor on day 1.
        if (r.grassBordersModel) {
            this.pieces.grassBorders = new GrassBorders(r.grassBordersModel, this.floorUniforms)
        }

        // ── Walls (Forest atlas) — patio boundaries, first thing the user sees.
        if (r.wallsModel) {
            this.pieces.walls = new StaticPiece('walls', r.wallsModel, {
                map: r.forestAtlas || null
            })
        }
        // River, house, bridge, infoBoard → decorative (see _setupProgressiveLoading)
    }

    /**
     * Hooks into `sourceLoaded` so decorative pieces pop in the instant
     * their GLB arrives — no need to wait for `allReady`.
     */
    _setupProgressiveLoading() {
        const r = this.resources.items

        const tryBuild = (name) => {
            // River (water shader)
            if (name === 'riverModel' && !this.pieces.river && r.riverModel) {
                this.pieces.river = new River(r.riverModel)
            }
            // House (needs both model + texture — build as soon as model arrives)
            if ((name === 'houseModel' || name === 'houseTexture') &&
                !this.pieces.house && r.houseModel) {
                this.pieces.house = new StaticPiece('house', r.houseModel, {
                    map: r.houseTexture || null
                })
            }
            // Bridge
            if (name === 'bridgeModel' && !this.pieces.bridge && r.bridgeModel) {
                this.pieces.bridge = new StaticPiece('bridge', r.bridgeModel, {
                    map: r.forestAtlas || null
                })
            }
            // InfoBoard
            if (name === 'infoBoardModel' && !this.pieces.infoBoard && r.infoBoardModel) {
                this.pieces.infoBoard = new StaticPiece('infoBoard', r.infoBoardModel, {
                    map: r.forestAtlas || null
                })
            }
        }

        this.resources.on('sourceLoaded', tryBuild)

        // Also check immediately in case assets loaded from cache already
        for (const name of ['riverModel', 'houseModel', 'bridgeModel', 'infoBoardModel']) {
            tryBuild(name)
        }
    }

    /**
     * Adds decorative pieces once their assets are loaded. Called when the
     * `allReady` event fires from Resources (i.e. after the player has
     * already started exploring). Pieces pop in smoothly over the next
     * frames. The wrapper classes are dynamic-imported so they're not in
     * the initial bundle.
     */
    async _buildDecorativePieces() {
        const r = this.resources.items

        console.time('PatioScene · decorative imports')
        const [
            { default: Coblestone },
            { default: Fence },
            { default: BaseballPitch },
            { default: BlackCave }
        ] = await Promise.all([
            import('./scene/Coblestone.js'),
            import('./scene/Fence.js'),
            import('./scene/BaseballPitch.js'),
            import('./scene/BlackCave.js')
        ])
        console.timeEnd('PatioScene · decorative imports')

        if (!this.pieces.coblestone && r.coblestoneModel && r.coblestoneInstances) {
            this.pieces.coblestone = new Coblestone(r.coblestoneModel, r.coblestoneInstances)
        }

        if (!this.pieces.fence && r.fenceModel && r.fenceInstances) {
            this.pieces.fence = new Fence(r.fenceModel, r.fenceInstances, r.sushiAtlas)
        }

        if (!this.pieces.parkThings && r.parkThingsModel) {
            this.pieces.parkThings = new StaticPiece('parkThings', r.parkThingsModel, {})
        }

        if (!this.pieces.socialArea && r.socialAreaModel) {
            this.pieces.socialArea = new StaticPiece('socialArea', r.socialAreaModel, {
                map: r.sushiAtlas || null
            })
        }

        if (!this.pieces.socialEntrance && r.socialEntranceModel) {
            this.pieces.socialEntrance = new StaticPiece('socialEntrance', r.socialEntranceModel, {
                map: r.sushiAtlas || null,
                preserveOwnMaps: true
            })
        }

        // Fallback: build these if they weren't caught by sourceLoaded yet
        if (!this.pieces.house && r.houseModel) {
            this.pieces.house = new StaticPiece('house', r.houseModel, { map: r.houseTexture || null })
        }
        if (!this.pieces.river && r.riverModel) {
            this.pieces.river = new River(r.riverModel)
        }
        if (!this.pieces.bridge && r.bridgeModel) {
            this.pieces.bridge = new StaticPiece('bridge', r.bridgeModel, { map: r.forestAtlas || null })
        }
        if (!this.pieces.infoBoard && r.infoBoardModel) {
            this.pieces.infoBoard = new StaticPiece('infoBoard', r.infoBoardModel, { map: r.forestAtlas || null })
        }

        if (!this.pieces.baseballPitch && r.baseballPitchModel) {
            this.pieces.baseballPitch = new BaseballPitch(r.baseballPitchModel)
        }

        if (!this.pieces.blackCave && r.blackCaveModel) {
            this.pieces.blackCave = new BlackCave(r.blackCaveModel)
        }

        console.log('✅ PatioScene decorative pieces loaded')
    }

    /**
     * Build colliders from the dedicated `Collaiders.glb`.
     *
     * Causa #3 fix — uses convexHull instead of trimesh:
     *   - trimesh  = O(n) vertex walk + O(m) triangle BVH → 5–20 ms per mesh
     *   - convexHull = O(n log n) quickhull on vertex cloud → <1 ms per mesh
     *
     * For architectural pieces (walls, house, bridge) this is fine because
     * they are convex. Falls back to a bounding-box cuboid for degenerate hulls.
     *
     * Still scheduled across frames (via chunkedInBackground) so the browser
     * stays responsive during startup.
     */
    async _buildCollidersAsync() {
        if (this.physics?.world && this.physics?.RAPIER) {
            this._scheduleCollidersBuild()
            return
        }
        // Physics is async; wait until it's up before we even try.
        await this._waitForPhysics()
        this._scheduleCollidersBuild()
    }

    _waitForPhysics() {
        return new Promise((resolve) => {
            const tick = () => {
                if (this.physics?.world && this.physics?.RAPIER) resolve()
                else setTimeout(tick, 30)
            }
            tick()
        })
    }

    _scheduleCollidersBuild() {
        const r = this.resources.items
        const collidersGltf = r.collidersModel
        if (!collidersGltf?.scene) {
            console.warn('PatioScene: collidersModel missing — no colliders generated')
            return
        }

        console.time('PatioScene · colliders')

        const root = collidersGltf.scene
        root.name = 'Colliders'
        root.visible = false
        root.traverse((child) => {
            if (child.isMesh) {
                child.visible = false
                child.castShadow = false
                child.receiveShadow = false
            }
        })
        this.scene.add(root)
        root.updateMatrixWorld(true)

        const meshes = []
        root.traverse((child) => {
            if (child.isMesh && child.geometry) meshes.push(child)
        })

        // Time-budgeted background scheduler (4 ms per setTimeout tick).
        // Unlike rAF-based chunking, this does NOT compete with the render
        // loop for the browser's single animation frame slot.
        chunkedInBackground(meshes, 4, (mesh) => this._createConvexCollider(mesh))
            .then(() => {
                console.timeEnd('PatioScene · colliders')
                console.log(`✅ PatioScene: ${this.colliderBodies.length} static convexHull colliders`)
            })
    }

    /**
     * Builds a trimesh collider.
     * Trimesh is extremely fast to build for fixed colliders because Rapier just
     * computes a BVH tree over the raw arrays (O(N) vs QuickHull's O(N log N) with
     * huge constant factors). It also preserves concave shapes (like valleys/rivers).
     */
    _createConvexCollider(mesh) {
        const RAPIER = this.physics.RAPIER

        mesh.updateWorldMatrix(true, false)
        const worldPos = new THREE.Vector3()
        const worldQuat = new THREE.Quaternion()
        const worldScale = new THREE.Vector3()
        mesh.matrixWorld.decompose(worldPos, worldQuat, worldScale)

        const geometry = mesh.geometry
        const posAttr = geometry.attributes.position
        if (!posAttr) return

        // Scale vertices into world space
        const vertices = new Float32Array(posAttr.count * 3)
        for (let i = 0; i < posAttr.count; i++) {
            vertices[i * 3]     = posAttr.getX(i) * worldScale.x
            vertices[i * 3 + 1] = posAttr.getY(i) * worldScale.y
            vertices[i * 3 + 2] = posAttr.getZ(i) * worldScale.z
        }

        let indices
        if (geometry.index) {
            indices = new Uint32Array(geometry.index.count)
            for (let i = 0; i < geometry.index.count; i++) {
                indices[i] = geometry.index.getX(i)
            }
        } else {
            // If no index, generate unindexed triangles
            indices = new Uint32Array(posAttr.count)
            for (let i = 0; i < posAttr.count; i++) indices[i] = i
        }

        try {
            const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
                .setTranslation(worldPos.x, worldPos.y, worldPos.z)
                .setRotation({
                    x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w
                })
            const rigidBody = this.physics.world.createRigidBody(rigidBodyDesc)

            // Fast BVH construction without blocking the main thread
            let colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)

            colliderDesc
                .setFriction(0.8)
                .setRestitution(0.0)
                .setActiveCollisionTypes(
                    RAPIER.ActiveCollisionTypes.DEFAULT |
                    RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED
                )

            const collider = this.physics.world.createCollider(colliderDesc, rigidBody)
            this.colliderBodies.push({ rigidBody, collider, mesh })
        } catch (e) {
            console.warn('PatioScene: failed to create convex collider for', mesh.name, e.message)
        }
    }

    getGrassSpawnPositions(count = 3000) {
        return this.pieces.floor?.getGrassSpawnPositions?.(count) || []
    }

    /**
     * Convenience getter so legacy World code can keep referring to
     * `patioScene.groundMeshes` for shadow casters / ray-casts.
     */
    get groundMeshes() {
        const out = []
        if (this.pieces.floor) out.push(...this.pieces.floor.grassMeshes, ...this.pieces.floor.dirtMeshes)
        return out
    }

    update() {
        this.pieces.river?.update?.()
    }
}
