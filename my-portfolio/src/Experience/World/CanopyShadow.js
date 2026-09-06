import * as THREE from 'three'
import {
    uv, vec2, vec3, vec4, float, uniform, smoothstep, clamp, max,
    length, normalize, dot, pow, positionLocal, instancedArray
} from 'three/tsl'
import Experience from '../Experience.js'
import { propSunDirection } from './scene/StylizedPropMaterial.js'
import { ignoreAO } from './aoMask.js'

/**
 * CanopyShadow — the pool of shade a tree drops, drawn instead of cast.
 *
 * WHY THE CANOPY DOES NOT USE THE SHADOW MAP
 *
 * The leaves are camera-facing billboards whose alpha cutout is sampled through
 * wind-rotated UVs. Both halves of that are fatal to a shadow map, separately:
 *
 *   - a billboard turns to face the CAMERA, so it shows the sun a different
 *     silhouette every time the player moves. The tree's shadow re-forms as you
 *     walk around it, which no amount of bias or filtering can settle;
 *   - the alpha test decides per texel whether a leaf is there at all, and the
 *     wind moves the UVs it reads every frame, so the silhouette boils even
 *     standing still.
 *
 * That is the shimmering. It was never a depth-precision problem, so none of
 * the depth-precision knobs were ever going to fix it.
 *
 * WHAT THIS DRAWS INSTEAD
 *
 * One soft ellipse per tree, on the ground, and the reason it reads as shade
 * rather than as a sticker is that it does what the real thing does:
 *
 *   - it LEANS. The centre slides away from the sun by the canopy's height over
 *     the tangent of the sun's elevation, so at midday it sits under the tree
 *     and by evening it has stepped out to the side;
 *   - it STRETCHES along that same heading as the sun drops;
 *   - it goes out at night, and not by fading to transparent: the mesh is
 *     hidden outright. A quad with nothing to say is still a quad being drawn,
 *     and this project has been bitten three times by exactly that.
 *
 * Everything is a fraction of the quad, never metres, so a tree scaled up in
 * Blender gets a proportionally bigger pool for free.
 *
 * The trunk keeps its real cast shadow. It is honest geometry that holds still,
 * it anchors the pool to the tree, and at a low sun it is what draws the long
 * shadow the pool deliberately does not try to reach.
 *
 * THE WHOLE SHAPE IS COPIED FROM Footprints.js ON PURPOSE
 *
 * Not just the material -- the instancing too. Two earlier attempts drew
 * nothing at all: quads that appeared the instant the material was made
 * opaque and vanished again the instant it was not.
 *
 * What they had in common was THREE.InstancedMesh. Every transparent
 * instanced thing in this project that actually renders -- footprints,
 * fireflies, the fire's flames, embers and halo, the confetti -- is a plain
 * THREE.Mesh with `mesh.count` set and its positions read from an
 * instancedArray in a positionNode. There is not one InstancedMesh among
 * them. Whatever the reason, the pattern that works here is not the one that
 * looked obvious, so this stops arguing and follows it.
 */

/** How far past the canopy radius the quad reaches, to fit the lean + stretch. */
const QUAD_MARGIN = 2.3

/** Below this the sun is too low to trust; past it the ellipse would run away. */
const MIN_ELEVATION = 0.22

export default class CanopyShadow {
    /**
     * @param {THREE.Object3D[]} references  one per tree — placement only
     * @param {number} canopyRadius  horizontal half-extent of the leaves, metres
     * @param {number} canopyHeight  height of the canopy's centre, metres
     */
    constructor(references, canopyRadius, canopyHeight) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        this.quadRadius = canopyRadius * QUAD_MARGIN

        // Normalised against the quad, so per-tree scale is the matrix's job.
        this.uCanopyR = uniform(canopyRadius / this.quadRadius)
        this.uCanopyH = uniform(canopyHeight / this.quadRadius)
        this.uStrength = uniform(0.34)
        this.uSoftness = uniform(1.5)
        this.uNight = uniform(0)
        this.uColor = uniform(new THREE.Color('#241f2b'))

