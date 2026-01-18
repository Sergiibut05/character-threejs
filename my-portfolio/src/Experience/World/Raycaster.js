import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Raycaster
{
    constructor()
    {
        this.experience = new Experience()
        this.camera = this.experience.camera
        this.canvas = this.experience.canvas
        this.scene = this.experience.scene

        // Raycaster setup
        this.raycaster = new THREE.Raycaster()
        this.mouse = new THREE.Vector2()

        // Track currently hovered object
        this.hoveredObject = null

        // List of interactive objects to check
        this.interactiveObjects = []

        this.setEventListeners()
    }

    // Register an interactive object to be checked by raycaster
    addInteractiveObject(interactiveObject)
    {
        if(interactiveObject?.mesh)
        {
            this.interactiveObjects.push(interactiveObject)
        }
    }

    // Remove an interactive object from the list
    removeInteractiveObject(interactiveObject)
    {
        const index = this.interactiveObjects.indexOf(interactiveObject)
        if(index > -1)
        {
            this.interactiveObjects.splice(index, 1)
        }
    }

    setEventListeners()
    {
        // Mouse move for hover detection
        this.canvas.addEventListener('mousemove', (event) =>
        {
            this.onMouseMove(event)
        })

        // Click detection
        this.canvas.addEventListener('click', (event) =>
        {
            this.onClick(event)
        })

        // Touch support for mobile
        this.canvas.addEventListener('touchstart', (event) =>
        {
            if(event.touches.length === 1)
            {
                this.onTouchStart(event)
            }
        })
    }

    onMouseMove(event)
    {
        // Convert mouse position to normalized device coordinates (-1 to +1)
        const rect = this.canvas.getBoundingClientRect()
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    }

    onClick(event)
    {
        // Update mouse position
        const rect = this.canvas.getBoundingClientRect()
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        // Perform raycast
        this.raycaster.setFromCamera(this.mouse, this.camera.instance)
        
        const meshes = this.interactiveObjects.map(obj => obj.mesh)
        const intersects = this.raycaster.intersectObjects(meshes)

        if(intersects.length > 0)
        {
            const clickedMesh = intersects[0].object
            const interactiveObject = clickedMesh.userData.interactiveObject

            if(interactiveObject)
            {
                interactiveObject.onClick()
            }
        }
    }

    onTouchStart(event)
    {
        const touch = event.touches[0]
        const rect = this.canvas.getBoundingClientRect()
        this.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1

        // Perform raycast for touch
        this.raycaster.setFromCamera(this.mouse, this.camera.instance)
        
        const meshes = this.interactiveObjects.map(obj => obj.mesh)
        const intersects = this.raycaster.intersectObjects(meshes)

        if(intersects.length > 0)
        {
            const touchedMesh = intersects[0].object
            const interactiveObject = touchedMesh.userData.interactiveObject

            if(interactiveObject)
            {
                interactiveObject.onClick()
            }
        }
    }

    update()
    {
        if(this.interactiveObjects.length === 0) return

        // Perform raycast
        this.raycaster.setFromCamera(this.mouse, this.camera.instance)
        
        const meshes = this.interactiveObjects.map(obj => obj.mesh)
        const intersects = this.raycaster.intersectObjects(meshes)

        if(intersects.length > 0)
        {
            const hitMesh = intersects[0].object
            const hitObject = hitMesh.userData.interactiveObject

            // New hover target
            if(this.hoveredObject !== hitObject)
            {
                // Unhover previous
                if(this.hoveredObject)
                {
                    this.hoveredObject.onUnhover()
                }

                // Hover new
                this.hoveredObject = hitObject
                if(this.hoveredObject)
                {
                    this.hoveredObject.onHover()
                }
            }
        }
        else
        {
            // No intersection - unhover if we had one
            if(this.hoveredObject)
            {
                this.hoveredObject.onUnhover()
                this.hoveredObject = null
            }
        }
    }
}
