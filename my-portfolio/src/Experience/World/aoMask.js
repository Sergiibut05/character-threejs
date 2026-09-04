import { mrt, float } from 'three/tsl'

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
 * that was fatal — sprites left dark rectangles all over the ground. For a mask
 * it is harmless: the worst case is a sprite writing "apply AO here", which is
 * the default anyway.
 */

/** The MRT attachment carrying the mask. Must match Renderer's scene pass. */
export const AO_MASK = 'aoMask'

const EXCLUDED = mrt({ [AO_MASK]: float(0) })

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
export function withAOMask(colorNode) {
    return mrt({ output: colorNode, [AO_MASK]: float(1) })
}
