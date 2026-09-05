/**
 * BaseballPitch — flat baked dirt/sand field. Two gotchas about this GLB:
 *
 *  1. It was exported with KHR_mesh_quantization, so position/normal/uv arrive
 *     as NORMALIZED integers. This project's WebGPU/TSL path does NOT auto-
 *     denormalize them (unlike legacy WebGL), so raw values break the mesh:
 *     UVs collapse to a single texel and ±32767 positions blow the quad up so
 *     it gets frustum-culled. `dequantizeGeometry` converts them to float once
 *     on the CPU. After that the embedded KTX2/ETC1S map textures normally.
 *
 *  2. The field is authored a hair BELOW the grass floor (field y≈0.22 vs
 *     grass-floor y≈0.23), so the grass draws over it and it vanishes. We lift
 *     the whole piece a small epsilon so it rests just on top of the grass.
 */
import * as THREE from 'three'
import {
    uniform, vec2, vec4, float, positionLocal,
    abs, max, min, length, smoothstep, mix
} from 'three/tsl'
import Experience from '../../Experience.js'
import { createStylizedPropNodeMaterial } from './StylizedPropMaterial.js'
import { dequantizeGeometry } from './SceneUtils.js'
import { snoise } from '../TSL/NoiseNodes.js'
import { dayNightTint } from '../DayNight.js'
import { ignoreAO } from '../aoMask.js'

// Where the field's surface goes, in WORLD units -- set absolutely, not added
// to whatever height the model happens to carry.
//
// It used to be `position.y += 0.02`, and that is why the field floated. The
// .glb's own node sits at y = 0.2168 while the grass underneath is at 0.2036,
// so the model was already 1.3 cm too high before any lift was added on top.
// Nudging a relative offset could never fix that: the number to change was one
// nobody had measured.
//
// Both figures come from sampling the actual meshes: the grass under the whole
// field footprint is dead flat at 0.2036 -- nine points across 28 x 28 metres,
// zero variation -- so a single height is not an approximation here, it is
// exact. Assigning it outright also survives a re-export at a different
// authored height, which adding never would.
//
// The 2 mm is only so the two surfaces are not mathematically coplanar. What
// actually prevents z-fighting is the material's polygonOffset below, which
// biases the depth test rather than moving anything.
const GRASS_TOP_Y = 0.2036
const CLEARANCE = 0.002

export default class BaseballPitch {
    constructor(gltf) {
        this.experience = new Experience()
        this.scene = this.experience.scene

        if (!gltf || !gltf.scene) {
            console.warn('BaseballPitch: missing gltf.scene')
            return
        }

        this.root = gltf.scene
        this.root.name = 'BaseballPitch'

        this.root.traverse((child) => {
            if (!child.isMesh) return

            // De-quantize every normalized integer attribute (see file header).
            dequantizeGeometry(child.geometry)

            const old = child.material
            child.material = createStylizedPropNodeMaterial({
                map: old?.map || null,
                color: old?.color || 0xffffff,
                side: old?.side ?? THREE.FrontSide
            })
            // Decal-style overlay on the ground: bias it toward the camera so it
            // never z-fights the grass at the field edges.
            child.material.polygonOffset = true
            child.material.polygonOffsetFactor = -1
            child.material.polygonOffsetUnits = -1
            child.castShadow = false
            child.receiveShadow = true
            old?.dispose?.()
        })

        this.scene.add(this.root)

        this.root.updateMatrixWorld(true)
        this.bbox = new THREE.Box3().setFromObject(this.root)

        // Land the surface on the grass by MEASURING it, not by trusting a
        // number. The .glb wraps its mesh in a node carrying its own y, so
        // nudging root.position was always adjusting the wrong end of a sum --
        // which is how the field ended up 1.7 cm in the air with nobody able to
        // point at the offending value. Reading the loaded height and closing
        // the gap works whatever the model was authored at, and cannot drift
        // when it is re-exported.
        //
        // It has to happen here: the positions arrive quantized (see the file
        // header) and only mean anything after the traverse above has
        // de-quantized them.
        this.root.position.y += (GRASS_TOP_Y + CLEARANCE) - this.bbox.max.y
        this.root.updateMatrixWorld(true)
        this.bbox.setFromObject(this.root)

        this._buildFringe()

        if (this.experience.debug?.active) this._setFringeDebug()
    }

