/**
 * Stylized Water — TSL (full rewrite, replaces WaterShader.js)
 * ------------------------------------------------------------
 * One material that reads as river AND sea/shore. Pure visual, cheap:
 * a single depth-buffer read + a few value-noise taps per pixel.
 *
 * Everything is keyed on the WORLD-SPACE water column height ("depth"),
 * reconstructed from the depth buffer — camera-invariant, so nothing swims
 * or changes with distance/angle.
 *
 *   1. SHORE CORE — an *unconditionally solid* white line wherever the water
 *      meets ground/objects (depth → 0). This is what kills the ugly
 *      geometric intersection cuts: the seam is always covered by opaque
 *      foam. Its outer boundary is wobbled by animated noise so it reads as
 *      a living waterline, but the core near depth 0 can never be eaten.
 *   2. FLOWING FOAM BANDS — thin stepped white lines that travel toward the
 *      shore (fract(depth·freq + noise − time)), fading out as the water
 *      gets deep. They ring every island/rock/pillar automatically.
 *   3. CURRENT STREAKS — sparse, soft white marks drifting slowly over open
 *      water (two scrolling noises multiplied → thresholded). Subtle.
 *   4. COLOR & ALPHA — shallow→deep gradient; translucent near shore (the
 *      bed tints through), more solid when deep; foam is fully opaque.
 *   5. Distance fade for the infinite-floor illusion (kept from before).
 */
import {
    Fn, float, vec2, vec4,
    positionWorld, positionView, vertexStage,
    smoothstep, clamp, mix, length, max, min, pow, fract, abs, step,
    viewportDepthTexture, perspectiveDepthToViewZ,
    cameraNear, cameraFar, cameraWorldMatrix, screenUV, screenSize
} from 'three/tsl'

import { snoise } from './NoiseNodes.js'

