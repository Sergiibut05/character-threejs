/**
 * Floor Shader – TSL
 *
 * Replica del material híbrido de Blender que mezcla:
 *   1. **Grass** (color ramp procedural sobre fbm + AO/sun micro-detail)
 *   2. **Dirt / sand** (Voronoi estilizado, mismos colores que GroundShader)
 *   3. **Slabs overlay** (textura tileada de baldosas modulando en multiply)
 *
 * Máscaras:
 *   - `grassMask`: textura UV horneada desde Blender (vertex group → emission
 *     bake). Bright = grass, dark = dirt.
 *   - `slabsMask`: vertex color attribute "slabs" (color_0). 1 = slabs overlay.
 *
 * Modos:
 *   - 'floor':  máscaras completas (grass + dirt + slabs).
 *   - 'dirt':   solo dirt, ignora máscaras.
 *   - 'grass':  solo grass procedural (para grass-borders, sin slabs/dirt).
 *
 * Las texturas se inyectan **como Three.Texture directamente** (no envueltas
 * en uniforms), porque la función TSL `texture()` exige una instancia válida
 * de THREE.Texture en tiempo de compilación del nodo.
 */
import {
    Fn, float, vec2, vec3, vec4,
    attribute, uv, texture as textureNode,
    positionWorld, vertexStage,
    sin, floor, fract,
    smoothstep, clamp, mix, dot,
    min, max, sqrt
} from 'three/tsl'
import { fbm, colorRamp } from './NoiseNodes.js'

// ── Hash helpers (shared with GroundShader) ─────────────────────────────────
const hash21 = Fn(([p]) => {
    const d = dot(p, vec2(127.1, 311.7))
    return fract(sin(d).mul(43758.5453123))
})

const hash22 = Fn(([p]) => {
    const px = dot(p, vec2(127.1, 311.7))
    const py = dot(p, vec2(269.5, 183.3))
    return vec2(fract(sin(px).mul(43758.5453)), fract(sin(py).mul(43758.5453)))
})

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
        f2.assign(mix(min(dist, f2), f1, dist.lessThan(f1)))
        f1.assign(min(dist, f1))
    }
    return sqrt(f2).sub(sqrt(f1))
})

// ── Reusable nodes ─────────────────────────────────────────────────────────
const grassPalette = (uniforms) => {
    const { uScale, uGrassMicroScale } = uniforms
    const wp = vertexStage(positionWorld)
    return Fn(() => {
        // 1. World-space UVs (planar mapping on XZ)
        const grassP = wp.mul(uScale).xz
        const microP = wp.mul(uScale).mul(uGrassMicroScale).xz

        // 2. Sample noise
        const largeFBM = fbm(grassP)

        // Map FBM [-1..1] → [0..1] normalised for the color ramp
        const noiseN = clamp(largeFBM.div(1.875).mul(0.5).add(0.5), 0.0, 1.0)
        const largePatchColor = colorRamp(
            largeFBM,
            uniforms.uGrassColor0, uniforms.uGrassColor1,
            uniforms.uGrassColor2, uniforms.uGrassColor3,
            uniforms.uGrassRampStop1, uniforms.uGrassRampStop2
        )

        // Micro variation (AO and sun highlights)
        const microFBM = fbm(microP)
        const microN = clamp(microFBM.div(1.875).mul(0.5).add(0.5), 0.0, 1.0)

        const aoFactor = float(1.0).sub(microN).mul(uniforms.uGrassAOStrength)
        const sunFactor = smoothstep(0.6, 1.0, microN).mul(uniforms.uGrassSunStrength)

        const grassColor = largePatchColor.toVar()
        grassColor.assign(mix(uniforms.uGrassSoilColor, grassColor, float(1.0).sub(aoFactor)))
        grassColor.addAssign(vec3(sunFactor.mul(0.12), sunFactor.mul(0.18), sunFactor.mul(0.04)))

        return grassColor
    })()
}

