import * as THREE from 'three'
import {
    Fn, float, vec2, vec3, vec4,
    uniform, attribute, uv, sin, cos,
    positionLocal, positionWorld, texture,
    smoothstep, clamp, normalize, length, mix, pow, abs, max,
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
        this.bladeWidth = options.bladeWidth ?? 0.35
        this.bladeHeight = options.bladeHeight ?? 0.38
        this.spawnPositions = options.spawnPositions || null
        this.spawnFunction = options.spawnFunction || null

        this.setGeometry()
        this.setMaterial()
        this.setMesh()

        if (this.debug.active) {
            this.setDebug()
        }
    }

    setGeometry() {
        if (this.geometry) this.geometry.dispose()

        // Crossed-planes: two quads at 90° for volumetric look
        const hw = this.bladeWidth * 0.5
        const h = this.bladeHeight

        // Plane 1 (XY)
        const positions = new Float32Array([
            -hw, 0, 0, hw, 0, 0, hw, h, 0, -hw, h, 0,   // front quad
            0, 0, -hw, 0, 0, hw, 0, h, hw, 0, h, -hw    // side quad (90°)
        ])

        const uvs = new Float32Array([
            0, 0, 1, 0, 1, 1, 0, 1,  // front
            0, 0, 1, 0, 1, 1, 0, 1   // side
        ])

        const indices = new Uint16Array([
            0, 1, 2, 0, 2, 3,  // front face
            4, 5, 6, 4, 6, 7   // side face
        ])

        this.geometry = new THREE.BufferGeometry()
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1))
        this.geometry.computeVertexNormals()
    }

    setMaterial() {
        const grassTex = this.resources.items.grassAtlas

        grassTex.wrapS = THREE.ClampToEdgeWrapping
        grassTex.wrapT = THREE.ClampToEdgeWrapping
        grassTex.minFilter = THREE.LinearMipMapLinearFilter
        grassTex.magFilter = THREE.LinearFilter
        grassTex.flipY = true
        grassTex.colorSpace = THREE.SRGBColorSpace
        grassTex.generateMipmaps = true
        grassTex.needsUpdate = true

        // ─── Uniforms ────────────────────────────────────────────────────────
        this.uTime = uniform(0)

        // Ghibli palette – root to tip gradient
        this.uColorRoot = uniform(new THREE.Color(0x1A3D0E))   // deep dark earth moss
        this.uColorMid = uniform(new THREE.Color(0x3D8A22))   // vivid forest green
        this.uColorTip = uniform(new THREE.Color(0x8CCF3A))   // warm lime tip

        // Patch-level noise color variation (world-space fBM)
        this.uColor0 = uniform(new THREE.Color(0x245A14))
        this.uColor1 = uniform(new THREE.Color(0x4EA52A))
        this.uColor2 = uniform(new THREE.Color(0x7BC840))
        this.uColor3 = uniform(new THREE.Color(0xA8E460))
        this.uNoiseScale = uniform(0.22)
        this.uRampStop1 = uniform(0.15)
        this.uRampStop2 = uniform(0.70)

        // Blade rendering
        this.uEmissionStrength = uniform(1.15)
        this.uAlphaCutoff = uniform(0.6)
        this.uAlphaSoftness = uniform(0.02)

        // Root AO
        this.uAOMix = uniform(0.51)

        // Backlighting: warm glow for subsurface scattering feel
        this.uBacklightColor = uniform(new THREE.Color(0xFFEA60))
        this.uBacklightStrength = uniform(0.3)

        // Wind
        this.uWindStrength = uniform(0.10)
        this.uWindSpeed = uniform(1.0)

        // Character grass parting
        this.uCharacterPosition = uniform(new THREE.Vector3(0, 0, 0))
        this.uDisplacementRadius = uniform(0.7)
        this.uDisplacementStrength = uniform(0.45)

        // ─── VERTEX SHADER ───────────────────────────────────────────────────
        const posNode = Fn(() => {
            const pos = positionLocal.toVar()
            const uvCoord = uv()
            const h = uvCoord.y  // 0=base, 1=tip

            const aInstanceWorldPos = attribute('aInstanceWorldPos', 'vec3')
            const aRandomSeed = attribute('aRandomSeed', 'float')

            // Character grass parting
            const toCharXZ = aInstanceWorldPos.xz.sub(this.uCharacterPosition.xz).toVar()
            const distToChar = length(toCharXZ)
            const dispFactor = float(1.0).sub(smoothstep(0.0, this.uDisplacementRadius, distToChar))
            const pushDir = normalize(toCharXZ.add(vec2(0.0001, 0.0001)))
            const disp = dispFactor.mul(this.uDisplacementStrength).mul(h)
            pos.x.addAssign(pushDir.x.mul(disp))
            pos.z.addAssign(pushDir.y.mul(disp))

            // Wind — 3 overlapping sine waves, seeded per-instance
            const wx = aInstanceWorldPos.x.add(aRandomSeed.mul(6.28))
            const wz = aInstanceWorldPos.z.add(aRandomSeed.mul(2.72))
            const t = this.uTime.mul(this.uWindSpeed)

            const wave1 = sin(t.mul(1.1).add(wx.mul(0.75)).add(wz.mul(0.5)))
            const wave2 = cos(t.mul(0.7).add(wx.mul(0.5)).add(wz.mul(0.9)))
            const wave3 = sin(t.mul(2.5).add(wx.mul(1.3))).mul(0.25)

            // Quadratic height weight: base stays, tip sways
            const hSq = h.mul(h)
            const ws = this.uWindStrength
            pos.x.addAssign(wave1.mul(ws).add(wave3.mul(ws.mul(0.25))).mul(hSq))
            pos.z.addAssign(wave2.mul(ws.mul(0.6)).mul(hSq))

            return pos
        })()

        // ─── FRAGMENT SHADER ─────────────────────────────────────────────────
        const colorNode = Fn(() => {
            const uvCoord = uv()
            const aColorVariant = attribute('aColorVariant', 'float')
            const worldPos = positionWorld

            // Height factor: 0=base, 1=tip
            const h = uvCoord.y

            // Texture alpha from the grass clump image
            const texSample = texture(grassTex, uvCoord)
            const rawAlpha = texSample.r

            // Discard transparent pixels
            If(rawAlpha.lessThan(this.uAlphaCutoff), () => { Discard() })
            const alpha = smoothstep(this.uAlphaCutoff, this.uAlphaCutoff.add(this.uAlphaSoftness), rawAlpha)

            // ── 1. World-space patch color (large color blotches from fBM noise) ──
            const noiseVal = fbm(worldPos.mul(this.uNoiseScale))
            const patchColor = colorRamp(
                noiseVal,
                this.uColor0, this.uColor1, this.uColor2, this.uColor3,
                this.uRampStop1, this.uRampStop2
            )

            // Slight individual variation (biodiversity)
            const isAlt = smoothstep(0.45, 0.55, aColorVariant.mod(1.0))
            const baseColor = mix(patchColor, this.uColorMid, isAlt.mul(0.2))

            // ── 2. Root AO: blend toward dark root color at base ──
            const aoWeight = float(1.0).sub(smoothstep(0.0, 0.5, h)).mul(this.uAOMix)
            const aoColor = mix(baseColor, this.uColorRoot, aoWeight)

            // ── 3. Tip brightening: blend toward bright lime at tip ──
            const tipWeight = smoothstep(0.5, 1.0, h).mul(0.5)
            const tipColor = mix(aoColor, this.uColorTip, tipWeight)

            // ── 4. Backlighting — subsurface scattering at tip ──
            const backlight = smoothstep(0.4, 1.0, h).mul(this.uBacklightStrength)
            const backlightAdd = this.uBacklightColor.mul(backlight).mul(0.15)

            // ── 5. Combine ──
            const finalRGB = tipColor.add(backlightAdd).mul(this.uEmissionStrength)

            // ── 6. Base fade: smoothly fade out at the root so blades merge with ground ──
            const baseFade = smoothstep(0.0, 0.25, h)
            const finalAlpha = alpha.mul(baseFade)

            return vec4(finalRGB, finalAlpha)
        })()

        // Material
        this.material = new THREE.MeshBasicNodeMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: true,
            alphaTest: 0.01
        })
        this.material.positionNode = posNode
        this.material.fragmentNode = colorNode

        this.material.blending = THREE.CustomBlending
        this.material.blendSrc = THREE.SrcAlphaFactor
        this.material.blendDst = THREE.OneMinusSrcAlphaFactor
        this.material.blendSrcAlpha = THREE.OneFactor
        this.material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor
    }

    setMesh() {
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh.dispose()
        }

        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.count)
        this.mesh.frustumCulled = false

        const dummy = new THREE.Object3D()
        const colorVariants = new Float32Array(this.count)
        const randomSeeds = new Float32Array(this.count)
        this.instanceWorldPositions = new Float32Array(this.count * 3)

        const halfSize = this.size * 0.5

        const getNoise = (x, z) =>
            Math.sin(x * this.noiseScale) * Math.cos(z * this.noiseScale) * 0.5 + 0.5

        for (let i = 0; i < this.count; i++) {
            let x, y, z

            if (this.spawnPositions && i < this.spawnPositions.length) {
                x = this.spawnPositions[i].x
                y = this.spawnPositions[i].y
                z = this.spawnPositions[i].z
            } else if (!this.spawnPositions) {
                x = this.position.x + (Math.random() * this.size - halfSize)
                z = this.position.z + (Math.random() * this.size - halfSize)
                y = this.position.y
            } else {
                break
            }

            // Random scale and rotation for natural look
            const scaleY = 0.6 + Math.random() * 0.8
            const scaleX = 0.7 + Math.random() * 0.6
            const rotationY = Math.random() * Math.PI * 2

            dummy.position.set(x, y, z)
            dummy.rotation.set(0, rotationY, 0)
            dummy.scale.set(scaleX, scaleY, scaleX)
            dummy.updateMatrix()

            this.mesh.setMatrixAt(i, dummy.matrix)
            colorVariants[i] = getNoise(x, z) * 2.0
            randomSeeds[i] = Math.random()

            this.instanceWorldPositions[i * 3] = x
            this.instanceWorldPositions[i * 3 + 1] = y
            this.instanceWorldPositions[i * 3 + 2] = z
        }

        this.geometry.setAttribute('aColorVariant', new THREE.InstancedBufferAttribute(colorVariants, 1))
        this.geometry.setAttribute('aRandomSeed', new THREE.InstancedBufferAttribute(randomSeeds, 1))
        this.geometry.setAttribute('aInstanceWorldPos', new THREE.InstancedBufferAttribute(this.instanceWorldPositions, 3))

        this.mesh.instanceMatrix.needsUpdate = true
        this.scene.add(this.mesh)
    }

    update() {
        if (this.uTime) {
            this.uTime.value = this.time.elapsed * 0.001
        }
        if (this.uCharacterPosition && this.experience.world.character) {
            this.uCharacterPosition.value.copy(this.experience.world.character.position)
        }
    }

    setDebug() {
        this.debugFolder = this.debug.ui.addFolder('Grass')
        this.debugFolder.close()

        this.debugFolder.add(this, 'count').min(100).max(10000).step(100).name('Blade Count')
            .onChange(() => {
                if (this.spawnFunction) {
                    this.spawnPositions = this.spawnFunction(this.count)
                    this.count = Math.min(this.count, this.spawnPositions.length)
                }
                this.setMesh()
            })

        this.debugFolder.add(this, 'bladeWidth').min(0.04).max(0.8).step(0.01).name('Clump Width')
            .onChange(() => { this.setGeometry(); this.setMesh() })

        this.debugFolder.add(this, 'bladeHeight').min(0.05).max(1.5).step(0.01).name('Clump Height')
            .onChange(() => { this.setGeometry(); this.setMesh() })

        this.debugFolder.add(this.uEmissionStrength, 'value', 0.1, 3.0, 0.01).name('Brightness')
        this.debugFolder.add(this.uAlphaCutoff, 'value', 0.01, 0.6, 0.01).name('Alpha Cutoff')
        this.debugFolder.add(this.uAlphaSoftness, 'value', 0.02, 0.5, 0.01).name('Alpha Softness')
        this.debugFolder.add(this.uAOMix, 'value', 0.0, 1.0, 0.01).name('Root Darkness (AO)')
        this.debugFolder.add(this.uBacklightStrength, 'value', 0.0, 1.5, 0.05).name('Backlight')
        this.debugFolder.add(this.uWindStrength, 'value', 0.0, 0.4, 0.01).name('Wind Strength')
        this.debugFolder.add(this.uWindSpeed, 'value', 0.1, 3.0, 0.1).name('Wind Speed')
        this.debugFolder.add(this.uNoiseScale, 'value', 0.05, 5.0, 0.05).name('Patch Scale')
        this.debugFolder.add(this.uDisplacementRadius, 'value', 0.3, 3.0, 0.1).name('Char Radius')
        this.debugFolder.add(this.uDisplacementStrength, 'value', 0.0, 1.5, 0.05).name('Char Strength')

        this.debugFolder.addColor({ value: this.uColorRoot.value }, 'value').name('Root Color')
            .onChange(v => this.uColorRoot.value.copy(v))
        this.debugFolder.addColor({ value: this.uColorMid.value }, 'value').name('Mid Color')
            .onChange(v => this.uColorMid.value.copy(v))
        this.debugFolder.addColor({ value: this.uColorTip.value }, 'value').name('Tip Color')
            .onChange(v => this.uColorTip.value.copy(v))
        this.debugFolder.addColor({ value: this.uBacklightColor.value }, 'value').name('Backlight Color')
            .onChange(v => this.uBacklightColor.value.copy(v))
    }
}
