import nipplejs from 'nipplejs'

export default class MobileControls
{
    constructor()
    {
        this.experience = window.experience
        this.sizes = this.experience.sizes

        // Movement data
        this.movement = {
            x: 0,
            y: 0,
            angle: 0,
            force: 0
        }

        // Action buttons state
        this.actions = {
            button1: false,
            button2: false
        }

        // Check if we're on mobile
        this.isMobile = this.checkIfMobile()

        if(this.isMobile)
        {
            this.createUI()
            this.createJoystick()
            this.createActionButtons()
        }
    }

    checkIfMobile()
    {
        // Check for touch capability and screen size
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
        const isSmallScreen = window.innerWidth < 768 || window.innerHeight < 768

        return hasTouch && isSmallScreen
    }

    createUI()
    {
        // Create main container for mobile controls
        this.container = document.createElement('div')
        this.container.id = 'mobile-controls'
        this.container.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 200px;
            z-index: 1000;
            pointer-events: none;
        `

        // Joystick area (left side)
        this.joystickArea = document.createElement('div')
        this.joystickArea.id = 'joystick-area'
        this.joystickArea.style.cssText = `
            position: absolute;
            left: 20px;
            bottom: 20px;
            width: 150px;
            height: 150px;
            pointer-events: auto;
        `

        // Action buttons area (right side)
        this.buttonsArea = document.createElement('div')
        this.buttonsArea.id = 'buttons-area'
        this.buttonsArea.style.cssText = `
            position: absolute;
            right: 20px;
            bottom: 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: auto;
        `

        this.container.appendChild(this.joystickArea)
        this.container.appendChild(this.buttonsArea)
        document.body.appendChild(this.container)
    }

    createJoystick()
    {
        this.joystick = nipplejs.create({
            zone: this.joystickArea,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'rgba(255, 255, 255, 0.7)',
            size: 120,
            threshold: 0.1,
            fadeTime: 200,
            restOpacity: 0.5
        })

        // Handle joystick events
        this.joystick.on('move', (evt, data) => {
            this.movement.x = data.vector.x
            this.movement.y = data.vector.y
            this.movement.angle = data.angle.radian
            this.movement.force = data.force
        })

        this.joystick.on('end', () => {
            this.movement.x = 0
            this.movement.y = 0
            this.movement.angle = 0
            this.movement.force = 0
        })
    }

    createActionButtons()
    {
        // Button 1
        this.button1 = document.createElement('button')
        this.button1.id = 'action-button-1'
        this.button1.textContent = 'A'
        this.button1.style.cssText = `
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: 2px solid rgba(255, 255, 255, 0.8);
            background: rgba(0, 150, 255, 0.7);
            color: white;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
        `

        // Button 2
        this.button2 = document.createElement('button')
        this.button2.id = 'action-button-2'
        this.button2.textContent = 'B'
        this.button2.style.cssText = `
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: 2px solid rgba(255, 255, 255, 0.8);
            background: rgba(255, 100, 100, 0.7);
            color: white;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
        `

        // Add event listeners
        this.button1.addEventListener('touchstart', (e) => {
            e.preventDefault()
            this.actions.button1 = true
            this.button1.style.transform = 'scale(0.9)'
            this.button1.style.background = 'rgba(0, 150, 255, 0.9)'
        })

        this.button1.addEventListener('touchend', (e) => {
            e.preventDefault()
            this.actions.button1 = false
            this.button1.style.transform = 'scale(1)'
            this.button1.style.background = 'rgba(0, 150, 255, 0.7)'
        })

        this.button2.addEventListener('touchstart', (e) => {
            e.preventDefault()
            this.actions.button2 = true
            this.button2.style.transform = 'scale(0.9)'
            this.button2.style.background = 'rgba(255, 100, 100, 0.9)'
        })

        this.button2.addEventListener('touchend', (e) => {
            e.preventDefault()
            this.actions.button2 = false
            this.button2.style.transform = 'scale(1)'
            this.button2.style.background = 'rgba(255, 100, 100, 0.7)'
        })

        this.buttonsArea.appendChild(this.button1)
        this.buttonsArea.appendChild(this.button2)
    }

    // Get current movement data
    getMovement()
    {
        return { ...this.movement }
    }

    // Get current action states
    getActions()
    {
        return { ...this.actions }
    }

    // Check if controls are active (mobile mode)
    isActive()
    {
        return this.isMobile
    }

    // Update method (called each frame)
    update()
    {
        // Could add additional logic here if needed
    }

    // Cleanup method
    destroy()
    {
        if(this.joystick)
        {
            this.joystick.destroy()
        }

        if(this.container)
        {
            document.body.removeChild(this.container)
        }
    }
}