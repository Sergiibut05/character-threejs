import { mrt, float, vec4, transformedNormalView } from 'three/tsl'

/**
 * Letting a surface opt OUT of ambient occlusion.
 *
 * Screen-space AO and alpha-tested foliage do not get along. A tree crown here
 * is dozens of overlapping cards with cut-out leaf shapes, so the depth buffer
 * across it is a field of tiny cliffs — and AO faithfully shades every one of
 * them. The result is not shadow, it is speckle: the flat clean blobs of colour
 * the art is made of come out looking dirty.
 *
 * Nothing tuned that away, because it is not noise. It is the effect working
 * exactly as specified on geometry it was never meant for.
 *
 * So the foliage stops RECEIVING occlusion. It still CASTS it — the AO is read
 * off the depth buffer, which the leaves are still in, so the ground under a
 * tree darkens as it should. Only the leaves themselves are spared.
 *
 * Done with a mask channel rather than by excluding the trees from the pass:
 * the scene pass writes 1 everywhere by default, a material can override its
 * own pixels to 0, and the renderer blends the occlusion toward "none" wherever
 * it reads 0.
 *
 * A note on why a MASK and not the normals buffer, which is the obvious other
 * use of MRT here: transparent effects draw with depthWrite off, so they write
 * their channel while leaving the depth of whatever is behind them. For normals
 * that was fatal — sprites left dark rectangles all over the ground.
 *
 * This file used to claim that was harmless for a mask, because "the worst case
 * is a sprite writing 'apply AO here', which is the default anyway". That was
 * wrong, and it is worth spelling out why, because it is the whole reason for
 * the second rule below.
 *
 * The default is only 1 where nothing has opted out. Over a tree crown the
 * default is 0 — and a music note drifting across that crown was writing 1 back
 * over it while contributing no depth of its own. So AO got computed there from
 * the LEAF depth, which is the cliff-edged mess this mask exists to avoid, and
 * applied in the shape of the note: a dark rim tracing the note's silhouette
 * with a smear of shadow trailing off it.
 *
 * Hence the second rule: A MATERIAL THAT DOES NOT WRITE DEPTH DOES NOT GET A
 * SAY — it must ABSTAIN, which is not the same as voting 0.
 *
 * Voting 0 was the first attempt and it is just as wrong, in the other
 * direction. The mask attachment has no blending by default, so a sprite
 * overwrites its whole QUAD, not the shape of the glyph. Notes drifting past
 * the house wall stopped being a dark rim and became a bright rectangle: AO
 * switched off across a square of wall that was supposed to be shaded.
 *
 * Abstaining is done with the alpha channel. The alpha of an MRT output is its
 * blend factor, so alpha 0 contributes nothing and leaves whatever the opaque
 * geometry wrote. That needs the attachment to actually be blended, which is
 * set up on the scene pass — see Renderer.js. Opaque materials are not blended
 * at all, so they still write the mask outright; only the depth-less ones fall
 * through.
 */

/** The MRT attachment carrying the mask. Must match Renderer's scene pass. */
export const AO_MASK = 'aoMask'

/**
 * The MRT attachment carrying view-space surface normals.
 *
 * GTAO sweeps horizons around each pixel RELATIVE TO ITS NORMAL, so the normal
 * is not a refinement -- it is half the input. It used to be rebuilt from the
 * depth buffer, and that is fine in the middle of a surface and worthless at
 * the edge of one: a reconstruction straddling a silhouette is differencing two
 * surfaces metres apart, and `cross(dpdx, dpdy)` on that is noise. Noise in the
 * normal at exactly the silhouette is a band of wrong occlusion tracing the
 * outline -- the halo.
 *
 * The real normals were available all along and could not be used, because a
 * plain MRT attachment is overwritten by every draw: the transparent effects,
 * which contribute no depth, were stamping their own normals over the surfaces
 * behind them and leaving dark rectangles on the ground. That is what sent this
 * file down the depth-reconstruction road in the first place.
 *
 * Abstention fixes it for this attachment exactly as it fixed the mask, and for
 * the same reason -- see the rule above. Now that a material can decline to
 * write, only real geometry does.
 */
export const AO_NORMAL = 'normal'

/**
 * "I opt out of occlusion." Alpha 1, so it lands.
 *
 * The alpha of an MRT output is its BLEND FACTOR, not data -- see the note on
 * the scene pass in Renderer.js. Writing float(0) here would splat to
 * vec4(0,0,0,0), which happens to work only because the foliage is opaque and
 * therefore not blended at all. Spelling the alpha out means it keeps working
 * if that ever changes.
 */
const EXCLUDED = mrt({ [AO_MASK]: vec4(0, 0, 0, 1) })

/**
 * "I have no opinion." Alpha 0, so it contributes nothing and the value
 * underneath survives untouched.
 */
const NEUTRAL = mrt({
    [AO_MASK]: vec4(0, 0, 0, 0),
    [AO_NORMAL]: vec4(0, 0, 0, 0),
})

