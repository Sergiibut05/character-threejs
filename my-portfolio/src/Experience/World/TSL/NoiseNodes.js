/**
 * Shared TSL Noise Nodes
 * Replaces the duplicated GLSL simplex noise + fBM + ColorRamp code
 * that was in both GroundPerlin.js and Grass.js
 */
import {
    Fn, float, vec2, vec3, vec4,
    floor, fract, dot, step, min, max, abs,
    smoothstep, mix, clamp,
    Loop, int
} from 'three/tsl'

// --- Helper functions for simplex noise ---

const mod289_vec3 = Fn(([x]) => {
    return x.sub(floor(x.mul(1.0 / 289.0)).mul(289.0))
})

const mod289_vec4 = Fn(([x]) => {
    return x.sub(floor(x.mul(1.0 / 289.0)).mul(289.0))
})

const permute = Fn(([x]) => {
    return mod289_vec4(x.mul(34.0).add(1.0).mul(x))
})

const taylorInvSqrt = Fn(([r]) => {
    return float(1.79284291400159).sub(float(0.85373472095314).mul(r))
})

// --- Simplex Noise 3D ---
export const snoise = Fn(([v]) => {

    const C = vec2(1.0 / 6.0, 1.0 / 3.0)
    const D = vec4(0.0, 0.5, 1.0, 2.0)

    // First corner
    const i = floor(v.add(dot(v, C.yyy))).toVar()
    const x0 = v.sub(i).add(dot(i, C.xxx)).toVar()

    // Other corners
    const g = step(x0.yzx, x0.xyz).toVar()
    const l = float(1.0).sub(g).toVar()
    const i1 = min(g.xyz, l.zxy).toVar()
    const i2 = max(g.xyz, l.zxy).toVar()

    const x1 = x0.sub(i1).add(C.xxx).toVar()
    const x2 = x0.sub(i2).add(C.yyy).toVar()
    const x3 = x0.sub(D.yyy).toVar()

    // Permutations
    i.assign(mod289_vec3(i))
    const p = permute(
        permute(
            permute(
                i.z.add(vec4(0.0, i1.z, i2.z, 1.0))
            ).add(i.y).add(vec4(0.0, i1.y, i2.y, 1.0))
        ).add(i.x).add(vec4(0.0, i1.x, i2.x, 1.0))
    ).toVar()

    // Gradients
    const n_ = float(0.142857142857)
    const ns = n_.mul(D.wyz).sub(D.xzx).toVar()

    const j = p.sub(floor(p.mul(ns.z).mul(ns.z)).mul(49.0)).toVar()

    const x_ = floor(j.mul(ns.z)).toVar()
    const y_ = floor(j.sub(x_.mul(7.0))).toVar()

    const x = x_.mul(ns.x).add(ns.yyyy).toVar()
    const y = y_.mul(ns.x).add(ns.yyyy).toVar()
    const h = float(1.0).sub(abs(x)).sub(abs(y)).toVar()

    const b0 = vec4(x.xy, y.xy).toVar()
    const b1 = vec4(x.zw, y.zw).toVar()

    const s0 = floor(b0).mul(2.0).add(1.0).toVar()
    const s1 = floor(b1).mul(2.0).add(1.0).toVar()
    const sh = step(h, vec4(0.0)).negate().toVar()

    const a0 = b0.xzyw.add(s0.xzyw.mul(sh.xxyy)).toVar()
    const a1 = b1.xzyw.add(s1.xzyw.mul(sh.zzww)).toVar()

    const p0 = vec3(a0.xy, h.x).toVar()
    const p1 = vec3(a0.zw, h.y).toVar()
    const p2 = vec3(a1.xy, h.z).toVar()
    const p3 = vec3(a1.zw, h.w).toVar()

    // Normalise gradients
    const norm = taylorInvSqrt(vec4(
        dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)
    )).toVar()
    p0.mulAssign(norm.x)
    p1.mulAssign(norm.y)
    p2.mulAssign(norm.z)
    p3.mulAssign(norm.w)

    // Mix contributions
    const m = max(
        float(0.6).sub(vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3))),
        0.0
    ).toVar()
    m.assign(m.mul(m))

    return float(42.0).mul(
        dot(m.mul(m), vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)))
    )

})

// --- Fractal Brownian Motion (fBM) ---
// 4 octaves, lacunarity 2.0, persistence 0.5 (Blender-style)
export const fbm = Fn(([p]) => {

    const value = float(0.0).toVar()
    const amplitude = float(1.0).toVar()
    const frequency = float(1.0).toVar()
    const lacunarity = float(2.0)
    const persistence = float(0.5)

    Loop(4, () => {
        value.addAssign(amplitude.mul(snoise(p.mul(frequency))))
        frequency.mulAssign(lacunarity)
        amplitude.mulAssign(persistence)
    })

    return value

})

// --- ColorRamp (Blender-style with 4 colors and 2 stops) ---
export const colorRamp = Fn(([noiseValue, color0, color1, color2, color3, rampStop1, rampStop2]) => {

    // Normalize to [0,1] with soft remap
    const n = clamp(noiseValue.div(1.875).mul(0.5).add(0.5), 0.0, 1.0).toVar()
    n.assign(smoothstep(0.0, 1.0, n))

    // ColorRamp Blender-style: 3 transitions
    const s1 = min(rampStop1, rampStop2)
    const s2 = max(rampStop1, rampStop2)
    const t1 = smoothstep(0.0, s1, n)
    const t2 = smoothstep(s1, s2, n)
    const t3 = smoothstep(s2, 1.0, n)

    const result = mix(color0, color1, t1).toVar()
    result.assign(mix(result, color2, t2))
    result.assign(mix(result, color3, t3))

    return result

})
