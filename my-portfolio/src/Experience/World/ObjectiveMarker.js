import * as THREE from 'three'
import { Fn, float, vec2, vec3, uv, smoothstep, mix, length, abs } from 'three/tsl'
import Experience from '../Experience.js'

export default class ObjectiveMarker {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        this.targetCenter = new THREE.Vector3()
        this._time = 0

        this._bullseyeTimer = -1
        this._bullseyePopDur = 0.4

        this._aimSegments = 30
        this._currentYaw = undefined

        this.setupArrow()
        this.setupCheck()
        this.setupBullseye()
    }

    // ─── Floating Arrow ─────────────────────────────────────────────────

    setupArrow() {
        const tex = this.resources.items.objectiveArrowTexture
        if (!tex) return
        if (this.arrowSprite) return

        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthWrite: false
        })
        this.arrowSprite = new THREE.Sprite(mat)
        this.arrowSprite.scale.set(0.5, 0.6, 1)
        this.arrowSprite.visible = false
        this.scene.add(this.arrowSprite)
    }

    showArrow(targetCenter) {
        this.targetCenter.copy(targetCenter)
        if (!this.arrowSprite) return
        this.arrowSprite.position.set(targetCenter.x, 0.9, targetCenter.z)
        this.arrowSprite.visible = true
    }

    hideArrow() {
        if (this.arrowSprite) this.arrowSprite.visible = false
    }

    // ─── Check Sprite (catch marker) ────────────────────────────────────

    setupCheck() {
        const tex = this.resources.items.checkTexture
        if (!tex) return
        if (this.checkSprite) return

        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthWrite: false
        })
        this.checkSprite = new THREE.Sprite(mat)
        this.checkSprite.scale.set(0.6, 0.6, 1)
        this.checkSprite.visible = false
        this.scene.add(this.checkSprite)
    }

    showCheck(worldPos) {
        if (!this.checkSprite) return
        this.checkSprite.position.set(worldPos.x, 0.8, worldPos.z)
        this.checkSprite.visible = true
    }

    hideCheck() {
        if (this.checkSprite) this.checkSprite.visible = false
    }

    // ─── Bullseye Rings ─────────────────────────────────────────────────

    setupBullseye() {
        // Radius = outer scoring ring (10 pts). Rings/scoring share these radii:
        //   bullseye 1.0m (100) · middle 2.4m (50) · outer 3.8m (10).
        // Bigger outer rings, same small centre — and the visual now matches
        // ScoreFeedback so a far catch can't score like a near one.
        const geo = new THREE.CircleGeometry(3.8, 64)
        geo.rotateX(-Math.PI * 0.5)

        const mat = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        })

        mat.colorNode = _bullseyeColor()
        mat.opacityNode = _bullseyeOpacity()

        this.bullseyeMesh = new THREE.Mesh(geo, mat)
        this.bullseyeMesh.position.y = 0.02
        this.bullseyeMesh.visible = false
        this.bullseyeMesh.renderOrder = 1
        this.scene.add(this.bullseyeMesh)
    }

    showBullseye(targetCenter) {
        if (!this.bullseyeMesh) return
        // Lift clear of the raised field surface so the opaque pitch doesn't
        // depth-cull the rings (the field sits a little above the play ground).
        this.bullseyeMesh.position.set(targetCenter.x, targetCenter.y + 0.08, targetCenter.z)
        this.bullseyeMesh.scale.set(0.01, 0.01, 0.01)
        this.bullseyeMesh.visible = true
        this._bullseyeTimer = 0
    }

    hideBullseye() {
        if (this.bullseyeMesh) this.bullseyeMesh.visible = false
        this._bullseyeTimer = -1
    }

    // ─── Aim Line (Ribbon from CubicBezier) ─────────────────────────────

    createAimLine() {
        if (this._aimLineGroup) {
            this.scene.remove(this._aimLineGroup)
        }

        this._aimLineGroup = new THREE.Group()
        this._aimLineGroup.visible = false
        this.scene.add(this._aimLineGroup)

        const seg = this._aimSegments
        const vertCount = (seg + 1) * 2
        const positions = new Float32Array(vertCount * 3)
        const indices = []

        for (let i = 0; i < seg; i++) {
            const base = i * 2
            indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
        }

        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geo.setIndex(indices)

        this.aimLineMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            side: THREE.DoubleSide
        }))
        this.aimLineMesh.renderOrder = 2
        this._aimLineGroup.add(this.aimLineMesh)
    }

    showAimLine() {
        if (this._aimLineGroup) this._aimLineGroup.visible = true
    }

    hideAimLine() {
        if (this._aimLineGroup) this._aimLineGroup.visible = false
    }

    updateAimLine(tiltAngle, power, charPos, charYaw) {
        if (!this.aimLineMesh || !this._aimLineGroup) return

        if (charPos) {
            this._aimLineGroup.position.set(charPos.x, charPos.y, charPos.z)

            const target = charYaw ?? 0
            if (this._currentYaw === undefined) {
                this._currentYaw = target
            } else {
                const diff = Math.atan2(
                    Math.sin(target - this._currentYaw),
                    Math.cos(target - this._currentYaw)
                )
                this._currentYaw += diff * 0.12
            }
            this._aimLineGroup.rotation.y = this._currentYaw
        }

        const lineLen = 5.5
        const curveLateral = -tiltAngle * 0.8
        const ribbonWidth = 0.12

        // CubicBezier: first half stays ~straight, second half curves
        _cubicCurve.v0.set(0, 0.06, 0.5)
        _cubicCurve.v1.set(0, 0.06, lineLen * 0.4)
        _cubicCurve.v2.set(curveLateral * 0.5, 0.06, lineLen * 0.72)
        _cubicCurve.v3.set(curveLateral * 1.8, 0.06, lineLen)

        const points = _cubicCurve.getPoints(this._aimSegments)
        const posAttr = this.aimLineMesh.geometry.getAttribute('position')

        for (let i = 0; i < points.length; i++) {
            const p = points[i]
            const t = i / (points.length - 1)

            let tx, tz
            if (i < points.length - 1) {
                tx = points[i + 1].x - p.x
                tz = points[i + 1].z - p.z
            } else {
                tx = p.x - points[i - 1].x
                tz = p.z - points[i - 1].z
            }
            const len = Math.sqrt(tx * tx + tz * tz) || 1
            const px = -tz / len
            const pz = tx / len

            // Taper at both ends for a softer look
            const taper = Math.sin(t * Math.PI)
            const w = ribbonWidth * (0.35 + 0.65 * taper)

            const vi = i * 2
            posAttr.setXYZ(vi, p.x - px * w, p.y, p.z - pz * w)
            posAttr.setXYZ(vi + 1, p.x + px * w, p.y, p.z + pz * w)
        }

        posAttr.needsUpdate = true

        if (tiltAngle < -0.1) {
            this.aimLineMesh.material.color.setHex(0x6eaaff)
        } else if (tiltAngle > 0.1) {
            this.aimLineMesh.material.color.setHex(0xff8e6e)
        } else {
            this.aimLineMesh.material.color.setHex(0xffffff)
        }
        this.aimLineMesh.material.opacity = 0.4 + power * 0.35
    }

    // ─── Per-frame ──────────────────────────────────────────────────────

    update(dt) {
        this._time += dt

        if (this.arrowSprite?.visible) {
            this.arrowSprite.position.y = 0.9 + Math.sin(this._time * 3) * 0.12
        }

        if (this._bullseyeTimer >= 0 && this.bullseyeMesh) {
            this._bullseyeTimer += dt
            const t = Math.min(this._bullseyeTimer / this._bullseyePopDur, 1)
            const eased = 1 - Math.pow(1 - t, 3)
            const s = eased * (t < 0.8 ? 1 + (1 - t) * 0.15 : 1)
            this.bullseyeMesh.scale.setScalar(s)
            if (t >= 1) this._bullseyeTimer = -1
        }
    }

    // ─── Reset / Destroy ────────────────────────────────────────────────

    reset() {
        this.hideArrow()
        this.hideCheck()
        this.hideBullseye()
        this.hideAimLine()
        this._currentYaw = undefined
    }

    destroy() {
        this.reset()
        if (this.arrowSprite) { this.scene.remove(this.arrowSprite); this.arrowSprite = null }
        if (this.checkSprite) { this.scene.remove(this.checkSprite); this.checkSprite = null }
        if (this.bullseyeMesh) { this.scene.remove(this.bullseyeMesh); this.bullseyeMesh = null }
        if (this._aimLineGroup) {
            this.scene.remove(this._aimLineGroup)
            if (this.aimLineMesh) this.aimLineMesh.geometry.dispose()
            this._aimLineGroup = null
            this.aimLineMesh = null
        }
    }
}