    /**
     * Dirt fringe — a thin procedural TSL band hugging the field's OUTER edge
     * so it doesn't look stamped onto the grass. The geometry is a 4-strip
     * frame (single merged mesh, 1 draw call) covering ONLY the border band:
     * no fragment is ever shaded over the field interior or far grass. Alpha
     * fades outward with a noisy organic boundary; two dirt tones speckle the
     * band. No extra textures.
     */
    _buildFringe() {
        const ob = this.getOrientedBounds()
        if (!ob) return
        this._ob = ob // cached for CPU queries (isOnSand)

        // Tunables (exposed in the debug GUI; current values hand-tuned live).
        this.uFringeWidth = uniform(1.85)                       // fade distance beyond the edge
        this.uInnerBlend = uniform(0.8)                         // soft start just inside the edge
        this.uEdgeNoiseAmp = uniform(0.55)                      // boundary irregularity
        this.uEdgeNoiseScale = uniform(0.9)
        this.uSpeckScale = uniform(2.2)                         // dirt mottling frequency
        this.uFringeOpacity = uniform(1.0)
        // Hand-picked in the GUI (#9e5c1a / #83531b). NOTE: the GUI edits the
        // color's RAW working-space channels, whereas `new THREE.Color('#hex')`
        // would apply an sRGB→linear conversion and render a different tone —
        // setRGB() with no conversion reproduces the approved look exactly.
        this.uDirtA = uniform(new THREE.Color().setRGB(0x9e / 255, 0x5c / 255, 0x1a / 255)) // dirt light
        this.uDirtB = uniform(new THREE.Color().setRGB(0x83 / 255, 0x53 / 255, 0x1b / 255)) // dirt dark

        const hu = ob.halfX, hv = ob.halfZ
        const out = 2.8          // outer headroom (max width + noise the GUI allows)
        const inset = 0.8        // inner headroom (max inner blend)
        const xo = hu + out, zo = hv + out
        const xi = Math.max(hu - inset, 0), zi = Math.max(hv - inset, 0)

        // Non-overlapping frame strips (overlap would double-blend the corners).
        const rects = [
            [-xo, xo, zi, zo],     // far strip (+Z, corners included)
            [-xo, xo, -zo, -zi],   // near strip (−Z, corners included)
            [-xo, -xi, -zi, zi],   // left strip (between the two)
            [xi, xo, -zi, zi]      // right strip
        ]
        const positions = []
        const indices = []
        for (const [x0, x1, z0, z1] of rects) {
            const b = positions.length / 3
            positions.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1)
            indices.push(b, b + 2, b + 1, b, b + 3, b + 2)
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        geo.setIndex(indices)

        // Field-local coords in world units come straight from the vertex
        // positions (the mesh itself carries the field's rotation + centre).
        const p = positionLocal.xz

        // Signed rounded-rect distance to the play rectangle edge (<0 inside).
        const q = abs(p).sub(vec2(hu, hv))
        const sd = length(max(q, vec2(0.0))).add(min(max(q.x, q.y), float(0.0)))

        // Band alpha: soft start just inside the edge × noisy fade outward.
        const innerFade = smoothstep(this.uInnerBlend.negate(), float(0.0), sd)
        const edgeNoise = snoise(p.mul(this.uEdgeNoiseScale))
        const outerFade = float(1.0).sub(
            smoothstep(float(0.0), this.uFringeWidth, sd.sub(edgeNoise.mul(this.uEdgeNoiseAmp)))
        )
        const fade = innerFade.mul(outerFade)

        // Two-tone dirt speckle, day/night tinted like the rest of the world.
        const speck = snoise(p.mul(this.uSpeckScale)).mul(0.5).add(0.5)
        const rgb = mix(this.uDirtA, this.uDirtB, speck).mul(dayNightTint)

        const mat = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        // No depth write means no say over ambient occlusion -- it abstains
        // rather than overriding what is behind it. See aoMask.js.
        ignoreAO(mat)
        mat.outputNode = vec4(rgb, fade.mul(this.uFringeOpacity))
        // Sits between the grass floor and the field decal (field uses -1).
        mat.polygonOffset = true
        mat.polygonOffsetFactor = -0.5
        mat.polygonOffsetUnits = -0.5

        this.fringe = new THREE.Mesh(geo, mat)
        this.fringe.name = 'BaseballPitchFringe'
        this.fringe.position.set(ob.center.x, ob.topY + 0.004, ob.center.z)
        // Align local +X with the field's axisX (fade is symmetric, sign-safe).
        this.fringe.rotation.y = Math.atan2(-ob.axisX.z, ob.axisX.x)
        // Ground decal: must be painted FIRST among transparent objects. The
        // objective arrow / frisbee glow / markers are transparent sprites with
        // the default renderOrder (0) and no depth write — with the fringe at a
        // higher order it painted OVER them near the field edges.
        this.fringe.renderOrder = -1
        this.fringe.receiveShadow = false
        this.fringe.castShadow = false
        this.scene.add(this.fringe)
    }

