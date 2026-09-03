import './ui.css'

/**
 * InputGlyph — renders the physical button for a semantic action, adapted to the
 * active input device (plan §1.2). Follows the game aesthetic; gamepad buttons
 * use Xbox colours.
 *
 *   inputGlyph('confirm')            → <span> for the current device
 *   inputGlyph('aim', 'gamepad')     → left-stick glyph
 *
 * Actions: confirm · back · sprint · move · aim · tilt · power · interact · continue
 * Mapping: confirm/continue/power/interact = A/Enter/tap · back = B/Esc · sprint = X/Shift ·
 *          move/aim/tilt = stick / WASD-◀▶ / joystick.
 */

// Gamepad face button → [letter, colour-class] (Xbox colours)
const PAD = { confirm: ['A', 'a'], back: ['B', 'b'], sprint: ['X', 'x'] }
const PAD_A = ['A', 'a']
// Keyboard labels
const KEY = {
    confirm: 'Enter', continue: 'Enter', power: 'Enter', interact: 'Enter',
    back: 'Esc', sprint: 'Shift', aim: '◀ ▶', tilt: '◀ ▶', move: 'WASD'
}
const STICK_ACTIONS = new Set(['move', 'aim', 'tilt'])

const SVG_STICK = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
  <circle cx="12" cy="12" r="3.4" fill="currentColor"/>
</svg>`
const SVG_TOUCH = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
  <path d="M9 11V6.5a1.6 1.6 0 0 1 3.2 0V11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M12.2 11V9.4a1.5 1.5 0 0 1 3 0V11M15.2 11v-.6a1.5 1.5 0 0 1 3 0V15a4.5 4.5 0 0 1-4.5 4.5h-1.6a4.5 4.5 0 0 1-3.6-1.8l-2-2.6a1.5 1.5 0 0 1 2.3-1.9l1 1.1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

/** @returns {HTMLSpanElement} */
export function inputGlyph(action, device) {
    device = device || window.experience?.input?.device || 'keyboard'

    if (device === 'gamepad') {
        if (STICK_ACTIONS.has(action)) return _el('fz-glyph fz-glyph--pad fz-glyph--stick', SVG_STICK, true)
        const [letter, color] = PAD[action] || PAD_A
        return _el(`fz-glyph fz-glyph--pad fz-glyph--${color}`, letter)
    }

    if (device === 'touch') {
        // Moving, aiming and tilting on a phone are the on-screen JOYSTICK, not
        // a tap. Showing the tap hand for those said the wrong thing: it is the
        // same stick the pad has, drawn on glass. Everything else really is a
        // tap, and keeps the hand.
        if (STICK_ACTIONS.has(action)) return _el('fz-glyph fz-glyph--touch', SVG_STICK, true)
        return _el('fz-glyph fz-glyph--touch', SVG_TOUCH, true)
    }

    return _el('fz-glyph fz-glyph--key', KEY[action] || '')
}

function _el(className, content, isHtml = false) {
    const span = document.createElement('span')
    span.className = className
    if (isHtml) span.innerHTML = content
    else span.textContent = content
    return span
}
