import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Grass
{
    constructor(options = {})
    {
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
        
        if(this.debug.active)
        {
            this.setDebug()
        }
    }

    setGeometry()
    {
        if(this.geometry) this.geometry.dispose()
        const segments = 2
        this.geometry = new THREE.PlaneGeometry(this.bladeWidth, this.bladeHeight, 1, segments)
        this.geometry.translate(0, this.bladeHeight * 0.5, 0)
    }

    setMaterial()
    {
        const grassAtlas = this.resources.items.grassAtlas

        grassAtlas.wrapS = THREE.ClampToEdgeWrapping
        grassAtlas.wrapT = THREE.ClampToEdgeWrapping
        grassAtlas.minFilter = THREE.LinearMipMapLinearFilter
        grassAtlas.magFilter = THREE.LinearFilter
        grassAtlas.flipY = true
        grassAtlas.colorSpace = THREE.SRGBColorSpace
        grassAtlas.generateMipmaps = true
        grassAtlas.needsUpdate = true

        // Misma paleta y parámetros que el suelo (ColorRamp fBM)
        this.uniforms = {
            uTime: { value: 0 },
            uMap: { value: grassAtlas },
            uColor0: { value: new THREE.Color(0x4B9B82) },
            uColor1: { value: new THREE.Color(0x7ACC56) },
            uColor2: { value: new THREE.Color(0xC9F547) },
            uColor3: { value: new THREE.Color(0xE6FF91) },
            uNoiseScale: { value: 0.2 },
            uRampStop1: { value: 0.05 },
            uRampStop2: { value: 0.8 },
            uEmissionStrength: { value: 0.49 },
            uBendStrength: { value: 0.09 },
            uAlphaCutoff: { value: 0.2 },
            uAlphaSoftness: { value: 0.45 },
            uCharacterPosition: { value: new THREE.Vector3(0, 0, 0) },
            uDisplacementRadius: { value: 0.7 },
            uDisplacementStrength: { value: 0.45 }
        }

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                uniform float uTime;
                uniform float uBendStrength;
                uniform vec3 uCharacterPosition;
                uniform float uDisplacementRadius;
                uniform float uDisplacementStrength;
                attribute float aTextureIndex;
                attribute float aColorVariant;
                attribute float aBendDirection;
                
                varying vec2 vUv;
                varying vec3 vWorldPosition;

                void main()
                {
                    vec3 pos = position;

                    // Curvatura: desplazar el centro de la hoja (sin en altura), 0 en base y punta
                    float bend = sin(uv.y * 3.14159) * uBendStrength * aBendDirection;
                    pos.x += bend;

                    // World position
                    vec3 worldPos = (modelMatrix * instanceMatrix * vec4(pos, 1.0)).xyz;
                    
                    // Grass displacement: apartar hierba cuando el personaje pasa
                    vec2 toCharacter = worldPos.xz - uCharacterPosition.xz;
                    float distToChar = length(toCharacter);
                    if(distToChar < uDisplacementRadius)
                    {
                        float influence = 1.0 - smoothstep(0.0, uDisplacementRadius, distToChar);
                        vec2 pushDir = normalize(toCharacter);
                        float displacement = influence * uDisplacementStrength * uv.y;
                        worldPos.xz += pushDir * displacement;
                    }
                    
                    vWorldPosition = worldPos;
                    
                    // Wind (aplicado después del displacement)
                    float wave1 = sin(uTime * 1.2 + worldPos.x * 0.8 + worldPos.z * 0.6);
                    float wave2 = cos(uTime * 0.9 + worldPos.x * 0.6 + worldPos.z * 0.9);
                    float wave3 = sin(uTime * 0.7 + worldPos.x * 1.1 + worldPos.z * 0.5) * 0.5;
                    
                    worldPos.x += (wave1 * 0.12 + wave3 * 0.04) * uv.y;
                    worldPos.z += (wave2 * 0.08 + wave3 * 0.03) * uv.y;

                    // Atlas UV mapping
                    float indexX = mod(aTextureIndex, 2.0);
                    float indexY = floor(aTextureIndex / 2.0);
                    float margin = 0.001;
                    vec2 offset = vec2(indexX * 0.5 + margin, (1.0 - indexY) * 0.5 + margin);
                    
                    vUv = uv * (0.5 - margin * 2.0) + offset;

                    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uMap;
                uniform vec3 uColor0;
                uniform vec3 uColor1;
                uniform vec3 uColor2;
                uniform vec3 uColor3;
                uniform float uNoiseScale;
                uniform float uRampStop1;
                uniform float uRampStop2;
                uniform float uEmissionStrength;
                uniform float uAlphaCutoff;
                uniform float uAlphaSoftness;

                varying vec2 vUv;
                varying vec3 vWorldPosition;

                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
                float snoise(vec3 v)
                {
                    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                    vec3 i  = floor(v + dot(v, C.yyy));
                    vec3 x0 = v - i + dot(i, C.xxx);
                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min(g.xyz, l.zxy);
                    vec3 i2 = max(g.xyz, l.zxy);
                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;
                    i = mod289(i);
                    vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                    float n_ = 0.142857142857;
                    vec3 ns = n_ * D.wyz - D.xzx;
                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_);
                    vec4 x = x_ *ns.x + ns.yyyy;
                    vec4 y = y_ *ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);
                    vec4 b0 = vec4(x.xy, y.xy);
                    vec4 b1 = vec4(x.zw, y.zw);
                    vec4 s0 = floor(b0)*2.0 + 1.0;
                    vec4 s1 = floor(b1)*2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));
                    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                    vec3 p0 = vec3(a0.xy, h.x);
                    vec3 p1 = vec3(a0.zw, h.y);
                    vec3 p2 = vec3(a1.xy, h.z);
                    vec3 p3 = vec3(a1.zw, h.w);
                    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
                    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
                }
                float fbm(vec3 p)
                {
                    float value = 0.0;
                    float amplitude = 1.0;
                    float frequency = 1.0;
                    const float lacunarity = 2.0;
                    const float persistence = 0.5;
                    for (int i = 0; i < 4; i++)
                    {
                        value += amplitude * snoise(p * frequency);
                        frequency *= lacunarity;
                        amplitude *= persistence;
                    }
                    return value;
                }

                void main()
                {
                    vec4 texColor = texture2D(uMap, clamp(vUv, 0.0, 1.0));
                    float rawAlpha = texColor.r;
                    if(rawAlpha < uAlphaCutoff) discard;
                    float edge0 = 0.5 - uAlphaSoftness;
                    float edge1 = 0.5 + uAlphaSoftness;
                    float alpha = smoothstep(edge0, edge1, rawAlpha);

                    // Mismo ColorRamp que el suelo: fBM + smoothstep + 4 colores
                    float raw = fbm(vWorldPosition * uNoiseScale);
                    float n = clamp((raw / 1.875) * 0.5 + 0.5, 0.0, 1.0);
                    n = smoothstep(0.0, 1.0, n);
                    float s1 = min(uRampStop1, uRampStop2);
                    float s2 = max(uRampStop1, uRampStop2);
                    float t1 = smoothstep(0.0, s1, n);
                    float t2 = smoothstep(s1, s2, n);
                    float t3 = smoothstep(s2, 1.0, n);
                    vec3 color = mix(uColor0, uColor1, t1);
                    color = mix(color, uColor2, t2);
                    color = mix(color, uColor3, t3);
                    color *= uEmissionStrength;

                    gl_FragColor = vec4(color * alpha, alpha);
                }
            `,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: true,
            alphaTest: 0.01,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            blendSrcAlpha: THREE.OneFactor,
            blendDstAlpha: THREE.OneMinusSrcAlphaFactor
        })
    }

    setMesh()
    {
        // Remove existing mesh if recreating
        if(this.mesh)
        {
            this.scene.remove(this.mesh)
            this.mesh.dispose()
        }

        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.count)
        this.mesh.frustumCulled = false

        const dummy = new THREE.Object3D()
        const textureIndices = new Float32Array(this.count)
        const colorVariants = new Float32Array(this.count)
        const bendDirections = new Float32Array(this.count)
        const halfSize = this.size * 0.5
        
        const getNoise = (x, z) => {
            return Math.sin(x * this.noiseScale) * Math.cos(z * this.noiseScale) * 0.5 + 0.5
        }

        for(let i = 0; i < this.count; i++)
        {
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
        }

        this.geometry.setAttribute('aTextureIndex', new THREE.InstancedBufferAttribute(textureIndices, 1))
        this.geometry.setAttribute('aColorVariant', new THREE.InstancedBufferAttribute(colorVariants, 1))
        this.geometry.setAttribute('aBendDirection', new THREE.InstancedBufferAttribute(bendDirections, 1))
        this.mesh.instanceMatrix.needsUpdate = true

        this.scene.add(this.mesh)
    }

    update()
    {
        if(this.uniforms?.uTime)
        {
            this.uniforms.uTime.value = this.time.elapsed * 0.001
        }

        // Update character position for grass displacement
        if(this.uniforms?.uCharacterPosition && this.experience.world.character)
        {
            this.uniforms.uCharacterPosition.value.copy(this.experience.world.character.position)
        }
    }

    setDebug()
    {
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
            .add(this.uniforms.uEmissionStrength, 'value')
            .min(0)
            .max(3)
            .step(0.01)
            .name('Emission Strength (igual que suelo)')

        this.debugFolder
            .add(this.uniforms.uBendStrength, 'value')
            .min(0)
            .max(0.6)
            .step(0.02)
            .name('Curvatura hoja')

        this.debugFolder
            .add(this.uniforms.uAlphaCutoff, 'value')
            .min(0.0)
            .max(0.2)
            .step(0.01)
            .name('Corte alpha (descartar casi transparente)')
        this.debugFolder
            .add(this.uniforms.uAlphaSoftness, 'value')
            .min(0.02)
            .max(0.45)
            .step(0.01)
            .name('Difuminado bordes (estilo Ghibli)')

        this.debugFolder
            .add(this.uniforms.uNoiseScale, 'value')
            .min(0.1)
            .max(10)
            .step(0.05)
            .name('Tamaño patrón (↓ más grande)')

        this.debugFolder
            .add(this.uniforms.uRampStop1, 'value')
            .min(0.05)
            .max(0.95)
            .step(0.01)
            .name('ColorRamp Stop 1')

        this.debugFolder
            .add(this.uniforms.uRampStop2, 'value')
            .min(0.05)
            .max(0.95)
            .step(0.01)
            .name('ColorRamp Stop 2')

        this.debugFolder.addColor(this.uniforms.uColor0, 'value').name('Color 0')
        this.debugFolder.addColor(this.uniforms.uColor1, 'value').name('Color 1')
        this.debugFolder.addColor(this.uniforms.uColor2, 'value').name('Color 2')
        this.debugFolder.addColor(this.uniforms.uColor3, 'value').name('Color 3')

        this.debugFolder
            .add(this.uniforms.uDisplacementRadius, 'value')
            .min(0.3)
            .max(3.0)
            .step(0.1)
            .name('Radio desplazamiento')

        this.debugFolder
            .add(this.uniforms.uDisplacementStrength, 'value')
            .min(0.0)
            .max(1.5)
            .step(0.05)
            .name('Fuerza desplazamiento')
    }
}
