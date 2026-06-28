import * as THREE from 'three'
import {
    texture, uv, uniform, color, vec3, vec4, mix, float,
    instancedArray, instanceIndex, hash, sin, length, clamp, time
} from 'three/tsl'
import Experience from '../Experience.js'
import { createStylizedPropNodeMaterial } from './scene/StylizedPropMaterial.js'
import { jsonInstancesToObjects } from './scene/SceneUtils.js'
import { dayNightTint } from './DayNight.js'

/**
 * StreetLamps — Bruno-Simon-style pole lights. `post.glb` holds one lamp
 * (pieces `post`, `chain`, `lamp`, `lamp-light`, all on Tiny_Atlas) and
 * `post-references.json` says where each lamp goes (the POST anchor).
 *
 * The `lamp-light` glass uses Bruno's emissive trick: a radial gradient
 * (warm centre → deep orange edge) normalised by luminance and pushed above
 * 1.0, so the renderer's bloom pass turns it into a soft HDR halo. By day it
 * fades to a very dim panel. Red-orange ember fireflies fade in around each
 * lamp at night. Everything is driven by Environment's `skyNightFactor`.
 *
 * Placement: the lamp is authored off-origin in the GLB, so each instance is
 * placed with G = M_ref · M_post⁻¹ → the post lands exactly on its reference
 * while the other pieces keep their relative arrangement.
 */
const FIREFLIES_PER_LAMP = 5
const EMBER_COLOR = '#ff7e26'        // orange ember fireflies
const GLOW_TINT = '#ff8a2e'          // saturated warm-orange the glass glows
const GLOW_INTENSITY = 1.2           // night luminance of the glass (>1 → crosses bloom threshold)

export default class StreetLamps {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        this.resolved = false
        this.heads = []                 // world position of each lamp-light
        this.uNight = uniform(0)        // 0 day → 1 night (glow + fireflies)
        this.fireflies = null

        this._resolve()
    }

    _resolve() {
        const r = this.resources.items
        if (!r.postModel || !r.postReferences || !r.tinyAtlas) return false

        const refs = jsonInstancesToObjects(r.postReferences, 'conjugate')
        if (!refs.length) return false

        const src = r.postModel.scene
        src.updateMatrixWorld(true)
        const postNode = src.getObjectByName('post')
        if (!postNode) return false

        const matBody = createStylizedPropNodeMaterial({ map: r.tinyAtlas })
        const matLight = this._makeLightMaterial(r.tinyAtlas)
        const isLow = this.experience.quality?.isLow
        const mPostInv = postNode.matrixWorld.clone().invert()

        for (const ref of refs) {
            const mRef = new THREE.Matrix4().compose(ref.position, ref.quaternion, ref.scale)
            const G = new THREE.Matrix4().multiplyMatrices(mRef, mPostInv)

            const clone = src.clone(true)
            const group = new THREE.Group()
            group.matrixAutoUpdate = false
            group.matrix.copy(G)
            group.add(clone)
            this.scene.add(group)
            group.updateMatrixWorld(true)

            this._applyMaterials(clone, matBody, matLight, isLow)

            const lightNode = clone.getObjectByName('lamp-light')
            if (lightNode) this.heads.push(lightNode.getWorldPosition(new THREE.Vector3()))
        }

        this._buildFireflies()
        this.resolved = true
        return true
    }

    _applyMaterials(clone, matBody, matLight, isLow) {
        const assign = (name, mat, glowing = false) => {
            const node = clone.getObjectByName(name)
            node?.traverse((c) => {
                if (!c.isMesh) return
                c.material?.dispose?.()
                c.material = mat
                c.castShadow = glowing ? false : !isLow
                c.receiveShadow = glowing ? false : !isLow
            })
        }
        assign('post', matBody)
        assign('chain', matBody)
        assign('lamp', matBody)
        assign('lamp-light', matLight, true)
    }

    /** Lamp glass: a dim textured panel by day → warm-orange glow at night.
     *  The night colour is luminance-normalised then pushed to GLOW_INTENSITY
     *  (>1), so even a saturated orange crosses the bloom threshold (1.0) and
     *  forms a coloured halo (Bruno's trick) without washing out to white. */
    _makeLightMaterial(map) {
        const tex = texture(map, uv())
        const ember = color(GLOW_TINT)
        const lum = ember.dot(vec3(0.2126, 0.7152, 0.0722)).max(0.0001)
        const nightGlow = ember.div(lum).mul(GLOW_INTENSITY)
        const dayCol = tex.rgb.mul(dayNightTint).mul(0.12)

        const mat = new THREE.MeshBasicNodeMaterial()
        mat.colorNode = mix(dayCol, nightGlow, this.uNight)
        mat.fog = false
        return mat
    }

    _buildFireflies() {
        const perLamp = FIREFLIES_PER_LAMP
        const count = this.heads.length * perLamp
        if (count === 0) return

        const positions = new Float32Array(count * 3)
        let i = 0
        for (const head of this.heads) {
            for (let j = 0; j < perLamp; j++) {
                const a = Math.random() * Math.PI * 2
                const rad = 0.4 + Math.random() * 0.5
                positions[i * 3 + 0] = head.x + Math.cos(a) * rad
                positions[i * 3 + 1] = head.y - 0.25 + Math.random() * 0.7
                positions[i * 3 + 2] = head.z + Math.sin(a) * rad
                i++
            }
        }
        const posAttr = instancedArray(positions, 'vec3').toAttribute()

        const d = length(uv().sub(0.5))
        const glow = clamp(float(0.05).div(d).sub(0.1), 0.0, 1.0)
        const baseTime = time.add(hash(instanceIndex).mul(999))
        const blink = sin(baseTime.mul(1.1)).mul(0.5).add(0.5).mul(0.6).add(0.4)
        const flyOffset = vec3(
            sin(baseTime.mul(0.4)).mul(0.45),
            sin(baseTime.mul(0.9)).mul(0.22),
            sin(baseTime.mul(0.3)).mul(0.45)
        )

        const ember = new THREE.Color(EMBER_COLOR)
        const material = new THREE.SpriteNodeMaterial()
        material.positionNode = posAttr.add(flyOffset)
        material.scaleNode = float(0.038).mul(this.uNight) // smaller + fade in at night
        material.outputNode = vec4(
            vec3(ember.r, ember.g, ember.b).mul(glow).mul(1.8),
            glow.mul(blink)
        )
        material.blending = THREE.AdditiveBlending
        material.transparent = true
        material.depthWrite = false

        const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 8), material)
        mesh.count = count
        mesh.frustumCulled = false
        mesh.renderOrder = 6
        this.scene.add(mesh)
        this.fireflies = mesh
    }

    update() {
        if (!this.resolved) { if (!this._resolve()) return }
        const nf = this.experience.world?.environment?.skyNightFactor?.value ?? 0
        // Clean dusk switch: a narrow smoothstep band so the lamp is clearly
        // OFF during the day and clearly ON at night, with a short tidy fade —
        // not a long muddy half-lit stretch across the cycle.
        this.uNight.value = THREE.MathUtils.smoothstep(nf, 0.40, 0.60)
    }
}
