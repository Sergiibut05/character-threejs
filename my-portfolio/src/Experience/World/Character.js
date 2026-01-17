import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Character
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.physics = this.experience.world.physics
        this.debug = this.experience.debug

        // Character state
        this.position = new THREE.Vector3(0, 1, 0)
        this.previousPosition = new THREE.Vector3(0, 1, 0)
        this.moveSpeed = 2.0
        this.rotationSpeed = 5.0 // Rotation lerp speed

        // Input state
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        }

        this.setModel()
        this.setAnimation()
        this.setInput()
        
        // Physics will be set up after model loads and physics initializes
        setTimeout(() => {
            this.setPhysics()
        }, 200)
    }

    setModel()
    {
        this.resource = this.resources.items.humanModel
        
        // Create a container Group - this will be moved
        this.container = new THREE.Group()
        this.container.name = 'CharacterContainer'
        this.container.position.copy(this.position)
        
        // Use the original scene directly (clone doesn't work properly)
        this.model = this.resource.scene
        this.model.name = 'CharacterModel'
        
        // Adjust scale - the Armature has 0.01, so we compensate
        this.model.scale.set(1, 1, 1)
        this.model.position.set(0, 0, 0)
        
        // Enable shadows
        this.model.traverse((child) => {
            if(child instanceof THREE.Mesh)
            {
                child.castShadow = true
                child.receiveShadow = true
            }
        })
        
        this.container.add(this.model)
        this.scene.add(this.container)
    }

    setAnimation()
    {
        if(!this.resource?.animations?.length)
        {
            console.warn('Character: No animations found')
            return
        }

        this.animation = {}
        this.animation.mixer = new THREE.AnimationMixer(this.model)
        this.animation.action = this.animation.mixer.clipAction(this.resource.animations[0])
        
        // Set up animation
        this.animation.action.setLoop(THREE.LoopRepeat)
        this.animation.action.reset()
        this.animation.action.play() // Always play, control visibility with weight
        
        // Start with weight 0 (invisible)
        this.animation.action.setEffectiveWeight(0)
        this.animation.targetWeight = 0
        
        this.animation.fadeDuration = 0.3 // Transition duration in seconds
    }

    setInput()
    {
        window.addEventListener('keydown', (event) => {
            this.handleKeyDown(event)
        })

        window.addEventListener('keyup', (event) => {
            this.handleKeyUp(event)
        })
    }

    handleKeyDown(event)
    {
        const key = event.key.toLowerCase()
        if(key in this.keys)
        {
            this.keys[key] = true
        }
    }

    handleKeyUp(event)
    {
        const key = event.key.toLowerCase()
        if(key in this.keys)
        {
            this.keys[key] = false
        }
    }

    setPhysics()
    {
        if(!this.physics.world) return

        // Create kinematic rigid body for character
        const RAPIER = this.physics.RAPIER
        const rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(this.position.x, this.position.y, this.position.z)
        this.rigidBody = this.physics.world.createRigidBody(rigidBodyDesc)

        // Create capsule collider (better for character movement)
        const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.4) // halfHeight, radius
        this.collider = this.physics.world.createCollider(colliderDesc, this.rigidBody)
        
        // Store previous position for collision checking
        this.previousPosition = this.position.clone()
        
        // Ensure initial sync
        this.container.position.copy(this.position)
    }

    update()
    {
        const deltaTime = this.time.delta * 0.001

        if(!this.container) return

        // Calculate movement
        const moveDirection = new THREE.Vector3(0, 0, 0)
        if(this.keys.w) moveDirection.z -= 1
        if(this.keys.s) moveDirection.z += 1
        if(this.keys.a) moveDirection.x -= 1
        if(this.keys.d) moveDirection.x += 1

        const isMoving = moveDirection.length() > 0.01

        // Handle animation transitions
        if(this.animation?.action && this.animation?.mixer)
        {
            // Determine target weight based on movement
            this.animation.targetWeight = isMoving ? 1.0 : 0.0
            
            // Smoothly interpolate weight
            const currentWeight = this.animation.action.getEffectiveWeight()
            const weightDiff = this.animation.targetWeight - currentWeight
            
            if(Math.abs(weightDiff) > 0.01)
            {
                const weightChangeSpeed = 1.0 / this.animation.fadeDuration
                const newWeight = currentWeight + Math.sign(weightDiff) * Math.min(Math.abs(weightDiff), weightChangeSpeed * deltaTime)
                this.animation.action.setEffectiveWeight(newWeight)
            }
            else
            {
                this.animation.action.setEffectiveWeight(this.animation.targetWeight)
            }
            
            // Always update mixer (critical for animations to work)
            this.animation.mixer.update(deltaTime)
        }

        // Move character
        if(isMoving)
        {
            moveDirection.normalize()
            const movement = moveDirection.multiplyScalar(this.moveSpeed * deltaTime)
            
            // Store previous position
            this.previousPosition.copy(this.position)
            
            // Calculate new position
            const newX = this.position.x + movement.x
            const newZ = this.position.z + movement.z
            const newY = 1.0
            
            // Check for collisions with STATIC objects only using raycast
            let canMove = true
            if(this.rigidBody && this.collider && this.physics?.world)
            {
                try {
                    const RAPIER = this.physics.RAPIER
                    const maxDistance = Math.sqrt(movement.x * movement.x + movement.z * movement.z) + 0.1
                    
                    // Normalize ray direction
                    const rayLength = Math.sqrt(movement.x * movement.x + movement.z * movement.z)
                    const dirX = rayLength > 0 ? movement.x / rayLength : 0
                    const dirZ = rayLength > 0 ? movement.z / rayLength : 0
                    
                    // Create ray using RAPIER.Ray (not Vector3 directly)
                    const rayOrigin = new RAPIER.Vector3(this.position.x, this.position.y, this.position.z)
                    const rayDir = new RAPIER.Vector3(dirX, 0, dirZ)
                    const ray = new RAPIER.Ray(rayOrigin, rayDir)
                    
                    // Cast ray - EXCLUDE_DYNAMIC so we only detect static objects
                    const hit = this.physics.world.castRay(
                        ray,
                        maxDistance,
                        true, // solid
                        RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,
                        0, // groups
                        this.collider.handle, // exclude self
                        null, // excludeRigidBody
                        null  // filterPredicate
                    )
                    
                    // If we hit something (static), block movement
                    if(hit !== null)
                    {
                        canMove = false
                    }
                } catch(error) {
                    // If raycast fails, allow movement (fallback)
                    console.warn('Raycast collision check failed:', error)
                }
            }
            
            // Move if no static collision, or allow pushing dynamic objects
            if(canMove)
            {
                this.position.x = newX
                this.position.z = newZ
                this.position.y = newY

                // Update rigid body (this will naturally push dynamic objects)
                if(this.rigidBody)
                {
                    this.rigidBody.setNextKinematicTranslation({
                        x: this.position.x,
                        y: this.position.y,
                        z: this.position.z
                    })
                }
            }
            else
            {
                // Blocked by static object - stay in previous position
                this.position.copy(this.previousPosition)
            }

            // Update container position
            this.container.position.copy(this.position)
            
            // Smooth rotation towards movement direction
            const targetRotation = Math.atan2(moveDirection.x, moveDirection.z)
            const currentRotation = this.container.rotation.y
            
            // Normalize angles for lerp
            let rotationDiff = targetRotation - currentRotation
            if(rotationDiff > Math.PI) rotationDiff -= Math.PI * 2
            if(rotationDiff < -Math.PI) rotationDiff += Math.PI * 2
            
            // Smooth lerp rotation
            this.container.rotation.y += rotationDiff * this.rotationSpeed * deltaTime
        }
        else
        {
            if(this.rigidBody)
            {
                const translation = this.rigidBody.translation()
                this.position.set(translation.x, translation.y, translation.z)
            }
            this.container.position.copy(this.position)
        }
    }
}
