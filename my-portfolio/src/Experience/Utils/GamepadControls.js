/**
 * GamepadControls — Xbox (and compatible) pad support, mirroring the polled
 * MobileControls API so the minigame/character can read it the same way:
 *   getMovement() → { x, y, force }   (x right+, y up+ — same as the joystick)
 *   getActions()  → { button1, button2, back, start }
 *   isActive()    → a pad is connected/active
 *   update()      → poll each frame
 *
 * Built on the native Gamepad API (no dependency) and encapsulated here so the
 * backend can be swapped for a library later without touching consumers.
 *
 * Xbox standard mapping: A=0 (confirm/throw), B=1 (back), X=2 (sprint), Y=3,
 * LB=4, RB=5, Start=9, dpad L/R = 14/15, left stick = axes 0/1.
 */
const DEADZONE = 0.18
const NAV_COOLDOWN_MS = 180

export default class GamepadControls {
    constructor() {
        this.index = null
        this.connected = false
        this.movement = { x: 0, y: 0, force: 0 }
        this.actions = { button1: false, button2: false, back: false, start: false }

        this._buttons = []
        this._prevA = false
        this._prevB = false
        this._navAt = 0

        // When true, the built-in menu navigation is paused so a component
        // (e.g. NameEntry's letter reels) can drive the pad itself.
        this.suspendMenuNav = false

        this._onConnect = (e) => { this.index = e.gamepad.index; this.connected = true }
        this._onDisconnect = (e) => {
            if (e.gamepad.index === this.index) { this.index = null; this._reset() }
        }
        window.addEventListener('gamepadconnected', this._onConnect)
        window.addEventListener('gamepaddisconnected', this._onDisconnect)
    }

    _reset() {
        this.connected = false
        this.movement.x = this.movement.y = this.movement.force = 0
        this.actions.button1 = this.actions.button2 = this.actions.back = this.actions.start = false
        this._buttons = []
    }

    _pad() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : []
        if (this.index != null && pads[this.index]) return pads[this.index]
        for (const p of pads) { if (p) { this.index = p.index; return p } }
        return null
    }

    update() {
        const pad = this._pad()
        if (!pad) { if (this.connected) this._reset(); return }
        this.connected = true

        // Left stick with a radial deadzone → unit direction + force (mirrors
        // the touch joystick: x*force gives the deflection).
        let ax = pad.axes[0] || 0
        let ay = pad.axes[1] || 0
        const mag = Math.hypot(ax, ay)
        if (mag < DEADZONE) {
            this.movement.x = this.movement.y = this.movement.force = 0
        } else {
            this.movement.x = ax / mag
            this.movement.y = -(ay / mag) // up positive
            this.movement.force = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE))
        }

        const b = pad.buttons
        this._buttons = b
        this.actions.button2 = !!b[0]?.pressed              // A — confirm/throw
        this.actions.button1 = !!(b[2]?.pressed || b[5]?.pressed) // X/RB — sprint
        this.actions.back = !!b[1]?.pressed                 // B — back
        this.actions.start = !!b[9]?.pressed                // Start

        // Real pad input → mark gamepad as the active device.
        if (this.movement.force > 0.05 || b.some((btn) => btn?.pressed)) {
            window.experience?.input?.set('gamepad')
        }

        this._navigateModals()
    }

    // Drive open modals from the pad (A activate · B close · dpad/stick move).
    _navigateModals() {
        if (this.suspendMenuNav) { this._prevA = this.actions.button2; this._prevB = this.actions.back; return }
        const overlay = document.querySelector('.fz-modal-overlay.is-open')
        if (!overlay) { this._prevA = this.actions.button2; this._prevB = this.actions.back; return }

        const items = [...overlay.querySelectorAll('.fz-card, .fz-btn, .fz-settings-tab')].filter((el) => {
            const s = getComputedStyle(el)
            return s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled
        })
        if (!items.length) { this._prevA = this.actions.button2; this._prevB = this.actions.back; return }

        if (this.actions.button2 && !this._prevA) {
            const cur = items.includes(document.activeElement) ? document.activeElement : items[0]
            cur?.click()
        } else if (this.actions.back && !this._prevB) {
            overlay.querySelector('.fz-modal-close')?.click()
        } else if (items.length > 1) {
            const dpadU = this._buttons[12]?.pressed
            const dpadD = this._buttons[13]?.pressed
            const dpadL = this._buttons[14]?.pressed
            const dpadR = this._buttons[15]?.pressed
            let dir = 0
            if (dpadR || dpadD || this.movement.x > 0.5 || this.movement.y < -0.5) dir = 1
            else if (dpadL || dpadU || this.movement.x < -0.5 || this.movement.y > 0.5) dir = -1
            const now = performance.now()
            if (dir !== 0 && now - this._navAt > NAV_COOLDOWN_MS) {
                this._navAt = now
                const i = items.indexOf(document.activeElement)
                const ni = i === -1 ? 0 : (i + dir + items.length) % items.length
                items[ni].focus()
            }
        }

        this._prevA = this.actions.button2
        this._prevB = this.actions.back
    }

    getMovement() { return { ...this.movement } }
    getActions() { return { ...this.actions } }
    getDpad() {
        const b = this._buttons
        return {
            up: !!b[12]?.pressed,
            down: !!b[13]?.pressed,
            left: !!b[14]?.pressed,
            right: !!b[15]?.pressed
        }
    }
    isActive() { return this.connected }

    destroy() {
        window.removeEventListener('gamepadconnected', this._onConnect)
        window.removeEventListener('gamepaddisconnected', this._onDisconnect)
    }
}
