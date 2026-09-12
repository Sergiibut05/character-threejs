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
 * LB=4, RB=5, Select/View=8, Start=9, dpad U/D/L/R = 12/13/14/15, left stick
 * = axes 0/1.
 *
 * In a modal the pad follows console convention rather than inventing one:
 * A activates, B closes, the D-PAD moves the selection, the BUMPERS change
 * tab, and the LEFT STICK scrolls. The stick used to move the selection too,
 * doubling up with the d-pad while nothing could scroll at all -- so a panel
 * taller than the screen (the settings on a short window, the computer's
 * bios) simply had a bottom you could not reach with a pad in your hands.
 * One input, one job.
 */
const DEADZONE = 0.18
const NAV_COOLDOWN_MS = 180
// Stick scrolling, in pixels per second at full deflection. Time-scaled, so
// the panel travels at the same speed whatever the frame rate.
const SCROLL_PX_PER_SEC = 900
const SCROLL_DEADZONE = 0.15

export default class GamepadControls {
    constructor() {
        this.index = null
        this.connected = false
        this.movement = { x: 0, y: 0, force: 0 }
        this.actions = { button1: false, button2: false, back: false, start: false }

        this._buttons = []
        this._prevA = false
        this._prevB = false
        this._prevBumper = false
        this._prevSelect = false
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

        // Start/Options toggles the settings menu (like any console game).
        if (this.actions.start && !this._prevStart) {
            const settings = window.experience?.settingsUi
            if (settings?.isOpen()) settings.close()
            else if (settings && !document.querySelector('.fz-modal-overlay.is-open, .fz-proj.is-open')) {
                settings.open()
            }
        }
        this._prevStart = this.actions.start

        // Select/View opens the map, the way a console game would. toggle()
        // already refuses while a minigame, a cutscene or another dialog owns
        // the screen, so there is nothing to guard here.
        const select = !!b[8]?.pressed
        if (select && !this._prevSelect) window.experience?.worldMap?.toggle?.()
        this._prevSelect = select

        this._navigateModals()
    }

    /**
     * Drive an open modal from the pad.
     *
     * A activates · B closes · D-PAD moves the selection · BUMPERS change tab ·
     * LEFT STICK scrolls.
     *
     * The "prev" edge flags are updated in ONE place at the end, not at each
     * early return. They used to be repeated at every exit, which is the shape
     * of bug that only shows up on the path somebody forgot: a held button
     * firing every frame because that branch never recorded it.
     */
    _navigateModals() {
        const lb = !!this._buttons[4]?.pressed
        const rb = !!this._buttons[5]?.pressed
        this._driveModal(lb, rb)
        this._prevA = this.actions.button2
        this._prevB = this.actions.back
        this._prevBumper = lb || rb
    }

    _driveModal(lb, rb) {
        if (this.suspendMenuNav) return

        // The project panel (carts) is NOT a .fz-modal-overlay — it closes on
        // Escape, so B forwards a synthetic Escape (works for drawer AND sheet,
        // which has no close button).
        if (document.querySelector('.fz-proj.is-open')) {
            if (this.actions.back && !this._prevB) {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
            }
            return
        }

        const overlay = document.querySelector('.fz-modal-overlay.is-open')
        if (!overlay) return

        // B closes FIRST — before any item checks. The trophy modal has only
        // links (no cards/buttons), and the old "no items → return" bailed out
        // before ever reaching the close branch.
        if (this.actions.back && !this._prevB) {
            overlay.querySelector('.fz-modal-close')?.click()
            return
        }

        // "Is it laid out", not "is it painted". The overlay animates its own
        // `visibility` as it fades in, and that inherits -- so for the first
        // quarter second after a panel opens, a computed-style check calls
        // every control inside it hidden and the pad does nothing. Press a
        // bumper the moment the settings appear and it was simply ignored.
        // Client rects exist as soon as the thing has a box, which is the
        // question actually being asked; display:none still has none.
        const visible = (el) => el.getClientRects().length > 0 && !el.disabled

        // ── Bumpers: straight to the next tab ────────────────────────────
        // Tabs are reachable by walking the selection too, but on the settings
        // panel that means stepping through every card and slider in between
        // to reach the row at the top. A bumper is what a player already
        // expects to mean "next tab".
        // The MODAL's own tab row, not every pill that shares its class. The
        // panels build their own rows out of the same parts -- the language
        // picker in General, the device picker in Controles -- so collecting
        // all of them put "Teclado" immediately after "Controles" in the
        // ring: a bumper on the last tab switched the input device instead of
        // wrapping round to the first, and the tabs looked stuck.
        const navs = [...overlay.querySelectorAll('.fz-settings-nav')]
        const mainNav = navs.find((n) => !n.closest('.fz-settings-content')) || navs[0]
        const tabs = mainNav ? [...mainNav.querySelectorAll('.fz-settings-tab')].filter(visible) : []
        if (tabs.length > 1 && (lb || rb) && !this._prevBumper) {
            const at = tabs.findIndex((t) => t.classList.contains('is-active'))
            const from = at === -1 ? 0 : at
            tabs[(from + (rb ? 1 : -1) + tabs.length) % tabs.length].click()
            return
        }

        // ── Left stick: scroll the panel ─────────────────────────────────
        this._scrollModal(overlay)

        const items = [...overlay.querySelectorAll('.fz-card, .fz-btn, .fz-settings-tab, a.fz-cert')].filter(visible)
        if (!items.length) return

        if (this.actions.button2 && !this._prevA) {
            const cur = items.includes(document.activeElement) ? document.activeElement : items[0]
            cur?.click()
            return
        }

        // ── D-pad: move the selection ────────────────────────────────────
        if (items.length < 2) return
        let dir = 0
        if (this._buttons[15]?.pressed || this._buttons[13]?.pressed) dir = 1   // right / down
        else if (this._buttons[14]?.pressed || this._buttons[12]?.pressed) dir = -1 // left / up
        if (dir === 0) return

        const now = performance.now()
        if (now - this._navAt <= NAV_COOLDOWN_MS) return
        this._navAt = now
        const i = items.indexOf(document.activeElement)
        const ni = i === -1 ? 0 : (i + dir + items.length) % items.length
        items[ni].focus()
    }

    /**
     * Scroll the modal's body with the left stick.
     *
     * .fz-modal-body is the part that scrolls in every modal built on the
     * shared Modal — the title and the hint bar stay pinned around it — so
     * this needs no per-panel knowledge. Does nothing when the content fits.
     */
    _scrollModal(overlay) {
        const body = overlay.querySelector('.fz-modal-body')
        if (!body || body.scrollHeight <= body.clientHeight + 1) return

        // movement.y is up-positive and movement.force is the deflection, so
        // the product is the signed push; negated because pushing down has to
        // move the content up.
        const push = -this.movement.y * this.movement.force
        if (Math.abs(push) < SCROLL_DEADZONE) return

        const dt = Math.min((window.experience?.time?.delta ?? 16) * 0.001, 0.1)
        body.scrollTop += push * SCROLL_PX_PER_SEC * dt
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
