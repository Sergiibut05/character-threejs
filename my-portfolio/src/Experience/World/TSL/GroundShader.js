/**
 * Ground Shader – TSL
 *
 * Blends TWO regions via vertex color mask:
 *   0 = grass region  → multi-octave noise + rich Ghibli palette + micro-detail
 *   1 = dirt/sand     → Voronoi-based stylized sand (unchanged, already good)
 *
 * Grass improvements for Ghibli look:
 *   - Two stacked FBM layers (large patches + small micro-variation overlay)
 *   - Darker "soil tint" pooled in low-noise valleys (fake AO)
 *   - Brighter "sun spots" on high-noise peaks
 *   - Subtle warm desaturation near dirt border for natural transition
 */
import {
    Fn, float, vec2, vec3, vec4,
    uniform, attribute, uv,
    positionWorld, vertexStage,
    sin, cos, abs, floor, fract,
    smoothstep, clamp, mix, dot,
    normalize, length, min, max, sqrt, pow
} from 'three/tsl'
import { fbm, colorRamp } from './NoiseNodes.js'

// --- Hash functions ---
const hash21 = Fn(([p]) => {
    const d = dot(p, vec2(127.1, 311.7))
    return fract(sin(d).mul(43758.5453123))
})

const hash22 = Fn(([p]) => {
    const px = dot(p, vec2(127.1, 311.7))
    const py = dot(p, vec2(269.5, 183.3))
    return vec2(fract(sin(px).mul(43758.5453)), fract(sin(py).mul(43758.5453)))
})

// --- 2D Value Noise ---
const valueNoise2D = Fn(([p]) => {
    const i = floor(p).toVar()
    const f = fract(p).toVar()
    const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)))

    const a = hash21(i)
    const b = hash21(i.add(vec2(1.0, 0.0)))
    const c = hash21(i.add(vec2(0.0, 1.0)))
    const d = hash21(i.add(vec2(1.0, 1.0)))

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y)
})

// --- Voronoi F1 (Smooth) ---
const voronoiF1 = Fn(([p, smoothness]) => {
    const pi = floor(p).toVar()
    const pf = fract(p).toVar()

    const res = float(8.0).toVar()

    const offsets = [
        vec2(-1, -1), vec2(0, -1), vec2(1, -1),
        vec2(-1, 0), vec2(0, 0), vec2(1, 0),
        vec2(-1, 1), vec2(0, 1), vec2(1, 1)
    ]

    for (const offset of offsets) {
        const point = hash22(pi.add(offset)).toVar()
        const diff = offset.add(point).sub(pf)
        const dist = dot(diff, diff)

        const h = clamp(
            float(0.5).add(float(0.5).mul(res.sub(dist)).div(smoothness)),
            0.0, 1.0
        )
        res.assign(
            mix(res, dist, h).sub(smoothness.mul(h).mul(float(1.0).sub(h)))
        )
    }

    return res
})

// --- Voronoi Distance-to-Edge ---
const voronoiDistToEdge = Fn(([p]) => {
    const pi = floor(p).toVar()
    const pf = fract(p).toVar()

    const f1 = float(8.0).toVar()
    const f2 = float(8.0).toVar()

    const offsets = [
        vec2(-1, -1), vec2(0, -1), vec2(1, -1),
        vec2(-1, 0), vec2(0, 0), vec2(1, 0),
        vec2(-1, 1), vec2(0, 1), vec2(1, 1)
    ]

    for (const offset of offsets) {
        const point = hash22(pi.add(offset)).toVar()
        const diff = offset.add(point).sub(pf)
        const dist = dot(diff, diff)

        const isCloser = dist.lessThan(f1)
        f2.assign(mix(min(dist, f2), f1, isCloser))
        f1.assign(min(dist, f1))
    }

    return sqrt(f2).sub(sqrt(f1))
})

/**
 * Creates the ground color node.
 * @param {object} uniforms
 * @returns TSL color node (vec4)
 */
