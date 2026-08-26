import * as THREE from 'three'

/**
 * Sitting pose for the dog rig.
 *
 * The GLB only ships `idle`, `walk`, `run`, `jump_start` and `jump_end` — there
 * is no sit clip to play. Rather than author one, this is an ADDITIVE layer
 * over whatever the mixer just wrote: each entry is a local-space delta
 * quaternion, so `bone.quaternion.multiply(delta)` bends the rest pose into a
 * sit while the idle clip keeps breathing underneath it. Blend it in with a
 * weight and the dog stands up and sits down smoothly.
 *
 * The deltas were solved offline against `idle` at t=0, in terms of the world
 * pitch each bone should hold once seated:
 *
 *   spine        body -33°, and NOTHING else in the torso
 *   neck         neck0 -19.8°, neck1 -8.9°, head 0°  (head ends up level)
 *   front legs   top0 -16.2°, top1 0°  → vertical again, as when standing
 *   hind legs    femur -73°, tibia -46°, metatarsus -88.5°, rolled away from
 *                the midline by 3° / 7° / 1° — femur, tibia, metatarsus
 *
 * This is a STYLISED dog, and the hind legs are where that matters. Two things
 * were tried and rejected on the way here:
 *
 *   - No roll at all. The segments are not dog-shaped — femur 5.8, tibia 5.2,
 *     but metatarsus 14.1 — so folding in the sagittal plane alone leaves the
 *     one long segment flat on the floor while the short femur and tibia
 *     vanish behind the flank: a foot poking out of the belly, knee sucked
 *     inward. A little roll swings the haunch clear so the fold reads. A lot
 *     of roll (16° was tried) splays him out like a frog.
 *
 *     The roll is per-segment rather than one value for the chain, and that
 *     is the point: rolling the femur is what pushes the THIGH out, and the
 *     thigh is the bulky part. Holding the femur near-straight (3°) and
 *     paying most of the abduction at the tibia (7°) tucks the haunch in
 *     while the hock and paw stay where they were. The window is narrow:
 *     at 1° the thigh is visibly over-tucked, and the knee has to keep a few
 *     units of clearance on the flank (it has ~3.5 here) or it sinks back in.
 *   - The anatomical hock. Real dogs sit with the hock behind the knee, and
 *     building that zigzag in is exactly what it sounds like: a kink in the
 *     leg. Here the tibia simply drops from the knee and the foot goes
 *     forward — one clean bend, which is what the drawing wants.
 *
 * Three more rules kept the mesh from tearing, all learnt the hard way:
 *
 *   1. NEVER split the torso. An earlier pass bent body/body_top0/body_top1 to
 *      -60/-45/-35 to curve the spine; every one of those joints is inside the
 *      ribcage, and the chest folded in on itself. Pitching the whole torso as
 *      one rigid piece and paying for it at the neck and shoulders — real
 *      joints, with weights built for bending — is what a sit actually is.
 *   2. Spread a counter-rotation over the joints that have one. Pinning the
 *      front legs upright in a single 45° twist at the shoulder wrung the
 *      upper leg like a candy wrapper; half at top0 and half at top1 does not.
 *   3. Do not drop the hips all the way to the floor. At -45° the hip sat 5
 *      rig units up, and femur + tibia had to double back on themselves to
 *      fit — the thigh collapsed into a lump with the shank poking out of it
 *      like a stick. -33° leaves the hip at 9.5, which the leg folds into
 *      cleanly, and the rump still reads as resting.
 *
 * Because the deltas are LOCAL they are independent of the hierarchy and of
 * where the idle clip happens to be — the pose reads identically at any point
 * in the loop.
 */
export const SIT_POSE = {
    body: [-0.284015, 0.000000, 0.000000, 0.958820],
    neck0: [0.114928, 0.001340, 0.000478, 0.993373],
    neck1: [0.094966, 0.001233, 0.000801, 0.995479],
    head0: [0.077551, 0.002427, -0.000183, 0.996985],
    leg_front_left_top0: [-0.033977, 0.141448, -0.013348, 0.989272],
    leg_front_right_top0: [-0.038381, -0.140266, 0.013874, 0.989272],
    leg_front_left_top1: [0.135069, -0.039843, 0.004689, 0.990024],
    leg_front_right_top1: [0.133868, 0.042943, -0.009404, 0.990024],
    leg_hind_left_top1: [-0.341711, -0.007599, -0.027545, 0.939371],
    leg_hind_right_top1: [-0.341788, -0.020187, 0.018876, 0.939371],
    leg_hind_left_bot0: [0.234539, -0.001626, -0.025242, 0.971778],
    leg_hind_right_bot0: [0.234554, 0.023125, 0.009897, 0.971778],
    leg_hind_left_ankle: [-0.322795, -0.026047, 0.169899, 0.930731],
    leg_hind_right_ankle: [-0.324646, 0.033503, -0.164995, 0.930731]
}

/**
 * How much higher the paws sit in rig space once seated — folding the hind legs
 * and pitching the spine lifts the whole contact plane. Multiply by the model's
 * scale and lower the model by that much, or the dog hovers.
 */
export const SIT_RIG_LIFT = 14.23

/** Exponential blend rate for standing up / sitting down. */
export const SIT_BLEND_SPEED = 7

/**
 * Resolve the pose against a loaded rig once, at setup time.
 *
 * `base` is the last value the MIXER put on the bone. It exists because the
 * layer cannot simply multiply itself onto whatever the bone currently holds:
 * AnimationMixer skips writing a track whose mixed value has not changed since
 * it last wrote it, so on any frame it stays quiet the bone still carries our
 * previous result — and multiplying again turns a sit into a bone spinning
 * like a fan within a couple of seconds. Keeping the mixer's own value aside
 * and always composing from THAT makes the layer idempotent.
 *
 * @returns {{ bone: THREE.Bone, delta: THREE.Quaternion, base: THREE.Quaternion }[]}
 */
export function collectSitBones(root) {
    const out = []
    for (const [name, q] of Object.entries(SIT_POSE)) {
        const bone = root.getObjectByName(name)
        if (!bone) continue
        out.push({
            bone,
            delta: new THREE.Quaternion().fromArray(q),
            base: bone.quaternion.clone()
        })
    }
    return out
}

const _q = new THREE.Quaternion()

/**
 * Hand the bones back to the mixer, exactly as it left them. Call this BEFORE
 * `mixer.update()` — it both undoes last frame's layer and keeps the mixer's
 * "did this change?" bookkeeping honest.
 */
export function beginSitFrame(bones) {
    for (const e of bones) e.bone.quaternion.copy(e.base)
}

/**
 * Take note of what the mixer just wrote, then lay the sit over it. Call this
 * AFTER `mixer.update()`.
 * @param {number} weight  0 = standing, 1 = fully seated
 */
export function endSitFrame(bones, weight) {
    for (const e of bones) e.base.copy(e.bone.quaternion)
    applySitPose(bones, weight)
}

/**
 * Re-apply the layer over the stored base without re-reading the bones. For
 * snapping the pose outside the animation loop, where no mixer tick has run.
 */
export function applySitPose(bones, weight) {
    const off = weight <= 0.0001
    const full = weight >= 0.9999
    for (const e of bones) {
        e.bone.quaternion.copy(e.base)
        if (off) continue
        e.bone.quaternion.multiply(full ? e.delta : _q.set(0, 0, 0, 1).slerp(e.delta, weight))
    }
}
