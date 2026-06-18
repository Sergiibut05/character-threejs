/**
 * Shared day/night state — global multiplicative colours updated every frame
 * by `Environment` from the current phase (sunrise / noon / afternoon / ...).
 *
 * Two tints, because materials fall into two families:
 *
 *   - `dayNightTint`     → UNLIT / emissive materials (stylized props, grass,
 *                          river water). They ignore scene lights, so the tint
 *                          is the ONLY thing that grades them: full strength.
 *
 *   - `dayNightLitTint`  → LIT materials (floor, foliage, riverbed) that already
 *                          react to the real lights + shadows. They only get a
 *                          gentler tint so they don't "double-darken" (which is
 *                          why tree leaves looked far too dark at night).
 *
 * Day = (1, 1, 1) -> authored colour preserved.
 */
import * as THREE from 'three'
import { uniform } from 'three/tsl'

export const dayNightTint = uniform(new THREE.Color(1, 1, 1))
export const dayNightLitTint = uniform(new THREE.Color(1, 1, 1))
