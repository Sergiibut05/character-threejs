import * as THREE from 'three'
import { Fn, vec3, vec4, uv, float, mix, smoothstep, sin, abs, fract } from 'three/tsl'
import Experience from '../Experience.js'
import { createStylizedPropNodeMaterial } from './scene/StylizedPropMaterial.js'

/**
 * BeachBallVariants — the three balls the beach rally cycles through.
 *
 * Each one changes how the rally FEELS, not just how it looks: the gravity
 * multiplier is the point. A ball you can read at a glance ("that's a coconut,
 * it's going to drop like a stone") teaches its own rules.
 *
 *   playa   — inflatable, floaty and forgiving. The baseline.
 *   futbol  — heavier, quicker, tighter timing.
 *   coco    — drops hard. Procedural material: no asset needed, and it echoes
 *             the coconuts already hanging on the palms next to the court.
 *
 * All three share ONE radius (taken from the beach ball) so the collision
 * never has to change when the visual swaps.
 */
/**
 * Each ball has ONE fixed fall rate (`gravityScale`) — no streak ramp on top,
 * so a coconut always feels like a coconut whenever it turns up.
 *
 * `windScale` is mass made visible: a light inflatable gets shoved around, a
 * coconut barely notices the breeze. It is what stops the wind from feeling
 * like an unfair tax on every ball alike.
 */
export const VARIANTS = [
    { id: 'playa', label: 'Pelota de playa', gravityScale: 1.0, windScale: 1.0 },
    { id: 'futbol', label: 'Balón de fútbol', gravityScale: 1.3, windScale: 0.5 },
    { id: 'coco', label: 'Coco', gravityScale: 1.6, windScale: 0.18 }
]

export default class BeachBallVariants {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene

