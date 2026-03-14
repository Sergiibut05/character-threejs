import * as THREE from 'three'
import Experience from '../Experience.js'

/**
 * Simulated frisbee flight — Wii Sports Resort style.
 * Parametric arc with air drag + lateral curve from tilt.
 * Visual spin uses a locked base quaternion to avoid wobble.
 * Can attach to a bone (hand) for the aiming phase.
 */
export default class FrisbeeFlightController {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        this.mesh = null
        this.active = false
        this._attachedToBone = null

        // Flight state
        this.position = new THREE.Vector3()
        this.velocity = new THREE.Vector3()
        this.flightTime = 0
        this.curveAmount = 0
        this._spinAngle = 0
        this._flightBaseQuat = new THREE.Quaternion()

        // Tuning
        this.gravity = 1.5
        this.airDrag = 0.65
        this.spinSpeed = 14
        this.groundY = 0.08
        this.curveStrength = 6.0

        // Hand offset — shifted along bone-local X to hold from the edge, not center
        this.handOffset = new THREE.Vector3(0.18, 0.04, 0.07)
        this._handBaseQuat = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(-Math.PI * 0.5, 0, -0.4)
        )
        this.maxTiltRadians = 0.35

        this._worldPos = new THREE.Vector3()
        this._worldQuat = new THREE.Quaternion()
        this._tmpQuat = new THREE.Quaternion()

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

    // ─── Hand attachment ─────────────────────────────────────────────────

    attachToHand(bone) {
        if (!this.mesh || !bone) return
        this._attachedToBone = bone

        this.scene.remove(this.mesh)
        bone.add(this.mesh)

        this.mesh.position.copy(this.handOffset)
        this.mesh.quaternion.copy(this._handBaseQuat)
        this.mesh.visible = true
    }

    setTilt(tiltAngle) {
        if (!this.mesh || !this._attachedToBone) return
        // Apply base rotation then tilt in the disc's local frame
        this._tmpQuat.setFromAxisAngle(_AXIS_Z, tiltAngle * this.maxTiltRadians)
        this.mesh.quaternion.copy(this._handBaseQuat).multiply(this._tmpQuat)
    }

    detachFromHand() {
        if (!this.mesh || !this._attachedToBone) return

        this.mesh.getWorldPosition(this._worldPos)
        this.mesh.getWorldQuaternion(this._worldQuat)

        this._attachedToBone.remove(this.mesh)
        this.scene.add(this.mesh)

        this.mesh.position.copy(this._worldPos)
        this.mesh.quaternion.copy(this._worldQuat)

        this._attachedToBone = null
        return this._worldPos.clone()
    }

    // ─── Flight ──────────────────────────────────────────────────────────

    launch(origin, direction, speed, tiltAngle) {
        if (this._attachedToBone) {
            this.detachFromHand()
        }

        this.position.copy(origin)
        this.velocity.copy(direction).multiplyScalar(speed)
        this.curveAmount = tiltAngle || 0
        this.flightTime = 0
        this._spinAngle = 0
        this.active = true

        // Lock the base orientation for the entire flight — no wobble
        // Disc faces the throw direction, flat, with a slight bank from curve
        const hDir = new THREE.Vector3(direction.x, 0, direction.z)
        if (hDir.lengthSq() > 0.001) hDir.normalize()
        else hDir.set(0, 0, 1)

        const yaw = Math.atan2(hDir.x, hDir.z)
        this._flightBaseQuat.setFromEuler(
            new THREE.Euler(0, yaw, this.curveAmount * 0.3)
        )

        if (this.mesh) {
            this.mesh.visible = true
            this.mesh.position.copy(origin)
            this.mesh.quaternion.copy(this._flightBaseQuat)
        }
    }

    update(dt) {
        if (!this.active || !this.mesh) return

        this.flightTime += dt

        // Horizontal drag
        const drag = Math.exp(-this.airDrag * dt)
        this.velocity.x *= drag
        this.velocity.z *= drag

        // Gravity
        this.velocity.y -= this.gravity * dt

        // Lateral curve
        if (Math.abs(this.curveAmount) > 0.01) {
            const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2)
            if (hSpeed > 0.1) {
                const perpX = -this.velocity.z / hSpeed
                const perpZ = this.velocity.x / hSpeed
                const curveMag = this.curveAmount * this.curveStrength * dt
                this.velocity.x += perpX * curveMag
                this.velocity.z += perpZ * curveMag
            }
        }

        // Integrate position
        this.position.x += this.velocity.x * dt
        this.position.y += this.velocity.y * dt
        this.position.z += this.velocity.z * dt

        // Stable visual: locked base orientation + spin on local Y
        this._spinAngle += this.spinSpeed * dt
        this._tmpQuat.setFromAxisAngle(_AXIS_Y, this._spinAngle)
        this.mesh.quaternion.copy(this._flightBaseQuat).multiply(this._tmpQuat)

        this.mesh.position.copy(this.position)

        // Landing check
        if (this.position.y <= this.groundY && this.flightTime > 0.2) {
            this.position.y = this.groundY
            this.mesh.position.y = this.groundY
            this.active = false
        }
    }

    /**
     * Simulate the full trajectory ahead of time to find where/when the disc lands.
     * Uses the same physics as update() but runs the whole arc in one call.
     */
    predictLanding(origin, direction, speed, tiltAngle) {
        const pos = origin.clone()
        const vel = direction.clone().multiplyScalar(speed)
        const curve = tiltAngle || 0
        const step = 1 / 60
        let time = 0

        for (let i = 0; i < 600; i++) {
            time += step

            const drag = Math.exp(-this.airDrag * step)
            vel.x *= drag
            vel.z *= drag
            vel.y -= this.gravity * step

            if (Math.abs(curve) > 0.01) {
                const hSpeed = Math.sqrt(vel.x ** 2 + vel.z ** 2)
                if (hSpeed > 0.1) {
                    const perpX = -vel.z / hSpeed
                    const perpZ = vel.x / hSpeed
                    vel.x += perpX * curve * this.curveStrength * step
                    vel.z += perpZ * curve * this.curveStrength * step
                }
            }

            pos.x += vel.x * step
            pos.y += vel.y * step
            pos.z += vel.z * step

            if (pos.y <= this.groundY && time > 0.2) {
                return { point: new THREE.Vector3(pos.x, this.groundY, pos.z), flightTime: time }
            }
        }

        return { point: new THREE.Vector3(pos.x, this.groundY, pos.z), flightTime: time }
    }

    getPosition() {
        return this.position
    }

    reset() {
        if (this._attachedToBone) {
            this._attachedToBone.remove(this.mesh)
            if (this.mesh) this.scene.add(this.mesh)
            this._attachedToBone = null
        }
        this.active = false
        this.flightTime = 0
        this.curveAmount = 0
        this._spinAngle = 0
        this.velocity.set(0, 0, 0)
        if (this.mesh) {
            this.mesh.visible = false
            this.mesh.quaternion.identity()
        }
    }

    destroy() {
        this.reset()
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh = null
        }
    }
}

const _AXIS_Y = new THREE.Vector3(0, 1, 0)
const _AXIS_Z = new THREE.Vector3(0, 0, 1)
