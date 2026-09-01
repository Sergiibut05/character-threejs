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
 *   - Fence          (fence.glb + json)     instanced fences (Tiny atlas)
 *   - StaticPiece    (bridge / walls / InfoBoard / social-area / social-entrance / house / outside-house-things)
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
import { vec4 } from 'three/tsl'
import Floor, { createDefaultFloorUniforms } from './scene/Floor.js'
import { createFloorColorNode } from './TSL/FloorShader.js'
import { dayNightLitTint } from './DayNight.js'
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

// Palms sit a touch low against the beach once placed exactly where Blender
// says. Lifted here rather than in the references JSON, which a re-export
// would overwrite. Tunable live under "Palmeras" in the debug GUI.
const PALM_Y_OFFSET = 0.12

export default class PatioScene {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.physics = this.experience.world.physics
        this.time = this.experience.time
        this.debug = this.experience.debug

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
        // Kept so the lazily-loaded decorative pieces can add their own
        // controls once they finish loading, well after this runs.
        this._guiFolder = folder

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

    /**
     * Re-skin a mesh with the floor's dirt/sand shader so it blends into the
     * ground. Uses the SHARED floor uniforms, so the beach tint (and any GUI
     * tweak to the palette) applies to it exactly as it does to the sand.
     */
    _applySandMaterial(root, meshName) {
        const mesh = root?.getObjectByName?.(meshName)
        if (!mesh) return
        const material = new THREE.MeshLambertNodeMaterial({ side: THREE.FrontSide })
        material.colorNode = createFloorColorNode(this.floorUniforms, { mode: 'dirt' })
            .mul(vec4(dayNightLitTint, 1.0))
        mesh.material?.dispose?.()
        mesh.material = material
        mesh.castShadow = false
        mesh.receiveShadow = true
    }

    _debugPalm() {
        if (!this.debug?.active || !this._guiFolder) return
        const piece = this.pieces.palmTree
        const state = { alturaExtra: piece.yOffset }
        this._guiFolder
            .add(state, 'alturaExtra', -1, 1, 0.01)
            .name('Palmeras · altura extra')
            .onChange((v) => piece.setYOffset(v))
    }

