/**
 * Minimal “folio-style” shading for static props: Lambert-family node material
 * with stylized core shadow (N·L band) + projected shadow map, no terrain bounce.
 */
import * as THREE from 'three'
import {
    Fn, float, vec3, vec4,
    uniform,
    texture, uv,
    normalWorld,
    mix, smoothstep, max
} from 'three/tsl'

/** Unit vector toward the directional sun (same convention as Foliage.js). */
export const propSunDirection = uniform(new THREE.Vector3(4, 5, -3).normalize())

/** Lit-side albedo multiplier (Vector3 uniform; tweak in lil-gui under Environment). */
export const propLitTint = uniform(new THREE.Vector3(1.04, 1.01, 0.96))
/** Shadow-side albedo multiplier. */
export const propShadowTint = uniform(new THREE.Vector3(0.58, 0.56, 0.68))

/** N·L smoothstep edges on lit side (see outputNode). */
export const propCoreLit0 = uniform(-0.22)
export const propCoreLit1 = uniform(0.52)

function toThreeColor(c) {
    if (c instanceof THREE.Color) return c.clone()
    return new THREE.Color(c ?? 0xffffff)
}

/**
 * Keep stylized props aligned with `DirectionalLight` position (world space).
 * Call from `Environment.update()` (or whenever the sun moves).
 */
export function syncPropStylizedSunDirection(sunLight) {
    if (!sunLight?.position) return
    propSunDirection.value.copy(sunLight.position).normalize()
}

/**
 * @param {object} options
 * @param {THREE.Texture|null} [options.map]
 * @param {number|THREE.Color} [options.color]
 * @param {boolean} [options.flatShading]
 */
export function createStylizedPropNodeMaterial(options = {}) {
    const {
        map = null,
        color = 0xffffff,
        flatShading = false
    } = options

    const tc = toThreeColor(color)
    const tintRgb = uniform(new THREE.Vector3(tc.r, tc.g, tc.b))

    const material = new THREE.MeshLambertNodeMaterial({
        flatShading
    })
    if (map) material.map = map

    const catchedShadow = float(1).toVar()

    material.receivedShadowNode = Fn(([shadow]) => {
        catchedShadow.mulAssign(shadow.r)
        return float(1)
    })

    material.outputNode = Fn(() => {
        const base = map
            ? texture(map, uv()).rgb.mul(tintRgb)
            : tintRgb

        const N = normalWorld.normalize()
        const ndl = N.dot(propSunDirection.normalize())
        const coreMix = float(1).sub(smoothstep(propCoreLit0, propCoreLit1, ndl))
        const dropMix = catchedShadow.oneMinus()
        const combined = max(coreMix, dropMix).clamp(float(0), float(1))

        const lit = base.mul(propLitTint)
        const shaded = base.mul(propShadowTint)
        const rgb = mix(lit, shaded, combined)
        return vec4(rgb, float(1))
    })()

    return material
}
