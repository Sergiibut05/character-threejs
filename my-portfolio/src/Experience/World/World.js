import * as THREE from 'three'
import Experience from '../Experience.js'
import Environment from './Environment.js'
import Ground from './Ground.js'
import Character from './Character.js'
import Physics from './Physics.js'

export default class World
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        // Initialize physics first
        this.physics = new Physics()

        // Wait for resources to be ready
        this.resources.on('ready', () =>
        {
            this.environment = new Environment()
            this.ground = new Ground()
            this.character = new Character()
            
            // Add interactive cubes after a short delay to ensure physics is initialized
            setTimeout(() => {
                this.setInteractiveCubes()
            }, 300)
        })
    }

    setInteractiveCubes()
    {
        // Pushable cubes (dynamic)
        const pushableCube1 = this.createPushableCube({ x: 5, y: 1, z: 0 }, { x: 1, y: 1, z: 1 })
        const pushableCube2 = this.createPushableCube({ x: -5, y: 1, z: 0 }, { x: 0.8, y: 0.8, z: 0.8 })

        // Static cubes (barriers)
        const staticCube1 = this.createStaticCube({ x: 0, y: 2, z: 5 }, { x: 2, y: 2, z: 2 })
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
    }
}
