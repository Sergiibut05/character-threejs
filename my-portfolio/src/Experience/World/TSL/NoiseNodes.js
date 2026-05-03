import * as THREE from 'three'
import {
    Fn, float, vec2, vec3,
    floor, fract,
    mix, smoothstep,
    Loop, int, texture
} from 'three/tsl'

// --- High-Performance Texture Noise ---
// Generate a 256x256 random noise texture ONCE on the CPU (0ms cost).
// This replaces the extremely heavy 3D procedural math that was crashing
// the WebGPU compiler and causing 26-60 second freezes.
const NOISE_SIZE = 256
const noiseData = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4)
for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = Math.floor(Math.random() * 255)
}

export const hashTexture = new THREE.DataTexture(noiseData, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat)
hashTexture.minFilter = THREE.NearestFilter
hashTexture.magFilter = THREE.NearestFilter
hashTexture.wrapS = THREE.RepeatWrapping
hashTexture.wrapT = THREE.RepeatWrapping
hashTexture.generateMipmaps = false
hashTexture.needsUpdate = true

// --- 2D Value Noise ---
// O(1) texture lookup instead of O(N) mathematical trigonometry
export const snoise = Fn(([v]) => {
    // Value noise expects a vec2. If a vec3 is passed (like world position), 
    // we just use the XZ plane.
    const p = vec2(v.x, v.y)
    
    const i = floor(p)
    const f = fract(p)

    // Smoothstep interpolation (Hermite curve)
    const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0))).toVar()

    // Map pixel coordinates to UVs with half-pixel offset 
    // to fix precision glitches on older Android devices.
    const res = float(NOISE_SIZE)
    const halfPixel = float(0.5).div(res)
    
    const uv00 = i.div(res).add(halfPixel)
    const uv10 = i.add(vec2(1.0, 0.0)).div(res).add(halfPixel)
    const uv01 = i.add(vec2(0.0, 1.0)).div(res).add(halfPixel)
    const uv11 = i.add(vec2(1.0, 1.0)).div(res).add(halfPixel)

    const a = texture(hashTexture, uv00).r
    const b = texture(hashTexture, uv10).r
    const c = texture(hashTexture, uv01).r
    const d = texture(hashTexture, uv11).r

    // Interpolate along x, then y
    const mixAB = mix(a, b, u.x)
    const mixCD = mix(c, d, u.x)
    const finalVal = mix(mixAB, mixCD, u.y)

    // Return mapped to [-1, 1] range to simulate simplex output
    return finalVal.mul(2.0).sub(1.0)
})

// --- Fractal Brownian Motion (fBM) ---
export const fbm = Fn(([v]) => {
    const value = float(0.0).toVar()
    const amplitude = float(0.5).toVar()
    
    // We only need the XZ coordinates for the 2D noise texture
    const p = vec2(v.x, v.y).toVar()

    Loop({ start: int(0), end: int(4), type: 'int', condition: '<' }, () => {
        value.addAssign(amplitude.mul(snoise(p)))
        p.mulAssign(2.0)
        amplitude.mulAssign(0.5)
    })

    return value
})

// --- Color Ramp ---
export const colorRamp = Fn(([t, c0, c1, c2, c3, stop1, stop2]) => {
    // Map noise [-1, 1] to [0, 1]
    const t01 = t.mul(0.5).add(0.5).toVar()

    const color = vec3(0.0).toVar()

    const w0 = float(1.0).sub(smoothstep(0.0, stop1, t01))
    color.addAssign(vec3(c0).mul(w0))

    const w1 = smoothstep(0.0, stop1, t01).mul(float(1.0).sub(smoothstep(stop1, stop2, t01)))
    color.addAssign(vec3(c1).mul(w1))

    const w2 = smoothstep(stop1, stop2, t01).mul(float(1.0).sub(smoothstep(stop2, 1.0, t01)))
    color.addAssign(vec3(c2).mul(w2))

    const w3 = smoothstep(stop2, 1.0, t01)
    color.addAssign(vec3(c3).mul(w3))

    return color
})