    _setFringeDebug() {
        if (!this.fringe) return
        const f = this.experience.debug.ui.addFolder('Field Fringe')
        f.close()
        f.add(this.uFringeWidth, 'value', 0.2, 2.8, 0.05).name('Width')
        f.add(this.uInnerBlend, 'value', 0.0, 0.8, 0.02).name('Inner Blend')
        f.add(this.uEdgeNoiseAmp, 'value', 0.0, 1.5, 0.05).name('Edge Noise')
        f.add(this.uEdgeNoiseScale, 'value', 0.2, 3.0, 0.05).name('Edge Scale')
        f.add(this.uSpeckScale, 'value', 0.3, 6.0, 0.1).name('Speckle Scale')
        f.add(this.uFringeOpacity, 'value', 0.0, 1.0, 0.02).name('Opacity')
        f.addColor({ value: this.uDirtA.value }, 'value').name('Dirt Light')
            .onChange((v) => this.uDirtA.value.copy(v))
        f.addColor({ value: this.uDirtB.value }, 'value').name('Dirt Dark')
            .onChange((v) => this.uDirtB.value.copy(v))
    }

    getBoundingBox() {
        return this.bbox ?? null
    }

    // ─── CPU sand queries (footprints) ───────────────────────────────────

    /**
     * True when world (x,z) sits on sand: either the dirt fringe band around
     * the field, or the sand diamond inside it (via the CPU mask PNG).
     */
    isOnSand(x, z) {
        const ob = this._ob
        if (!ob) return false

        // Signed distance to the oriented play rectangle (same math as the shader).
        const dx = x - ob.center.x
        const dz = z - ob.center.z
        const u = dx * ob.axisX.x + dz * ob.axisX.z
        const v = dx * ob.axisZ.x + dz * ob.axisZ.z
        const qx = Math.abs(u) - ob.halfX
        const qz = Math.abs(v) - ob.halfZ
        const sd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0)

        // Fringe band: from just inside the edge to the solid part of the fade
        // (the noisy outer tail is excluded — prints on grass would look wrong).
        const bandOut = Math.min((this.uFringeWidth?.value ?? 1.85) * 0.6, 1.2)
        if (sd >= -0.35 && sd <= bandOut) return true
        if (sd > bandOut) return false

