import * as THREE from 'three'
import {
    Fn, float, vec2, vec3, vec4,
    uniform, attribute, uv, sin, cos,
    positionLocal, positionWorld, texture,
    smoothstep, clamp, normalize, length, mix,
    If, Discard
} from 'three/tsl'
import Experience from '../Experience.js'
import { fbm, colorRamp } from './TSL/NoiseNodes.js'

export default class Grass {
    constructor(options = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.debug = this.experience.debug

        this.size = options.size || 10
        this.count = options.count || 3000
        this.position = options.position || new THREE.Vector3(0, 0, 0)
        this.noiseScale = options.noiseScale || 0.3
        this.bladeWidth = options.bladeWidth ?? 0.29
        this.bladeHeight = options.bladeHeight ?? 0.4

        this.setGeometry()
        this.setMaterial()
        this.setMesh()

        if (this.debug.active) {
            this.setDebug()
        }
    }

    setGeometry() {
        if (this.geometry) this.geometry.dispose()
        const segments = 2
        this.geometry = new THREE.PlaneGeometry(this.bladeWidth, this.bladeHeight, 1, segments)
        this.geometry.translate(0, this.bladeHeight * 0.5, 0)
    }

    setMaterial() {
        const grassAtlas = this.resources.items.grassAtlas

        grassAtlas.wrapS = THREE.ClampToEdgeWrapping
        grassAtlas.wrapT = THREE.ClampToEdgeWrapping
        grassAtlas.minFilter = THREE.LinearMipMapLinearFilter
        grassAtlas.magFilter = THREE.LinearFilter
        grassAtlas.flipY = true
        // IMPORTANT: This is a data texture (alpha mask), NOT a color texture
        // Using LinearSRGBColorSpace prevents gamma correction artifacts
        grassAtlas.colorSpace = THREE.LinearSRGBColorSpace
        grassAtlas.generateMipmaps = true
        grassAtlas.needsUpdate = true

        // TSL uniforms
        this.uTime = uniform(0)
        this.uColor0 = uniform(new THREE.Color(0x4B9B82))
        this.uColor1 = uniform(new THREE.Color(0x7ACC56))
        this.uColor2 = uniform(new THREE.Color(0xC9F547))
        this.uColor3 = uniform(new THREE.Color(0xE6FF91))
        this.uNoiseScale = uniform(0.2)
        this.uRampStop1 = uniform(0.05)
        this.uRampStop2 = uniform(0.8)
        this.uEmissionStrength = uniform(0.49)
        this.uBendStrength = uniform(0.09)
        this.uAlphaCutoff = uniform(0.35)
        this.uAlphaSoftness = uniform(0.25)
        this.uCharacterPosition = uniform(new THREE.Vector3(0, 0, 0))
        this.uDisplacementRadius = uniform(0.7)
        this.uDisplacementStrength = uniform(0.45)

        // --- VERTEX POSITION (positionNode) ---
        // Uses positionLocal + instance world position attribute for displacement
        const posNode = Fn(() => {
            const pos = positionLocal.toVar()

            // Custom attributes
            const aBendDirection = attribute('aBendDirection', 'float')
            // Instance world position passed from JS (updated each frame)
            const aInstanceWorldPos = attribute('aInstanceWorldPos', 'vec3')
            const uvCoord = uv()

            // Blade curvature
            const bend = sin(uvCoord.y.mul(3.14159)).mul(this.uBendStrength).mul(aBendDirection)
            pos.x.addAssign(bend)

            // Character displacement — uses the instance's world position
            const toCharXZ = aInstanceWorldPos.xz.sub(this.uCharacterPosition.xz).toVar()
            const distToChar = length(toCharXZ)
            const displaceFactor = float(1.0).sub(smoothstep(0.0, this.uDisplacementRadius, distToChar))
            const pushDir = normalize(toCharXZ.add(vec2(0.0001, 0.0001))) // prevent zero-length normalize
            const disp = displaceFactor.mul(this.uDisplacementStrength).mul(uvCoord.y)
            pos.x.addAssign(pushDir.x.mul(disp))
            pos.z.addAssign(pushDir.y.mul(disp))

            // Wind — world-space seeded waves for variation across instances
            const wx = aInstanceWorldPos.x.add(pos.x)
            const wz = aInstanceWorldPos.z.add(pos.z)
            const wave1 = sin(this.uTime.mul(1.2).add(wx.mul(0.8)).add(wz.mul(0.6)))
            const wave2 = cos(this.uTime.mul(0.9).add(wx.mul(0.6)).add(wz.mul(0.9)))
            const wave3 = sin(this.uTime.mul(0.7).add(wx.mul(1.1)).add(wz.mul(0.5))).mul(0.5)

            pos.x.addAssign(wave1.mul(0.12).add(wave3.mul(0.04)).mul(uvCoord.y))
            pos.z.addAssign(wave2.mul(0.08).add(wave3.mul(0.03)).mul(uvCoord.y))

            return pos
        })()

        // --- FRAGMENT SHADER ---
        const colorNode = Fn(() => {
            const aTextureIndex = attribute('aTextureIndex', 'float')
            const uvCoord = uv()
            const worldPos = positionWorld

            // Atlas UV mapping (2x2 grid)
            const indexX = aTextureIndex.mod(2.0)
            const indexY = aTextureIndex.div(2.0).floor()
            const margin = float(0.002) // slightly larger margin to avoid bleeding
            const cellSize = float(0.5).sub(margin.mul(2.0))
            const offset = vec2(
                indexX.mul(0.5).add(margin),
                float(1.0).sub(indexY.add(1.0).mul(0.5)).add(margin)
            )
            const atlasUV = uvCoord.mul(cellSize).add(offset)

            // Sample alpha from texture (R channel = blade shape)
            const texSample = texture(grassAtlas, atlasUV)
            const rawAlpha = texSample.r

            // Hard alpha discard — removes transparent pixels cleanly
            If(rawAlpha.lessThan(this.uAlphaCutoff), () => {
                Discard()
            })

            // Smooth alpha edges (Ghibli-style soft look)
            const softMin = this.uAlphaCutoff
            const softMax = this.uAlphaCutoff.add(this.uAlphaSoftness)
            const alpha = smoothstep(softMin, softMax, rawAlpha)

            // Noise-based color from shared fBM + ColorRamp
            const noiseVal = fbm(worldPos.mul(this.uNoiseScale))
            const grassColor = colorRamp(
                noiseVal,
                this.uColor0, this.uColor1, this.uColor2, this.uColor3,
                this.uRampStop1, this.uRampStop2
            )

            return vec4(grassColor.mul(this.uEmissionStrength), alpha)
        })()

        // Build the material
        this.material = new THREE.MeshBasicNodeMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: true,
            alphaTest: 0.01
        })
        this.material.positionNode = posNode
        this.material.fragmentNode = colorNode

        // Premultiplied-alpha blending for clean edges
        this.material.blending = THREE.CustomBlending
        this.material.blendSrc = THREE.SrcAlphaFactor
        this.material.blendDst = THREE.OneMinusSrcAlphaFactor
        this.material.blendSrcAlpha = THREE.OneFactor
        this.material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor
    }

    setMesh() {
        // Remove existing mesh if recreating
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh.dispose()
        }

        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.count)
        this.mesh.frustumCulled = false

        const dummy = new THREE.Object3D()
        const textureIndices = new Float32Array(this.count)
        const colorVariants = new Float32Array(this.count)
        const bendDirections = new Float32Array(this.count)
        // Store world positions of each instance for displacement calculation in shader
        this.instanceWorldPositions = new Float32Array(this.count * 3)
        const halfSize = this.size * 0.5

        const getNoise = (x, z) => {
            return Math.sin(x * this.noiseScale) * Math.cos(z * this.noiseScale) * 0.5 + 0.5
        }

        for (let i = 0; i < this.count; i++) {
            const x = this.position.x + (Math.random() * this.size - halfSize)
            const z = this.position.z + (Math.random() * this.size - halfSize)
            const y = this.position.y

            const scaleY = 0.4 + Math.random() * 1.0
            const scaleX = 0.7 + Math.random() * 0.5
            const rotationY = Math.random() * Math.PI * 2

            dummy.position.set(x, y, z)
            dummy.rotation.set(0, rotationY, 0)
            dummy.scale.set(scaleX, scaleY, 1)
            dummy.updateMatrix()

            this.mesh.setMatrixAt(i, dummy.matrix)
            textureIndices[i] = Math.floor(Math.random() * 4)
            colorVariants[i] = getNoise(x, z) * 2.0
            bendDirections[i] = Math.random() > 0.5 ? 1.0 : -1.0

            // Store instance world position
            this.instanceWorldPositions[i * 3] = x
            this.instanceWorldPositions[i * 3 + 1] = y
            this.instanceWorldPositions[i * 3 + 2] = z
        }

        this.geometry.setAttribute('aTextureIndex', new THREE.InstancedBufferAttribute(textureIndices, 1))
        this.geometry.setAttribute('aColorVariant', new THREE.InstancedBufferAttribute(colorVariants, 1))
        this.geometry.setAttribute('aBendDirection', new THREE.InstancedBufferAttribute(bendDirections, 1))
        this.geometry.setAttribute('aInstanceWorldPos', new THREE.InstancedBufferAttribute(this.instanceWorldPositions, 3))
        this.mesh.instanceMatrix.needsUpdate = true

        this.scene.add(this.mesh)
    }

    update() {
        if (this.uTime) {
            this.uTime.value = this.time.elapsed * 0.001
        }

        // Update character position for grass displacement
        if (this.uCharacterPosition && this.experience.world.character) {
            this.uCharacterPosition.value.copy(this.experience.world.character.position)
        }
    }

    setDebug() {
        this.debugFolder = this.debug.ui.addFolder('Grass')

        this.debugFolder
            .add(this, 'count')
            .min(100)
            .max(10000)
            .step(100)
            .name('Blade Count')
            .onChange(() => {
                this.setMesh()
            })

        this.debugFolder
            .add(this, 'bladeWidth')
            .min(0.05)
            .max(0.8)
            .step(0.01)
            .name('Anchura hoja')
            .onChange(() => {
                this.setGeometry()
                this.setMesh()
            })

        this.debugFolder
            .add(this, 'bladeHeight')
            .min(0.2)
            .max(1.5)
            .step(0.05)
            .name('Altura hoja')
            .onChange(() => {
                this.setGeometry()
                this.setMesh()
            })

        this.debugFolder
            .add(this.uEmissionStrength, 'value')
            .min(0)
            .max(3)
            .step(0.01)
            .name('Emission Strength (igual que suelo)')

        this.debugFolder
            .add(this.uBendStrength, 'value')
            .min(0)
            .max(0.6)
            .step(0.02)
            .name('Curvatura hoja')

        this.debugFolder
            .add(this.uAlphaCutoff, 'value')
            .min(0.05)
            .max(0.6)
            .step(0.01)
            .name('Corte alpha (descartar transparente)')

        this.debugFolder
            .add(this.uAlphaSoftness, 'value')
            .min(0.02)
            .max(0.5)
            .step(0.01)
            .name('Difuminado bordes (estilo Ghibli)')

        this.debugFolder
            .add(this.uNoiseScale, 'value')
            .min(0.1)
            .max(10)
            .step(0.05)
            .name('Tamaño patrón (↓ más grande)')

        this.debugFolder
            .add(this.uRampStop1, 'value')
            .min(0.05)
            .max(0.95)
            .step(0.01)
            .name('ColorRamp Stop 1')

        this.debugFolder
            .add(this.uRampStop2, 'value')
            .min(0.05)
            .max(0.95)
            .step(0.01)
            .name('ColorRamp Stop 2')

        this.debugFolder.addColor({ value: this.uColor0.value }, 'value').name('Color 0').onChange(v => this.uColor0.value.copy(v))
        this.debugFolder.addColor({ value: this.uColor1.value }, 'value').name('Color 1').onChange(v => this.uColor1.value.copy(v))
        this.debugFolder.addColor({ value: this.uColor2.value }, 'value').name('Color 2').onChange(v => this.uColor2.value.copy(v))
        this.debugFolder.addColor({ value: this.uColor3.value }, 'value').name('Color 3').onChange(v => this.uColor3.value.copy(v))

        this.debugFolder
            .add(this.uDisplacementRadius, 'value')
            .min(0.3)
            .max(3.0)
            .step(0.1)
            .name('Radio desplazamiento')

        this.debugFolder
            .add(this.uDisplacementStrength, 'value')
            .min(0.0)
            .max(1.5)
            .step(0.05)
            .name('Fuerza desplazamiento')
    }
}
