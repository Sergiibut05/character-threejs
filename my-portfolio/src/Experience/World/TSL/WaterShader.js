/**
 * Water Shader – TSL (Anime / Cel-Shaded Voronoi)
 * Port of cortiz2894/water-anime-shader to Three.js TSL.
 *
 * Algorithm:
 *   1. World XZ → fBm noise distortion → Voronoi UV
 *   2. Voronoi F1 (nearest cell) and SmoothF1 (polynomial smooth-min)
 *   3. Edge = F1 − SmoothF1 → cel-shaded threshold → 3-stop color ramp
 *   4. Camera distance fade for infinite-floor illusion
 *
 * Shadow variant (agua001/agua002):
 *   - Same Voronoi, wider threshold
 *   - Black + blue transparent, no distance fade
 */
import {
    Fn, float, vec2, vec3, vec4,
    positionWorld, positionView, vertexStage,
    sin, abs, floor, fract, exp,
    smoothstep, clamp, mix, dot, length,
    min, max, step, pow,
    viewportDepthTexture, perspectiveDepthToViewZ,
    cameraNear, cameraFar
} from 'three/tsl'

// ── 2D hash for Voronoi cell seeds ──────────────────────────────────────────
const hash2 = Fn(([p]) => {
    const px = dot(p, vec2(127.1, 311.7))
    const py = dot(p, vec2(269.5, 183.3))
    return vec2(
        fract(sin(px).mul(43758.5453)),
        fract(sin(py).mul(43758.5453))
    )
})

// ── Polynomial smooth-min (k = blend radius) ───────────────────────────────
const smin = Fn(([a, b, k]) => {
    const h = max(k.sub(abs(a.sub(b))), 0.0).div(k)
    return min(a, b).sub(h.mul(h).mul(h).mul(k).div(6.0))
})

// ── Animated cell position (same random offset in both F1 and SF1) ──────────
const cellPt = Fn(([seed, time, cellSpeed]) => {
    const phaseX = time.mul(cellSpeed).add(float(6.2831).mul(seed.x))
    const phaseY = time.mul(cellSpeed).add(float(6.2831).mul(seed.y))
    return vec2(
        float(0.5).add(float(0.5).mul(sin(phaseX))),
        float(0.5).add(float(0.5).mul(sin(phaseY)))
    )
})

// ── Voronoi F1: nearest-cell Euclidean distance ─────────────────────────────
const voronoiF1 = Fn(([p, time, cellSpeed]) => {
    const i = floor(p)
    const f = fract(p)
    const md = float(8.0).toVar()

    const offsets = [
        vec2(-1, -1), vec2(0, -1), vec2(1, -1),
        vec2(-1, 0), vec2(0, 0), vec2(1, 0),
        vec2(-1, 1), vec2(0, 1), vec2(1, 1)
    ]

    for (const n of offsets) {
        const pt = cellPt(hash2(i.add(n)), time, cellSpeed)
        md.assign(min(md, length(n.add(pt).sub(f))))
    }

    return md
})

// ── Voronoi SmoothF1: smooth-min over all cell distances ────────────────────
const voronoiSF1 = Fn(([p, time, cellSpeed, smoothness]) => {
    const i = floor(p)
    const f = fract(p)
    const res = float(8.0).toVar()

    const offsets = [
        vec2(-1, -1), vec2(0, -1), vec2(1, -1),
        vec2(-1, 0), vec2(0, 0), vec2(1, 0),
        vec2(-1, 1), vec2(0, 1), vec2(1, 1)
    ]

    for (const n of offsets) {
        const pt = cellPt(hash2(i.add(n)), time, cellSpeed)
        res.assign(smin(res, length(n.add(pt).sub(f)), smoothness))
    }

    return res
})

import { snoise } from './NoiseNodes.js'

// ── 2-octave fBm ───────────────────────────────────────────────────────────
const fbm = Fn(([p]) => {
    // Map snoise [-1..1] to [0..1] to match the old vnoise range
    const noise1 = snoise(p).mul(0.5).add(0.5)
    const noise2 = snoise(p.mul(2.0)).mul(0.5).add(0.5)
    return float(0.5).mul(noise1).add(float(0.25).mul(noise2))
})

// ── Core: noise distortion + Voronoi F1−SF1 edge detection ─────────────────
const computeAnimeVoronoi = Fn(([
    wp, time, scale, smoothness, cellSpeed,
    flowX, flowZ, noiseScale, noiseFlowSpeed, distortAmount
]) => {
    const noiseUV = wp.mul(noiseScale).add(vec2(time.mul(noiseFlowSpeed), 0.0))
    const noiseFac = fbm(noiseUV)
    const dv = noiseFac.sub(0.5).mul(distortAmount)
    const distort = vec2(dv, dv)

    const vuv = wp.mul(scale)
        .add(vec2(flowX, flowZ).mul(time))
        .add(distort)

    const f1 = voronoiF1(vuv, time, cellSpeed)
    const sf1 = voronoiSF1(vuv, time, cellSpeed, smoothness)

    return f1.sub(sf1)
})