const dirtPalette = (uniforms) => {
    const wp = vertexStage(positionWorld)
    return Fn(() => {
        const sandUV = wp.xz.mul(uniforms.uSandNoiseScale).toVar()
        const noiseUV = sandUV.mul(5.0)
        const noiseVal = valueNoise2D(noiseUV)
        sandUV.x.addAssign(uniforms.uSandDistortion.mul(noiseVal.mul(2.0).sub(1.0)))
        sandUV.y.addAssign(uniforms.uSandDistortion.mul(noiseVal.mul(2.0).sub(1.0)).mul(0.5))

        const vf1 = voronoiF1(sandUV.mul(uniforms.uSandVoronoiScale), float(0.5))
        const vEdge = voronoiDistToEdge(sandUV.mul(uniforms.uSandVoronoiScale))
        const combinedVoronoi = mix(vf1, vEdge, float(0.3))
        // Beach shift: run the dirt toward sand as the ground goes south.
        // Both ends of the palette are remapped BEFORE the voronoi mix, rather
        // than tinting the result. A multiply can only ever darken, so it could
        // never pull this saturated orange-brown up to pale sand — swapping the
        // palette itself can, and keeps every bit of the voronoi detail because
        // the mix ratio is untouched.
        const beach = smoothstep(uniforms.uBeachStartZ, uniforms.uBeachEndZ, wp.z)
            .mul(uniforms.uBeachStrength)
        const c1 = mix(uniforms.uSandColor1, uniforms.uBeachColor1, beach)
        const c2 = mix(uniforms.uSandColor2, uniforms.uBeachColor2, beach)
        return mix(c1, c2, clamp(combinedVoronoi, 0.0, 1.0))
    })()
}

/**
 * Build the floor color node.
 * @param {object} uniforms shared palette/control uniforms
 * @param {object} options
 *   - mode: 'floor' | 'dirt' | 'grass'
 *   - grassMaskTexture: THREE.Texture for the baked grass mask (UV-sampled)
 *   - slabsTexture: THREE.Texture for the tiled slabs overlay
 *   - slabsAttribute: vertex color attribute name ('color' = COLOR_0,
 *     'color_1' = COLOR_1; default 'color')
 *   - slabsChannel: which channel to read from the attribute
 *     ('r' | 'g' | 'b' | 'a' | 'lum'; default 'lum'). If 'a', the attribute
 *     is read as vec4; otherwise as vec3 to maximise compatibility with
 *     glTF COLOR_X primitives that may be exported as either size.
 *   - debugSlabsMask: if true, output the raw slabs mask as the final
 *     color (white where slabs are detected, black elsewhere).
 */
export function createFloorColorNode(uniforms, options = {}) {
    const mode = options.mode || 'floor'
    const slabsAttribute = options.slabsAttribute || 'color'
    const slabsChannel = options.slabsChannel || 'lum'
    const grassMaskTexture = options.grassMaskTexture || null
    const slabsTexture = options.slabsTexture || null
    const debugSlabsMask = options.debugSlabsMask === true

    return Fn(() => {
        const grassColor = grassPalette(uniforms).toVar()
        const dirtColor = dirtPalette(uniforms).toVar()

        if (mode === 'grass') {
            return vec4(grassColor, 1.0)
        }
        if (mode === 'dirt') {
            return vec4(dirtColor, 1.0)
        }

        // 'floor' mode — grass/dirt blended by baked texture (if provided),
        // then optional slabs overlay.
        let grassMask
        if (grassMaskTexture) {
            const maskTex = textureNode(grassMaskTexture, uv())
            const luminance = maskTex.r.mul(0.299)
                .add(maskTex.g.mul(0.587))
                .add(maskTex.b.mul(0.114))
            grassMask = smoothstep(
                uniforms.uGrassMaskLow, uniforms.uGrassMaskHigh, luminance
            )
        } else {
            grassMask = float(1.0)
        }

        const baseColor = mix(dirtColor, grassColor, grassMask).toVar()

        // Slabs overlay — multiply by tiled slabs pattern where attribute > threshold.
        if (slabsTexture) {
            const attrType = slabsChannel === 'a' ? 'vec4' : 'vec3'
            const slabsAttr = attribute(slabsAttribute, attrType)

            let slabsValue
            if (slabsChannel === 'r') slabsValue = slabsAttr.r
            else if (slabsChannel === 'g') slabsValue = slabsAttr.g
            else if (slabsChannel === 'b') slabsValue = slabsAttr.b
            else if (slabsChannel === 'a') slabsValue = slabsAttr.a
            else {
                slabsValue = slabsAttr.r.mul(0.299)
                    .add(slabsAttr.g.mul(0.587))
                    .add(slabsAttr.b.mul(0.114))
            }

            const slabsMask = smoothstep(
                uniforms.uSlabsMaskLow, uniforms.uSlabsMaskHigh, slabsValue
            )

            if (debugSlabsMask) return vec4(vec3(slabsMask), 1.0)

            const wp = vertexStage(positionWorld)
            const slabsUV = wp.xz.mul(uniforms.uSlabsScale)
            const slabsTex = textureNode(slabsTexture, slabsUV)
            const slabsMixed = mix(
                float(1.0),
                slabsTex.r,
                uniforms.uSlabsStrength
            )
            const slabsColor = baseColor.mul(slabsMixed)

            baseColor.assign(mix(baseColor, slabsColor, slabsMask))
        }

        return vec4(baseColor, 1.0)
    })()
}