        this._build(references)
        if (this.debug.active) this.setDebug()
    }

    _build(references) {
        const count = references.length

        // Per-tree placement: xyz = where the tree stands, w = its scale.
        // Read in the positionNode below, exactly as Footprints does.
        const data = new Float32Array(count * 4)
        const position = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        const scale = new THREE.Vector3()

        for (let i = 0; i < count; i++) {
            const ref = references[i]
            ref.updateWorldMatrix(true, false)
            ref.matrixWorld.decompose(position, quaternion, scale)
            data[i * 4 + 0] = position.x
            // Sits ON the ground; polygonOffset below does the rest, so this
            // does not need a lift big enough to float on a slope.
            data[i * 4 + 1] = position.y + 0.02
            data[i * 4 + 2] = position.z
            // Rotation deliberately dropped: the shader reasons in world XZ,
            // so a turned quad would turn the sun with it. A round pool
            // cannot tell anyway.
            data[i * 4 + 3] = (Math.max(scale.x, scale.z) || 1) * this.quadRadius
        }

        const d = instancedArray(data, 'vec4').toAttribute()

        // A UNIT quad: local x and z run −1..1, which is already the space the
        // ellipse below is written in, and already oriented like world XZ.
        const geometry = new THREE.PlaneGeometry(2, 2)
        geometry.rotateX(-Math.PI / 2)

        const material = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false
        })
        // No depth write means no say over ambient occlusion -- it abstains
        // rather than overriding the ground it is lying on. See aoMask.js.
        ignoreAO(material)

        material.positionNode = vec3(
            d.x.add(positionLocal.x.mul(d.w)),
            d.y,
            d.z.add(positionLocal.z.mul(d.w))
        )

        // The quad's own −1..1 space, taken from the UVs and NOT from
        // positionLocal.
        //
        // positionLocal is what the positionNode above just rewrote, so by the
        // time the fragment stage reads it back it is a world coordinate in
        // the tens of metres, not a number between −1 and 1. Every pixel then
        // measured itself as hopelessly outside the ellipse, the falloff came
        // out zero across all 309 quads, and the whole thing drew nothing --
        // while an opaque material, which never looks at the alpha, showed the
        // quads sitting exactly where they belonged. Footprints reads uv() for
        // its shape for the same reason.
        //
        // rotateX(-90°) sends the plane's +v to world −Z, hence the negation.
        const p = uv().sub(0.5).mul(2.0)
        const q = vec2(p.x, p.y.negate())

        // The sun, as a ground heading plus an elevation.
        const sd = propSunDirection
        const elev = max(sd.y, float(MIN_ELEVATION))
        const flat = vec2(sd.x, sd.z)
        // The epsilon keeps a sun exactly overhead from normalising a
        // zero-length vector into NaN and painting the whole quad.
        const dir = normalize(flat.add(vec2(1e-5, 1e-5)))
        const horizon = length(flat)

        // Lean: canopyHeight / tan(elevation), away from the sun.
        //
        // It saturates well inside the quad. The true lean at a low sun is
        // several times the canopy's own radius and a quad big enough to hold
        // it would be mostly empty overdraw -- and the long shadow is already
        // being drawn properly by the trunk, which is real geometry. What has
        // to survive here is that the pool MOVES as the day turns.
        const lean = clamp(this.uCanopyH.mul(horizon).div(elev), 0.0, 0.45)
        const centred = q.add(dir.mul(lean))

        // Stretch along the sun heading as it drops.
        const stretch = clamp(float(1.0).div(elev), 1.0, 2.4)
        const along = dot(centred, dir).div(stretch)
        const across = dot(centred, vec2(dir.y.negate(), dir.x))
        const r = length(vec2(along, across)).div(this.uCanopyR)

        // Ascending edges then inverted -- NOT smoothstep(1, 0, r). Handing it
        // a descending pair is undefined in both GLSL and WGSL, and what it
        // did here was return zero everywhere.
        const falloff = pow(float(1.0).sub(smoothstep(float(0.0), float(1.0), r)),
            this.uSoftness)

        material.outputNode = vec4(
            vec3(this.uColor),
            falloff.mul(this.uStrength).mul(float(1.0).sub(this.uNight))
        )

        material.polygonOffset = true
        material.polygonOffsetFactor = -2
        material.polygonOffsetUnits = -2

        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.name = 'CanopyShadow'
        this.mesh.count = count
        // Under the footprints (3), over the ground and its decals.
        this.mesh.renderOrder = 2
        this.mesh.receiveShadow = false
        this.mesh.castShadow = false
        // Instances are scattered island-wide, exactly as in Footprints: one
        // bounding sphere around all of them would never cull anything anyway,
        // and a wrong one silently deletes the whole mesh.
        this.mesh.frustumCulled = false
        this.scene.add(this.mesh)
    }

    update() {
        const night = this.experience.world?.environment?.skyNightFactor?.value
        if (night === undefined || !this.mesh) return
        this.uNight.value = night
        // Hidden, not merely transparent — see the class note.
        this.mesh.visible = night < 0.99
    }

    setDebug() {
        const f = this.debug.ui.addFolder('Sombra de copa')
        f.close()
        f.add(this.uStrength, 'value', 0, 1, 0.01).name('Intensidad')
        f.add(this.uSoftness, 'value', 0.5, 4, 0.05).name('Suavidad')
        f.addColor({ value: this.uColor.value }, 'value').name('Color')
            .onChange(v => this.uColor.value.copy(v))
    }

    dispose() {
        if (!this.mesh) return
        this.scene.remove(this.mesh)
        this.mesh.geometry?.dispose()
        this.mesh.material?.dispose()
        this.mesh = null
    }
}
