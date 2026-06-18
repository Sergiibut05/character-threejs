import * as THREE from 'three'
import {
    Fn, float, vec2,
    uniform, uv, texture,
    mix, normalWorld, sin, cos,
    positionLocal, rotateUV, smoothstep,
    screenUV, screenSize, positionWorld, cameraPosition
} from 'three/tsl'
import Experience from '../Experience.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { propSunDirection } from './scene/StylizedPropMaterial.js'
import { dayNightLitTint } from './DayNight.js'

function createRng(seed) {
    let s = seed | 0
    return () => {
        s |= 0
        s = s + 0x6D2B79F5 | 0
        let t = Math.imul(s ^ s >>> 15, 1 | s)
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
}

export default class Foliage {
    constructor(references, colorANode, colorBNode, seeThrough = false) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time

        this.references = references
        this.colorANode = colorANode
        this.colorBNode = colorBNode
        this.seeThrough = seeThrough
        this.seeThroughMultiplier = 0.5
        this.lockSeeThroughToScreenCenter = true
        this.seeThroughCenterOffsetY = -0.04
        this.rng = createRng(42)

        // Pre-allocated helpers — avoid GC pressure in update()
        this._tmpVec3 = new THREE.Vector3()
        this._billboardObj = new THREE.Object3D()
        this._instances = [] // { position: Vector3, size: number }

        this.setGeometry()
        this.setMaterial()
        this.setFromReferences()
        this.setInstancedMesh()
    }

    setGeometry() {
        const count = this.experience.quality?.foliagePlanes ?? 80
        const planes = []

        for (let i = 0; i < count; i++) {
            const plane = new THREE.PlaneGeometry(0.8, 0.8)

            const spherical = new THREE.Spherical(
                1 - Math.pow(this.rng(), 3),
                Math.PI * 2 * this.rng(),
                Math.PI * this.rng()
            )
            const position = new THREE.Vector3().setFromSpherical(spherical)

            // Match original foliage orientation logic
            plane.rotateZ(this.rng() * 9999)
            plane.rotateY(0)
            plane.translate(position.x, position.y, position.z)

            const normal = position.clone().normalize()
            const normalArray = new Float32Array(12)
            for (let j = 0; j < 4; j++) {
                const j3 = j * 3
                const vertPos = new THREE.Vector3(
                    plane.attributes.position.array[j3],
                    plane.attributes.position.array[j3 + 1],
                    plane.attributes.position.array[j3 + 2]
                )
                const mixedNormal = vertPos.lerp(normal, 0.85)
                normalArray[j3] = mixedNormal.x
                normalArray[j3 + 1] = mixedNormal.y
                normalArray[j3 + 2] = mixedNormal.z
            }

            plane.setAttribute('normal', new THREE.BufferAttribute(normalArray, 3))
            planes.push(plane)
        }

        this.geometry = mergeGeometries(planes)
    }

    setMaterial() {
        this.material = {}

        // Alpha
        this.material.threshold = uniform(0.3)

        // See-through
        this.material.seeThroughPosition = uniform(vec2(0, 0))
        this.material.seeThroughEdgeMin = uniform(0.11)
        this.material.seeThroughEdgeMax = uniform(0.57)
        this.material.characterCameraDistance = uniform(8)

        // Wind
        this.material.uTime = uniform(0)
        this.material.windSpeed = uniform(1.1)
        this.material.windStrength = uniform(0.27)

        // Shadow
        this.material.shadowOffset = uniform(1)
        // 0.5 = neutral, > 0.5 = more Color A presence, < 0.5 = more Color B
        this.material.colorAPresence = uniform(0.5)

        const foliageTexture = this.resources.items.foliageTexture

        // Same world-space sun vector as stylized props (updated in Environment.update)
        const lightDir = propSunDirection

        // Wind: time-based UV rotation
        const windOffset = Fn(() => {
            const t = this.material.uTime.mul(this.material.windSpeed)
            const w1 = sin(t.mul(1.1).add(positionLocal.x.mul(0.5)).add(positionLocal.z.mul(0.3)))
            const w2 = cos(t.mul(0.7).add(positionLocal.x.mul(0.3)).add(positionLocal.z.mul(0.5)))
            return vec2(w1, w2).length().mul(this.material.windStrength)
        })

        // Foliage alpha: sample texture with wind-rotated UVs
        const foliageAlpha = Fn(() => {
            const rotatedUv = rotateUV(
                uv(),
                windOffset().mul(2.2),
                vec2(0.5)
            )
            return texture(foliageTexture, rotatedUv).b
        })

        // Alpha node with see-through around character
        const alphaNode = Fn(() => {
            let alpha = float(1)

            if (this.seeThrough) {
                const toChar = screenUV.sub(this.material.seeThroughPosition)
                toChar.mulAssign(vec2(screenSize.x.div(screenSize.y), 1))
                const distToChar = toChar.length()
                const distanceFade = smoothstep(
                    this.material.seeThroughEdgeMin,
                    this.material.seeThroughEdgeMax,
                    distToChar
                )

                const foliageSDF = foliageAlpha()
                const seeThroughAlpha = foliageSDF.mul(
                    distanceFade.mul(this.material.threshold.oneMinus()).add(this.material.threshold)
                )

                // Enable see-through only when foliage is between camera and character.
                const fragmentCameraDistance = positionWorld.sub(cameraPosition).length()
                const isOccluder = smoothstep(
                    0.0,
                    0.5,
                    this.material.characterCameraDistance.sub(fragmentCameraDistance)
                )
                alpha.assign(mix(foliageSDF, seeThroughAlpha, isOccluder))
            } else {
                alpha.assign(foliageAlpha())
            }

            alpha.subAssign(this.material.threshold)
            return alpha
        })()

        // Color: mix A/B based on how much the normal faces the sun
        const colorNode = Fn(() => {
            const mixStrength = normalWorld.dot(lightDir).smoothstep(0, 1)
            const bias = float(0.5).sub(this.material.colorAPresence)
            const shiftedMix = mixStrength.add(bias).clamp(0.0, 1.0)
            return mix(this.colorANode, this.colorBNode, shiftedMix).mul(dayNightLitTint)
        })()

        this.material.instance = new THREE.MeshLambertNodeMaterial({
            side: THREE.DoubleSide
        })
        this.material.instance.colorNode = colorNode
        this.material.instance.opacityNode = smoothstep(0.0, 0.03, alphaNode)
        this.material.instance.alphaTestNode = uniform(0.5)
        this.material.instance.transparent = false
        this.material.instance.depthWrite = true
        this.material.instance.alphaTest = 0.5

        if (!this.experience.quality?.isLow) {
            this.material.instance.receivedShadowPositionNode = positionLocal.add(lightDir.mul(this.material.shadowOffset))
        }
    }

    setFromReferences() {
        this._instances = []
        this.transformMatrices = []
        const camPos = this.experience.camera.instance.position

        for (const _child of this.references) {
            const size = _child.scale.x
            const pos = _child.position.clone()
            this._instances.push({ position: pos, size })

            const object = new THREE.Object3D()
            object.position.copy(pos)
            object.scale.setScalar(size)
            // Initial billboard orientation toward camera
            const dx = camPos.x - pos.x
            const dz = camPos.z - pos.z
            object.rotation.y = Math.atan2(dx, dz)
            object.updateMatrix()
            this.transformMatrices.push(object.matrix.clone())
        }
    }

    setInstancedMesh() {
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh = null
        }

        const count = this.transformMatrices.length
        if (count === 0) return

        this.mesh = new THREE.InstancedMesh(this.geometry, this.material.instance, count)
        const isLow = this.experience.quality?.isLow
        this.mesh.receiveShadow = !isLow
        this.mesh.castShadow = !isLow
        this.mesh.frustumCulled = false

        for (let i = 0; i < count; i++) {
            this.mesh.setMatrixAt(i, this.transformMatrices[i])
        }
        this.mesh.instanceMatrix.needsUpdate = true

        this.scene.add(this.mesh)
    }

    update() {
        // Wind time
        this.material.uTime.value = this.time.elapsed * 0.001

        // Billboard: rotate each instance to face the camera around the Y axis
        if (this.mesh && this._instances.length > 0) {
            const camPos = this.experience.camera.instance.position
            const obj = this._billboardObj
            for (let i = 0; i < this._instances.length; i++) {
                const inst = this._instances[i]
                const dx = camPos.x - inst.position.x
                const dz = camPos.z - inst.position.z
                obj.position.copy(inst.position)
                obj.scale.setScalar(inst.size)
                obj.rotation.set(0, Math.atan2(dx, dz), 0)
                obj.updateMatrix()
                this.mesh.setMatrixAt(i, obj.matrix)
            }
            this.mesh.instanceMatrix.needsUpdate = true
        }

        // See-through: use stable center to avoid projection jitter
        if (this.seeThrough) {
            const character = this.experience.world.character
            const camera = this.experience.camera.instance

            if (this.lockSeeThroughToScreenCenter || !character) {
                this.material.seeThroughPosition.value.set(0.5, 0.5 + this.seeThroughCenterOffsetY)
            } else {
                // Reuse pre-allocated vector — avoids new THREE.Vector3() every frame
                this._tmpVec3.copy(character.position).project(camera)
                this.material.seeThroughPosition.value.set(
                    THREE.MathUtils.clamp((this._tmpVec3.x + 1) * 0.5, 0, 1),
                    THREE.MathUtils.clamp((1 - this._tmpVec3.y) * 0.5 + this.seeThroughCenterOffsetY, 0, 1)
                )
            }

            // Scale edges by camera distance
            const camDist = character
                ? camera.position.distanceTo(character.position)
                : 8
            this.material.characterCameraDistance.value = camDist
            this.material.seeThroughEdgeMin.value = 3 / camDist * this.seeThroughMultiplier
            this.material.seeThroughEdgeMax.value = 15 / camDist * this.seeThroughMultiplier
        }
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh.geometry?.dispose?.()
            this.mesh.material?.dispose?.()
            this.mesh = null
        }
    }
}