// Reusable curve instance to avoid per-frame allocations
const _cubicCurve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(), new THREE.Vector3(),
    new THREE.Vector3(), new THREE.Vector3()
)

// ─── TSL Bullseye Shader ─────────────────────────────────────────────────

const _bullseyeColor = () => {
    return Fn(() => {
        const d = length(uv().sub(vec2(0.5, 0.5))).mul(2.0)

        const gold = vec3(1.0, 0.82, 0.15)
        const green = vec3(0.25, 0.78, 0.38)
        const blue = vec3(0.35, 0.55, 0.95)

        // Radius 3.8m: bullseye 1.0m (d=0.263), middle ring 2.4m (d=0.632).
        const innerEdge = smoothstep(float(0.253), float(0.273), d)
        const midEdge = smoothstep(float(0.622), float(0.642), d)

        const border1 = smoothstep(float(0.005), float(0.0), abs(d.sub(0.263)))
        const border2 = smoothstep(float(0.005), float(0.0), abs(d.sub(0.632)))

        let col = mix(gold, green, innerEdge)
        col = mix(col, blue, midEdge)
        col = mix(col, vec3(1.0, 1.0, 1.0), border1.add(border2).clamp(0, 1))

        return col
    })()
}

const _bullseyeOpacity = () => {
    return Fn(() => {
        const d = length(uv().sub(vec2(0.5, 0.5))).mul(2.0)

        const outerFade = smoothstep(float(1.0), float(0.95), d)

        // Radius 3.8m: bullseye 1.0m (d=0.263), middle ring 2.4m (d=0.632).
        const innerEdge = smoothstep(float(0.253), float(0.273), d)
        const midEdge = smoothstep(float(0.622), float(0.642), d)

        const op = mix(float(0.7), float(0.5), innerEdge)
        const finalOp = mix(op, float(0.35), midEdge)

        return finalOp.mul(outerFade)
    })()
}
