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
        this._worldPos = new THREE.Vector3()

        this.setEventListeners()
    }

    /**
     * Hover/click only count when the character is near the object. Without
     * this, a mouse-over from across the map still drew the outline (and
     * opened some panels) because the raycaster has no distance of its own.
     */
    _isInInteractRange(io, mesh)
    {
        const character = this.experience.world?.character
        if (!character || !io) return false

        const base = io.hoverRadius ?? io.proximityRadius ?? io.kickRadius
        const r = (Number.isFinite(base) ? base : 2.2) * 1.15

        let x
        let z
        const pos = io.position
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z))
        {
            x = pos.x
            z = pos.z
        }
        else if (mesh)
        {
            mesh.getWorldPosition(this._worldPos)
            x = this._worldPos.x
            z = this._worldPos.z
        }
        else
        {
            return false
        }

        const dx = character.position.x - x
        const dz = character.position.z - z
        return dx * dx + dz * dz <= r * r
    }

    /** First ray hit whose interactive is in range (skips far objects in front). */
    _pickInteractive(intersects)
    {
        for (let i = 0; i < intersects.length; i++)
        {
            const mesh = intersects[i].object
            const io = mesh.userData.interactiveObject
            if (io && this._isInInteractRange(io, mesh)) return io
        }
        return null
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

        // Click detection (use press, not release). Skip the SYNTHETIC
        // mousedown browsers fire after a touch — it would run the same
        // interaction twice (touchstart already handled it), which corrupted
        // modal open/close state (frozen character after closing on mobile).
        this.canvas.addEventListener('mousedown', (event) =>
        {
            if(performance.now() - (this._lastTouchAt || 0) < 700) return
            this.onClick(event)
        })

        // Touch support for mobile
        this.canvas.addEventListener('touchstart', (event) =>
        {
            this._lastTouchAt = performance.now()
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

        const interactiveObject = this._pickInteractive(intersects)
        if(interactiveObject?.onClick)
        {
            interactiveObject.onClick()
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

        const interactiveObject = this._pickInteractive(intersects)
        if(interactiveObject?.onClick)
        {
            interactiveObject.onClick()
        }
    }

    update()
    {
        if(this.interactiveObjects.length === 0) return

        // While a modal/panel is open the overlay eats mousemove, so the canvas
        // keeps the LAST mouse position — the stale hover would stick and the
        // body 'pointer' cursor would show all over the modal. Clear it.
        if(document.querySelector('.fz-modal-overlay.is-open, .fz-proj.is-open'))
        {
            if(this.hoveredObject)
            {
                this.hoveredObject.onUnhover()
                this.hoveredObject = null
            }
            document.body.style.cursor = ''
            return
        }

        // Perform raycast
        this.raycaster.setFromCamera(this.mouse, this.camera.instance)
        
        const meshes = this.interactiveObjects.map(obj => obj.mesh)
        const intersects = this.raycaster.intersectObjects(meshes)

        const hitObject = this._pickInteractive(intersects)

        if(hitObject)
        {
            if(this.hoveredObject !== hitObject)
            {
                if(this.hoveredObject)
                {
                    this.hoveredObject.onUnhover()
                }

                this.hoveredObject = hitObject
                this.hoveredObject.onHover()
            }
        }
        else if(this.hoveredObject)
        {
            this.hoveredObject.onUnhover()
            this.hoveredObject = null
        }
    }
}
