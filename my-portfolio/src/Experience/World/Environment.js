import * as THREE from 'three'
import Experience from '../Experience.js'
import {
    uniform, mix, positionWorld, cameraPosition, smoothstep, vec2, vec3, float,
    floor, fract, step, texture
} from 'three/tsl'
import { hashTexture } from './TSL/NoiseNodes.js'
import { dayNightTint, dayNightLitTint } from './DayNight.js'
import {
    syncPropStylizedSunDirection,
    propLitTint,
    propShadowTint,
    propCoreLit0,
    propCoreLit1
} from './scene/StylizedPropMaterial.js'

const TWO_PI = Math.PI * 2

/**
 * Slack, in world units, added on each side of the computed shadow depth so
 * the near plane never grazes the terrain (which rises ~3 above the shadow
 * centre and drops ~4 below it) and the far plane never clips the far corner.
 */
const SHADOW_DEPTH_MARGIN = 12

// Shadow bias expressed in WORLD units; converted to the camera's NDC bias in
// applyShadowQuality. Matches what the old hardcoded -0.0001 worked out to
// around noon, which is where it was tuned.
const SHADOW_BIAS_WORLD = 0.0035

/**
 * normalBias, counted in SHADOW-MAP TEXELS rather than in metres.
 *
 * Acne is a sampling problem, so its scale is the texel, not the world. Across
 * one texel the stored depth is constant while the real ground keeps falling
 * away, and how far it falls is `texel * tan(angle between light and normal)`.
 * With a 9.8 cm texel and the sun down at its floor of 17.5 degrees that is
 * 31 cm of depth inside a single sample -- which a fixed 4 cm normalBias, the
 * number that used to sit here, is not within seven times of covering. Hence
 * the bands across the flat sand when the sun is low.
 *
 * Counted in texels it tracks shadowCameraSize and shadowMapSize by itself, so
 * widening the shadow box can no longer quietly re-introduce the stripes --
 * the same reason SHADOW_BIAS_WORLD above is authored in metres and converted.
 *
 * The cost of raising it is peter-panning: the shadow slides off its caster by
 * roughly this distance, which shows up first as a gap under the character's
 * feet. That trade is the whole tuning range, so it has a slider in the debug
 * panel -- see setDebug.
 *
 * One texel is the starting point and NOT a verified number: shadows did not
 * render at all in the machine this was written on, so the value was reasoned
 * out rather than looked at. If the bands are still there with the slider at
 * zero, they are not shadow acne and this whole paragraph is barking up the
 * wrong tree.
 */
const SHADOW_NORMAL_BIAS_TEXELS = 1.0

/**
 * How wide the shadow edge is blurred, IN METRES.
 *
 * three's PCF filter takes its radius in TEXELS -- `radius.mul(texelSize.x)`
 * in ShadowFilterNode -- which means the authored number silently means a
 * different real distance every time the map size or the box size changes.
 * Doubling the map to 2048 halved the texel and so halved the softness: the
 * same `radius: 3` went from blurring 293 mm of world to 146 mm, and shadows
 * twice as sharp show twice as much of the edge crawl below.
 *
 * WHY SOFTNESS IS THE ANSWER TO THE CRAWL. The sun turns a full circle in six
 * minutes, which is 1 degree per second, which is about 8.7 mm of movement per
 * frame thirty metres out. That is 18% of a texel: never a clean jump to the
 * next one, just a permanent slide between two, and a hard edge sliding like
 * that reads as a fast repetitive twitch. Texel snapping cannot fix it, because
 * the grid being snapped to is derived from the light direction and therefore
 * turns with it. What does fix it is making the edge wider than the wobble --
 * at 350 mm of blur an 8.7 mm slide is a fortieth of the gradient and simply
 * cannot be seen.
 *
 * Which is also the right look here. This world is soft-edged and stylised;
 * nothing in it wants a crisp shadow.
 */
const SHADOW_SOFTNESS_WORLD = 0.35

/**
 * How far the sun is allowed to turn before the SHADOW is allowed to follow,
 * measured in texels of movement at the edge of the shadow box.
 *
 * THE ONE THING TEXEL SNAPPING CANNOT DO. Snapping quantises WHERE the shadow
 * camera sits, and that fixes the crawl from following the player. It does
 * nothing for the crawl from the sun turning, because the grid being snapped
 * to is built from the light direction: rotate the light and the whole grid
 * rotates with it, so every texel lands somewhere new no matter what the
 * centre does. The advice going around for this problem gets that wrong -- it
 * rebuilds its snapping basis from the current light direction every frame,
 * which is precisely the thing that is moving.
 *
 * So the direction itself is quantised. The sun crosses the sky at a degree a
 * second here, which is about 0.18 of a texel per frame at thirty metres: never
 * a clean step to the next texel, just a permanent slide between two, and that
 * slide is what reads as a fast repetitive twitch along every shadow edge.
 * Held to a grid instead, the shadow map is bit-identical for several frames
 * and then moves once, by a known amount.
 *
 * Two texels is the default: still for about seven frames at 60fps, then a
 * 98 mm step underneath 350 mm of blur -- under a third of the gradient, so
 * the step lands inside the softness and cannot be picked out.
 *
 * Only the SHADOW is quantised. The sun disc, the sky and the colour of the
 * light keep moving continuously; shading is a smooth dot product with no
 * edge to alias, so it has nothing to gain from this and everything to lose.
 */