export function createStylizedWaterNode(uniforms) {
    const {
        uTime,
        // Depth gradient
        uShallowColor, uDeepColor, uDepthMax, uDepthPower,
        // Foam (shared color)
        uFoamColor,
        // 1. Shore core
        uShoreWidth, uShoreNoiseScale, uShoreNoiseAmp,
        // 2. Flowing bands
        uBandZone, uBandCount, uBandSpeed, uBandThickness,
        uBandNoiseScale, uBandNoiseAmp, uBandStrength,
        // 3. Current streaks
        uStreakScale, uStreakSpeed, uStreakThreshold, uStreakStrength,
        // Alpha
        uOpacity, uShallowOpacity, uDeepOpacity,
        // Distance fade
        uFadeDistance, uFadeStrength, uCamXZ
    } = uniforms

    const worldPos = vertexStage(positionWorld)
    const viewPos = vertexStage(positionView)

    return Fn(() => {
        const wp = worldPos.xz

        // ── World-space water column height (camera-invariant) ──────────
        // Reconstruct the bed's world Y from the depth buffer and measure the
        // vertical gap to the surface. Real world units → stable everywhere.
        // The depth is sampled with a 5-tap cross and BILATERALLY averaged:
        // the raw buffer gives pixel stair-steps along the waterline (worse
        // over a low-poly bed), but a plain average bleeds the depth of
        // FOREGROUND objects (bridge, character) across their silhouettes and
        // paints a white halo around them. Each neighbour therefore only
        // counts when its depth is close to the centre tap's.
        const dz = (uv) => perspectiveDepthToViewZ(viewportDepthTexture(uv), cameraNear, cameraFar)
        const texel = vec2(1.5).div(screenSize)
        const center = dz(screenUV).toVar()
        const range = float(0.6) // max viewZ divergence (m) to join the average
        const acc = center.toVar()
        const cnt = float(1.0).toVar()
        const taps = [
            vec2(texel.x, 0.0), vec2(texel.x.negate(), 0.0),
            vec2(0.0, texel.y), vec2(0.0, texel.y.negate())
        ]
        for (const offset of taps) {
            const s = dz(screenUV.add(offset))
            const w = float(1.0).sub(step(range, abs(s.sub(center))))
            acc.addAssign(s.mul(w))
            cnt.addAssign(w)
        }
        const sceneViewZ = acc.div(cnt)
        const bedViewPos = viewPos.mul(sceneViewZ.div(viewPos.z))
        const bedWorldY = cameraWorldMatrix.mul(vec4(bedViewPos, 1.0)).y
        const depth = max(worldPos.y.sub(bedWorldY), float(0.0)).toVar()

        // ── Base gradient: shallow → deep ────────────────────────────────
        const depthT = pow(
            clamp(depth.div(max(uDepthMax, float(0.001))), 0.0, 1.0),
            uDepthPower
        ).toVar()
        const color = mix(uShallowColor, uDeepColor, depthT).toVar()

        // ── 1. Shore core — solid, alive, and NEVER broken ──────────────
        // The waterline noise only pushes the OUTER boundary of the band in
        // and out over time; at depth≈0 the smoothstep is 0 → core = 1 solid.
        const shoreWobble = snoise(
            wp.mul(uShoreNoiseScale).add(vec2(uTime.mul(0.18), uTime.mul(-0.13)))
        ).mul(uShoreNoiseAmp)
        const shoreEdge = max(uShoreWidth.add(shoreWobble), float(0.015))
        // Tight transition (78% → 100% of the width) → crisp toon waterline
        // with just enough antialiasing, instead of a wide soft gradient.
        const shoreCore = float(1.0).sub(
            smoothstep(shoreEdge.mul(0.78), shoreEdge, depth)
        ).toVar()

        // ── 2. Flowing foam bands (travel toward the shore) ─────────────
        // Iso-lines of the depth field, animated: fract(d·count + n − t).
        // Wobbling the coordinate with world noise bends the rings organically.
        const dNorm = clamp(depth.div(max(uBandZone, float(0.001))), 0.0, 1.0)
        const bandNoise = snoise(
            wp.mul(uBandNoiseScale).add(vec2(uTime.mul(0.05), uTime.mul(0.04)))
        ).mul(uBandNoiseAmp)
        const bandCoord = dNorm.mul(uBandCount).add(bandNoise).sub(uTime.mul(uBandSpeed))
        const bandPhase = fract(bandCoord)
        // Soft, relaxed line profile: gentle rise, gentle fall.
        const line = smoothstep(float(1.0).sub(uBandThickness), float(1.0).sub(uBandThickness.mul(0.35)), bandPhase)
            .mul(float(1.0).sub(smoothstep(float(0.92), float(1.0), bandPhase)))
        // Bands live near the shore only, and get fainter as they get deeper.
        const bandFalloff = float(1.0).sub(smoothstep(float(0.15), float(1.0), dNorm))
        const bands = line.mul(bandFalloff).mul(uBandStrength).toVar()

        // ── 3. Current streaks over open water (subtle) ──────────────────
        const streakA = snoise(
            wp.mul(vec2(uStreakScale, uStreakScale.mul(2.6)))
                .add(vec2(uTime.mul(uStreakSpeed), 0.0))
        ).mul(0.5).add(0.5)
        const streakB = snoise(
            wp.mul(uStreakScale.mul(0.55))
                .add(vec2(uTime.mul(uStreakSpeed).negate().mul(0.7), uTime.mul(uStreakSpeed).mul(0.4)))
        ).mul(0.5).add(0.5)
        const streakField = streakA.mul(streakB)
        const openWater = smoothstep(float(0.55), float(1.0), dNorm) // only where deep
        const streaks = smoothstep(uStreakThreshold, uStreakThreshold.add(float(0.08)), streakField)
            .mul(openWater)
            .mul(uStreakStrength)

        // ── Combine foam layers ──────────────────────────────────────────
        const foam = clamp(max(max(shoreCore, bands), streaks), 0.0, 1.0).toVar()
        color.assign(mix(color, uFoamColor, foam))

        // ── Distance fade (infinite-floor illusion) ──────────────────────
        const dist = length(wp.sub(uCamXZ))
        const fade = float(1.0).sub(
            pow(clamp(dist.div(uFadeDistance), 0.0, 1.0), uFadeStrength)
        )

        // ── Alpha ─────────────────────────────────────────────────────────
        // Shallow water is translucent (bed tints through), deep is solid and
        // foam is fully opaque — the shore core therefore hides the raw
        // geometric seam completely.
        const baseAlpha = mix(uShallowOpacity, uDeepOpacity, depthT)
        const alpha = clamp(max(baseAlpha, foam), 0.0, 1.0).mul(uOpacity).mul(fade)

        return vec4(color, alpha)
    })()
}

/** Fresh defaults for the stylized water (see River.js). */
export function createStylizedWaterDefaults(uniform, THREE) {
    return {
        uTime: uniform(0),

        uShallowColor: uniform(new THREE.Color('#68d6c6')),
        uDeepColor: uniform(new THREE.Color('#1c6ba8')),
        uDepthMax: uniform(1.2),
        uDepthPower: uniform(0.25),     // low curve → deep colour dominates early

        uFoamColor: uniform(new THREE.Color('#ffffff')),

        uShoreWidth: uniform(0.075),
        uShoreNoiseScale: uniform(2.6),
        uShoreNoiseAmp: uniform(0.05),

        // Slow, relaxed bands hugging the shore.
        uBandZone: uniform(0.5),
        uBandCount: uniform(1.6),
        uBandSpeed: uniform(0.09),
        uBandThickness: uniform(0.32),
        uBandNoiseScale: uniform(1.3),
        uBandNoiseAmp: uniform(0.3),
        uBandStrength: uniform(0.55),

        uStreakScale: uniform(0.8),
        uStreakSpeed: uniform(0.05),
        uStreakThreshold: uniform(0.72),
        uStreakStrength: uniform(0.22),

        uOpacity: uniform(1.0),
        uShallowOpacity: uniform(0.95),
        uDeepOpacity: uniform(1.0),

        uFadeDistance: uniform(275),
        uFadeStrength: uniform(1.3),
        uCamXZ: uniform(new THREE.Vector2(0, 0))
    }
}
