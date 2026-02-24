/**
 * PatioScene
 * Loads patio-draco.glb, sets up:
 *   - Grupo_Colliders → invisible + Rapier trimesh colliders
 *   - suelo1, suelo2 → custom ground shader (grass/dirt via vertex colors)
 *   - agua → water caustics shader
 *   - agua.001 → water shadow shader
 *   - All other meshes → default materials with shadows
 */
import * as THREE from 'three'
import { uniform } from 'three/tsl'
import Experience from '../Experience.js'
import { createGroundColorNode } from './TSL/GroundShader.js'
import { createWaterColorNode, createWaterShadowColorNode } from './TSL/WaterShader.js'
import { createCloudShaderNodes } from './TSL/CloudShader.js'

export default class PatioScene {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.physics = this.experience.world.physics
        this.time = this.experience.time
        this.debug = this.experience.debug

        // Store references for cleanup / updates
        this.colliderBodies = []
        this.groundMeshes = []
        this.waterMesh = null
        this.waterShadowMesh = null
        this.cloudMeshes = []

        // Water time uniform (animated)
        this.uTime = uniform(0)

        this.loadModel()
    }

    loadModel() {
        const gltf = this.resources.items.patioModel
        if (!gltf) {
            console.error('PatioScene: patioModel not found in resources')
            return
        }

        this.model = gltf.scene

        // Traverse and enable shadows on all meshes
        this.model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true
                child.receiveShadow = true
            }
        })

        // Process special nodes
        this.processColliders()
        this.processGround()
        this.processWater()
        this.processClouds()

        // Add the entire model to scene
        this.scene.add(this.model)

        // Setup lil-gui controls
        this.setupGUI()

        console.log('✅ PatioScene loaded')
    }

    // ─── COLLIDERS ───────────────────────────────────────────────
    processColliders() {
        const collidersGroup = this.model.getObjectByName('Grupo_Colliders')
        if (!collidersGroup) {
            console.warn('PatioScene: Grupo_Colliders not found')
            return
        }

        // Make invisible
        collidersGroup.visible = false

        // Create Rapier trimesh colliders for each child mesh
        collidersGroup.traverse((child) => {
            if (child.isMesh && child.geometry) {
                this.createTrimeshCollider(child)
            }
        })

        console.log(`✅ Created ${this.colliderBodies.length} colliders from Grupo_Colliders`)
    }

    createTrimeshCollider(mesh) {
        if (!this.physics.world) return

        const RAPIER = this.physics.RAPIER

        // Get world transform
        mesh.updateWorldMatrix(true, false)
        const worldPos = new THREE.Vector3()
        const worldQuat = new THREE.Quaternion()
        const worldScale = new THREE.Vector3()
        mesh.matrixWorld.decompose(worldPos, worldQuat, worldScale)

        // Get geometry vertices and indices
        const geometry = mesh.geometry
        const posAttr = geometry.attributes.position
        const vertices = new Float32Array(posAttr.count * 3)

        // Apply scale to vertices
        for (let i = 0; i < posAttr.count; i++) {
            vertices[i * 3] = posAttr.getX(i) * worldScale.x
            vertices[i * 3 + 1] = posAttr.getY(i) * worldScale.y
            vertices[i * 3 + 2] = posAttr.getZ(i) * worldScale.z
        }

        let indices
        if (geometry.index) {
            indices = new Uint32Array(geometry.index.array)
        } else {
            indices = new Uint32Array(posAttr.count)
            for (let i = 0; i < posAttr.count; i++) indices[i] = i
        }

        // Create fixed rigid body
        const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(worldPos.x, worldPos.y, worldPos.z)
            .setRotation({
                x: worldQuat.x,
                y: worldQuat.y,
                z: worldQuat.z,
                w: worldQuat.w
            })
        const rigidBody = this.physics.world.createRigidBody(rigidBodyDesc)

        // Create trimesh collider
        try {
            const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
                .setFriction(0.8)
                .setRestitution(0.0)
                .setActiveCollisionTypes(
                    RAPIER.ActiveCollisionTypes.DEFAULT |
                    RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED
                )
            const collider = this.physics.world.createCollider(colliderDesc, rigidBody)
            this.colliderBodies.push({ rigidBody, collider })
        } catch (e) {
            console.warn('PatioScene: Failed to create trimesh collider for', mesh.name, e)
        }
    }

    // ─── GROUND (suelo1, suelo2) ─────────────────────────────────
    processGround() {
        const groundNames = ['suelo1', 'suelo2']

        // Ground shader uniforms — matching Blender node values
        this.groundUniforms = {
            uScale: uniform(0.2),
            uEmissionStrength: uniform(0.75), // overall brightness
            // Grass Color Ramp (HSV, 4 stops — Ghibli palette)
            uGrassColor0: uniform(new THREE.Color(0x3A7A30)),  // deep forest green
            uGrassColor1: uniform(new THREE.Color(0x62B83A)),  // vivid mid-green
            uGrassColor2: uniform(new THREE.Color(0xB8E840)),  // bright lime
            uGrassColor3: uniform(new THREE.Color(0xE2FF8A)),  // pale sun yellow
            uGrassRampStop1: uniform(0.10),
            uGrassRampStop2: uniform(0.72),
            // Grass micro-detail / Ghibli AO (NEW)
            uGrassMicroScale: uniform(1.4),             // micro-noise frequency (higher = finer)
            uGrassAOStrength: uniform(0.45),            // how dark the valleys are
            uGrassSunStrength: uniform(0.28),           // how bright the sunlit peaks are
            uGrassSoilColor: uniform(new THREE.Color(0x2C4A1A)),  // dark soil for AO mixing
            // Stylized Sand.001 — Voronoi-based
            uSandColor1: uniform(new THREE.Color(0.791, 0.352, 0.122)),  // Blender linear
            uSandColor2: uniform(new THREE.Color(0.597, 0.266, 0.093)),  // Blender linear
            uSandVoronoiScale: uniform(6.3), // Blender: Wave Scale = 6.3
            uSandNoiseScale: uniform(0.8),   // Blender: Group Scale = 0.8
            uSandDistortion: uniform(0.136)  // Blender: Distortion = 0.136
        }

        const groundColorNode = createGroundColorNode(this.groundUniforms)

        for (const name of groundNames) {
            const mesh = this.model.getObjectByName(name)
            if (!mesh) {
                console.warn(`PatioScene: ${name} not found`)
                continue
            }

            // Verify vertex colors are present
            if (!mesh.geometry.attributes.color_1) {
                console.warn(`PatioScene: ${name} has no 'color_1' (Mask) attribute`)
            }

            // Apply custom ground material — MeshStandardNodeMaterial so shadows are received
            const groundMaterial = new THREE.MeshStandardNodeMaterial({
                side: THREE.DoubleSide,
                depthWrite: true,
                roughness: 1.0,
                metalness: 0.0
            })
            // colorNode replaces albedo → receives shadows from DirectionalLight automatically
            groundMaterial.colorNode = groundColorNode

            mesh.material = groundMaterial
            mesh.receiveShadow = true
            mesh.castShadow = false

            this.groundMeshes.push(mesh)
        }

        console.log(`✅ Applied ground shader to ${this.groundMeshes.length} meshes`)
    }

    // ─── WATER (agua, agua001, agua002) ───────────────────────────
    processWater() {
        // Shared water uniforms — Blender-exact values, adjusted for world-space coordinates
        // NOTE: Blender uses Object coords (normalized to mesh size), Three.js uses world coords
        // so scales need dividing by ~4 to get similar cell density
        this.waterUniforms = {
            uTime: this.uTime,
            uVoronoiScale: uniform(12.0),         // Blender=12 (using object-space scale matching)
            uMappingScaleY: uniform(3.0),          // Blender=3.0
            uMappingOffsetY: uniform(0.176),      // Blender: Mapping Location Y = 0.176
            uSmoothness: uniform(0.54),           // Blender: Voronoi Smoothness = 0.54
            uEmissionStrength: uniform(1.5),      // Blender: Emission Strength = 1.5
            uWaterColor: uniform(new THREE.Color(0.028, 0.829, 1.0)),
            uCausticsThresholdLow: uniform(0.0454),  // Blender: Color Ramp pos 1
            uCausticsThresholdHigh: uniform(0.0818), // Blender: Color Ramp pos 2
            uDistortionStrength: uniform(1.0),
            uIntersectionWidth: uniform(0.5),      // depth comparison distance
            uIntersectionStrength: uniform(1.0)     // intensity of white contour
        }

        // Shadow uniforms share key parameters with main water
        const shadowUniforms = {
            uTime: this.uTime,
            uVoronoiScale: this.waterUniforms.uVoronoiScale,
            uMappingScaleY: this.waterUniforms.uMappingScaleY,
            uMappingOffsetY: this.waterUniforms.uMappingOffsetY,
            uSmoothness: this.waterUniforms.uSmoothness,
            uDistortionStrength: this.waterUniforms.uDistortionStrength
        }

        // --- Main water plane (agua) ---
        const waterColorNode = createWaterColorNode(this.waterUniforms)
        const aguaMesh = this.model.getObjectByName('agua')
        if (aguaMesh) {
            const waterMaterial = new THREE.MeshBasicNodeMaterial({
                side: THREE.DoubleSide,
                transparent: true,
                depthWrite: false
            })
            waterMaterial.fragmentNode = waterColorNode
            waterMaterial.blending = THREE.CustomBlending
            waterMaterial.blendSrc = THREE.SrcAlphaFactor
            waterMaterial.blendDst = THREE.OneMinusSrcAlphaFactor

            aguaMesh.material = waterMaterial
            aguaMesh.castShadow = false
            aguaMesh.receiveShadow = false
            aguaMesh.renderOrder = 1
            this.waterMesh = aguaMesh
            console.log('✅ Applied water caustics shader to agua')
        } else {
            console.warn('PatioScene: agua mesh not found')
        }

        // --- Shadow planes (agua001, agua002) ---
        const shadowColorNode = createWaterShadowColorNode(shadowUniforms)
        const shadowNames = ['agua001', 'agua.001', 'agua002', 'agua.002']
        const processed = new Set()

        for (const name of shadowNames) {
            const mesh = this.model.getObjectByName(name)
            if (!mesh || processed.has(mesh.uuid)) continue
            processed.add(mesh.uuid)

            const shadowMaterial = new THREE.MeshBasicNodeMaterial({
                side: THREE.DoubleSide,
                transparent: true,
                depthWrite: false
            })
            shadowMaterial.fragmentNode = createWaterShadowColorNode(shadowUniforms)
            shadowMaterial.blending = THREE.CustomBlending
            shadowMaterial.blendSrc = THREE.SrcAlphaFactor
            shadowMaterial.blendDst = THREE.OneMinusSrcAlphaFactor

            mesh.material = shadowMaterial
            mesh.castShadow = false
            mesh.receiveShadow = false
            mesh.renderOrder = 0
            console.log('✅ Applied water shadow shader to', mesh.name)
        }
    }

    // ─── CLOUDS (Clouds plane from patio GLB) ────────────────────
    processClouds() {
        this.cloudUniforms = {
            uNoiseScale1: uniform(1.2),
            uNoiseScale2: uniform(1.8),
            uNoiseScale3: uniform(3.0),
            uScrollSpeed1: uniform(0.15),
            uScrollSpeed2: uniform(0.25),
            // Kept modest for imported planes that may have low subdivisions.
            uDisplacement: uniform(0.35),
            uBaseColor: uniform(new THREE.Color('#4a6fa5')),
            uCloudColor: uniform(new THREE.Color('#e8eef8')),
            uHighlight: uniform(new THREE.Color('#fff8ee')),
            uOpacity: uniform(0.82)
        }

        const cloudNodes = createCloudShaderNodes(this.cloudUniforms)
        const processed = new Set()
        const cloudCandidates = ['Clouds', 'Clouds.001']

        const applyCloudMaterial = (mesh) => {
            if (!mesh || processed.has(mesh.uuid)) return
            processed.add(mesh.uuid)

            const cloudMaterial = new THREE.MeshStandardNodeMaterial({
                side: THREE.DoubleSide,
                transparent: true,
                depthWrite: false,
                roughness: 0.95,
                metalness: 0.0
            })
            cloudMaterial.positionNode = cloudNodes.positionNode
            cloudMaterial.colorNode = cloudNodes.colorNode
            cloudMaterial.opacityNode = cloudNodes.opacityNode

            mesh.material = cloudMaterial
            mesh.castShadow = false
            mesh.receiveShadow = false
            mesh.renderOrder = 2
            this.cloudMeshes.push(mesh)
            console.log('✅ Applied fluffy cloud shader to', mesh.name)
        }

        for (const name of cloudCandidates) {
            const mesh = this.model.getObjectByName(name)
            if (mesh?.isMesh) applyCloudMaterial(mesh)
        }

        // Fallback: match any mesh whose name contains "cloud".
        if (this.cloudMeshes.length === 0) {
            this.model.traverse((child) => {
                if (child.isMesh && child.name.toLowerCase().includes('cloud')) {
                    applyCloudMaterial(child)
                }
            })
        }

        if (this.cloudMeshes.length === 0) {
            console.warn('PatioScene: Clouds mesh not found')
        }
    }

    /**
     * Returns ground meshes with vertex color data for grass blade placement.
     * Grass.js can sample these to determine where to spawn blades.
     */
    getGroundMeshes() {
        return this.groundMeshes
    }

    /**
     * Sample vertex colors from ground meshes to get grass spawn positions.
     * Uses efficient triangle-based sampling: picks random triangles weighted
     * by area, then generates random barycentric points inside them.
     * Only places grass where all 3 vertices of the triangle have dark vertex colors (mask < 0.4).
     */
    getGrassSpawnPositions(count = 3000) {
        const positions = []
        if (this.groundMeshes.length === 0) return positions

        const countPerMesh = Math.ceil(count / this.groundMeshes.length)

        for (const mesh of this.groundMeshes) {
            const geometry = mesh.geometry
            const posAttr = geometry.attributes.position
            const colorAttr = geometry.attributes.color_1 || geometry.attributes.color

            if (!posAttr || !colorAttr) continue

            mesh.updateWorldMatrix(true, false)
            const worldMatrix = mesh.matrixWorld

            // Build list of grass triangles (all 3 vertices have dark vertex color)
            const indexArray = geometry.index ? geometry.index.array : null
            const faceCount = indexArray ? indexArray.length / 3 : posAttr.count / 3

            const grassTriangles = []  // { a, b, c } world positions + area
            let totalArea = 0

            const vA = new THREE.Vector3()
            const vB = new THREE.Vector3()
            const vC = new THREE.Vector3()

            for (let f = 0; f < faceCount; f++) {
                let iA, iB, iC
                if (indexArray) {
                    iA = indexArray[f * 3]
                    iB = indexArray[f * 3 + 1]
                    iC = indexArray[f * 3 + 2]
                } else {
                    iA = f * 3
                    iB = f * 3 + 1
                    iC = f * 3 + 2
                }

                // Check vertex colors - all 3 must be dark (grass)
                const rA = colorAttr.getX(iA)
                const rB = colorAttr.getX(iB)
                const rC = colorAttr.getX(iC)

                if (rA > 0.4 || rB > 0.4 || rC > 0.4) continue // skip non-grass triangles

                // Get world positions
                vA.set(posAttr.getX(iA), posAttr.getY(iA), posAttr.getZ(iA)).applyMatrix4(worldMatrix)
                vB.set(posAttr.getX(iB), posAttr.getY(iB), posAttr.getZ(iB)).applyMatrix4(worldMatrix)
                vC.set(posAttr.getX(iC), posAttr.getY(iC), posAttr.getZ(iC)).applyMatrix4(worldMatrix)

                // Triangle area (for weighted random sampling)
                const ab = new THREE.Vector3().subVectors(vB, vA)
                const ac = new THREE.Vector3().subVectors(vC, vA)
                const area = ab.cross(ac).length() * 0.5

                if (area > 0.0001) {
                    grassTriangles.push({
                        a: vA.clone(), b: vB.clone(), c: vC.clone(),
                        area
                    })
                    totalArea += area
                }
            }

            if (grassTriangles.length === 0 || totalArea === 0) continue

            console.log(`🌿 ${mesh.name}: ${grassTriangles.length} grass triangles, total area: ${totalArea.toFixed(2)}`)

            // Sample random points on grass triangles, weighted by area
            for (let i = 0; i < countPerMesh; i++) {
                // Pick a random triangle (weighted by area)
                let r = Math.random() * totalArea
                let chosenTri = grassTriangles[0]
                for (const tri of grassTriangles) {
                    r -= tri.area
                    if (r <= 0) {
                        chosenTri = tri
                        break
                    }
                }

                // Random barycentric coordinates
                let u = Math.random()
                let v = Math.random()
                if (u + v > 1) {
                    u = 1 - u
                    v = 1 - v
                }
                const w = 1 - u - v

                positions.push({
                    x: chosenTri.a.x * u + chosenTri.b.x * v + chosenTri.c.x * w,
                    y: chosenTri.a.y * u + chosenTri.b.y * v + chosenTri.c.y * w,
                    z: chosenTri.a.z * u + chosenTri.b.z * v + chosenTri.c.z * w
                })
            }
        }

        console.log(`🌿 Total grass positions: ${positions.length}`)
        return positions
    }

    update() {
        // Animate water
        if (this.uTime) {
            this.uTime.value = this.time.elapsed * 0.001
        }
    }

    // ─── GUI CONTROLS ────────────────────────────────────────────
    setupGUI() {
        if (!this.debug.active) return

        // --- Ground folder ---
        const groundFolder = this.debug.ui.addFolder('Ground')
        groundFolder.close()

        const gu = this.groundUniforms
        groundFolder.add(gu.uScale, 'value', 0.01, 2.0, 0.01).name('Grass Patch Scale')
        groundFolder.add(gu.uEmissionStrength, 'value', 0.1, 2.0, 0.01).name('Emission Strength')
        // Grass micro-detail
        groundFolder.add(gu.uGrassMicroScale, 'value', 0.2, 5.0, 0.1).name('Grass Micro Scale')
        groundFolder.add(gu.uGrassAOStrength, 'value', 0.0, 1.5, 0.01).name('Grass AO Strength')
        groundFolder.add(gu.uGrassSunStrength, 'value', 0.0, 1.0, 0.01).name('Grass Sun Highlights')
        groundFolder.addColor({ value: gu.uGrassSoilColor.value }, 'value').name('Grass Soil Color')
            .onChange(v => gu.uGrassSoilColor.value.copy(v))
        // Grass color ramp
        groundFolder.addColor({ value: gu.uGrassColor0.value }, 'value').name('Grass Color 0')
            .onChange(v => gu.uGrassColor0.value.copy(v))
        groundFolder.addColor({ value: gu.uGrassColor1.value }, 'value').name('Grass Color 1')
            .onChange(v => gu.uGrassColor1.value.copy(v))
        groundFolder.addColor({ value: gu.uGrassColor2.value }, 'value').name('Grass Color 2')
            .onChange(v => gu.uGrassColor2.value.copy(v))
        groundFolder.addColor({ value: gu.uGrassColor3.value }, 'value').name('Grass Color 3')
            .onChange(v => gu.uGrassColor3.value.copy(v))
        // Sand
        groundFolder.add(gu.uSandVoronoiScale, 'value', 0.5, 20.0, 0.1).name('Sand Voronoi Scale')
        groundFolder.add(gu.uSandNoiseScale, 'value', 0.1, 3.0, 0.05).name('Sand UV Scale')
        groundFolder.add(gu.uSandDistortion, 'value', 0.0, 1.0, 0.01).name('Sand Distortion')
        groundFolder.addColor({ value: gu.uSandColor1.value }, 'value').name('Sand Color 1')
            .onChange(v => gu.uSandColor1.value.copy(v))
        groundFolder.addColor({ value: gu.uSandColor2.value }, 'value').name('Sand Color 2')
            .onChange(v => gu.uSandColor2.value.copy(v))

        // --- Water folder ---
        const waterFolder = this.debug.ui.addFolder('Water')
        waterFolder.close()

        const wu = this.waterUniforms
        waterFolder.add(wu.uVoronoiScale, 'value', 1.0, 30.0, 0.5).name('Voronoi Scale')
        waterFolder.add(wu.uMappingScaleY, 'value', 0.5, 10.0, 0.1).name('Flow Stretch (Y)')
        waterFolder.add(wu.uMappingOffsetY, 'value', -1.0, 1.0, 0.01).name('Mapping Offset Y')
        waterFolder.add(wu.uSmoothness, 'value', 0.01, 2.0, 0.01).name('Cell Smoothness')
        waterFolder.add(wu.uEmissionStrength, 'value', 0.1, 5.0, 0.1).name('Caustics Emission')
        waterFolder.add(wu.uCausticsThresholdLow, 'value', 0.001, 0.2, 0.001).name('Caustics Threshold Low')
        waterFolder.add(wu.uCausticsThresholdHigh, 'value', 0.01, 0.5, 0.01).name('Caustics Threshold High')
        waterFolder.add(wu.uDistortionStrength, 'value', 0.0, 3.0, 0.1).name('Noise Distortion')
        waterFolder.add(wu.uIntersectionWidth, 'value', 0.0, 2.0, 0.1).name('Shore Contour Width')
        waterFolder.add(wu.uIntersectionStrength, 'value', 0.0, 3.0, 0.1).name('Shore Contour Strength')
        waterFolder.addColor({ value: wu.uWaterColor.value }, 'value').name('Water Color')
            .onChange(v => wu.uWaterColor.value.copy(v))

        // --- Clouds folder ---
        if (this.cloudUniforms && this.cloudMeshes.length > 0) {
            const cloudFolder = this.debug.ui.addFolder('Clouds')
            cloudFolder.close()

            const cu = this.cloudUniforms
            cloudFolder.add(cu.uNoiseScale1, 'value', 0.2, 4.0, 0.01).name('Noise Scale 1')
            cloudFolder.add(cu.uNoiseScale2, 'value', 0.2, 5.0, 0.01).name('Noise Scale 2')
            cloudFolder.add(cu.uNoiseScale3, 'value', 0.2, 8.0, 0.01).name('Noise Scale 3')
            cloudFolder.add(cu.uScrollSpeed1, 'value', -1.0, 1.0, 0.01).name('Scroll Speed 1')
            cloudFolder.add(cu.uScrollSpeed2, 'value', -1.0, 1.0, 0.01).name('Scroll Speed 2')
            cloudFolder.add(cu.uDisplacement, 'value', 0.0, 3.0, 0.01).name('Displacement')
            cloudFolder.add(cu.uOpacity, 'value', 0.0, 1.0, 0.01).name('Opacity')
            cloudFolder.addColor({ value: cu.uBaseColor.value }, 'value').name('Base Color')
                .onChange(v => cu.uBaseColor.value.copy(v))
            cloudFolder.addColor({ value: cu.uCloudColor.value }, 'value').name('Cloud Color')
                .onChange(v => cu.uCloudColor.value.copy(v))
            cloudFolder.addColor({ value: cu.uHighlight.value }, 'value').name('Highlight Color')
                .onChange(v => cu.uHighlight.value.copy(v))
        }
    }
}
