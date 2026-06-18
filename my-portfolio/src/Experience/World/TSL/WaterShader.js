/**
 * Water Shader – TSL (Depth-driven Stylized Water)
 * Ported from the "Water with Caustics" Godot shader approach (binbun) —
 * https://godotshaders.com/shader/water-with-caustics/ — adapted to TSL.
 *
 * Key idea: water depth is a TRUE WORLD-SPACE vertical column height,
 * reconstructed from the depth buffer (worldBedY → surfaceY). Camera-invariant
 * (no "looks different far away", no "swimming"). Single depth read → cheap.
 *
 *   1. Base colour: shallow → deep by world depth (Beer-Lambert style).
 *   2. Edge foam: solid white where the water column is thin (shore/objects),
 *      dissolved into natural clumps by a STATIC world-space noise (no travel).
 *   3. Sparse open-water specks that fade in/out IN PLACE (not flowing).
 *   4. Distance fade for the infinite-floor illusion.
 *
 * Reuses the project's cheap texture-based noise (snoise in NoiseNodes).
 */
import {
    Fn, float, vec2, vec3, vec4,
    positionWorld, positionView, vertexStage,
    sin, smoothstep, clamp, mix, length,
    max, pow,
    viewportDepthTexture, perspectiveDepthToViewZ,
    cameraNear, cameraFar, cameraWorldMatrix, screenUV
} from 'three/tsl'

import { snoise } from './NoiseNodes.js'

/**
 * Main water surface — depth-based color + animated shore foam + whitecaps.
 */
export function createWaterColorNode(uniforms) {
    const {
        uTime,
        // Depth color
        uShallowColor, uDeepWaterColor, uDepthMax, uDepthPower,
        // Foam color
        uFoamColor,
        // Edge foam (depth-based, noise-shaped, animated)
        uFoamDepth, uFoamScale, uFoamShapeAmount, uFoamExponent, uFoamStrength, uFoamSpeed,
        // Sparse open-water specks (cartoon noise blobs, fade in place)
        uSpeckScale, uSpeckThreshold, uSpeckEdge, uSpeckStrength, uSpeckSpeed,
        // Opacity (shallow = translucent so terrain tints through, deep = solid)
        uOpacity, uShallowOpacity, uDeepOpacity,
        // Distance fade
        uFadeDistance, uFadeStrength, uCamXZ
    } = uniforms

    const worldPos = vertexStage(positionWorld)
    const viewPos = vertexStage(positionView)

    return Fn(() => {
        const wp = worldPos.xz
        const waterViewZ = viewPos.z

        // ── World-space water depth (camera-invariant) ──────────────────
        // Reconstruct the riverbed WORLD position from the depth buffer and
        // take the vertical (Y) gap to the water surface. Because it is a real
        // world height, it does NOT change with camera distance or angle.
        const reconstructDepth = (uv) => {
            const sZ = perspectiveDepthToViewZ(viewportDepthTexture(uv), cameraNear, cameraFar)
            // Scale the view ray (camera at origin) so its z reaches the bed.
            const bedViewPos = viewPos.mul(sZ.div(waterViewZ))
            const bedWorldY = cameraWorldMatrix.mul(vec4(bedViewPos, 1.0)).y
            return max(worldPos.y.sub(bedWorldY), float(0.0))
        }

        const waterDepth = reconstructDepth(screenUV).toVar()

        // ── 1. Base color by depth (Beer-Lambert style absorption) ──────
        const depthT = pow(
            clamp(waterDepth.div(max(uDepthMax, float(0.001))), 0.0, 1.0),
            uDepthPower
        )
        const color = mix(uShallowColor, uDeepWaterColor, depthT).toVar()

        // ── 2. Edge foam (depth-based, noise-shaped, ANIMATED) ──────────
        // Solid white near shore/objects where the water column is thin.
        // The shaping noise flows along the shore so the foam clumps drift /
        // breathe. Because it is gated by depth (edgeRaw) it stays at the edge
        // and never travels across open water.
        const foamFlow = vec2(uTime.mul(uFoamSpeed), uTime.mul(uFoamSpeed).mul(0.6))
        const edgeRaw = float(1.0).sub(
            smoothstep(float(0.0), max(uFoamDepth, float(0.001)), waterDepth)
        )
        const foamShape = snoise(wp.mul(uFoamScale).add(foamFlow)).mul(0.5).add(0.5).mul(uFoamShapeAmount)
        const edgeFoam = pow(
            clamp(
                edgeRaw.sub(foamShape).div(max(float(1.0).sub(foamShape), float(0.001))),
                0.0, 1.0
            ),
            uFoamExponent
        ).toVar()

        // ── 3. Cartoon noise specks (organic blobs, fade IN PLACE) ──────
        // Smooth value-noise gives naturally ROUNDED, irregular contours (not
        // circles). A narrow smoothstep band turns them into crisp cartoon
        // edges. The noise coords are STATIC (no flow) so blobs never travel;
        // each blob fades in/out on its own clock via a per-region phase.
        const speckField = snoise(wp.mul(uSpeckScale)).mul(0.5).add(0.5)
        const speckPhase = snoise(wp.mul(uSpeckScale.mul(0.5)).add(vec2(11.3, 7.7)))
        const flick = float(0.5).add(
            float(0.5).mul(sin(uTime.mul(uSpeckSpeed).add(speckPhase.mul(6.2831))))
        )
        // crisp rounded edge: small uSpeckEdge → sharp cartoon cut
        const speckMask = smoothstep(
            uSpeckThreshold, uSpeckThreshold.add(uSpeckEdge), speckField
        )
        const speckDeep = smoothstep(uFoamDepth, uFoamDepth.mul(2.0), waterDepth)
        const specks = speckMask
            .mul(smoothstep(float(0.5), float(0.85), flick))
            .mul(uSpeckStrength)
            .mul(speckDeep)
            .mul(float(1.0).sub(edgeFoam))

        // ── Combine ──────────────────────────────────────────────────────
        const foam = clamp(max(edgeFoam, specks).mul(uFoamStrength), 0.0, 1.0).toVar()
        color.assign(mix(color, uFoamColor, foam))

        // ── 4. Distance fade (infinite-floor illusion) ──────────────────
        const dist = length(wp.sub(uCamXZ))
        const fade = float(1.0).sub(
            pow(clamp(dist.div(uFadeDistance), 0.0, 1.0), uFadeStrength)
        )

        // ── Alpha: shallow = translucent (terrain tints through),
        //          deep = solid, foam fully opaque ──────────────────────
        const baseAlpha = mix(uShallowOpacity, uDeepOpacity, depthT).mul(uOpacity)
        const alpha = clamp(max(baseAlpha, foam).mul(fade), 0.0, 1.0)

        return vec4(color, alpha)
    })()
}

/**
 * Shadow / shallow layer — very subtle translucent darkening for the
 * secondary planes (agua.001 / agua.002). It only deepens the existing
 * water tone slightly (no bright cyan band), so it reads as a soft
 * shadowed/deeper patch rather than a hard-edged strip.
 */
export function createWaterShadowColorNode(uniforms) {
    const {
        uTime, uDeepWaterColor, uShadowOpacity
    } = uniforms

    const worldPos = vertexStage(positionWorld)

    return Fn(() => {
        const wp = worldPos.xz

        const wobble = snoise(wp.mul(0.5).add(vec2(uTime.mul(0.04), 0.0))).mul(0.5).add(0.5)

        const alpha = clamp(
            uShadowOpacity.mul(float(0.6).add(wobble.mul(0.4))),
            0.0, 1.0
        )

        return vec4(uDeepWaterColor, alpha)
    })()
}
