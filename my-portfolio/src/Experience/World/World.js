import * as THREE from 'three'
import Experience from '../Experience.js'
import Environment from './Environment.js'
import Character from './Character.js'
import Physics from './Physics.js'
import Raycaster from './Raycaster.js'
import Mailbox from './Mailbox.js'
import Door from './Door.js'
import HouseInterior from './HouseInterior.js'
import ProjectCarts from './ProjectCarts.js'
import GoalPost from './GoalPost.js'
import Confetti from './Confetti.js'
import Ball from './Ball.js'
import StreetLamps from './StreetLamps.js'
import ScoreboardScreen from './ScoreboardScreen.js'
import ScoreboardInteractive from './ScoreboardInteractive.js'
import Ground from './Ground.js'
import Grass from './Grass.js'
import Flowers from './Flowers.js'
import Fireflies from './Fireflies.js'
import Fire from './Fire.js'
import MusicNotes from './MusicNotes.js'
import Footprints from './Footprints.js'
import PatioScene from './PatioScene.js'
import { jsonInstancesToObjects } from './scene/SceneUtils.js'
import Trees from './Trees.js'
import Bushes from './Bushes.js'
import FakeShadow from './FakeShadow.js'
import ActivityPrompt from './ActivityPrompt.js'
import SocialArea from './SocialArea.js'
import BeachMinigame from './BeachMinigame.js'
import BeachSession from './BeachSession.js'
import FrisbeeMinigame from './FrisbeeMinigame.js'
import FrisbeeSession from './FrisbeeSession.js'

export default class World {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        // Initialize physics first
        this.physics = new Physics()

        // Interactive objects list
        this.interactiveObjects = []
        this.isDevLightMode = import.meta.env.VITE_DEV_LIGHT_MODE === 'true'

