/**
 * Minimal “folio-style” shading for static props: Lambert-family node material
 * with stylized core shadow (N·L band) + projected shadow map, no terrain bounce.
 */
import * as THREE from 'three'
import {
    Fn, float, vec3, vec4,
    uniform,
    texture, uv,
    normalWorld, positionWorld, cameraPosition,
    mix, smoothstep, max, pow, normalize,
    If, Discard
} from 'three/tsl'
import { dayNightTint } from '../DayNight.js'
import { REAL_SHADOWS_SUPPORTED } from '../../Utils/DeviceCaps.js'

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
 * @param {boolean} [options.mapAlpha] Use texture alpha in output (transparent cutout / billboard)
 * @param {number} [options.alphaCutoff] glTF alphaMode MASK: DISCARD below this
 *   alpha and stay fully opaque (keeps depth write). Preferred over `mapAlpha`
 *   for foliage — blending without depth write makes leaves show through each
 *   other. Takes precedence over `mapAlpha` when > 0.
 * @param {number} [options.gloss] 0 = matte (default). Above 0 adds a stylized
 *   specular highlight from the same fake sun the shading uses, which is what
 *   sells "moulded plastic" (beach ball) versus "cloth/matte" props.
 * @param {number} [options.shininess] Highlight tightness; higher = smaller dot.
 */
export function createStylizedPropNodeMaterial(options = {}) {
    const {
        map = null,
        color = 0xffffff,
        flatShading = false,
        mapAlpha = false,
        alphaCutoff = 0,
        gloss = 0,
        shininess = 26
    } = options

    // Cutout (MASK) wins over blending: opaque + depth write + discard.
    const useCutout = alphaCutoff > 0 && !!map
    const useBlend = mapAlpha && !!map && !useCutout

    const tc = toThreeColor(color)
    const tintRgb = uniform(new THREE.Vector3(tc.r, tc.g, tc.b))
    // Exposed so consumers (e.g. Coblestone's GUI) can retint live.
    // (assigned to userData after material creation below)

    const material = new THREE.MeshLambertNodeMaterial({
        flatShading,
        transparent: useBlend,
        depthWrite: !useBlend
    })
    if (map) material.map = map
    material.userData.uTint = tintRgb

    const catchedShadow = float(1).toVar()

    // Custom shadow hook — only where the real shadow pipeline exists. On
    // Android this hook + three's TEXTURE_COMPARE fallback fails to build and
    // the prop simply vanishes (see Utils/DeviceCaps.js). Without the hook,
    // catchedShadow stays 1 → no drop shadows, everything else identical.
    if (REAL_SHADOWS_SUPPORTED) {
        material.receivedShadowNode = Fn(([shadow]) => {
            catchedShadow.mulAssign(shadow.r)
            return float(1)
        })
    }

    material.outputNode = Fn(() => {
        const texel = map ? texture(map, uv()) : null
        const base = map ? texel.rgb.mul(tintRgb) : tintRgb

        // Alpha cutout: kill the fragment outright so the leaf still writes
        // depth where it IS opaque — that's what makes overlapping fronds
        // occlude each other correctly.
        if (useCutout) {
            If(texel.a.lessThan(float(alphaCutoff)), () => { Discard() })
        }

        const N = normalWorld.normalize()
        const ndl = N.dot(propSunDirection.normalize())
        const coreMix = float(1).sub(smoothstep(propCoreLit0, propCoreLit1, ndl))
        const dropMix = catchedShadow.oneMinus()
        const combined = max(coreMix, dropMix).clamp(float(0), float(1))

        const lit = base.mul(propLitTint)
        const shaded = base.mul(propShadowTint)
        let rgb = mix(lit, shaded, combined).mul(dayNightTint)

        // Blinn-Phong style highlight, driven by the SAME fake sun direction the
        // core shading uses so it never contradicts the stylized lighting.
        if (gloss > 0) {
            const V = normalize(cameraPosition.sub(positionWorld))
            const H = normalize(propSunDirection.normalize().add(V))
            const spec = pow(max(N.dot(H), float(0)), float(shininess)).mul(gloss)
            // Fades with the core shadow: no gleam on the dark side.
            rgb = rgb.add(spec.mul(combined.oneMinus()).mul(dayNightTint))
        }

        const outA = useBlend ? texel.a : float(1)
        return vec4(rgb, outA)
    })()

    return material
}
