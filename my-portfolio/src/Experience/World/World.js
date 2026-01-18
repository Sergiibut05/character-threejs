import * as THREE from 'three'
import Experience from '../Experience.js'
import Environment from './Environment.js'
import Ground from './Ground.js'
import Character from './Character.js'
import Physics from './Physics.js'
import InteractiveObject from './InteractiveObject.js'
import Raycaster from './Raycaster.js'

export default class World
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        // Initialize physics first
        this.physics = new Physics()

        // Interactive objects list
        this.interactiveObjects = []

        // Wait for resources to be ready
        this.resources.on('ready', () =>
        {
            this.environment = new Environment()
            this.ground = new Ground()
            this.character = new Character()
            
            // Initialize raycaster for mouse interactions
            this.raycaster = new Raycaster()
            
            // Add interactive cubes after a short delay to ensure physics is initialized
            setTimeout(() => {
                this.setInteractiveCubes()
                this.setInteractiveObjects()
            }, 300)
            
            // Setup modal close functionality
            this.setupModal()
        })
    }

    setInteractiveCubes()
    {
        // Pushable cubes (dynamic)
        // Position Y should be half the height so base touches ground (y=0)
        const pushableCube1 = this.createPushableCube({ x: 5, y: 0.5, z: 0 }, { x: 1, y: 1, z: 1 })
        const pushableCube2 = this.createPushableCube({ x: -5, y: 0.4, z: 0 }, { x: 0.8, y: 0.8, z: 0.8 })

        // Static cubes (barriers)
        // Position Y should be half the height so base touches ground (y=0)
        const staticCube1 = this.createStaticCube({ x: 0, y: 1.0, z: 5 }, { x: 2, y: 2, z: 2 })
        const staticCube2 = this.createStaticCube({ x: 0, y: 1.5, z: -5 }, { x: 1.5, y: 3, z: 1.5 })
    }

    createPushableCube(position, size)
    {
        // Create Three.js mesh
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
        const material = new THREE.MeshStandardMaterial({ 
            color: '#ff6b6b',
            metalness: 0.3,
            roughness: 0.4
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(position.x, position.y, position.z)
        mesh.castShadow = true
        mesh.receiveShadow = true
        this.scene.add(mesh)

        // Create physics rigid body
        if(this.physics.world)
        {
            this.physics.createDynamicBox(size, position, mesh)
        }

        return mesh
    }

    createStaticCube(position, size)
    {
        // Create Three.js mesh
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
        const material = new THREE.MeshStandardMaterial({ 
            color: '#4ecdc4',
            metalness: 0.5,
            roughness: 0.3
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(position.x, position.y, position.z)
        mesh.castShadow = true
        mesh.receiveShadow = true
        this.scene.add(mesh)

        // Create physics rigid body
        if(this.physics.world)
        {
            this.physics.createStaticBox(size, position, mesh)
        }

        return mesh
    }

    setInteractiveObjects()
    {
        // Create an interactive object (clickable cube)
        const interactiveObj = new InteractiveObject({
            position: { x: 3, y: 0.75, z: 3 },
            size: { x: 1.5, y: 1.5, z: 1.5 },
            color: '#6054D0',
            highlightColor: '#ffffff',
            proximityRadius: 2.0,  // Reduced from 4.0 to 2.0
            modalContent: {
                title: 'About Me',
                body: `
                    <p>Welcome to my portfolio! I'm a developer passionate about creating interactive 3D experiences.</p>
                    <p>Click around to explore more content.</p>
                    <p><a href="#">Learn more →</a></p>
                `
            }
        })

        // Register with raycaster
        this.raycaster.addInteractiveObject(interactiveObj)
        this.interactiveObjects.push(interactiveObj)

        // You can add more interactive objects here
        const interactiveObj2 = new InteractiveObject({
            position: { x: -3, y: 0.5, z: -3 },
            size: { x: 1, y: 1, z: 1 },
            color: '#D06054',
            highlightColor: '#ffffff',
            proximityRadius: 1.75,  // Reduced from 3.5 to 1.75
            modalContent: {
                title: 'Projects',
                body: `
                    <p>Here are some of my recent projects:</p>
                    <p>• Project 1 - Description</p>
                    <p>• Project 2 - Description</p>
                    <p>• Project 3 - Description</p>
                `
            }
        })

        this.raycaster.addInteractiveObject(interactiveObj2)
        this.interactiveObjects.push(interactiveObj2)
    }

    setupModal()
    {
        const modalOverlay = document.querySelector('.modal-overlay')
        const closeButton = document.querySelector('.modal-close')

        if(closeButton)
        {
            closeButton.addEventListener('click', () =>
            {
                modalOverlay.classList.remove('is-visible')
            })
        }

        // Close on overlay click (outside modal)
        if(modalOverlay)
        {
            modalOverlay.addEventListener('click', (event) =>
            {
                if(event.target === modalOverlay)
                {
                    modalOverlay.classList.remove('is-visible')
                }
            })
        }

        // Close on Escape key
        document.addEventListener('keydown', (event) =>
        {
            if(event.key === 'Escape')
            {
                modalOverlay.classList.remove('is-visible')
            }
        })
    }

    update()
    {
        // Update character (sets desired position for physics)
        if(this.character)
        {
            this.character.update()
        }

        // Update physics (steps simulation and syncs positions)
        if(this.physics && this.physics.world)
        {
            const deltaTime = this.experience.time.delta * 0.001
            
            // Step physics simulation
            this.physics.update(deltaTime)
        }

        // Update raycaster for hover detection
        if(this.raycaster)
        {
            this.raycaster.update()
        }

        // Update interactive objects (check proximity to character)
        if(this.interactiveObjects.length > 0 && this.character)
        {
            const characterPos = this.character.position
            for(const obj of this.interactiveObjects)
            {
                obj.update(characterPos)
            }
        }
    }
}
