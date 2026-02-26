import * as THREE from 'three'
import Experience from '../Experience.js'
import Environment from './Environment.js'
import Character from './Character.js'
import Physics from './Physics.js'
import Raycaster from './Raycaster.js'
import Grass from './Grass.js'
import PatioScene from './PatioScene.js'
import Trees from './Trees.js'
import Bushes from './Bushes.js'

export default class World {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        // Initialize physics first
        this.physics = new Physics()

        // Interactive objects list
        this.interactiveObjects = []

        // Wait for resources to be ready
        this.resources.on('ready', () => {
            this.environment = new Environment()

            // Load the patio scene (GLB model with colliders, ground, water)
            this.patioScene = new PatioScene()

            // Character
            this.character = new Character()

            // Grass — placed on grass regions from the ground mesh vertex colors
            this.setupGrass()

            // Trees — instanced per type from reference models
            this.setupTrees()

            // Bushes (standalone, ready for future reference models)
            this.bushes = new Bushes()

            // Initialize raycaster for mouse interactions
            this.raycaster = new Raycaster()

            // Setup modal close functionality
            this.setupModal()
        })
    }

    setupGrass() {
        // Get grass spawn positions from the patio ground meshes
        const spawnPositions = this.patioScene.getGrassSpawnPositions(5000)

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

            this.grass = new Grass({
                size: Math.max(size.x, size.z),
                count: spawnPositions.length,
                position: new THREE.Vector3(center.x, center.y, center.z),
                spawnPositions: spawnPositions,
                bladeWidth: 0.35,
                bladeHeight: 0.38,
                // Callback so Grass can re-sample when count changes in GUI
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

    setupTrees() {
        const res = this.resources.items

        // Each tree type: visual model scene, reference model children, leaf colors
        const treeConfigs = [
            {
                name: 'Abedul',
                visual: res.abedulTreeVisual?.scene,
                references: res.abedulTreeReferences?.scene?.children,
                colorA: '#ff4f2b',
                colorB: '#ff903f'
            },
            {
                name: 'Normal',
                visual: res.normalTreeVisual?.scene,
                references: res.normalTreeReferences?.scene?.children,
                colorA: '#b4b536',
                colorB: '#d8cf3b'
            },
            {
                name: 'Old',
                visual: res.oldTreeVisual?.scene,
                references: res.oldTreeReferences?.scene?.children,
                colorA: '#ff6d6d',
                colorB: '#ff9990'
            }
        ]

        this.trees = []
        for (const cfg of treeConfigs) {
            if (!cfg.visual || !cfg.references || cfg.references.length === 0) {
                console.warn(`Trees: skipping "${cfg.name}" — missing visual or references`)
                continue
            }

            // Filter only treeBody* references from the reference file
            const bodyRefs = cfg.references.filter(c => c.name.startsWith('treeBody'))
            if (bodyRefs.length === 0) {
                console.warn(`Trees: skipping "${cfg.name}" — no treeBody* found in references`)
                continue
            }

            const tree = new Trees(cfg.name, cfg.visual, bodyRefs, cfg.colorA, cfg.colorB)
            this.trees.push(tree)
        }
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
        // Update character
        if (this.character) {
            this.character.update()
        }

        // Update physics
        if (this.physics && this.physics.world) {
            const deltaTime = this.experience.time.delta * 0.001
            this.physics.update(deltaTime)
        }

        // Update raycaster for hover detection
        if (this.raycaster) {
            this.raycaster.update()
        }

        // Update interactive objects (check proximity to character)
        if (this.interactiveObjects.length > 0 && this.character) {
            const characterPos = this.character.position
            for (const obj of this.interactiveObjects) {
                obj.update(characterPos)
            }
        }

        // Update grass
        if (this.grass) {
            this.grass.update()
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
    }
}
