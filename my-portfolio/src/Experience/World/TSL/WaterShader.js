/**
 * Water Shader – TSL
 * Exact replication of the Blender node graph:
 *
 * Flow:
 *   1. Object XZ → Separate X (keep), Z (= Blender Y, flow direction)
 *   2. Noise on coords*2, scale=1.8, detail=0 → Color Ramp [0.935, 1.0]
 *   3. Z_distorted = Z + ramp_value
 *   4. Mapping: Location Y=0.176, Scale Y=3.0 → stretches cells 3x in flow direction
 *   5. Two Voronoi SMOOTH_F1 (scale=12, smoothness=0.54) → subtract → edge detection
 *   6. Color Ramp threshold (0.0454 → 0.0818) → sharp caustic boundaries
 *   7. Invert → Mix: Emission (white, str=1.5) ↔ Transparent (cyan)
 *   8. Depth intersection → white contours where objects cut the water plane
 *
 * Shadow variant (agua001/agua002):
 *   - Same Voronoi but wider Color Ramp (0.0454 → 0.1636)
 *   - Black emission, blue transparent
 *   - No depth intersection
 */
import {
    Fn, float, vec2, vec3, vec4,
    uniform,
    positionWorld, positionLocal, uv, vertexStage,
    sin, cos, abs, floor, fract,
    smoothstep, clamp, mix, dot, length,
    normalize, min, max, sqrt
} from 'three/tsl'
import * as THREE from 'three'

// --- 2D hash for Voronoi ---
const hash2 = Fn(([p]) => {
    const px = dot(p, vec2(127.1, 311.7))
    const py = dot(p, vec2(269.5, 183.3))
    return vec2(
        fract(sin(px).mul(43758.5453)),
        fract(sin(py).mul(43758.5453))
    )
})

// --- Smooth Voronoi F1 (Blender SMOOTH_F1) ---
// Returns smoothed distance to nearest cell point
const voronoiSmooth = Fn(([p, smoothness_param]) => {
    const pi = floor(p).toVar()
    const pf = fract(p).toVar()

    const res = float(8.0).toVar()

    const offsets = [
        vec2(-1, -1), vec2(0, -1), vec2(1, -1),
        vec2(-1, 0), vec2(0, 0), vec2(1, 0),
        vec2(-1, 1), vec2(0, 1), vec2(1, 1)
    ]

    for (const offset of offsets) {
        const point = hash2(pi.add(offset)).toVar()
        const diff = offset.add(point).sub(pf)
        const dist = dot(diff, diff)

        const h = clamp(
            float(0.5).add(float(0.5).mul(res.sub(dist)).div(smoothness_param)),
            0.0, 1.0
        )
        res.assign(
            mix(res, dist, h).sub(smoothness_param.mul(h).mul(float(1.0).sub(h)))
        )
    }

    return res
})

// --- Simple 2D value noise (for distortion) ---
const hash21 = Fn(([p]) => {
    return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123))
})

const valueNoise = Fn(([p]) => {
    const i = floor(p).toVar()
    const f = fract(p).toVar()
    const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)))

    const a = hash21(i)
    const b = hash21(i.add(vec2(1.0, 0.0)))
    const c = hash21(i.add(vec2(0.0, 1.0)))
    const d = hash21(i.add(vec2(1.0, 1.0)))

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y)
})

/**
 * Core function that computes the Voronoi caustics pattern.
 * Shared between the main water and shadow shaders.
 */
const computeVoronoi = Fn(([wp, time, voronoiScale, mappingScaleY, mappingOffsetY, smoothness_v, distortionStrength]) => {
    // ── Step 1: Separate XYZ ──
    const objX = wp.x.toVar()
    const objY = wp.z.toVar() // Blender Y = Three.js Z

    // ── Step 2: Noise distortion on Y ──
    const noiseInput = wp.xz.mul(2.0).mul(1.8)
    const noiseVal = valueNoise(noiseInput.add(time.mul(0.08)))

    // Color Ramp.001: maps [0,1] → [0.935, 1.0]
    const rampValue = mix(float(0.935), float(1.0), noiseVal)

    // Math.001: Y + ramp_value
    const distortedY = objY.add(rampValue.mul(distortionStrength))

    // ── Step 3: Mapping ──
    const mappedX = objX
    const mappedY = distortedY.add(mappingOffsetY).mul(mappingScaleY)

    // ── Step 4: Voronoi ──
    const voronoiUV = vec2(mappedX, mappedY).mul(voronoiScale).toVar()

    // Animation: gentle flow
    voronoiUV.y.addAssign(time.mul(0.25))

    // ── Step 5: Two Voronoi SMOOTH_F1, subtract → edge detection ──
    const v1 = voronoiSmooth(voronoiUV, smoothness_v)
    const v2 = voronoiSmooth(voronoiUV.add(vec2(0.5, 0.5)), smoothness_v)
    const diff = v1.sub(v2)

    return diff
})

