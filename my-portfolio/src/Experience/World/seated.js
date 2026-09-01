import Experience from '../Experience.js'

/**
 * Who owns the interact key when a seat and something else both want it.
 *
 * Two problems, one rule.
 *
 * The first is being SAT DOWN. Sitting is the only state you cannot walk out
 * of, so leaving everything else live means one press can open a panel while
 * you are seated — and that panel locks movement on top of a stand-up
 * animation that never ran. Seated, nothing but standing up answers.
 *
 * The second is the press that puts you there. Standing in front of the
 * interior sofa you are inside the sofa's sit radius AND the Nintendo Switch's,
 * so ONE Enter both sat you down and opened the games panel — and which won
 * came down to the order their keydown listeners happened to be registered in.
 * That is the sofa bug.
 *
 * So when both are on offer the CLOSER one wins, and it is enforced from BOTH
 * sides: props ask seatOwnsInteract() before acting or lighting up, and
 * SitPoints asks seatYieldsToRival() before sitting you. One-sided was worse
 * than either extreme — the Switch would light up promising something, and
 * the press would sit you down instead.
 *
 * Ranking by distance rather than letting seats win outright matters for one
 * real spot: a bench sits 2.25 from the front door, inside the door's 2.4
 * reach, and a blanket seat-first rule would make the main entrance refuse to
 * open from a step away.
 *
 * Distances are measured on the floor plane, for the same reason prop
 * proximity is: the character's origin rides ~0.9 above the ground, and a
 * console on a low shelf would otherwise lose most of its reach to height.
 *
 * Read live, never cached — sitting happens between frames.
 */

/**
 * Should `rivalPosition` keep quiet because a seat has the key?
 *
 * @param {{x:number,z:number}} [rivalPosition]  the caller's own position. Omit
 *   for a zone-shaped interactive with no single point; only the already-seated
 *   half of the rule then applies.
 */
export function seatOwnsInteract(rivalPosition) {
    const world = new Experience().world
    const sit = world?.sitPoints
    if (!sit) return false
    if (sit.active) return true          // sat down: nothing else, ever

    const seat = sit.nearest             // the seat currently on offer, if any
    const character = world.character
    if (!seat || !character || !rivalPosition) return false
    return floorDist(seat.position, character.position)
        <= floorDist(rivalPosition, character.position)
}

/**
 * The mirror: should the seat keep quiet because you are stood at something
 * else? Called by SitPoints before it sits you down.
 *
 * The candidate list is written out rather than discovered, because the things
 * that compete for this key are a short, deliberate set — and an interactive
 * that forgets to appear here simply keeps today's behaviour (the seat wins)
 * rather than breaking. Only ones reporting themselves in reach are counted,
 * and that reach is plain geometry, never itself filtered by this rule — if it
 * were, the two halves would each be waiting on the other.
 */
export function seatYieldsToRival(seat) {
    const world = new Experience().world
    const character = world?.character
    if (!seat || !character) return false

    const seatDist = floorDist(seat.position, character.position)
    const closer = (o) => o && (o.isNear || o.isHovered) && o.position
        && floorDist(o.position, character.position) < seatDist

    if (closer(world.mailbox) || closer(world.door) || closer(world.ball)) return true
    if (closer(world.scoreboardInteractive)) return true
    for (const cart of world.projectCarts?.carts || []) if (closer(cart)) return true

    const house = world.houseInterior
    if (house?.isInside) {
        if (closer(house)) return true                    // the exit rug
        if (closer(house.lamp)) return true
        for (const rec of house._props || []) if (!rec.spent && closer(rec)) return true
    }
    return false
}

function floorDist(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z)
}
