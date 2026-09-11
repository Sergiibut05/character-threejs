import nipplejs from 'nipplejs'

// Shared button look. Only the geometry lives here now -- the MATERIAL is in
// style.css under .mc-btn, so these thumb buttons are made of exactly the same
// thing as every other round button in the game instead of being a second,
// slightly different answer to the same question. The blur is gone with it:
// it sat over a moving 3D scene and re-blurred every frame, on a phone, behind
// a surface that is opaque enough for it never to have shown.
const BTN_BASE_CSS = `
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
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
            this._watchViewport()
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

    /**
     * Build the stick.
     *
     * WHY THIS IS ALSO CALLED AGAIN, LATER, FROM _watchViewport.
     *
     * nipplejs records where the stick's centre is in page coordinates, once,
     * and every drag is measured from that recorded point. It does try to keep
     * it current -- it listens for window resize and recomputes -- but the
     * recompute is not the same calculation as the original.
     *
     * On creation the centre is the point at 50%/50% of the zone: nipplejs
     * drops a zero-size probe div there and takes its rect, which IS a point.
     * On resize it instead takes the rect of the STICK element and keeps
     * `left`/`top`. That element is `size` across and drawn centred on the
     * point, so its top-left corner is half a stick up and to the left of it.
     * The recorded centre therefore jumps by size/2 -- 60 px here -- on every
     * resize, which is further than the stick's own radius.
     *
     * Once the centre sits outside the area you can actually touch, every drag
     * lands on the same side of it, and nipplejs clamps the reading to a
     * 60 px circle around that point. The stick answers, always in about the
     * same direction, no matter which way you pull it.
     *
     * The resize that triggers it is the one you cannot avoid on a phone: the
     * address bar sliding away as you enter the world. Which is exactly when
     * it was reported, and why it never reproduced on the second attempt --
     * the bar is already gone by then.
     *
     * Rebuilding the manager outright is the fix, because creation is the path
     * that computes the centre correctly.
     */
    createJoystick()
    {
        const zone = this.joystickArea
        if (!zone) return

        this.joystick?.destroy?.()
        this.movement.x = 0
        this.movement.y = 0
        this.movement.angle = 0
        this.movement.force = 0
        this._dragging = false
        this._viewportKey = this._readViewportKey()

        this.joystick = nipplejs.create({
            zone: this.joystickArea,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'rgba(255, 255, 255, 0.7)',
            size: 120,
            threshold: 0.1,
            fadeTime: 200,
            // 0.5 was fine when the stick was two flat circles -- there was
            // nothing there to dim. Now that it is a dish with a rim and a
            // glazed thumb, halving its opacity at rest sands all of that off
            // and it reads as washed out until you touch it. High enough to
            // stay an object, low enough to stay out of the way.
            restOpacity: 0.85
        })

        // Handle joystick events
        this.joystick.on('start', () => { this._dragging = true })

        this.joystick.on('move', (evt, data) => {
            this.movement.x = data.vector.x
            this.movement.y = data.vector.y
            this.movement.angle = data.angle.radian
            this.movement.force = data.force
        })

        this.joystick.on('end', () => {
            this._dragging = false
            this.movement.x = 0
            this.movement.y = 0
            this.movement.angle = 0
            this.movement.force = 0
        })

        // A resize that arrived mid-drag was held back rather than yanking the
        // stick out from under the finger. Now that the finger is up, take it.
        if (this._rebuildPending) {
            this._rebuildPending = false
            requestAnimationFrame(() => this._rebuildJoystickIfMoved())
        }
    }

    /**
     * The number nipplejs actually depends on: where the zone sits in PAGE
     * coordinates. It stores scroll offset + rect, so a scroll with a fixed
     * element (which does not move) invalidates it just as a resize does.
     */
    _readViewportKey()
    {
        const r = this.joystickArea?.getBoundingClientRect()
        if (!r || r.width < 1) return null
        return [r.left + window.scrollX, r.top + window.scrollY,
                r.width, r.height].map(Math.round).join('|')
    }

    _watchViewport()
    {
        this._rebuildPending = false
        // Deliberately LONGER than the 100 ms nipplejs debounces its own resize
        // handler by. Both fire off the same event, and whichever runs last
        // decides where the centre is -- so this has to be the one that does.
        const schedule = () => {
            clearTimeout(this._rebuildTimer)
            this._rebuildTimer = setTimeout(() => this._rebuildJoystickIfMoved(), 260)
        }

        this.sizes?.on('resize', schedule)
        // window resize does not always fire for the address bar sliding away,
        // which is the specific event that broke the stick. visualViewport does.
        const vv = window.visualViewport
        if (vv) {
            vv.addEventListener('resize', schedule)
            vv.addEventListener('scroll', schedule)
        }
        window.addEventListener('orientationchange', schedule)
    }

    /** Rebuild only if the geometry nipplejs cached is genuinely stale. */
    _rebuildJoystickIfMoved()
    {
        const key = this._readViewportKey()
        if (!key || key === this._viewportKey) return
        // Never mid-drag: destroying the manager under a live touch loses the
        // 'end' event, and the character would keep walking on his own.
        if (this._dragging) { this._rebuildPending = true; return }
        this.createJoystick()
    }

    createActionButtons()
    {
        // Sprint button (secondary, glass-pastel) — a "dash" icon.
        this.button1 = document.createElement('button')
        this.button1.id = 'action-button-1'
        this.button1.className = 'mc-btn mc-btn--ghost'
        this.button1.setAttribute('aria-label', 'Correr')
        this.button1.innerHTML = ICON_RUN
        this.button1.style.cssText = BTN_BASE_CSS

        // Primary action button (filled green). Context-aware icon: a generic
        // "interact" in the world, the frisbee disc inside the minigame.
        this.button2 = document.createElement('button')
        this.button2.id = 'action-button-2'
        this.button2.className = 'mc-btn mc-btn--primary'
        this.button2.setAttribute('aria-label', 'Acción')
        this.button2.innerHTML = ICON_INTERACT
        this.button2.style.cssText = BTN_BASE_CSS

        // A CLASS, not inline styles. The pressed look is part of the
        // button's material and belongs next to the rest of it -- and an
        // inline transform written here would win against that material's own
        // :active rule, so the two would have been fighting over the same
        // property from different files.
        const press = (btn, key) => {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault()
                this.actions[key] = true
                btn.classList.add('is-pressed')
            })
            btn.addEventListener('touchend', (e) => {
                e.preventDefault()
                this.actions[key] = false
                btn.classList.remove('is-pressed')
            })
            // A finger that slides off the button never fires touchend on it,
            // and the button stayed lit and stayed DOWN for the rest of the
            // session. Both of these are the same fix.
            btn.addEventListener('touchcancel', () => {
                this.actions[key] = false
                btn.classList.remove('is-pressed')
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
        // With the sprint hidden (minigame) only the throw button remains — raise
        // it to the midpoint of where the two world buttons sit (64px buttons +
        // 10px gap → the midpoint is 37px above the lone button's spot).
        if (this.button2) this.button2.style.marginBottom = visible ? '' : '37px'
    }

    // Check if controls are active (mobile mode)
    isActive()
    {
        return this.isMobile
    }

    /**
     * Hide the whole control cluster for a moment -- a cinematic, say, where
     * there is nothing to drive and the stick would just be sitting on top of
     * the shot.
     *
     * A FLAG, not a direct write to style.display. update() runs every frame
     * and decides that property from whether a modal is open, so anything set
     * from outside would be overwritten on the very next frame. This is the
     * second reason it can be hidden; update() now weighs both.
     *
     * Hiding also zeroes the movement, because display:none under a live touch
     * cancels it without nipplejs ever seeing an 'end' -- and a stale vector
     * left behind means the character walks off on his own when the controls
     * come back. Same failure the buttons' touchcancel handler exists for.
     */
    setVisible(visible)
    {
        this._hidden = !visible
        if (!visible) {
            this.movement.x = 0
            this.movement.y = 0
            this.movement.angle = 0
            this.movement.force = 0
            this.actions.button1 = false
            this.actions.button2 = false
        }
    }

    // Update method (called each frame)
    update()
    {
        // On touch, modals are tapped directly — hide the virtual controls while
        // any modal is open so they don't sit under it (plan §2).
        if (this.container) {
            const modalOpen = !!document.querySelector('.fz-modal-overlay.is-open')
            const display = (this._hidden || modalOpen) ? 'none' : ''
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