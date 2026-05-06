import * as THREE from 'three'
import {
    Fn, float, vec3, normalWorld, cameraPosition, positionWorld,
    normalize, dot, pow, clamp, mix, sub, max as tslMax
} from 'three/tsl'
import Experience from '../Experience.js'

export default class Balloon {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene

        this._time = 0
        this._popping = false
        this._popTimer = 0
        this._popDuration = 0.35
        this._active = false

        this._baseY = 3.0
        this._bobAmplitude = 0.35
        this._bobSpeed = 1.8
        this._squashAmount = 0.07

        this._fragments = []

        this.setupMesh()
    }

    setupMesh() {
        const geo = new THREE.SphereGeometry(0.65, 28, 18)

        const mat = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.FrontSide
        })

        mat.colorNode = _balloonColor()
        mat.opacityNode = _balloonOpacity()

        this.mesh = new THREE.Mesh(geo, mat)
        this.mesh.scale.set(1, 1.3, 1)
        this.mesh.visible = false
        this.mesh.renderOrder = 5
        this.scene.add(this.mesh)

        // Knot at the bottom
        const knotGeo = new THREE.ConeGeometry(0.06, 0.12, 6)
        const knotMat = new THREE.MeshBasicMaterial({ color: 0xcc2233 })
        this.knot = new THREE.Mesh(knotGeo, knotMat)
        this.knot.position.y = -0.85
        this.knot.rotation.x = Math.PI
        this.mesh.add(this.knot)

        // String
        const stringGeo = new THREE.CylinderGeometry(0.008, 0.008, 1.4, 4)
        const stringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5
        })
        this.string = new THREE.Mesh(stringGeo, stringMat)
        this.string.position.y = -1.7
        this.mesh.add(this.string)

        // Pre-create pop fragment pool
        this._setupFragments()
    }

    _setupFragments() {
        const colors = [0xff3344, 0xff6655, 0xff8877, 0xffaaaa, 0xcc2233, 0xff4466]
        for (let i = 0; i < 8; i++) {
            const size = 0.04 + Math.random() * 0.08
            const geo = new THREE.PlaneGeometry(size, size * (0.6 + Math.random() * 0.8))
            const mat = new THREE.MeshBasicMaterial({
                color: colors[i % colors.length],
                transparent: true,
                opacity: 1,
                side: THREE.DoubleSide,
                depthWrite: false
            })
            const frag = new THREE.Mesh(geo, mat)
            frag.visible = false
            this.scene.add(frag)

            const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
            const speed = 2.5 + Math.random() * 3.0
            this._fragments.push({
                mesh: frag,
                vx: Math.cos(angle) * speed,
                vy: 1.5 + Math.random() * 3.0,
                vz: Math.sin(angle) * speed,
                rotSpeed: (Math.random() - 0.5) * 12,
                gravity: 9 + Math.random() * 4
            })
        }
    }

    show(worldPos) {
        this._active = true
        this._popping = false
        this._time = 0
        this._baseY = worldPos.y
        this.mesh.position.set(worldPos.x, worldPos.y, worldPos.z)
        this.mesh.scale.set(1, 1.3, 1)
        this.mesh.material.opacity = 1
        this.mesh.visible = true
        this.knot.visible = true
        this.string.visible = true

        for (const f of this._fragments) f.mesh.visible = false
    }

    hide() {
        this._active = false
        this.mesh.visible = false
        for (const f of this._fragments) f.mesh.visible = false
    }

    get popped() {
        return this._popping
    }

    pop() {
        if (this._popping || !this._active) return
        this._popping = true
        this._popTimer = 0

        this.knot.visible = false
        this.string.visible = false

        const pos = this.mesh.position
        for (const f of this._fragments) {
            f.mesh.position.set(pos.x, pos.y, pos.z)
            f.mesh.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            )
            f.mesh.visible = true
            f.mesh.material.opacity = 1
        }
    }

    checkCollision(frisbeePos, radius = 2.4) {
        if (!this._active || this._popping) return false
        const dx = frisbeePos.x - this.mesh.position.x
        const dy = frisbeePos.y - this.mesh.position.y
        const dz = frisbeePos.z - this.mesh.position.z
        return Math.sqrt(dx * dx + dy * dy + dz * dz) < radius
    }

    update(dt) {
        if (!this._active) return

        this._time += dt

        if (this._popping) {
            this._popTimer += dt
            const t = this._popTimer / this._popDuration

            if (t < 0.12) {
                const s = 1 + (t / 0.12) * 1.8
                this.mesh.scale.set(s, s * 1.3, s)
                this.mesh.material.opacity = 1 - (t / 0.12) * 0.6
            } else {
                this.mesh.visible = false
            }

            for (const f of this._fragments) {
                f.mesh.position.x += f.vx * dt
                f.mesh.position.y += f.vy * dt
                f.mesh.position.z += f.vz * dt
                f.vy -= f.gravity * dt
                f.mesh.rotation.x += f.rotSpeed * dt
                f.mesh.rotation.z += f.rotSpeed * 0.7 * dt
                f.mesh.material.opacity = Math.max(0, 1 - t * 1.5)
            }

            if (t >= 1) {
                this._active = false
                for (const f of this._fragments) f.mesh.visible = false
            }
            return
        }

        // Bobbing
        const bobPhase = Math.sin(this._time * this._bobSpeed)
        this.mesh.position.y = this._baseY + bobPhase * this._bobAmplitude

        // Squash/stretch — up = stretch, down = squash
        const stretch = 1 + bobPhase * this._squashAmount
        const squash = 1 - bobPhase * this._squashAmount * 0.5
        this.mesh.scale.set(squash, 1.3 * stretch, squash)
    }

    destroy() {
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh.geometry.dispose()
            this.mesh.material.dispose()
        }
        for (const f of this._fragments) {
            this.scene.remove(f.mesh)
            f.mesh.geometry.dispose()
            f.mesh.material.dispose()
        }
        this._fragments = []
    }
}

// ─── TSL Balloon Shader ──────────────────────────────────────────────────

const _balloonColor = () => {
    return Fn(() => {
        const normal = normalWorld
        const viewDir = normalize(sub(cameraPosition, positionWorld))

        // Fresnel: bright/lighter at grazing angles
        const NdotV = tslMax(dot(normal, viewDir), float(0.0))
        const fresnel = pow(sub(float(1.0), NdotV), float(2.5))

        const base = vec3(0.95, 0.15, 0.2)
        const highlight = vec3(1.0, 0.6, 0.55)

        // Fake top highlight — soft specular blob
        const topLight = clamp(dot(normal, normalize(vec3(0.3, 1.0, 0.5))), float(0.0), float(1.0))
        const specular = pow(topLight, float(16.0)).mul(0.45)

        const col = mix(base, highlight, fresnel)
        return col.add(vec3(specular, specular, specular))
    })()
}

const _balloonOpacity = () => {
    return Fn(() => {
        const normal = normalWorld
        const viewDir = normalize(sub(cameraPosition, positionWorld))

        const NdotV = tslMax(dot(normal, viewDir), float(0.0))
        const fresnel = pow(sub(float(1.0), NdotV), float(2.2))

        // Slightly more transparent at edges for translucent feel
        return mix(float(0.82), float(0.5), fresnel)
    })()
}
