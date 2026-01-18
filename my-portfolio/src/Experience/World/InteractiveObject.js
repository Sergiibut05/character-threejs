import * as THREE from 'three'
import Experience from '../Experience.js'

export default class InteractiveObject
{
    constructor(options = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.renderer = this.experience.renderer
        this.physics = this.experience.world.physics

        // Options with defaults - proximityRadius reduced to half (was 3.0, now 1.5)
        this.position = options.position || { x: 0, y: 0.5, z: 0 }
        this.size = options.size || { x: 1, y: 1, z: 1 }
        this.color = options.color || '#6054D0'
        this.highlightColor = options.highlightColor || '#ffffff'
        this.modalContent = options.modalContent || { title: 'Interactive Object', body: 'Click to interact!' }
        this.proximityRadius = options.proximityRadius || 1.5  // Reduced from 3.0 to 1.5

        // State
        this.isHighlighted = false
        this.isHovered = false
        this.isNearCharacter = false

        this.setMesh()
        this.setPhysics()
    }

    setMesh()
    {
        const geometry = new THREE.BoxGeometry(this.size.x, this.size.y, this.size.z)
        
        // Standard material without emissive (OutlinePass handles highlight)
        this.material = new THREE.MeshStandardMaterial({
            color: this.color,
            metalness: 0.3,
            roughness: 0.4
        })

        this.mesh = new THREE.Mesh(geometry, this.material)
        this.mesh.position.set(this.position.x, this.position.y, this.position.z)
        this.mesh.castShadow = true
        this.mesh.receiveShadow = true

        // Store reference to this InteractiveObject on the mesh for raycasting
        this.mesh.userData.interactiveObject = this

        this.scene.add(this.mesh)
    }

    setPhysics()
    {
        if(this.physics?.world)
        {
            this.physics.createStaticBox(this.size, this.position, this.mesh)
        }
    }

    // Check if character is within proximity
    checkProximity(characterPosition)
    {
        if(!characterPosition) return false

        const distance = this.mesh.position.distanceTo(characterPosition)
        const wasNear = this.isNearCharacter
        this.isNearCharacter = distance < this.proximityRadius

        // Update highlight if proximity changed
        if(wasNear !== this.isNearCharacter)
        {
            this.updateHighlight()
        }

        return this.isNearCharacter
    }

    // Called when mouse hovers over the object
    onHover()
    {
        if(!this.isHovered)
        {
            this.isHovered = true
            this.updateHighlight()
            
            // Change cursor to pointer
            document.body.style.cursor = 'pointer'
        }
    }

    // Called when mouse leaves the object
    onUnhover()
    {
        if(this.isHovered)
        {
            this.isHovered = false
            this.updateHighlight()
            
            // Reset cursor
            document.body.style.cursor = 'default'
        }
    }

    // Called when object is clicked
    onClick()
    {
        // Only allow click if near character or hovered
        if(this.isNearCharacter || this.isHovered)
        {
            this.openModal()
        }
    }

    // Update the highlight effect based on state using OutlinePass
    updateHighlight()
    {
        const shouldHighlight = this.isHovered || this.isNearCharacter

        if(shouldHighlight && !this.isHighlighted)
        {
            // Enable highlight - add mesh to OutlinePass
            this.isHighlighted = true
            if(this.renderer?.addOutlinedObject)
            {
                this.renderer.addOutlinedObject(this.mesh)
            }
        }
        else if(!shouldHighlight && this.isHighlighted)
        {
            // Disable highlight - remove mesh from OutlinePass
            this.isHighlighted = false
            if(this.renderer?.removeOutlinedObject)
            {
                this.renderer.removeOutlinedObject(this.mesh)
            }
        }
    }

    // Open the modal with this object's content
    openModal()
    {
        const modal = document.querySelector('.modal-overlay')
        const modalTitle = document.querySelector('.modal-title')
        const modalBody = document.querySelector('.modal-body')

        if(modal && modalTitle && modalBody)
        {
            modalTitle.textContent = this.modalContent.title
            modalBody.innerHTML = this.modalContent.body
            modal.classList.add('is-visible')
        }
    }

    update(characterPosition)
    {
        this.checkProximity(characterPosition)
    }
}
