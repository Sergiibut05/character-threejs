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

        // Character state - Y position will be adjusted in setPhysics() to match capsule
        this.position = new THREE.Vector3(0, 0.5, 0) // Temporary, will be adjusted
        this.previousPosition = new THREE.Vector3(0, 0.5, 0)
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
        
        // Calculate bounding box to find the bottom of the model
        const box = new THREE.Box3().setFromObject(this.model)
        const modelHeight = box.max.y - box.min.y
        const modelBottomY = box.min.y
        
        // Adjust model position so its bottom touches ground when container is at y=0.5
        // Container is at y=0.5 (center of capsule), we want model bottom at world y=0
        // worldY = container.y + model.y + modelBottomY
        // 0 = 0.5 + model.y + modelBottomY
        // model.y = -0.5 - modelBottomY
        const modelOffsetY = -0.5 - modelBottomY
        
        this.model.position.set(0, modelOffsetY, 0)
        
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

        const RAPIER = this.physics.RAPIER
        
        // Capsule dimensions
        const halfHeight = 0.5
        const radius = 0.4
        
        // Adjust position so capsule base touches ground (y=0)
        this.position.y = halfHeight
        
        // Create kinematic rigid body for character
        const rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(this.position.x, this.position.y, this.position.z)
        this.rigidBody = this.physics.world.createRigidBody(rigidBodyDesc)

        // Create capsule collider with proper collision types
        // KINEMATIC_FIXED enables collisions between kinematic and fixed (static) bodies
        const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
            .setActiveCollisionTypes(
                RAPIER.ActiveCollisionTypes.DEFAULT | 
                RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED
            )
        this.collider = this.physics.world.createCollider(colliderDesc, this.rigidBody)
        
        // Create Rapier's built-in Character Controller
        // The offset (0.01) is a skin width that prevents getting stuck in geometry
        this.characterController = this.physics.world.createCharacterController(0.01)
        
        // Configure character controller
        this.characterController.setApplyImpulsesToDynamicBodies(true) // Push dynamic objects
        this.characterController.setMaxSlopeClimbAngle(Math.PI * 0.25) // ~45 degrees
        this.characterController.setMinSlopeSlideAngle(Math.PI * 0.3)  // ~54 degrees
        
        // Store previous position
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

        // Move character using Rapier's built-in Character Controller
        if(isMoving && this.characterController && this.collider && this.rigidBody)
        {
            moveDirection.normalize()
            
            // Calculate desired movement
            const desiredMovement = {
                x: moveDirection.x * this.moveSpeed * deltaTime,
                y: 0, // No vertical movement (gravity handled separately if needed)
                z: moveDirection.z * this.moveSpeed * deltaTime
            }
            
            // Use Rapier's Character Controller to compute corrected movement
            // This handles collisions with both static and dynamic objects
            this.characterController.computeColliderMovement(
                this.collider,
                desiredMovement
            )
            
            // Get the corrected movement (after collision resolution)
            const correctedMovement = this.characterController.computedMovement()
            
            // Apply corrected movement to position
            const currentPos = this.rigidBody.translation()
            const newPos = {
                x: currentPos.x + correctedMovement.x,
                y: 0.5, // Keep Y at halfHeight so base touches ground
                z: currentPos.z + correctedMovement.z
            }
            
            // Update rigid body position
            this.rigidBody.setNextKinematicTranslation(newPos)
            
            // Update our position tracking
            this.position.set(newPos.x, newPos.y, newPos.z)
            
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
            // Not moving - sync position from physics
            if(this.rigidBody)
            {
                const translation = this.rigidBody.translation()
                this.position.set(translation.x, translation.y, translation.z)
            }
            this.container.position.copy(this.position)
        }
    }
}