    _setupAtlasTextureFlags() {
        const r = this.resources.items
        // Atlas textures need RGB clamping + linear filter for atlas sampling
        for (const tex of [r.forestAtlas, r.sushiAtlas, r.tinyAtlas]) {
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

        // ── Floor (grass-floor-1, plus the optional ground-floor-* dirt meshes)
        if (r.floorModel) {
            this.pieces.floor = new Floor(r.floorModel, {
                grassFloorMasks: {
                    'grass-floor-1': r.grassFloor1Mask || null
                },
                maskCpuImages: {
                    'grass-floor-1': r.grassFloor1MaskCpu || null
                },
                slabsTexture: r.slabsTexture || null,
                // Torus / black-plane decor inside floor.glb. The Sushi atlas is
                // a decorative-priority asset, so it's usually still loading
                // here — tryBuild() below re-applies it on arrival.
                atlasTexture: r.sushiAtlas || null,
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
            // Re-apply atlas flags when decorative atlases arrive (they load after construction)
            if (name === 'tinyAtlas' || name === 'sushiAtlas') {
                this._setupAtlasTextureFlags()
            }
            // Floor's Torus / black-plane wait for the Sushi atlas.
            if (name === 'sushiAtlas' && r.sushiAtlas) {
                this.pieces.floor?.setAtlas?.(r.sushiAtlas)
            }

            // River (water shader)
            if (name === 'riverModel' && !this.pieces.river && r.riverModel) {
                this.pieces.river = new River(r.riverModel)
            }
            // Wait for BOTH model and atlas — whichever arrives last triggers it.
            if ((name === 'houseModel' || name === 'tinyAtlas') &&
                !this.pieces.house && r.houseModel && r.tinyAtlas) {
                this.pieces.house = new StaticPiece('house', r.houseModel, {
                    map: r.tinyAtlas
                })
            }
            // Wait for BOTH model and atlas — whichever arrives last triggers construction
            if ((name === 'outsideHouseThingsModel' || name === 'tinyAtlas') &&
                !this.pieces.outsideHouseThings && r.outsideHouseThingsModel && r.tinyAtlas) {
                this.pieces.outsideHouseThings = new StaticPiece('outsideHouseThings', r.outsideHouseThingsModel, {
                    map: r.tinyAtlas
                })
            }
            // Scoreboards. InfoBoard.glb carries BOTH physical boards: the
            // pitch one ('leaderboard' / 'scoreboard') and the beach one
            // ('leaderboard.001' / 'scoreboard.001'). The screen planes get the
            // atlas material first; each ScoreboardScreen then finds its own
            // plane by name and swaps in the live ranking canvas.
            if ((name === 'infoBoardModel' || name === 'tinyAtlas') &&
                !this.pieces.scoreboard && r.infoBoardModel && r.tinyAtlas) {
                this.pieces.scoreboard = new StaticPiece('scoreboards', r.infoBoardModel, {
                    map: r.tinyAtlas
                })
            }
            // Bridge
            if (name === 'bridgeModel' && !this.pieces.bridge && r.bridgeModel) {
                this.pieces.bridge = new StaticPiece('bridge', r.bridgeModel, {
                    map: r.forestAtlas || null
                })
            }
            // Park info sign (was inside InfoBoard.glb before it became the
            // scoreboards file).
            if (name === 'parkInfoBoardModel' && !this.pieces.infoBoard && r.parkInfoBoardModel) {
                this.pieces.infoBoard = new StaticPiece('infoBoard', r.parkInfoBoardModel, {
                    map: r.forestAtlas || null,
                    // The frame takes the shared atlas; the `Map` plane inside
                    // it takes the world map picture. preserveOwnMaps is what
                    // switches StaticPiece out of its single-atlas fast path
                    // into the per-mesh one — without it meshMaps is skipped.
                    preserveOwnMaps: true,
                    meshMaps: r.worldMapTexture
                        ? { Map: { map: r.worldMapTexture, castShadow: false } }
                        : {}
                })
            }
        }

        this.resources.on('sourceLoaded', tryBuild)

        // Also check immediately in case assets loaded from cache already
        for (const name of ['riverModel', 'houseModel', 'tinyAtlas', 'sushiAtlas', 'outsideHouseThingsModel', 'bridgeModel', 'infoBoardModel', 'parkInfoBoardModel']) {
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
            { default: BlackCave },
            { default: InstancedProp }
        ] = await Promise.all([
            import('./scene/Coblestone.js'),
            import('./scene/Fence.js'),
            import('./scene/BaseballPitch.js'),
            import('./scene/BlackCave.js'),
            import('./scene/InstancedProp.js')
        ])
        console.timeEnd('PatioScene · decorative imports')

        if (!this.pieces.coblestone && r.coblestoneModel && r.coblestoneInstances) {
            this.pieces.coblestone = new Coblestone(r.coblestoneModel, r.coblestoneInstances)
        }

        if (!this.pieces.fence && r.fenceModel && r.fenceInstances) {
            this.pieces.fence = new Fence(r.fenceModel, r.fenceInstances, r.tinyAtlas)
        }

        if (!this.pieces.parkThings && r.parkThingsModel) {
            this.pieces.parkThings = new StaticPiece('parkThings', r.parkThingsModel, {
                map: r.forestAtlas || null
            })
        }

        if (!this.pieces.parkRock && r.parkRockModel && r.parkRockInstances) {
            this.pieces.parkRock = new InstancedProp('parkRock', r.parkRockModel, r.parkRockInstances, r.forestAtlas || null)
        }

        if (!this.pieces.trunk && r.trunkModel && r.trunkInstances) {
            this.pieces.trunk = new InstancedProp('trunk', r.trunkModel, r.trunkInstances, r.forestAtlas || null)
        }

        // Palm tree — 3 parts (trunk / coconuts / fronds) that must stay
        // assembled, with its own KTX2 textures and QUANTIZED positions, so it
        // is cloned rather than instanced (see ClonedFromJSON's header).
        if (!this.pieces.palmTree && r.palmTreeModel && r.palmTreeInstances) {
            const { default: ClonedFromJSON } = await import('./scene/ClonedFromJSON.js')
            this.pieces.palmTree = new ClonedFromJSON(
                'palmTree', r.palmTreeModel, r.palmTreeInstances,
                { rotationMode: 'conjugate', yOffset: PALM_Y_OFFSET }
            )
            this._debugPalm()
        }

        // Beach props: signboard + sandcastle on the Tiny atlas, with the sign's
        // artwork kept as its own texture.
        if (!this.pieces.beachThings && r.beachThingsModel && r.tinyAtlas) {
            const art = r.wahuIslandTexture || null
            this.pieces.beachThings = new StaticPiece('beachThings', r.beachThingsModel, {
                map: r.tinyAtlas,
                preserveOwnMaps: true,
                // The artwork is RGBA with a transparent surround. Without
                // asking for the alpha channel the material renders it opaque,
                // which is why the background came out solid black.
                meshMaps: art
                    ? { 'cartel-image': { map: art, alphaCutoff: 0.5, castShadow: false } }
                    : {}
            })
            // The sandcastle is made OF the beach: give it the ground's own sand
            // shader instead of the atlas, so it reads as piled-up sand rather
            // than a prop sitting on top of it.
            this._applySandMaterial(this.pieces.beachThings.root, 'castle')
        }

        // Deckchairs and parasols — instanced from their reference JSONs.
        if (!this.pieces.beachChair && r.beachChairModel && r.beachChairInstances) {
            this.pieces.beachChair = new InstancedProp(
                'beachChair', r.beachChairModel, r.beachChairInstances, r.tinyAtlas || null
            )
        }
        if (!this.pieces.beachUmbrella && r.beachUmbrellaModel && r.beachUmbrellaInstances) {
            this.pieces.beachUmbrella = new InstancedProp(
                'beachUmbrella', r.beachUmbrellaModel, r.beachUmbrellaInstances, r.tinyAtlas || null
            )
        }

        // Beach ball — single mesh already placed by the GLB node, with its own
        // texture, so StaticPiece (no atlas) drops it in as authored. Its
        // positions are quantized: never bake a matrix into this geometry.
        if (!this.pieces.beachBall && r.beachBallModel) {
            this.pieces.beachBall = new StaticPiece('beachBall', r.beachBallModel, {})

            // Authored a bit oversized. Shrink around the node origin and drop
            // it back onto the sand: the node's Y is the ball's CENTRE, so a
            // smaller radius has to be re-seated or the ball floats.
            const sphere = this.pieces.beachBall.root?.getObjectByName('Sphere')
            if (sphere) {
                sphere.geometry.computeBoundingSphere()
                const radius = sphere.geometry.boundingSphere.radius * sphere.scale.x
                const sandY = sphere.position.y - radius
                const factor = 0.68
                sphere.scale.multiplyScalar(factor)
                sphere.position.y = sandY + radius * factor
            }
        }

        if (!this.pieces.socialArea && r.socialAreaModel) {
            this.pieces.socialArea = new StaticPiece('socialArea', r.socialAreaModel, {
                map: r.tinyAtlas || null
            })
        }

        if (!this.pieces.socialEntrance && r.socialEntranceModel) {
            const titleTex = r.socialTittleTexture || null
            this.pieces.socialEntrance = new StaticPiece('socialEntrance', r.socialEntranceModel, {
                map: r.sushiAtlas || null,
                preserveOwnMaps: true,
                meshMaps: titleTex
                    ? {
                        'social-tittle': { map: titleTex, mapAlpha: true, castShadow: false }
                    }
                    : {}
            })
        }

        // Fallback: build these if they weren't caught by sourceLoaded yet
        if (!this.pieces.house && r.houseModel) {
            this.pieces.house = new StaticPiece('house', r.houseModel, {
                map: r.tinyAtlas || null
            })
        }
        if (!this.pieces.outsideHouseThings && r.outsideHouseThingsModel) {
            this.pieces.outsideHouseThings = new StaticPiece('outsideHouseThings', r.outsideHouseThingsModel, {
                map: r.tinyAtlas || null
            })
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
    /**
     * Switch off every static collider that overlaps `box`, and hand back a
     * function that switches them on again.
     *
     * The beach court needs this. The ball prop resting at the centre of the
     * court has its own collider so you cannot walk through it while roaming —
     * but that centre is exactly where the minigame stands the player, and the
     * whole rally is spent running left and right through it. Without this the
     * player materialises INSIDE the box and the character controller has no
     * way out: stuck on the spot, with nothing on screen to explain it.
     *
     * Selected by overlap rather than by mesh name on purpose. The names come
     * out of Blender (Cube094 today) and would silently point at a different
     * box the next time the file is re-exported.
     *
     * @param {THREE.Box3} box  world-space region to clear
     * @returns {() => void}    restores exactly what it disabled
     */
    suspendCollidersIn(box) {
        const suspended = []
        const bounds = new THREE.Box3()
        for (const entry of this.colliderBodies) {
            const collider = entry.collider
            if (!collider?.setEnabled || collider.isEnabled?.() === false) continue
            const geometry = entry.mesh?.geometry
            if (!geometry) continue
            entry.mesh.updateWorldMatrix(true, false)
            geometry.computeBoundingBox()
            bounds.copy(geometry.boundingBox).applyMatrix4(entry.mesh.matrixWorld)
            if (!bounds.intersectsBox(box)) continue
            collider.setEnabled(false)
            suspended.push(collider)
        }
        return () => {
            for (const collider of suspended) {
                try { collider.setEnabled(true) } catch { /* world torn down */ }
            }
            suspended.length = 0
        }
    }

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
            this._emitCollidersSkipped()
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
                console.log(`✅ PatioScene: ${this.colliderBodies.length} static colliders`)
                this.resources.trigger('patioCollidersReady', [])
            })
    }

    /** Emits patioCollidersReady so Character waits for usable ground collisions. */
    _emitCollidersSkipped() {
        this.resources.trigger('patioCollidersReady', [])
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