/**
 * Anime water surface — 3-stop color ramp with cel-shaded edges
 * and screen-space depth intersection (white line + soft glow where
 * geometry crosses the water plane).
 */
export function createWaterColorNode(uniforms) {
    const {
        uTime, uScale, uSmoothness, uEdgeThreshold, uEdgeSoftness,
        uFlowX, uFlowZ, uCellSpeed,
        uNoiseScale, uNoiseFlowSpeed, uDistortAmount,
        uDeepColor, uMidColor, uMidPos, uHighlight,
        uOpacity, uDeepOpacity,
        uFadeDistance, uFadeStrength, uCamXZ,
        uLineWidth, uGlowWidth,
        uLineColor, uLineOpacity,
        uGlowColor, uGlowOpacity
    } = uniforms

    const worldPos = vertexStage(positionWorld)
    const viewPos = vertexStage(positionView)

    return Fn(() => {
        const wp = worldPos.xz

        const edge = computeAnimeVoronoi(
            wp, uTime, uScale, uSmoothness, uCellSpeed,
            uFlowX, uFlowZ, uNoiseScale, uNoiseFlowSpeed, uDistortAmount
        )

        const t = smoothstep(
            uEdgeThreshold.sub(uEdgeSoftness),
            uEdgeThreshold.add(uEdgeSoftness),
            edge
        )

        const safeMP = max(uMidPos, float(0.0001))
        const seg0 = clamp(t.div(safeMP), 0.0, 1.0)
        const seg1 = clamp(
            t.sub(safeMP).div(max(float(1.0).sub(safeMP), float(0.0001))),
            0.0, 1.0
        )
        const inSeg1 = step(safeMP, t)
        const color = mix(
            mix(uDeepColor, uMidColor, seg0),
            mix(uMidColor, uHighlight, seg1),
            inSeg1
        ).toVar()

        // ── Depth intersection ──────────────────────────────────────────
        // Compare viewport depth buffer (opaque objects already rendered)
        // against the water surface depth → white line + blue glow where
        // geometry crosses the water plane.
        const sceneViewZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar)
        const waterViewZ = viewPos.z
        const depthDiff = abs(sceneViewZ.sub(waterViewZ))

        const line = float(1.0).sub(smoothstep(float(0.0), uLineWidth, depthDiff))
        const glow = exp(depthDiff.negate().div(max(uGlowWidth, float(0.001))))

        const lineContrib = line.mul(uLineOpacity)
        const glowContrib = glow.mul(uGlowOpacity)
        const intersectionAlpha = max(lineContrib, glowContrib)
        const intersectionColor = mix(uGlowColor, uLineColor, line)

        color.assign(color.add(intersectionColor.mul(intersectionAlpha)))

        // ── Distance fade ───────────────────────────────────────────────
        const dist = length(wp.sub(uCamXZ))
        const fade = float(1.0).sub(
            pow(clamp(dist.div(uFadeDistance), 0.0, 1.0), uFadeStrength)
        )

        const alpha = clamp(
            mix(uDeepOpacity, float(1.0), t).mul(uOpacity).mul(fade).add(intersectionAlpha),
            0.0, 1.0
        )

        return vec4(color, alpha)
    })()
}

/**
 * Shadow layer — same Voronoi, wider threshold, dark tones.
 */
export function createWaterShadowColorNode(uniforms) {
    const {
        uTime, uScale, uSmoothness, uCellSpeed,
        uFlowX, uFlowZ, uNoiseScale, uNoiseFlowSpeed, uDistortAmount
    } = uniforms

    const worldPos = vertexStage(positionWorld)

    return Fn(() => {
        const wp = worldPos.xz

        const edge = computeAnimeVoronoi(
            wp, uTime, uScale, uSmoothness, uCellSpeed,
            uFlowX, uFlowZ, uNoiseScale, uNoiseFlowSpeed, uDistortAmount
        )

        const t = smoothstep(float(0.04), float(0.16), edge)
        const invT = float(1.0).sub(t)

        const shadowColor = vec3(0.0, 0.0, 0.0)
        const transparentColor = vec3(0.057, 0.561, 1.0)

        const finalColor = mix(transparentColor, shadowColor, invT)
        const alpha = mix(float(0.05), float(0.6), invT)

        return vec4(finalColor, clamp(alpha, 0.0, 1.0))
    })()
}