const SHADOW_QUANT_TEXELS = 2.0

// Reusable temporaries for shadow texel-snapping (no per-frame allocation).
const _worldUp = new THREE.Vector3(0, 1, 0)
const _shadowRight = new THREE.Vector3()
const _shadowUp = new THREE.Vector3()
const _shadowCenter = new THREE.Vector3()

/**
 * Minimum elevation (sin of angle above horizon) for the shadow-casting
 * light direction. When the active body is near the horizon the shadow
 * frustum becomes extremely elongated and shadows disappear. Clamping to
 * this value keeps shadows visible at all times.
 */
const MIN_SHADOW_ELEVATION = 0.30

/**
 * Day/night keyframes over a normalized day [0..1):
 *   0.00 = midnight · 0.25 = sunrise · 0.50 = noon · 0.75 = sunset
 * Colours are pre-parsed into THREE.Color once (no per-frame allocation).
 */
const CYCLE_STOPS = [
    // Each phase carries its own grading tint (`tint` + `tintStrength`) that is
    // multiplied onto the scene materials, plus the sky/light palette.
    // --- Deep night (kept readable: bluish, never pitch black) ---
    { name: 'Midnight', t: 0.00, top: '#0a1230', bottom: '#1a2348', sun: '#223052', diskInt: 0.0, haloInt: 0.0,
      sunLight: '#8a98cf', sunLightInt: 0.45, amb: '#41507f', ambInt: 0.62,
      hemiSky: '#37456f', hemiGround: '#222a44', hemiInt: 0.55, moonInt: 0.60, nightFactor: 1.00,
      tint: '#666f8f', tintStrength: 1.0 },
    // --- First light (pre-dawn) ---
    { name: 'First light', t: 0.20, top: '#23305e', bottom: '#6a5078', sun: '#ffb27a', diskInt: 0.12, haloInt: 0.18,
      sunLight: '#9a8fbe', sunLightInt: 0.65, amb: '#535878', ambInt: 0.62,
      hemiSky: '#566aa0', hemiGround: '#5e5060', hemiInt: 0.55, moonInt: 0.22, nightFactor: 0.58,
      tint: '#8a82b4', tintStrength: 0.94 },
    // --- Sunrise (orange horizon) ---
    { name: 'Sunrise', t: 0.25, top: '#5577b8', bottom: '#ffae73', sun: '#ffd9a0', diskInt: 0.85, haloInt: 0.55,
      sunLight: '#ffcaa0', sunLightInt: 1.10, amb: '#b9bcd8', ambInt: 0.75,
      hemiSky: '#9ab8e6', hemiGround: '#ffcba0', hemiInt: 0.60, moonInt: 0.0, nightFactor: 0.15,
      tint: '#e2bb98', tintStrength: 1.0 },
    // --- Morning ---
    { name: 'Morning', t: 0.33, top: '#6aa6ee', bottom: '#dcefff', sun: '#fff2d4', diskInt: 1.0, haloInt: 0.36,
      sunLight: '#fff0e0', sunLightInt: 1.55, amb: '#eef3ff', ambInt: 0.95,
      hemiSky: '#cfe2fb', hemiGround: '#fbeccb', hemiInt: 0.70, moonInt: 0.0, nightFactor: 0.0,
      tint: '#fff5e5', tintStrength: 0.84 },
    // --- Noon (full day) ---
    { name: 'Noon', t: 0.50, top: '#4a93e8', bottom: '#dff0ff', sun: '#fff6dc', diskInt: 1.0, haloInt: 0.30,
      sunLight: '#fff4e6', sunLightInt: 1.70, amb: '#ffffff', ambInt: 1.00,
      hemiSky: '#dbeafe', hemiGround: '#fef3c7', hemiInt: 0.70, moonInt: 0.0, nightFactor: 0.0,
      tint: '#f7f4e4', tintStrength: 0.93 },
    // --- Afternoon / tarde (warm golden) ---
    { name: 'Afternoon', t: 0.68, top: '#5b9be0', bottom: '#ffe9c2', sun: '#ffe8b8', diskInt: 1.0, haloInt: 0.42,
      sunLight: '#ffdca8', sunLightInt: 1.50, amb: '#fff2dd', ambInt: 0.90,
      hemiSky: '#bcd6f2', hemiGround: '#ffe2b0', hemiInt: 0.70, moonInt: 0.0, nightFactor: 0.0,
      tint: '#ffe3bc', tintStrength: 0.94 },
    // --- Sunset (strong orange) ---
    { name: 'Sunset', t: 0.76, top: '#6a5a86', bottom: '#ff7e5a', sun: '#ffb066', diskInt: 0.95, haloInt: 0.75,
      sunLight: '#ff9e6b', sunLightInt: 1.20, amb: '#c9aeb8', ambInt: 0.70,
      hemiSky: '#8a7fae', hemiGround: '#ffae84', hemiInt: 0.60, moonInt: 0.0, nightFactor: 0.12,
      tint: '#c98354', tintStrength: 0.93 },
    // --- Dusk ---
    { name: 'Dusk', t: 0.82, top: '#2e3360', bottom: '#8a5a78', sun: '#ff9a66', diskInt: 0.30, haloInt: 0.35,
      sunLight: '#9a86b6', sunLightInt: 0.60, amb: '#5a5e84', ambInt: 0.58,
      hemiSky: '#48548e', hemiGround: '#5e5366', hemiInt: 0.52, moonInt: 0.28, nightFactor: 0.55,
      tint: '#685f77', tintStrength: 0.96 },
    // --- Night falls ---
    { name: 'Night', t: 0.90, top: '#0c1430', bottom: '#1a2346', sun: '#223052', diskInt: 0.0, haloInt: 0.0,
      sunLight: '#8a98cf', sunLightInt: 0.45, amb: '#41507f', ambInt: 0.60,
      hemiSky: '#37456f', hemiGround: '#222a44', hemiInt: 0.54, moonInt: 0.50, nightFactor: 0.95,
      tint: '#394b8e', tintStrength: 0.93 }
]