        // Wait for resources to be ready
        this.resources.on('ready', () => {
            this.environment = new Environment()

            if (this.isDevLightMode) {
                this.ground = new Ground()
                this.character = new Character()
                this.musicNotes = new MusicNotes()
                this.activityPrompt = new ActivityPrompt()
                this.frisbeeMinigame = new FrisbeeMinigame()
                this.frisbeeSession = new FrisbeeSession(this.frisbeeMinigame)
                this.raycaster = new Raycaster()
                this._showDogAtAnchor()

                // Stylized TSL fire — test instance near world center
                this.fire = new Fire()
                this.fire.addFire(new THREE.Vector3(2, 0, 0), 1.0)

                this.resources.on('sourceLoaded', (name) => {
                    if (name === 'dogModel') {
                        this.frisbeeMinigame?.dog?.setupModel()
                        this._showDogAtAnchor()
                    }
                    if (name === 'frisbeeModel' || name === 'frisbeeTexture') {
                        this.frisbeeMinigame?.flightController?.setupMesh()
                    }
                    if (name === 'objectiveArrowTexture') {
                        this.frisbeeMinigame?.objectiveMarker?.setupArrow()
                    }
                    if (name === 'checkTexture') {
                        this.frisbeeMinigame?.objectiveMarker?.setupCheck()
                    }
                })

                this.setupModal()
                console.info('World: VITE_DEV_LIGHT_MODE enabled (minimal world)')
                return
            }

            // Load the patio scene (GLB model with colliders, ground, water)
            this.patioScene = new PatioScene()

            // Character
            this.character = new Character()

            // Idle musical notes (Animal-Crossing "humming" while standing still)
            this.musicNotes = new MusicNotes()

            // Footprints on dirt/sand (stamped by Character via stampFootprint)
            this.footprints = new Footprints()

            // Grass — placed on grass regions from the ground mesh vertex colors
            this.setupGrass()

        // Flowers + fireflies — decorate the grass zones with vibes
        this.setupMeadowDecor()

            this.fire = new Fire()
            // Known fire location in Blender Z-up space (the 'fire-point' empty
            // is no longer exported into park-things.glb). Converted to Three
            // Y-up with the standard (bx, bz, -by) swap.
            const FIRE_POINT_THREE = new THREE.Vector3(-14.1581, 0.204325, 3.11002)
            const FIRE_SCALE = 1.2
            const _placeFire = (name) => {
                if (name !== 'parkThingsModel') return
                const firePoint = this.resources.items.parkThingsModel?.scene?.getObjectByName('fire-point')
                if (firePoint) {
                    firePoint.updateWorldMatrix(true, false)
                    const pos = new THREE.Vector3().setFromMatrixPosition(firePoint.matrixWorld)
                    this.fire.addFire(pos, FIRE_SCALE)
                } else {
                    this.fire.addFire(FIRE_POINT_THREE.clone(), FIRE_SCALE)
                }
                this.resources.off('sourceLoaded', _placeFire)
            }
            this.resources.on('sourceLoaded', _placeFire)

            // Trees — instanced per type from reference models
            this.setupTrees()

            // Bushes (standalone, ready for future reference models)
            this.bushes = new Bushes()

            // Fake blob shadows: on low quality, and ALSO wherever the real
            // shadow pipeline is unavailable (Android — see DeviceCaps.js).
            if (this.experience.quality.isLow || !this.experience.quality.shadowsEnabled) {
                this.setupFakeShadows()
            }

            // Initialize raycaster for mouse interactions
            this.raycaster = new Raycaster()
            this.activityPrompt = new ActivityPrompt()
            this.frisbeeMinigame = new FrisbeeMinigame()
            this.frisbeeSession = new FrisbeeSession(this.frisbeeMinigame)
            this.mailbox = new Mailbox() // resolves the mailbox node lazily
            this.door = new Door() // resolves the house `door` node lazily
            this.houseInterior = new HouseInterior() // far-offset interior + rug exit

            // West play area: project carts + goal + kickable ball + confetti
            this.projectCarts = new ProjectCarts()
            this.socialArea = new SocialArea()
            this.beachMinigame = new BeachMinigame()
            this.beachSession = new BeachSession(this.beachMinigame)
            this.goalPost = new GoalPost()
            this.confetti = new Confetti()
            this.ball = new Ball()
            this.streetLamps = new StreetLamps() // pole lights (glow + fireflies at night)
            // Live ranking screens. Both boards ship in InfoBoard.glb: the
            // pitch one ('scoreboard') and the beach one ('scoreboard.001'),
            // each painted with ITS OWN ranking.
            this.scoreboardScreen = new ScoreboardScreen()
            this.beachScoreboard = new ScoreboardScreen({
                targetName: 'scoreboard001', board: 'beach',
                footer: 'Top 5 · Voleibol de playa'
            })
            // …and the physical boards are interactive: outline + top-10 modal.
            this.scoreboardInteractive = new ScoreboardInteractive()
            this.beachScoreboardInteractive = new ScoreboardInteractive({
                nodeName: 'leaderboard001',
                screenName: 'scoreboard001',
                board: 'beach',
                subtitle: 'Top 10 · Voleibol de playa'
            })

            this._showDogAtAnchor()

            // When decorative assets finish, retry minigame component setup
            this.resources.on('sourceLoaded', (name) => {
                if (name === 'dogModel') {
                    this.frisbeeMinigame?.dog?.setupModel()
                    this._showDogAtAnchor()
                }
                if (name === 'frisbeeModel' || name === 'frisbeeTexture') {
                    this.frisbeeMinigame?.flightController?.setupMesh()
                }
                if (name === 'objectiveArrowTexture') {
                    this.frisbeeMinigame?.objectiveMarker?.setupArrow()
                }
                if (name === 'checkTexture') {
                    this.frisbeeMinigame?.objectiveMarker?.setupCheck()
                }
            })

            // Setup modal close functionality
            this.setupModal()
        })
    }

    setupGrass() {
        // Get grass spawn positions from the patio ground meshes
        const grassCount = this.experience.quality.grassCount
        const spawnPositions = this.patioScene.getGrassSpawnPositions(grassCount)

        if (spawnPositions.length > 0) {
            // Calculate bounding box of spawn positions
            const bbox = new THREE.Box3()
            for (const pos of spawnPositions) {
                bbox.expandByPoint(new THREE.Vector3(pos.x, pos.y, pos.z))
            }
            const center = new THREE.Vector3()
            bbox.getCenter(center)
            const size = new THREE.Vector3()
            bbox.getSize(size)

            const isLow = this.experience.quality.isLow
            this.grass = new Grass({
                size: Math.max(size.x, size.z),
                count: spawnPositions.length,
                position: new THREE.Vector3(center.x, center.y, center.z),
                spawnPositions: spawnPositions,
                bladeWidth: 0.35,
                bladeHeight: 0.38,
                cullAspectX: isLow ? 1.8 : 1.0,
                viewRadius: this.experience.quality.grassViewRadius,
                viewFadeBand: 4.0,
                viewAhead: this.experience.quality.grassViewAhead,
                spawnFunction: (count) => this.patioScene.getGrassSpawnPositions(count)
            })
        } else {
            // Fallback: place grass in a default area
            this.grass = new Grass({
                size: 10,
                count: 3000,
                position: new THREE.Vector3(0, 0, 0)
            })
        }
    }

    setupMeadowDecor() {
        const isLow = this.experience.quality.isLow

        // Candidate ground positions on the grass regions (reuse the spawner)
        const candidateCount = isLow ? 2500 : 4500
        const candidates = this.patioScene?.getGrassSpawnPositions
            ? this.patioScene.getGrassSpawnPositions(candidateCount)
            : []

        if (candidates.length === 0) return

        // Flowers grouped in colourful patches
        this.flowers = new Flowers({
            candidates,
            maxCount: isLow ? 360 : 700,
            viewRadius: this.experience.quality.grassViewRadius,
            viewFadeBand: 4.0
        })

        // Fireflies drift over ALL the grass (not just flower zones)
        const avgY = candidates.reduce((s, p) => s + p.y, 0) / candidates.length
        this.fireflies = new Fireflies({
            grassPositions: candidates,
            groundY: avgY,
            count: isLow ? 80 : 200
        })
    }

    _jsonToRefs(json) {
        // Blender Z-up → Three Y-up conversion (position, rotation, scale).
        // The raw JSON values must NOT be used directly: doing so put every
        // tree on one plane (Blender depth Y became Three's up axis).
        //
        // Trees are authored upright in Blender (no +π/2 X baseline like the
        // fence) and the export now writes their real world rotation, so we use
        // the true change-of-basis 'conjugate' mode. The global 'rawNegZ'
        // shortcut would tilt every tree on its heading rotation.
        return jsonInstancesToObjects(json, 'conjugate')
    }

    setupTrees() {
        const res = this.resources.items

        const treeConfigs = [
            {
                name: 'Abedul',
                visual: res.abedulTreeVisual?.scene,
                references: this._jsonToRefs(res.abedulTreeReferences),
                colorA: '#663000',
                colorB: '#ff5e00',
                foliageOpts: { shadowOffset: 0.181, threshold: 0.3, seeThroughEdgeMin: 0.06973, seeThroughEdgeMax: 0.348654, colorAPresence: 0.09 }
            },
            {
                name: 'Normal',
                visual: res.normalTreeVisual?.scene,
                references: this._jsonToRefs(res.normalTreeReferences),
                colorA: '#3b7500',
                colorB: '#4e9301',
                foliageOpts: { shadowOffset: 1.0, threshold: 0.3, seeThroughEdgeMin: 0.06973, seeThroughEdgeMax: 0.348654, colorAPresence: 0.5 }
            },
            {
                name: 'Old',
                visual: res.oldTreeVisual?.scene,
                references: this._jsonToRefs(res.oldTreeReferences),
                colorA: '#d01616',
                colorB: '#bf4745',
                foliageOpts: { shadowOffset: 0.041, threshold: 0.3, seeThroughEdgeMin: 0.275, seeThroughEdgeMax: 0.707, colorAPresence: 0.835 }
            }
        ]

        this.trees = []
        for (const cfg of treeConfigs) {
            if (!cfg.visual || cfg.references.length === 0) {
                console.warn(`Trees: skipping "${cfg.name}" — missing visual or references`)
                continue
            }

            const tree = new Trees(cfg.name, cfg.visual, cfg.references, cfg.colorA, cfg.colorB, cfg.foliageOpts || {})
            this.trees.push(tree)
        }
    }

    setupFakeShadows() {
        this.fakeShadow = new FakeShadow(this.scene)

        this.fakeShadow.createCharacterShadow(0.55)

        if (this.trees) {
            for (const tree of this.trees) {
                this.fakeShadow.createTreeShadows(tree.references, 1.0)
            }
        }
    }

    /**
     * True when world (x,z) is on dirt/sand: the pitch's sand diamond, its
     * dirt fringe, pure-dirt floor meshes, or grass-mask dirt patches.
     */
    isDirtAt(x, z) {
        const pitch = this.patioScene?.pieces?.baseballPitch
        if (pitch?.isOnSand?.(x, z)) return true
        const floor = this.patioScene?.pieces?.floor
        return floor?.isDirtAt?.(x, z) ?? false
    }

    /** Called by Character each stride; only stamps when the spot is dirt. */
    stampFootprint(x, y, z, yaw) {
        if (!this.footprints) return
        if (!this.isDirtAt(x, z)) return
        this.footprints.stamp(x, y, z, yaw)
    }

    getPitchBBox() {
        return this.patioScene?.pieces?.baseballPitch?.getBoundingBox?.() ?? null
    }

    getPitchOrientedBounds() {
        return this.patioScene?.pieces?.baseballPitch?.getOrientedBounds?.() ?? null
    }

    _showDogAtAnchor() {
        const prompt = this.activityPrompt
        const minigame = this.frisbeeMinigame
        if (!prompt?.hasAnchor || !minigame?.dog) return

        const anchorPos = prompt.anchorPosition.clone()
        const bbox = this.getPitchBBox()
        let yaw = 0
        if (bbox) {
            const center = new THREE.Vector3()
            bbox.getCenter(center)
            const dx = center.x - anchorPos.x
            const dz = center.z - anchorPos.z
            yaw = Math.atan2(dx, dz)
            // Use the pitch surface Y (bbox center on a flat field ≈ surface height)
            // instead of the GLB empty-point Y, which doesn't match the visual ground.
            anchorPos.y = (bbox.min.y + bbox.max.y) * 0.5
        }
        minigame.dog.showAtAnchor(anchorPos, yaw)
    }

    setupModal() {
        const modalOverlay = document.querySelector('.modal-overlay')
        const closeButton = document.querySelector('.modal-close')

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                modalOverlay.classList.remove('is-visible')
            })
        }

        // Close on overlay click (outside modal)
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (event) => {
                if (event.target === modalOverlay) {
                    modalOverlay.classList.remove('is-visible')
                }
            })
        }

        // Close on Escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                modalOverlay.classList.remove('is-visible')
            }
        })
    }

    update() {
        const deltaTime = this.experience.time.delta * 0.001

        // Update character
        if (this.character) {
            this.character.update()
        }

        // Idle musical notes (depends on character.idleTime updated above)
        if (this.musicNotes) {
            this.musicNotes.update()
        }

        if (this.footprints) {
            this.footprints.update()
        }

        // Frisbee minigame (includes pre-physics forces)
        if (this.frisbeeMinigame) {
            this.frisbeeMinigame.update()
        }
        if (this.frisbeeSession) {
            this.frisbeeSession.update()
        }

        // Update physics
        if (this.physics && this.physics.world) {
            this.physics.update(deltaTime)
        }

        // Update raycaster for hover detection
        if (this.raycaster) {
            this.raycaster.update()
        }
        if (this.mailbox) {
            this.mailbox.update()
        }
        if (this.door) {
            this.door.update()
        }
        if (this.houseInterior) {
            this.houseInterior.update()
        }
        if (this.projectCarts) {
            this.projectCarts.update()
        }
        if (this.socialArea) {
            this.socialArea.update()
        }
        if (this.beachMinigame) {
            this.beachMinigame.update()
        }
        if (this.beachSession) {
            this.beachSession.update()
        }
        if (this.beachScoreboard) {
            this.beachScoreboard.update()
        }
        if (this.beachScoreboardInteractive) {
            this.beachScoreboardInteractive.update()
        }
        if (this.ball) {
            this.ball.update()
        }
        if (this.confetti) {
            this.confetti.update()
        }
        if (this.streetLamps) {
            this.streetLamps.update()
        }
        if (this.scoreboardScreen) {
            this.scoreboardScreen.update()
        }
        if (this.scoreboardInteractive) {
            this.scoreboardInteractive.update()
        }

        // Update interactive objects (check proximity to character)
        if (this.interactiveObjects.length > 0 && this.character) {
            const characterPos = this.character.position
            for (const obj of this.interactiveObjects) {
                obj.update(characterPos)
            }
        }

        // Update fake shadows (mobile only)
        if (this.fakeShadow && this.character) {
            this.fakeShadow.updateCharacter(
                this.character.position,
                this.character.capsuleCenterY
            )
        }

        // Update grass
        if (this.grass) {
            this.grass.update()
        }

        // Update meadow decoration
        if (this.flowers) {
            this.flowers.update()
        }

        if (this.fireflies) {
            this.fireflies.update()
        }

        if (this.fire) {
            this.fire.update()
        }

        if (this.environment) {
            this.environment.update()
        }

        if (this.ground?.update) {
            this.ground.update()
        }

        // Update trees (wind animation)
        if (this.trees) {
            for (const tree of this.trees) {
                tree.update()
            }
        }

        if (this.bushes) {
            this.bushes.update()
        }

        // Update patio scene (water animation)
        if (this.patioScene) {
            this.patioScene.update()
        }

        if (this.activityPrompt) {
            this.activityPrompt.update()
        }
    }
}
