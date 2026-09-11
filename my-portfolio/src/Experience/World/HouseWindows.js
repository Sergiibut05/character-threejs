import * as THREE from 'three'
import { uniform, color, vec3, mix } from 'three/tsl'
import Experience from '../Experience.js'
import { dayNightTint } from './DayNight.js'

/**
 * HouseWindows — the house's panes: black all day, lit from within at night.
 *
 * Same trick as the street lamps, and deliberately so: a warm colour divided
 * by its own luminance and pushed above 1.0, on an unlit material. Above 1 is
 * what matters -- the renderer's bloom pass only picks up what crosses that
 * threshold, and dividing by luminance first is what keeps a saturated orange
 * from washing out to white on the way up. See StreetLamps._makeLightMaterial.
 *
 * Two things are its own, though:
 *
 * The day colour is a FIXED dark, not the atlas patch dimmed. The lamps sample
 * their texture and multiply it down, which works because their glass sits on
 * a patch that happens to be dark. These panes have no material of their own
 * in the GLB and land on whatever the Tiny atlas gives them, so "dark" would
 * have been left to chance. They are meant to read as black glass by day, so
 * they are told to be.
 *
 * And they are warmer and softer than a street lamp. A sodium lamp outside and
 * a lamp behind a curtain are not the same light, and using the lamp's orange
 * here made the house look like it was on fire.
 *
 * Resolved lazily: the house is a decorative asset that arrives whenever it
 * arrives, and PatioScene builds it from a `sourceLoaded` callback.
 */

// The panes, by the names they carry in house-compressed.glb. NOT window1 --
// the first one is just `window`, which is exactly the sort of thing that
// makes a silent no-op if it is guessed instead of read.
const PANE_NAMES = ['window', 'window2', 'window3']

const DAY_COLOR = '#0b0d11'    // near-black glass; still takes the day tint
const GLOW_TINT = '#ffb457'    // warm interior light, softer than the lamps
const GLOW_INTENSITY = 1.15    // >1 so bloom catches it

export default class HouseWindows {
    constructor() {
        this.experience = new Experience()

        this.resolved = false
        this.panes = []
        this.material = null
        this.uNight = uniform(0)      // 0 day → 1 night

        this._resolve()
    }

    _resolve() {
        const house = this.experience.world?.patioScene?.pieces?.house?.root
        if (!house) return false

        for (const name of PANE_NAMES) {
            const node = house.getObjectByName(name)
            if (node) this.panes.push(node)
        }
        if (!this.panes.length) return false

        this.material = this._makeMaterial()
        for (const pane of this.panes) {
            pane.traverse((child) => {
                if (!child.isMesh) return
                child.material = this.material
                // A pane that is glowing must not also be casting: its own
                // shadow would sit across the light it is supposed to be
                // throwing.
                child.castShadow = false
                child.receiveShadow = false
            })
        }

        if (this.panes.length !== PANE_NAMES.length) {
            console.warn(
                `HouseWindows: found ${this.panes.length} of ${PANE_NAMES.length} panes ` +
                `(${PANE_NAMES.join(', ')}) — check the names in house-compressed.glb`
            )
        }

        this.resolved = true
        return true
    }

    _makeMaterial() {
        const warm = color(GLOW_TINT)
        const lum = warm.dot(vec3(0.2126, 0.7152, 0.0722)).max(0.0001)
        const nightGlow = warm.div(lum).mul(GLOW_INTENSITY)
        const dayCol = color(DAY_COLOR).mul(dayNightTint)

        const mat = new THREE.MeshBasicNodeMaterial()
        mat.colorNode = mix(dayCol, nightGlow, this.uNight)
        mat.fog = false
        return mat
    }

    update() {
        if (!this.resolved) { if (!this._resolve()) return }
        const nf = this.experience.world?.environment?.skyNightFactor?.value ?? 0
        // The same dusk band the lamps use, on purpose: the windows and the
        // street lights coming on together is what reads as evening falling.
        // Two different curves would read as two unrelated bugs.
        this.uNight.value = THREE.MathUtils.smoothstep(nf, 0.40, 0.60)
    }

    destroy() {
        this.material?.dispose?.()
        this.panes.length = 0
    }
}