export default class Environment {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        // Day/night cycle state.
        //
        // 47 s for a whole day AND night meant every phase went by in seconds:
        // sunset is about 0.17 of the cycle, so the golden hour lasted eight of
        // them. Six minutes gives each phase a minute or two to sit in, while
        // still being short enough that someone who only wanders around for two
        // minutes watches the light move.
        //
        // Everything downstream keys off `timeOfDay` (0..1), not off seconds,
        // so changing this stretches the whole cycle evenly — lamps, tints and
        // the sky all keep the points they were tuned at.
        this.timeOfDay = 0.5
        this.cycle = { enabled: true, durationSec: 360 }

        // Tunable params (exposed in the GUI)
        this.params = {
            litTintScale: 0.0,
            nightBrightness: 3.0,
            sunAzimuthDeg: 180,
            moonAzimuthDeg: 180,
            sunArcTilt: 0.45
        }

        // Reusable scratch objects (no per-frame allocation)
        this._sunDir = new THREE.Vector3()
        this._moonDir = new THREE.Vector3()
        this._tmpColorA = new THREE.Color()
        this._tmpColorB = new THREE.Color()
        this._whiteColor = new THREE.Color(1, 1, 1)

        this._prepareCycleStops()
        this.setAmbientLight()
        this.setSunLight()
        this.setSky()

        // Apply the starting time immediately so nothing flashes default colours
        this._applyTimeOfDay(this.timeOfDay)