/**
 * Set ONCE, at material creation, and never touched again — which is why the
 * scene pass writes this channel on BOTH quality levels even though only high
 * reads it.
 *
 * The tempting version toggles the node with the quality setting and costs low
 * quality nothing. It also does not work: swapping mrtNode on a live material
 * changes the shape of its fragment output, and asking for that mid-session
 * left every tree a bare trunk — the foliage recompiled against a pass whose
 * attachments no longer matched and stopped writing colour at all.
 *
 * A single-channel attachment written and ignored is a cheap price for a
 * material that never has to be rebuilt.
 *
 * Works on plain materials too, not just node ones: three converts a
 * SpriteMaterial or MeshBasicMaterial to its node equivalent by copying
 * every enumerable property across, and this is one.
 *
 * @param {THREE.Material} material  a NodeMaterial that should not be shaded
 *   by ambient occlusion
 */
export function excludeFromAO(material) {
    if (!material) return
    material.mrtNode = EXCLUDED
}

/**
 * The same channel, for a material that writes its own fragment output.
 *
 * A material that sets `fragmentNode` takes a different branch inside three:
 * the whole MRT step is skipped, so it never learns the pass has a second
 * attachment. Its shader comes out with one output against a two-output target
 * and the pipeline is rejected outright — the object is simply not drawn, with
 * "no corresponding fragment stage output ... targets[1]" in the console. That
 * is how the grass and the river vanished.
 *
 * That branch does honour a fragmentNode which is already an output STRUCT, so
 * declaring both channels by hand puts these materials back in step.
 *
 * IF YOU ADD A MATERIAL THAT SETS fragmentNode, WRAP IT IN THIS. There are four
 * today: Grass, Ground, GroundPerlin and River.
 *
 * @param {Node} colorNode  what the material would have assigned directly
 */
export function withAOMask(colorNode, { writesDepth = true, receivesAO = 1 } = {}) {
    // All THREE attachments, not just the two that concern this file.
    //
    // An MRTNode is an output struct, so three uses it as the fragment output
    // VERBATIM rather than merging it with the pass -- which means anything
    // missing here is simply not written, and a shader with fewer outputs than
    // the target has attachments is rejected outright. That is how the grass
    // and the river vanished twice. If the scene pass ever grows a fourth
    // attachment, it has to be added here on the same day.
    return mrt({
        output: colorNode,
        // Not a switch. The renderer composites with
        // `mix(1, occlusion, mask)`, so this channel is a BLEND FACTOR: 1 takes
        // the full occlusion, 0 takes none, and everything between is a valid
        // "how much of it does this surface want". Partial costs exactly the
        // same as full -- it is the same write to the same attachment -- which
        // makes it the right knob for a surface like grass, where the occlusion
        // is not wrong, just too assertive for what the blades are.
        [AO_MASK]: float(receivesAO),
        // The normal follows the same rule as everything else: only a surface
        // that contributes DEPTH may state one. The river is the exception here
        // -- it draws with depthWrite off, so stating its normal would stamp
        // the water surface over the normals of the bed underneath while GTAO
        // still reads the bed's depth, and occlusion computed from a depth and
        // a normal belonging to different surfaces is exactly the artefact this
        // file exists to prevent.
        [AO_NORMAL]: writesDepth
            ? vec4(transformedNormalView, 1)
            : vec4(0, 0, 0, 0),
    })
}

/**
 * The safety net for the second rule.
 *
 * Calling excludeFromAO() where a material is built says WHY at the place it
 * matters, and that is still how this should be done. But it only covers
 * materials this code writes. Several of the offenders do not qualify: some
 * arrive already configured inside a .glb, and any effect added later starts
 * out not knowing the rule. Those are exactly the ones that would put the dark
 * rim back, and nobody would connect it to a file they never opened.
 *
 * So the rule is also enforced from the outside, once every half second or so.
 * A traverse of a few thousand objects doing a property comparison is far below
 * the noise floor of a frame here, and it is bounded work at a fixed cadence
 * rather than something that grows.
 *
 * Deliberately NOT memoised behind a WeakSet: a material is allowed to turn
 * depthWrite off at runtime, and a cache keyed on first sight would miss it
 * forever. Re-reading a boolean is cheaper than being wrong.
 *
 * Runs on BOTH quality tiers even though only high reads the mask, for the same
 * reason the scene pass writes the channel on both: a material that gains
 * mrtNode changes the shape of its fragment output and has to be recompiled,
 * and the moment to discover that is not halfway through a quality switch.
 *
 * @param {THREE.Object3D} root  usually the scene
 */
export function sweepDepthlessFromAO(root) {
    root.traverse((object) => {
        const material = object.material
        if (!material) return
        if (Array.isArray(material)) {
            for (const m of material) _applyIfDepthless(m)
        } else {
            _applyIfDepthless(material)
        }
    })
}

function _applyIfDepthless(material) {
    if (!material || material.mrtNode || material.fragmentNode) return
    // colorWrite: false writes no attachment at all, mask included, so those
    // are already harmless -- SitPoints' invisible collider proxies are the
    // ones this skips.
    if (material.depthWrite !== false || material.colorWrite === false) return
    material.mrtNode = NEUTRAL
}

/**
 * The opt-OUT's quieter sibling: for anything drawn without a depth write.
 *
 * Says nothing about occlusion rather than turning it off, so the surface
 * behind keeps whatever it decided for itself. This is what every sprite,
 * decal and effect wants.
 *
 * @param {THREE.Material} material  a material with depthWrite: false
 */
export function ignoreAO(material) {
    if (!material) return
    material.mrtNode = NEUTRAL
}