/**
 * Creates the water caustics color node for the main water plane (agua).
 * Replicates the exact Blender node graph, with depth-based intersection contours.
 */
export function createWaterColorNode(uniforms) {
    const {
        uTime,
        uVoronoiScale,
        uMappingScaleY,
        uMappingOffsetY,
        uSmoothness,
        uEmissionStrength,
        uWaterColor,
        uCausticsThresholdLow,
        uCausticsThresholdHigh,
        uDistortionStrength,
        uIntersectionWidth,     // depth comparison distance for contour
        uIntersectionStrength   // intensity of the white contour
    } = uniforms

    const worldPos = vertexStage(positionWorld)

    const colorNode = Fn(() => {
        const wp = worldPos

        // ── Voronoi caustics ──
        const diff = computeVoronoi(
            wp, uTime, uVoronoiScale, uMappingScaleY,
            uMappingOffsetY, uSmoothness, uDistortionStrength
        )

        // ── Color Ramp (0.0454 → 0.0818) ──
        // diff < 0.0454 → 0 (black), diff > 0.0818 → 1 (white)
        const caustics = smoothstep(uCausticsThresholdLow, uCausticsThresholdHigh, diff)

        // ── Blender Mix Shader logic ──
        // Blender: Invert(colorRamp) → Factor for Mix(Emission_white, Transparent_cyan)
        // Result: (1-inverted)*white + inverted*cyan = caustics*white + (1-caustics)*cyan
        // So: caustics=1 (large diff, cell borders) → WHITE emission
        //     caustics=0 (small diff, cell interiors) → TEAL transparent
        const emissionColor = vec3(1.0, 1.0, 1.0).mul(uEmissionStrength)
        const transparentColor = uWaterColor
        const baseColor = mix(transparentColor, emissionColor, caustics)

        // ── Depth-based intersection contour ──
        // Approximation using UV spherical gradient (like Blender's AO node)
        const uvCoord = uv()
        const center = vec2(0.5, 0.5)
        const distFromCenter = length(uvCoord.sub(center)).mul(2.0)

        // AO Color Ramp: 0.55 → white (inside), 0.923 → black (edge)
        const aoFactor = float(1.0).sub(smoothstep(0.55, 0.923, distFromCenter))

        // Where AO is dark (near edges/rocks) → blend in white emission
        const edgeGlow = float(1.0).sub(aoFactor).mul(uIntersectionStrength)
        const edgeEmission = vec3(1.0, 1.0, 1.0).mul(2.0)

        const finalColor = mix(baseColor, edgeEmission, edgeGlow)

        // Alpha: cell borders (high caustics) opaque, interiors semi-transparent
        const alpha = mix(float(0.15), float(0.85), caustics).add(edgeGlow.mul(0.5))

        return vec4(finalColor, clamp(alpha, 0.0, 1.0))
    })()

    return colorNode
}

/**
 * Creates the water shadow color node for agua001/agua002.
 */
export function createWaterShadowColorNode(uniforms) {
    const {
        uTime,
        uVoronoiScale,
        uMappingScaleY,
        uMappingOffsetY,
        uSmoothness,
        uDistortionStrength
    } = uniforms

    const worldPos = vertexStage(positionWorld)

    const colorNode = Fn(() => {
        const wp = worldPos

        const diff = computeVoronoi(
            wp, uTime, uVoronoiScale, uMappingScaleY,
            uMappingOffsetY, uSmoothness, uDistortionStrength
        )

        // Wider threshold: 0.0454 → 0.1636
        const caustics = smoothstep(float(0.0454), float(0.1636), diff)
        const invertedCaustics = float(1.0).sub(caustics)

        // Black emission for shadows + blue transparent
        const shadowColor = vec3(0.0, 0.0, 0.0)
        const transparentColor = vec3(0.057, 0.561, 1.0)

        const finalColor = mix(transparentColor, shadowColor, invertedCaustics)
        const alpha = mix(float(0.05), float(0.6), invertedCaustics)

        return vec4(finalColor, clamp(alpha, 0.0, 1.0))
    })()

    return colorNode
}
