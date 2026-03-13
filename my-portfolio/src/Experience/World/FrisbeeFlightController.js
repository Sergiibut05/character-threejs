import * as THREE from 'three'
import Experience from '../Experience.js'

/**
 * Simulated frisbee flight — Wii Sports Resort style.
 * No Rapier physics; just a parametric arc with air drag.
 * Visual spin is purely cosmetic (Three.js rotation).
 */
export default class FrisbeeFlightController {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        this.mesh = null
        this.active = false

        // Flight state
        this.position = new THREE.Vector3()
        this.velocity = new THREE.Vector3()
        this.flightTime = 0

        // Tuning
        this.gravity = 2.4
        this.airDrag = 0.4
        this.spinSpeed = 14
        this.groundY = 0.08

        this.setupMesh()
    }

    setupMesh() {
        const gltf = this.resources.items.frisbeeModel
        if (!gltf) return

        this.mesh = gltf.scene.clone()

        const tex = this.resources.items.frisbeeTexture
        this.mesh.traverse((child) => {
            if (!child.isMesh) return
            if (tex) {
                child.material = new THREE.MeshLambertMaterial({ map: tex })
            }
            child.castShadow = true
        })

        this.mesh.visible = false
        this.scene.add(this.mesh)
    }

    launch(origin, direction, speed) {
        this.position.copy(origin)
        this.velocity.copy(direction).multiplyScalar(speed)
        this.flightTime = 0
        this.active = true
        if (this.mesh) {
            this.mesh.visible = true
            this.mesh.position.copy(origin)
        }
    }

    update(dt) {
        if (!this.active || !this.mesh) return

        this.flightTime += dt

        // Horizontal drag (exponential decay)
        const drag = Math.exp(-this.airDrag * dt)
        this.velocity.x *= drag
        this.velocity.z *= drag

        // Gravity
        this.velocity.y -= this.gravity * dt

        // Integrate position
        this.position.x += this.velocity.x * dt
        this.position.y += this.velocity.y * dt
        this.position.z += this.velocity.z * dt

        // Visual spin (cosmetic only)
        this.mesh.rotation.y += this.spinSpeed * dt

        // Keep disc roughly horizontal with a gentle tilt from velocity
        const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2)
        const pitchAngle = Math.atan2(-this.velocity.y, Math.max(hSpeed, 0.1))
        this.mesh.rotation.x = pitchAngle * 0.3

        this.mesh.position.copy(this.position)

        // Landing check
        if (this.position.y <= this.groundY && this.flightTime > 0.2) {
            this.position.y = this.groundY
            this.mesh.position.y = this.groundY
            this.active = false
        }
    }

    getPosition() {
        return this.position
    }

    reset() {
        this.active = false
        this.flightTime = 0
        this.velocity.set(0, 0, 0)
        if (this.mesh) this.mesh.visible = false
    }

    destroy() {
        this.reset()
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh = null
        }
    }
}
