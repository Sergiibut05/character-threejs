/**
 * InputDevice — remembers which input is being used RIGHT NOW:
 *   'keyboard' | 'gamepad' | 'touch'
 *
 * Source of truth for adaptive UI (which button glyph to show, which controls to
 * highlight). See UI_INPUT_PLAN.md §1.1 / §2.
 *
 * - keydown / mouse pointerdown → 'keyboard' (desktop keyboard+mouse context)
 * - touch pointerdown          → 'touch'
 * - gamepad activity           → 'gamepad'  (GamepadControls calls set('gamepad'))
 */
export default class InputDevice {
    constructor() {
        const touchDefault =
            ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
            (window.innerWidth < 768 || window.innerHeight < 768)
        this.device = touchDefault ? 'touch' : 'keyboard'
        this._cbs = new Set()

        this._onKey = () => this.set('keyboard')
        this._onPointer = (e) => this.set(e.pointerType === 'touch' ? 'touch' : 'keyboard')
        window.addEventListener('keydown', this._onKey, true)
        window.addEventListener('pointerdown', this._onPointer, true)
    }

    set(device) {
        if (device === this.device) return
        this.device = device
        for (const cb of this._cbs) { try { cb(device) } catch (e) { /* ignore */ } }
    }

    /** Subscribe to device changes; returns an unsubscribe fn. */
    onChange(cb) { this._cbs.add(cb); return () => this._cbs.delete(cb) }

    isTouch() { return this.device === 'touch' }
    isGamepad() { return this.device === 'gamepad' }
    isKeyboard() { return this.device === 'keyboard' }

    destroy() {
        window.removeEventListener('keydown', this._onKey, true)
        window.removeEventListener('pointerdown', this._onPointer, true)
        this._cbs.clear()
    }
}
