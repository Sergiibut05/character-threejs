/**
 * Who owns a key when the character and something else both want it.
 *
 * The character walks on WASD *and* the arrows, and neither set is his alone.
 * The arrows also step through the social ring; all four of them, plus every
 * letter, also drive the three-initials picker on the leaderboard. Nothing
 * arbitrated that, so the same press did two things at once: cycling to the
 * next network walked you off the pedestal, and typing "WAD" into the
 * scoreboard walked you across the island while you did it.
 *
 * Two shapes of claim, because there are genuinely two.
 *
 * EXCLUSIVE — a piece of UI that has the keyboard for as long as it is open.
 * The name picker is this: while it is up, no key means walking, whatever it
 * is. Claims are counted rather than flagged so two overlapping owners cannot
 * have the first one to close hand the keyboard back on behalf of both.
 *
 * PARTIAL — a claim on specific keys while the world carries on around it.
 * The social ring is this: standing in it, left and right belong to the ring,
 * but you can still walk out with the other keys. That one lives in
 * SocialArea.js next to the state it reads, in the same shape as
 * seatOwnsInteract() in seated.js, and Character consults both.
 *
 * Read live, never cached: what is open changes between frames.
 */

/** Owners currently holding the whole keyboard. */
const exclusive = new Set()

/**
 * Take the keyboard until the returned function is called.
 *
 * @param {object} owner  anything unique; identifies this claim
 * @returns {Function} release — safe to call twice
 */
export function claimKeyboard(owner) {
    exclusive.add(owner)
    return () => exclusive.delete(owner)
}

/** Is some piece of UI holding the whole keyboard right now? */
export function keyboardTaken() {
    return exclusive.size > 0
}