export function createGroundColorNode(uniforms) {
    const {
        uScale,
        uEmissionStrength,
        // Grass
        uGrassColor0, uGrassColor1, uGrassColor2, uGrassColor3,
        uGrassRampStop1, uGrassRampStop2,
        // Grass AO / micro-detail  (new)
        uGrassMicroScale,
        uGrassAOStrength,
        uGrassSunStrength,
        uGrassSoilColor,
        // Sand
        uSandColor1, uSandColor2,
        uSandVoronoiScale,
        uSandNoiseScale,
        uSandDistortion
    } = uniforms

    const worldPos = vertexStage(positionWorld)

    const colorNode = Fn(() => {
        // Mask: 0 = grass (black vertex color), 1 = dirt (white vertex color)
        const vertexColor = attribute('color_1', 'vec4')
        const mask = vertexColor.r.toVar()

        const wp = worldPos

        // ══════════════════════════════════════════════════════════
        // ── GRASS (mask ≈ 0) ──────────────────────────────────────
        // ══════════════════════════════════════════════════════════

        // Layer 1: Large colour patches (Ghibli "painted" feel)
        // Uses the same scale as before, controls big colour blotches
        const grassP = wp.mul(uScale)
        const largeFBM = fbm(grassP)

        // Map FBM [-1..1] → [0..1] normalised for the color ramp
        const largePatchColor = colorRamp(
            largeFBM,
            uGrassColor0, uGrassColor1, uGrassColor2, uGrassColor3,
            uGrassRampStop1, uGrassRampStop2
        )

        // Layer 2: Micro-detail noise — tiny brightness variation replicating
        // individual grass blade clusters / uneven ground surface
        const microP = wp.mul(uGrassMicroScale)
        const microFBM = fbm(microP) // -1..1

        // Normalise micro noise to 0..1
        const microN = clamp(microFBM.div(1.875).mul(0.5).add(0.5), 0.0, 1.0)

        // Fake AO: darker where micro noise is low (pooled shadow in valleys)
        const aoFactor = float(1.0).sub(microN).mul(uGrassAOStrength)

        // Sun spots: brighter where micro noise is high (light catching grass tips)
        const sunFactor = smoothstep(0.6, 1.0, microN).mul(uGrassSunStrength)

        // Blend: base large patch color, darken valleys, brighten peaks
        const grassColor = largePatchColor.toVar()
        // Darken valleys (mix toward dark soil tone)
        grassColor.assign(mix(uGrassSoilColor, grassColor, float(1.0).sub(aoFactor)))
        // Brighten sun patches (additive toward tip color)
        grassColor.addAssign(vec3(sunFactor.mul(0.12), sunFactor.mul(0.18), sunFactor.mul(0.04)))

        // ══════════════════════════════════════════════════════════
        // ── SAND (mask ≈ 1) ───────────────────────────────────────
        // ══════════════════════════════════════════════════════════
        const sandUV = wp.xz.mul(uSandNoiseScale).toVar()

        const noiseUV = sandUV.mul(5.0)
        const noiseVal = valueNoise2D(noiseUV)
        sandUV.x.addAssign(uSandDistortion.mul(noiseVal.mul(2.0).sub(1.0)))
        sandUV.y.addAssign(uSandDistortion.mul(noiseVal.mul(2.0).sub(1.0)).mul(0.5))

        const vf1 = voronoiF1(sandUV.mul(uSandVoronoiScale), float(0.5))
        const vEdge = voronoiDistToEdge(sandUV.mul(uSandVoronoiScale))
        const combinedVoronoi = mix(vf1, vEdge, float(0.3))
        const sandColor = mix(uSandColor1, uSandColor2, clamp(combinedVoronoi, 0.0, 1.0))

        // ══════════════════════════════════════════════════════════
        // ── BLEND grass ↔ sand via mask ───────────────────────────
        // ══════════════════════════════════════════════════════════

        // Slightly wider blend zone for a natural, organic border
        const blendFactor = smoothstep(0.25, 0.75, mask)
        const finalColor = mix(grassColor, sandColor, blendFactor)

        return vec4(finalColor, 1.0)

    })()

    return colorNode
}