        this.entries = []       // { id, root, gravityScale }
        this.index = 0
        this.radius = 0.175
        this._restPos = null
        this._restScale = null
    }

    /**
     * @param {THREE.Object3D} beachMesh The decorative beach-ball node (reused
     *   as the "playa" variant, so nothing is duplicated).
     * @param {object|null} soccerGltf   Loaded soccer-ball GLB.
     */
    build(beachMesh, soccerGltf) {
        if (!beachMesh) return false

        beachMesh.geometry.computeBoundingSphere()
        this.radius = beachMesh.geometry.boundingSphere.radius * beachMesh.scale.x
        this._restPos = beachMesh.position.clone()
        this._restScale = beachMesh.scale.clone()

        // ── playa: give the existing ball a moulded-plastic sheen ──
        const beachMap = beachMesh.material?.map || null
        beachMesh.material?.dispose?.()
        beachMesh.material = createStylizedPropNodeMaterial({
            map: beachMap, gloss: 0.85, shininess: 34
        })
        this.entries.push({ id: 'playa', root: beachMesh, gravityScale: 1.0 })

        // ── futbol: rescale the authored ball to the same radius ──
        if (soccerGltf?.scene) {
            const root = soccerGltf.scene
            const mesh = _firstMesh(root)
            if (mesh) {
                mesh.geometry.computeBoundingSphere()
                const map = mesh.material?.map || null
                mesh.material?.dispose?.()
                mesh.material = createStylizedPropNodeMaterial({
                    map, gloss: 0.35, shininess: 22
                })
                // Authored ~131 units across and offset off-origin: normalise it
                // to our radius and re-centre so the node position IS the ball
                // centre, exactly like the beach ball.
                root.updateMatrixWorld(true)
                const box = new THREE.Box3().setFromObject(root)
                const size = box.getSize(new THREE.Vector3())
                const centre = box.getCenter(new THREE.Vector3())
                const authoredRadius = Math.max(size.x, size.y, size.z) * 0.5 || 1
                const k = this.radius / authoredRadius

                // Wrap it: scaling the wrapper keeps the GLB's own (quantised)
                // transforms untouched — baking into that geometry would destroy
                // it, since its positions are normalised int16.
                const holder = new THREE.Group()
                root.position.sub(centre)       // centre on the wrapper's origin
                holder.add(root)
                holder.scale.setScalar(k)
                holder.visible = false
                this.scene.add(holder)
                this.entries.push({ id: 'futbol', root: holder, gravityScale: 1.35 })
            }
        }

        // ── coco: procedural, built on a copy of the beach ball's sphere ──
        const coco = new THREE.Mesh(beachMesh.geometry, _coconutMaterial())
        coco.scale.copy(beachMesh.scale)
        coco.visible = false
        this.scene.add(coco)
        this.entries.push({ id: 'coco', root: coco, gravityScale: 1.7 })

        this.setIndex(0)
        return true
    }

    get ready() { return this.entries.length > 0 }
    get current() { return this.entries[this.index] || null }
    get gravityScale() { return this.current?.gravityScale ?? 1 }
    get windScale() {
        return VARIANTS.find((v) => v.id === this.current?.id)?.windScale ?? 1
    }
    get label() {
        return VARIANTS.find((v) => v.id === this.current?.id)?.label || ''
    }

    setIndex(i) {
        if (!this.entries.length) return
        this.index = ((i % this.entries.length) + this.entries.length) % this.entries.length
        for (let k = 0; k < this.entries.length; k++) {
            this.entries[k].root.visible = k === this.index
        }
    }

    /** Pick a different variant at random; returns the new label. */
    shuffle() {
        if (this.entries.length < 2) return null
        let next = this.index
        while (next === this.index) next = Math.floor(Math.random() * this.entries.length)
        this.setIndex(next)
        return this.label
    }

    setPosition(v) {
        const e = this.current
        if (e) e.root.position.copy(v)
    }

    /** Uniform scale multiplier used by the swap animation (1 = authored size). */
    setScaleFactor(k) {
        for (const e of this.entries) {
            const base = e.baseScale || (e.baseScale = e.root.scale.clone())
            e.root.scale.set(base.x * k, base.y * k, base.z * k)
        }
    }

    spin(dx, dy) {
        const e = this.current
        if (!e) return
        e.root.rotation.z -= dx
        e.root.rotation.x += dy
    }

    /** Back to the decorative ball resting on the sand. */
    rest() {
        this.setIndex(0)
        const e = this.entries[0]
        if (e && this._restPos) {
            e.root.position.copy(this._restPos)
            e.root.rotation.set(0, 0, 0)
        }
        for (let k = 1; k < this.entries.length; k++) this.entries[k].root.visible = false
    }

    dispose() {
        for (let k = 1; k < this.entries.length; k++) {
            const r = this.entries[k].root
            this.scene.remove(r)
        }
        this.entries.length = 0
    }
}

function _firstMesh(root) {
    let mesh = null
    root.traverse((c) => { if (!mesh && c.isMesh) mesh = c })
    return mesh
}

/** Brown shell + fibrous streaks + the three dark "eyes". */
function _coconutMaterial() {
    const material = new THREE.MeshLambertNodeMaterial()

    material.colorNode = Fn(() => {
        const p = uv()

        // Vertical husk fibres: stacked bands of slightly different browns.
        const fibre = sin(p.x.mul(180.0)).mul(0.5).add(0.5)
            .mul(sin(p.x.mul(53.0).add(p.y.mul(7.0))).mul(0.5).add(0.5))
        const shell = mix(vec3(0.33, 0.20, 0.11), vec3(0.52, 0.35, 0.20), fibre)

        // Scuffed lighter patches so it isn't a flat brown ball.
        const patch = smoothstep(0.35, 0.75, fract(p.y.mul(3.0).add(p.x.mul(1.7))))
        const base = mix(shell, vec3(0.60, 0.44, 0.28), patch.mul(0.25))

        // Three germination pores clustered on one pole.
        const eye = (cx, cy) => smoothstep(0.055, 0.028,
            abs(p.x.sub(cx)).mul(abs(p.x.sub(cx))).add(abs(p.y.sub(cy)).mul(abs(p.y.sub(cy)))).sqrt())
        const eyes = eye(float(0.30), float(0.74))
            .add(eye(float(0.38), float(0.80)))
            .add(eye(float(0.34), float(0.66)))
            .clamp(0, 1)

        return vec4(mix(base, vec3(0.13, 0.08, 0.05), eyes), 1.0)
    })()

    return material
}