        if (this.debug.active) {
            this.setDebug()
        }
    }

    _prepareCycleStops() {
        this.cycleStops = CYCLE_STOPS.map((s) => ({
            name: s.name,
            t: s.t,
            top: new THREE.Color(s.top),
            bottom: new THREE.Color(s.bottom),
            sun: new THREE.Color(s.sun),
            sunLight: new THREE.Color(s.sunLight),
            amb: new THREE.Color(s.amb),
            hemiSky: new THREE.Color(s.hemiSky),
            hemiGround: new THREE.Color(s.hemiGround),
            tint: new THREE.Color(s.tint),
            tintStrength: s.tintStrength,
            diskInt: s.diskInt,
            haloInt: s.haloInt,
            sunLightInt: s.sunLightInt,
            ambInt: s.ambInt,
            hemiInt: s.hemiInt,
            moonInt: s.moonInt,
            nightFactor: s.nightFactor
        }))
    }

    setAmbientLight() {
        this.ambientLight = new THREE.AmbientLight('#ffffff', 1.0)
        this.scene.add(this.ambientLight)
    }

    setSunLight() {
        const quality = this.experience.quality

        this.sunLight = new THREE.DirectionalLight('#fff4e6', 1.6)
        this.sunLight.shadow.camera.near = 0.5
        // castShadow, bias and normalBias are all quality-derived — see
        // applyShadowQuality.
        this.shadowNormalBiasTexels = SHADOW_NORMAL_BIAS_TEXELS
        this.shadowQuantTexels = SHADOW_QUANT_TEXELS
        // Needed by _quantiseShadowDir before applyShadowQuality has run once.
        this.shadowTexel = (2 * quality.shadowCameraSize) / quality.shadowMapSize

        this.applyShadowQuality()

        this.sunLight.position.set(4, 5, -3)
        this.sunLight.target.position.set(0, 0, 0)
        this.scene.add(this.sunLight.target)
        this.scene.add(this.sunLight)

        this.skyLight = new THREE.HemisphereLight('#dbeafe', '#fef3c7', 0.7)
        this.scene.add(this.skyLight)

        // Deliberately NOT subscribed to quality 'change'.
        //
        // Flipping castShadow creates or destroys the sun's shadow map, and
        // three's ShadowNode.updateBefore() reads `this.shadowMap.depthTexture`
        // with no null check while _reset() is free to leave shadowMap null.
        // So every castShadow transition is a window for that crash, and the
        // way to survive is to have as few of them as possible, at a moment
        // chosen between frames rather than inside the click handler.
        //
        // Renderer owns that moment and calls applyShadowQuality() from it.
        // See Renderer._applyQualityChange().
    }

    /**
     * Round a light direction onto a fixed angular grid, in place.
     *
     * Quantising the ANGLES rather than the vector keeps the step uniform: a
     * grid laid on x/y/z would be fine near the poles and coarse at the
     * equator. Azimuth and elevation both, because the sun's arc moves in
     * both. See SHADOW_QUANT_TEXELS for why this exists at all.
     *
     * @param {THREE.Vector3} dir  unit direction, modified in place
     */
    _quantiseShadowDir(dir) {
        const step = this.shadowQuantTexels * this.shadowTexel /
            this.experience.quality.shadowCameraSize
        if (!(step > 0)) return

        const azimuth = Math.round(Math.atan2(dir.z, dir.x) / step) * step
        const elevation = Math.round(
            Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) / step) * step

        const horizontal = Math.cos(elevation)
        dir.set(
            Math.cos(azimuth) * horizontal,
            Math.sin(elevation),
            Math.sin(azimuth) * horizontal
        ).normalize()
    }

    /**
     * Half the depth the shadow camera needs along the light axis, sized for
     * the WORST case the cycle can produce — the shallowest sun the clamp
     * allows — and therefore constant for a given quality level.
     *
     * The geometry: the ortho box's vertical axis in light space has
     * horizontal component `elev`, so a ground point `L` along the sun azimuth
     * only reaches the box edge at `L = sc / elev`, and its depth offset from
     * the centre is `L * horizontal`. Hence `sc * horizontal / elev` of depth
     * either side of the centre. Undersize this and the frustum's near plane
     * cuts the ground in a dead-straight line, correctly shadowed on one side
     * and flat on the other — it reads as a seam between two floor meshes.
     *
     * This used to track the LIVE elevation and rebuild the projection
     * whenever the range moved more than a unit. A full day here is 47
     * seconds, so that fires constantly — measured at 92 rebuilds in 120
     * frames around sunrise — and it turns a smooth change into a staircase.
     * `shadow.bias` is an NDC offset, so it scales with the depth range: every
     * step nudged the effective bias and the shadows shimmered. An ortho
     * shadow camera has UNIFORM depth precision, so holding the range at the
     * worst case costs nothing but a constant bias scale, and buys a shadow
     * projection that never changes mid-flight.
     */
    _shadowHalfDepthFor(sc) {
        const elev = MIN_SHADOW_ELEVATION
        const horizontal = Math.sqrt(Math.max(0, 1 - elev * elev))
        return (sc * horizontal) / elev + SHADOW_DEPTH_MARGIN
    }

    /**
     * Everything the quality level decides about shadows, in one place, and
     * re-run on every quality change — so switching level at runtime lands in
     * the same state a reload at that level would.
     */
    applyShadowQuality() {
        const quality = this.experience.quality
        const sc = quality.shadowCameraSize
        const cam = this.sunLight.shadow.camera

        this.sunLight.castShadow = quality.sunShadows

        cam.left = -sc; cam.right = sc; cam.top = sc; cam.bottom = -sc
        this._shadowHalfDepth = this._shadowHalfDepthFor(sc)
        cam.far = this._shadowHalfDepth * 2
        cam.updateProjectionMatrix()

        // `shadow.bias` is an NDC offset, so the same number means a different
        // distance depending on the depth range. Author it in world units and
        // convert, or it silently re-tunes itself whenever the range changes.
        this.sunLight.shadow.bias = -SHADOW_BIAS_WORLD / this._shadowHalfDepth

        // Shadow map size is locked to 1024x1024 to avoid reallocation crashes
        this.sunLight.shadow.mapSize.width = quality.shadowMapSize
        this.sunLight.shadow.mapSize.height = quality.shadowMapSize
        // Authored in metres, applied in texels -- see the constant. Kept at
        // least at 1 so it never degenerates into a single unfiltered tap.
        this.shadowSoftness = this.shadowSoftness ?? SHADOW_SOFTNESS_WORLD
        this.sunLight.shadow.radius = Math.max(
            1, this.shadowSoftness / ((2 * sc) / quality.shadowMapSize))

        // In texels, so it follows the box and the map. See the constant.
        //
        // This is the bias for a sun straight overhead. It is SCALED BY THE
        // ELEVATION every frame, in _applyTimeOfDay -- see the note there.
        this.shadowTexel = (2 * sc) / quality.shadowMapSize
        this.shadowNormalBiasBase = this.shadowTexel * this.shadowNormalBiasTexels
        this.sunLight.shadow.normalBias = this.shadowNormalBiasBase
    }

    setSky() {
        // Gradient
        this.skyTopColor = uniform(new THREE.Color('#86b8ff'))
        this.skyBottomColor = uniform(new THREE.Color('#f7fbff'))
        this.skyHorizonOffset = uniform(0.08)

        // Sun disk + halo (much more visible than before)
        this.skySunColor = uniform(new THREE.Color('#fff4d8'))
        this.skySunDirection = uniform(new THREE.Vector3(0, 1, 0))
        this.skySunDiskIntensity = uniform(1.0)
        this.skySunDiskSharpness = uniform(280.0) // lower = bigger disk (was 640)
        this.skySunHaloIntensity = uniform(0.35)
        this.skySunHaloSharpness = uniform(7.0)

        // Moon (night)
        this.skyMoonColor = uniform(new THREE.Color('#cdd6ff'))
        this.skyMoonDirection = uniform(new THREE.Vector3(0, -1, 0))
        this.skyMoonIntensity = uniform(0.0)
        this.skyMoonSharpness = uniform(900.0)

        // Stars (fades in at night)
        this.skyNightFactor = uniform(0.0)
        this.skyStarScale = uniform(55.0)      // grid density
        this.skyStarThreshold = uniform(0.90)  // higher = fewer stars
        this.skyStarSize = uniform(0.10)       // dot radius (in cell units)

        const viewDir = positionWorld.sub(cameraPosition).normalize()

        // Vertical gradient
        const height01 = viewDir.y.mul(0.5).add(0.5).add(this.skyHorizonOffset).clamp(0.0, 1.0)
        const gradient = smoothstep(0.0, 1.0, height01)
        const baseSky = mix(this.skyBottomColor, this.skyTopColor, gradient)

        // Sun disk + soft halo
        const sunDot = viewDir.dot(this.skySunDirection.normalize()).max(0.0)
        const sunDisk = sunDot.pow(this.skySunDiskSharpness).mul(this.skySunDiskIntensity)
        const sunHalo = sunDot.pow(this.skySunHaloSharpness).mul(this.skySunHaloIntensity)
        const sunContribution = this.skySunColor.mul(sunDisk.add(sunHalo))

        // Moon disk + tiny glow
        const moonDot = viewDir.dot(this.skyMoonDirection.normalize()).max(0.0)
        const moonDisk = moonDot.pow(this.skyMoonSharpness).mul(this.skyMoonIntensity)
        const moonGlow = moonDot.pow(float(16.0)).mul(this.skyMoonIntensity).mul(0.12)
        const moonContribution = this.skyMoonColor.mul(moonDisk.add(moonGlow))

        // Stars: round dots on a hashed grid, only above the horizon at night.
        // Project the sky dome onto a plane, split into cells, and drop one
        // randomly-placed round dot per "lit" cell (no streaks, just points).
        const upMask = smoothstep(0.0, 0.18, viewDir.y)
        const starProj = vec2(viewDir.x, viewDir.z)
            .div(viewDir.y.abs().add(0.35))
            .mul(this.skyStarScale)
        const cell = floor(starProj)
        const cellFract = fract(starProj)
        const cellRandom = texture(hashTexture, cell.mul(1 / 256).add(0.5 / 256))
        const hasStar = step(this.skyStarThreshold, cellRandom.r)
        // Random dot position inside the cell, kept away from edges (0.25..0.75)
        const starCenter = vec2(0.25, 0.25).add(vec2(cellRandom.g, cellRandom.b).mul(0.5))
        const starDist = cellFract.sub(starCenter).length()
        const starDot = smoothstep(this.skyStarSize, float(0.0), starDist)
        const stars = starDot.mul(hasStar).mul(cellRandom.a).mul(upMask).mul(this.skyNightFactor)
        const starContribution = vec3(0.95, 0.97, 1.0).mul(stars)

        const skyColor = baseSky
            .add(sunContribution)
            .add(moonContribution)
            .add(starContribution)

        const material = new THREE.MeshBasicNodeMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            fog: false
        })
        material.colorNode = vec3(skyColor)

        const geometry = new THREE.SphereGeometry(1, 32, 16)
        this.sky = new THREE.Mesh(geometry, material)
        this.sky.scale.setScalar(60)
        this.sky.frustumCulled = false
        this.scene.add(this.sky)
    }

    /** Find the keyframe segment for `t` (handles wrap-around) and blend it. */
    _applyTimeOfDay(t) {
        const stops = this.cycleStops
        const n = stops.length

        let i0 = n - 1
        let i1 = 0
        for (let i = 0; i < n; i++) {
            if (stops[i].t > t) {
                i1 = i
                i0 = (i - 1 + n) % n
                break
            }
            if (i === n - 1) {
                i0 = i
                i1 = 0
            }
        }

        const a = stops[i0]
        const b = stops[i1]
        let span = b.t - a.t
        if (span <= 0) span += 1
        let local = t - a.t
        if (local < 0) local += 1
        const f = THREE.MathUtils.clamp(local / span, 0, 1)

        const lerp = THREE.MathUtils.lerp
        const cA = this._tmpColorA
        const cB = this._tmpColorB

        // --- Sky uniforms ---
        this.skyTopColor.value.copy(cA.copy(a.top).lerp(cB.copy(b.top), f))
        this.skyBottomColor.value.copy(cA.copy(a.bottom).lerp(cB.copy(b.bottom), f))
        this.skySunColor.value.copy(cA.copy(a.sun).lerp(cB.copy(b.sun), f))
        this.skySunDiskIntensity.value = lerp(a.diskInt, b.diskInt, f)
        this.skySunHaloIntensity.value = lerp(a.haloInt, b.haloInt, f)
        this.skyMoonIntensity.value = lerp(a.moonInt, b.moonInt, f)
        const nightFactor = lerp(a.nightFactor, b.nightFactor, f)
        this.skyNightFactor.value = nightFactor

        // --- Sun direction from time of day ---
        // angle: t=0.25 -> elevation 0 (sunrise), t=0.50 -> elevation +1 (noon)
        const sunAngle = (t - 0.25) * TWO_PI
        const sunElev = Math.sin(sunAngle)
        const sunHoriz = Math.cos(sunAngle)
        // Base arc: East-West sweep (X) with a constant lean (Z), then spun
        // around Y by the azimuth so the sun can rise from another side.
        {
            let dx = sunHoriz * 0.8
            let dz = -this.params.sunArcTilt
            const az = this.params.sunAzimuthDeg * (Math.PI / 180)
            const ca = Math.cos(az)
            const sa = Math.sin(az)
            this._sunDir.set(dx * ca - dz * sa, sunElev, dx * sa + dz * ca).normalize()
        }

        // --- Moon direction (independent azimuth) ---
        const moonAngle = (t - 0.75) * TWO_PI   // moon rises at t=0.75
        const moonElev = Math.sin(moonAngle)
        const moonHoriz = Math.cos(moonAngle)
        {
            let dx = moonHoriz * 0.8
            let dz = -this.params.sunArcTilt
            const az = this.params.moonAzimuthDeg * (Math.PI / 180)
            const ca = Math.cos(az)
            const sa = Math.sin(az)
            this._moonDir.set(dx * ca - dz * sa, moonElev, dx * sa + dz * ca).normalize()
        }

        // Sky shader: real sun & moon positions (visual disks, no smoothing needed)
        this.skySunDirection.value.copy(this._sunDir)
        this.skyMoonDirection.value.copy(this._moonDir)

        // --- Lights ---
        // Smooth crossfade between sun and moon directional light.
        // sunBlend is driven directly by sunElev (sin of the sun's arc angle):
        //   sunElev > 0  → sun above horizon → sunBlend → 1
        //   sunElev < 0  → sun below horizon → sunBlend → 0 (moon takes over)
        // A smoothstep over a small band around 0 prevents any hard snap.
        const sunBlend = THREE.MathUtils.smoothstep(sunElev, -0.18, 0.18)

        // Smoothly blended light direction
        const blendedDir = this._sunDir.clone().multiplyScalar(sunBlend)
            .add(this._moonDir.clone().multiplyScalar(1 - sunBlend))
            .normalize()

        // --- Shadow-safe light direction ---
        // Clamp the elevation so the shadow frustum never becomes too
        // elongated. This keeps shadows visible even at sunrise/sunset.
        const shadowDir = blendedDir.clone()
        if (shadowDir.y < MIN_SHADOW_ELEVATION) {
            shadowDir.y = MIN_SHADOW_ELEVATION
            shadowDir.normalize()
        }
        this._quantiseShadowDir(shadowDir)

        // Bias scaled by how low the sun is.
        //
        // A fixed normalBias is correct at exactly one elevation and wrong at
        // every other one, because the depth a single texel spans is
        // texel * tan(angle between the light and the surface normal). Flat
        // ground under a sun straight overhead needs almost none; the same
        // ground at the 17 degree floor of this cycle needs 155 mm, three
        // times what the flat number gives it. So the leftover twitch came and
        // went with the hour of the day -- acne appearing as the sun dropped
        // and clearing again as it rose.
        //
        // shadowDir.y IS the sine of the elevation (unit vector) and is already
        // clamped to MIN_SHADOW_ELEVATION, so dividing by it costs nothing, can
        // never blow up, and lands within a few percent of the tangent it is
        // standing in for: 1x overhead, 3.3x at the floor.
        this.sunLight.shadow.normalBias = this.shadowNormalBiasBase / shadowDir.y

        // Constant: the range is sized for the worst case up front, so the
        // shadow projection never has to be rebuilt mid-cycle.
        const sunDistance = this._shadowHalfDepth
        this.sunLight.position.copy(shadowDir).multiplyScalar(sunDistance)

        // --- Centre the shadow camera on the character (texel-snapped) ---
        // Without this, the shadow frustum is centred on (0,0,0) and at low
        // light angles the limited frustum box only covers part of the scene.
        //
        // The centre is SNAPPED to whole shadow-map texels in the light's view
        // plane. If we followed the character at continuous float coords the
        // world→texel mapping would slide a fraction of a texel every frame and
        // the shadow edges would crawl/shimmer while moving. Snapping keeps the
        // mapping stable so shadows stay rock-steady.
        const character = this.experience.world?.character
        if (character) {
            const quality = this.experience.quality
            const cp = character.position

            // Texel-plane basis. Matches DirectionalLightShadow's lookAt camera
            // (up = +Y): right = normalize(up × dir), up' = dir × right.
            _shadowRight.crossVectors(_worldUp, shadowDir)
            if (_shadowRight.lengthSq() < 1e-6) _shadowRight.set(1, 0, 0)
            _shadowRight.normalize()
            _shadowUp.crossVectors(shadowDir, _shadowRight) // already unit length

            // World size of one shadow-map texel along those axes.
            const texel = (2 * quality.shadowCameraSize) / quality.shadowMapSize

            _shadowCenter.set(cp.x, 0, cp.z)
            const along = _shadowCenter.dot(shadowDir)
            const a = Math.round(_shadowCenter.dot(_shadowRight) / texel) * texel
            const b = Math.round(_shadowCenter.dot(_shadowUp) / texel) * texel

            // Reconstruct the snapped centre, then place target + light from it.
            _shadowCenter.copy(_shadowRight).multiplyScalar(a)
                .addScaledVector(_shadowUp, b)
                .addScaledVector(shadowDir, along)

            this.sunLight.target.position.copy(_shadowCenter)
            this.sunLight.position.copy(_shadowCenter).addScaledVector(shadowDir, sunDistance)
            this.sunLight.target.updateMatrixWorld()
        }

        this.sunLight.color.copy(cA.copy(a.sunLight).lerp(cB.copy(b.sunLight), f))
        this.sunLight.intensity = lerp(a.sunLightInt, b.sunLightInt, f)

        // Night brightness boost only ramps in as it gets dark, so daytime
        // lighting is untouched.
        const brightnessBoost = lerp(1.0, this.params.nightBrightness, nightFactor)

        this.ambientLight.color.copy(cA.copy(a.amb).lerp(cB.copy(b.amb), f))
        this.ambientLight.intensity = lerp(a.ambInt, b.ambInt, f) * brightnessBoost

        this.skyLight.color.copy(cA.copy(a.hemiSky).lerp(cB.copy(b.hemiSky), f))
        this.skyLight.groundColor.copy(cA.copy(a.hemiGround).lerp(cB.copy(b.hemiGround), f))
        this.skyLight.intensity = lerp(a.hemiInt, b.hemiInt, f) * brightnessBoost

        // --- Per-phase grading tint ---
        // For each side of the segment, build "white -> phase tint" by its
        // strength, then interpolate the two. UNLIT materials get the full tint;
        // LIT materials get a scaled-down version so they don't double-darken.
        const w = this._whiteColor

        // Unlit (full)
        cA.copy(w).lerp(a.tint, a.tintStrength)
        cB.copy(w).lerp(b.tint, b.tintStrength)
        dayNightTint.value.copy(cA).lerp(cB, f)

        // Lit (reduced)
        const litScale = this.params.litTintScale
        cA.copy(w).lerp(a.tint, a.tintStrength * litScale)
        cB.copy(w).lerp(b.tint, b.tintStrength * litScale)
        dayNightLitTint.value.copy(cA).lerp(cB, f)
    }

    update() {
        const camera = this.experience.camera.instance

        if (this.cycle.enabled && this.cycle.durationSec > 0) {
            const dt = this.experience.time.delta * 0.001
            this.timeOfDay = (this.timeOfDay + dt / this.cycle.durationSec) % 1
            if (this.timeOfDay < 0) this.timeOfDay += 1
            this._applyTimeOfDay(this.timeOfDay)
        }

        if (this.sky) {
            this.sky.position.copy(camera.position)
        }

        syncPropStylizedSunDirection(this.sunLight)
    }

    setDebug() {
        const f = this.debug.ui.addFolder('Environment · Day/Night')
        f.close()

        const cycleCtrl = f.add(this, 'timeOfDay', 0, 1, 0.001).name('Time of day').onChange((v) => {
            this._applyTimeOfDay(v)
        })
        f.add(this.cycle, 'enabled').name('Cycle running')
        f.add(this.cycle, 'durationSec', 5, 600, 1).name('Day length (s)')

        // Acne at one end, peter-panning at the other, and the sweet spot moves
        // with the sun -- so it is tuned by looking, at the lowest sun of the
        // day. Bands across the flat sand: too low. A gap between the character
        // and his own shadow: too high. See SHADOW_NORMAL_BIAS_TEXELS.
        f.add(this, 'shadowNormalBiasTexels', 0, 4, 0.05)
            .name('Sombras · normalBias (texels)')
            .onChange(() => this.applyShadowQuality())

        // The knob for the edge crawl. Wider hides it, at the cost of contact
        // definition. See SHADOW_SOFTNESS_WORLD.
        f.add(this, 'shadowSoftness', 0.05, 1.2, 0.01)
            .name('Sombras · suavizado (m)')
            .onChange(() => this.applyShadowQuality())

        // 0 = the sun turns continuously and the edges crawl again. Higher
        // holds the shadow still for longer between bigger steps. See
        // SHADOW_QUANT_TEXELS.
        f.add(this, 'shadowQuantTexels', 0, 8, 0.25)
            .name('Sombras · cuantización (texels)')

        // Quick jump presets
        const presets = {
            sunrise: () => { this.timeOfDay = 0.25; this._applyTimeOfDay(0.25); cycleCtrl.updateDisplay() },
            noon: () => { this.timeOfDay = 0.50; this._applyTimeOfDay(0.50); cycleCtrl.updateDisplay() },
            afternoon: () => { this.timeOfDay = 0.68; this._applyTimeOfDay(0.68); cycleCtrl.updateDisplay() },
            sunset: () => { this.timeOfDay = 0.76; this._applyTimeOfDay(0.76); cycleCtrl.updateDisplay() },
            night: () => { this.timeOfDay = 0.0; this._applyTimeOfDay(0.0); cycleCtrl.updateDisplay() }
        }
        f.add(presets, 'sunrise').name('→ Sunrise')
        f.add(presets, 'noon').name('→ Noon')
        f.add(presets, 'afternoon').name('→ Afternoon')
        f.add(presets, 'sunset').name('→ Sunset')
        f.add(presets, 'night').name('→ Night')

        // --- Sun direction / disk ---
        const sun = f.addFolder('Sun')
        sun.close()
        sun.add(this.params, 'sunAzimuthDeg', -180, 180, 1).name('Direction (azimuth °)')
            .onChange(() => this._applyTimeOfDay(this.timeOfDay))
        sun.add(this.params, 'sunArcTilt', 0, 1.5, 0.01).name('Arc tilt')
            .onChange(() => this._applyTimeOfDay(this.timeOfDay))

        // --- Moon ---
        const moon = f.addFolder('Moon')
        moon.close()
        moon.add(this.params, 'moonAzimuthDeg', -180, 180, 1).name('Direction (azimuth °)')
            .onChange(() => this._applyTimeOfDay(this.timeOfDay))
        sun.add(this.skySunDiskSharpness, 'value', 60, 800, 1).name('Disk size (sharpness)')
        sun.add(this.skySunHaloIntensity, 'value', 0, 1.5, 0.01).name('Halo intensity')
        sun.add(this.skySunHaloSharpness, 'value', 1, 40, 0.1).name('Halo size')

        // --- Per-phase grading tint (Bruno-style, but simple) ---
        const tints = f.addFolder('Phase tints')
        tints.close()
        tints.add(this.params, 'nightBrightness', 0.5, 3.0, 0.05).name('Night light boost')
            .onChange(() => this._applyTimeOfDay(this.timeOfDay))
        tints.add(this.params, 'litTintScale', 0, 1, 0.01).name('Lit surfaces tint amount')
            .onChange(() => this._applyTimeOfDay(this.timeOfDay))
        for (const stop of this.cycleStops) {
            const pf = tints.addFolder(stop.name)
            pf.close()
            pf.addColor({ c: '#' + stop.tint.getHexString() }, 'c').name('Tint colour')
                .onChange((v) => { stop.tint.set(v); this._applyTimeOfDay(this.timeOfDay) })
            pf.add(stop, 'tintStrength', 0, 1, 0.01).name('Tint strength')
                .onChange(() => this._applyTimeOfDay(this.timeOfDay))
        }

        // --- Stars ---
        const stars = f.addFolder('Stars')
        stars.close()
        stars.add(this.skyStarScale, 'value', 20, 140, 1).name('Density')
        stars.add(this.skyStarThreshold, 'value', 0.7, 0.99, 0.005).name('Sparseness')
        stars.add(this.skyStarSize, 'value', 0.02, 0.3, 0.005).name('Dot size')

        const sp = this.debug.ui.addFolder('Stylized props (TSL)')
        sp.close()
        const spCtrls = []
        spCtrls.push(sp.add(propCoreLit0, 'value', -1, 1, 0.01).name('Core shadow · edge 0 (N·L)'))
        spCtrls.push(sp.add(propCoreLit1, 'value', -1, 1, 0.01).name('Core shadow · edge 1 (N·L)'))
        const lit = propLitTint.value
        spCtrls.push(sp.add(lit, 'x', 0.5, 2.5, 0.01).name('Lit tint · X'))
        spCtrls.push(sp.add(lit, 'y', 0.5, 2.5, 0.01).name('Lit tint · Y'))
        spCtrls.push(sp.add(lit, 'z', 0.5, 2.5, 0.01).name('Lit tint · Z'))
        const sh = propShadowTint.value
        spCtrls.push(sp.add(sh, 'x', 0.2, 1.2, 0.01).name('Shadow tint · X'))
        spCtrls.push(sp.add(sh, 'y', 0.2, 1.2, 0.01).name('Shadow tint · Y'))
        spCtrls.push(sp.add(sh, 'z', 0.2, 1.2, 0.01).name('Shadow tint · Z'))
        const resetStylized = {
            reset() {
                propCoreLit0.value = -0.22
                propCoreLit1.value = 0.52
                lit.set(1.04, 1.01, 0.96)
                sh.set(0.58, 0.56, 0.68)
                for (const c of spCtrls) c.updateDisplay()
            }
        }
        sp.add(resetStylized, 'reset').name('Reset stylized props')
    }
}
