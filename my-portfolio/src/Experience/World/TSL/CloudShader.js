import {
    Fn, float, vec2, vec3, vec4,
    uv, time, positionLocal, normalLocal,
    floor, fract, dot, mix, abs, clamp, smoothstep, hash
} from 'three/tsl'

// 2D value noise using hash-based corner values.
const valueNoise2D = Fn(([p]) => {
    const i = vec2(floor(p))
    const f = vec2(fract(p))
    const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)))

    const a = hash(dot(i, vec2(127.1, 311.7)))
    const b = hash(dot(i.add(vec2(1.0, 0.0)), vec2(127.1, 311.7)))
    const c = hash(dot(i.add(vec2(0.0, 1.0)), vec2(127.1, 311.7)))
    const d = hash(dot(i.add(vec2(1.0, 1.0)), vec2(127.1, 311.7)))

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y)
})

// 4-octave FBM, manually unrolled for stable TSL generation.
const fbm = Fn(([p]) => {
    const result = float(0.0).toVar()
    const amplitude = float(0.5).toVar()
    const frequency = float(1.0).toVar()
    const pos = vec2(p).toVar()

    const n0 = valueNoise2D(pos.mul(frequency)).mul(amplitude)
    result.addAssign(n0)
    amplitude.mulAssign(0.5)
    frequency.mulAssign(2.0)
    pos.addAssign(vec2(1.7, 9.2))

    const n1 = valueNoise2D(pos.mul(frequency)).mul(amplitude)
    result.addAssign(n1)
    amplitude.mulAssign(0.5)
    frequency.mulAssign(2.0)
    pos.addAssign(vec2(1.7, 9.2))

    const n2 = valueNoise2D(pos.mul(frequency)).mul(amplitude)
    result.addAssign(n2)
    amplitude.mulAssign(0.5)
    frequency.mulAssign(2.0)
    pos.addAssign(vec2(1.7, 9.2))

    const n3 = valueNoise2D(pos.mul(frequency)).mul(amplitude)
    result.addAssign(n3)

    return result
})

export function createCloudShaderNodes(uniforms) {
    const {
        uNoiseScale1,
        uNoiseScale2,
        uNoiseScale3,
        uScrollSpeed1,
        uScrollSpeed2,
        uDisplacement,
        uBaseColor,
        uCloudColor,
        uHighlight,
        uOpacity
    } = uniforms

    const positionNode = Fn(() => {
        const uvCoord = uv()

        const scrollUV1 = uvCoord.mul(uNoiseScale1).add(
            vec2(time.mul(uScrollSpeed1), time.mul(uScrollSpeed1.mul(0.3)))
        )
        const noise1 = fbm(scrollUV1)

        const scrollUV2 = uvCoord.mul(uNoiseScale2).add(
            vec2(time.mul(uScrollSpeed2.negate()), time.mul(uScrollSpeed2.mul(0.5)))
        )
        const noise2 = fbm(scrollUV2)

        const combined = noise1.add(noise2).sub(1.0)
        const shaped = abs(combined)

        const detailUV = uvCoord.mul(uNoiseScale3).add(
            vec2(time.mul(0.08), time.mul(0.06))
        )
        const detailNoise = fbm(detailUV)

        const finalDisplacement = shaped.mul(detailNoise).mul(uDisplacement)
        return positionLocal.add(normalLocal.mul(finalDisplacement))
    })()

    const colorNode = Fn(() => {
        const uvCoord = uv()

        const scrollUV1 = uvCoord.mul(uNoiseScale1).add(
            vec2(time.mul(uScrollSpeed1), time.mul(uScrollSpeed1.mul(0.3)))
        )
        const noise1 = fbm(scrollUV1)

        const scrollUV2 = uvCoord.mul(uNoiseScale2).add(
            vec2(time.mul(uScrollSpeed2.negate()), time.mul(uScrollSpeed2.mul(0.5)))
        )
        const noise2 = fbm(scrollUV2)

        const colorNoise = clamp(noise1.add(noise2).mul(0.5), 0.0, 1.0)
        const fromBase = mix(uBaseColor, uCloudColor, colorNoise)
        const finalColor = mix(fromBase, uHighlight, colorNoise.mul(colorNoise))

        return vec3(finalColor)
    })()

    const opacityNode = Fn(() => {
        const uvCoord = uv()
        const edgeFade = smoothstep(0.0, 0.12, uvCoord.x)
            .mul(smoothstep(1.0, 0.88, uvCoord.x))
            .mul(smoothstep(0.0, 0.12, uvCoord.y))
            .mul(smoothstep(1.0, 0.88, uvCoord.y))

        return edgeFade.mul(uOpacity)
    })()

    return {
        positionNode,
        colorNode,
        opacityNode,
        fragmentNode: vec4(colorNode, opacityNode)
    }
}
