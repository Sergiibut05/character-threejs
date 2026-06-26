import nipplejs from 'nipplejs'

// Shared button look — rounded glass, soft shadow (matches the game UI).
const BTN_BASE_CSS = `
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 8px 18px rgba(39, 90, 70, 0.18);
    transition: transform 0.14s ease, filter 0.14s ease;
`

const ICON_RUN = `
<svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden="true">
  <path d="M4 8h9M3 12h11M5 16h7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M15 7l4.5 5-4.5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

const ICON_DISC = `
<svg viewBox="0 0 24 24" fill="none" width="30" height="30" aria-hidden="true">
  <ellipse cx="12" cy="13.5" rx="8.5" ry="3.6" fill="rgba(255,255,255,0.28)" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="12" cy="11.2" rx="8.5" ry="3.6" fill="rgba(255,255,255,0.5)" stroke="currentColor" stroke-width="2"/>
</svg>`

// Generic "interact" (tap hand) — the world action button outside minigames.
const ICON_INTERACT = `
<svg viewBox="0 0 24 24" fill="none" width="27" height="27" aria-hidden="true">
  <path d="M9 11V6a1.7 1.7 0 0 1 3.4 0v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M12.4 11V9.4a1.6 1.6 0 0 1 3.2 0V11M15.6 11v-.6a1.6 1.6 0 0 1 3.2 0V15a4.6 4.6 0 0 1-4.6 4.6h-1.7a4.6 4.6 0 0 1-3.7-1.9l-2-2.7a1.6 1.6 0 0 1 2.4-2l1.1 1.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

const ACTION_ICONS = { interact: ICON_INTERACT, frisbee: ICON_DISC }

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
            bottom: 60px;
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
            bottom: 60px;
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
        // Sprint button (secondary, glass-pastel) — a "dash" icon.
        this.button1 = document.createElement('button')
        this.button1.id = 'action-button-1'
        this.button1.setAttribute('aria-label', 'Correr')
        this.button1.innerHTML = ICON_RUN
        this.button1.style.cssText = BTN_BASE_CSS + `
            background: rgba(255, 255, 255, 0.55);
            border: 2px solid rgba(120, 185, 150, 0.5);
            color: #234b3a;
        `

        // Primary action button (filled green). Context-aware icon: a generic
        // "interact" in the world, the frisbee disc inside the minigame.
        this.button2 = document.createElement('button')
        this.button2.id = 'action-button-2'
        this.button2.setAttribute('aria-label', 'Acción')
        this.button2.innerHTML = ICON_INTERACT
        this.button2.style.cssText = BTN_BASE_CSS + `
            background: linear-gradient(168deg, #5fc594, #41a06e);
            border: 2px solid rgba(255, 255, 255, 0.7);
            color: #fff;
        `

        const press = (btn, key) => {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault()
                this.actions[key] = true
                btn.style.transform = 'scale(0.9)'
                btn.style.filter = 'brightness(1.08)'
            })
            btn.addEventListener('touchend', (e) => {
                e.preventDefault()
                this.actions[key] = false
                btn.style.transform = 'scale(1)'
                btn.style.filter = 'none'
            })
        }
        press(this.button1, 'button1')
        press(this.button2, 'button2')

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

    // Swap the primary action button icon by context ('interact' | 'frisbee').
    setActionIcon(name)
    {
        if (this.button2 && ACTION_ICONS[name]) this.button2.innerHTML = ACTION_ICONS[name]
    }

    // Show/hide the sprint button (useless inside the frisbee minigame).
    setSprintVisible(visible)
    {
        if (this.button1) this.button1.style.display = visible ? '' : 'none'
    }

    // Check if controls are active (mobile mode)
    isActive()
    {
        return this.isMobile
    }

    // Update method (called each frame)
    update()
    {
        // On touch, modals are tapped directly — hide the virtual controls while
        // any modal is open so they don't sit under it (plan §2).
        if (this.container) {
            const modalOpen = !!document.querySelector('.fz-modal-overlay.is-open')
            const display = modalOpen ? 'none' : ''
            if (this.container.style.display !== display) {
                this.container.style.display = display
            }
        }
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