        // Interior → sand diamond via the CPU mask.
        return this._sampleSandMask(x, z)
    }

    _sampleSandMask(x, z) {
        if (!this._sandSampler) this._sandSampler = this._buildSandSampler()
        if (!this._uvMap) this._uvMap = this._buildWorldToUv()
        const s = this._sandSampler
        const m = this._uvMap
        if (!s || !m) return false
        const u = m.u0 + m.ua * (x - m.x0) + m.ub * (z - m.z0)
        const v = m.v0 + m.va * (x - m.x0) + m.vb * (z - m.z0)
        if (u < 0 || u > 1 || v < 0 || v > 1) return false
        return s(u, v) > 0.5
    }

    /** Canvas sampler over the 128px sand mask (glTF convention: v rows top-down). */
    _buildSandSampler() {
        const image = this.experience.resources.items.pitchSandMaskCpu?.image
        if (!image || !(image.width || image.naturalWidth)) return null
        try {
            const w = image.naturalWidth || image.width
            const h = image.naturalHeight || image.height
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(image, 0, 0)
            const data = ctx.getImageData(0, 0, w, h).data
            return (u, v) => {
                const px = Math.max(0, Math.min(w - 1, Math.floor(u * w)))
                const py = Math.max(0, Math.min(h - 1, Math.floor(v * h)))
                return data[(py * w + px) * 4] / 255
            }
        } catch { return null }
    }

    /**
     * Exact affine map world(x,z) → texture uv, solved from the field quad's
     * own position+uv attributes (no guessing about baked rotations/flips).
     */
    _buildWorldToUv() {
        let mesh = null
        this.root?.traverse((c) => { if (!mesh && c.isMesh && c.geometry) mesh = c })
        const pos = mesh?.geometry?.attributes?.position
        const uvA = mesh?.geometry?.attributes?.uv
        if (!pos || !uvA || pos.count < 3) return null

        mesh.updateWorldMatrix(true, false)
        const P = (i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
        const p0 = P(0)
        const u0 = uvA.getX(0), v0 = uvA.getY(0)

        let i1 = -1, i2 = -1, e1 = null
        for (let i = 1; i < pos.count; i++) {
            const p = P(i)
            const ex = p.x - p0.x, ez = p.z - p0.z
            const len = Math.hypot(ex, ez)
            if (len < 0.1) continue
            if (i1 < 0) { i1 = i; e1 = { x: ex, z: ez, len }; continue }
            const cross = Math.abs(e1.x * ez - e1.z * ex)
            if (cross > 0.05 * e1.len * len) { i2 = i; break }
        }
        if (i1 < 0 || i2 < 0) return null

        const p1 = P(i1), p2 = P(i2)
        const e1x = p1.x - p0.x, e1z = p1.z - p0.z
        const e2x = p2.x - p0.x, e2z = p2.z - p0.z
        const det = e1x * e2z - e1z * e2x
        if (Math.abs(det) < 1e-8) return null

        const du1 = uvA.getX(i1) - u0, du2 = uvA.getX(i2) - u0
        const dv1 = uvA.getY(i1) - v0, dv2 = uvA.getY(i2) - v0
        return {
            x0: p0.x, z0: p0.z, u0, v0,
            ua: (du1 * e2z - e1z * du2) / det,
            ub: (e1x * du2 - du1 * e2x) / det,
            va: (dv1 * e2z - e1z * dv2) / det,
            vb: (e1x * dv2 - dv1 * e2x) / det
        }
    }

    /**
     * Oriented (rotation-aware) bounds of the field in world space. The field
     * tile is a single quad whose node matrix bakes a 45° Y rotation (its UVs
     * are drawn diagonally), so the world AABB is a larger square with four
     * corners landing on the grass OUTSIDE the actual field. We must read the
     * orientation from the MESH's own world matrix (not the root, which is
     * unrotated) to recover the true play rectangle: center + unit world axes +
     * half-extents.
     */
    getOrientedBounds() {
        if (!this.root) return null
        this.root.updateMatrixWorld(true)

        let mesh = null
        this.root.traverse((c) => { if (!mesh && c.isMesh && c.geometry) mesh = c })
        if (!mesh) return null
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()

        const bb = mesh.geometry.boundingBox
        const lc = bb.getCenter(new THREE.Vector3())
        const ls = bb.getSize(new THREE.Vector3())
        const m = mesh.matrixWorld
        const e = m.elements

        // Matrix columns = the quad's local axes in world (length encodes scale).
        const axisX = new THREE.Vector3(e[0], e[1], e[2])
        const axisY = new THREE.Vector3(e[4], e[5], e[6])
        const axisZ = new THREE.Vector3(e[8], e[9], e[10])

        const center = lc.clone().applyMatrix4(m)
        const halfX = ls.x * 0.5 * axisX.length()
        const halfZ = ls.z * 0.5 * axisZ.length()
        const topY = center.y + ls.y * 0.5 * axisY.length()

        return {
            center,
            axisX: axisX.normalize(),
            axisZ: axisZ.normalize(),
            halfX,
            halfZ,
            topY
        }
    }
}
