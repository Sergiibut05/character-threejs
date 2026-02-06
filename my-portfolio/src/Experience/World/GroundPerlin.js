import * as THREE from 'three'
import Experience from '../Experience.js'

// Fragment shader: fBM (Blender-style) from world position + ColorRamp of 4 colors, unlit
const perlinFragmentShader = `
    uniform vec3 uColor0; // #4B9B82
    uniform vec3 uColor1; // #7ACC56
    uniform vec3 uColor2; // #C9F547
    uniform vec3 uColor3; // #E6FF91
    uniform float uScale;
    uniform float uEmissionStrength;
    uniform float uRampStop1;
    uniform float uRampStop2;

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
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
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
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    // fBM: 4 octaves, lacunarity 2.0, persistence 0.5 (Blender-style)
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
        vec3 p = vWorldPosition * uScale;
        float raw = fbm(p);
        // Normalize to [0,1]; soft remap to avoid hard clipping (suavizado de ruido)
        float n = clamp((raw / 1.875) * 0.5 + 0.5, 0.0, 1.0);
        n = smoothstep(0.0, 1.0, n);

        // ColorRamp Blender-style: 3 transiciones (stops en GUI)
        float s1 = min(uRampStop1, uRampStop2);
        float s2 = max(uRampStop1, uRampStop2);
        float t1 = smoothstep(0.0, s1, n);
        float t2 = smoothstep(s1, s2, n);
        float t3 = smoothstep(s2, 1.0, n);
        vec3 color = mix(uColor0, uColor1, t1);
        color = mix(color, uColor2, t2);
        color = mix(color, uColor3, t3);

        color *= uEmissionStrength;
        gl_FragColor = vec4(color, 1.0);
    }
`

const perlinVertexShader = `
    varying vec3 vWorldPosition;
    void main()
    {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

export default class GroundPerlin
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.physics = this.experience.world.physics
        this.debug = this.experience.debug

        this.size = { x: 50, y: 0.1, z: 50 }
        this.position = { x: 0, y: 0, z: 0 }

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setPhysics()

        if(this.debug.active)
        {
            this.setDebug()
        }
    }

    setGeometry()
    {
        this.geometry = new THREE.PlaneGeometry(this.size.x, this.size.z, 64, 64)
    }

    setMaterial()
    {
        // Vivid colors: #4B9B82, #7ACC56, #C9F547, #E6FF91; emission like Blender
        this.uniforms = {
            uColor0: { value: new THREE.Color(0x4B9B82) },
            uColor1: { value: new THREE.Color(0x7ACC56) },
            uColor2: { value: new THREE.Color(0xC9F547) },
            uColor3: { value: new THREE.Color(0xE6FF91) },
            uScale: { value: 0.2 },
            uEmissionStrength: { value: 0.49 },
            uRampStop1: { value: 0.05 },
            uRampStop2: { value: 0.8 }
        }

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: perlinVertexShader,
            fragmentShader: perlinFragmentShader,
            side: THREE.DoubleSide,
            depthWrite: true
        })
    }

    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.rotation.x = -Math.PI * 0.5
        this.mesh.position.set(this.position.x, this.position.y, this.position.z)
        this.scene.add(this.mesh)
    }

    setPhysics()
    {
        setTimeout(() => {
            if(this.physics.world)
            {
                this.physics.createGround(this.size, this.position)
            }
        }, 100)
    }

    setDebug()
    {
        this.debugFolder = this.debug.ui.addFolder('Ground Perlin')
        this.debugFolder
            .add(this.uniforms.uEmissionStrength, 'value')
            .min(0)
            .max(3)
            .step(0.01)
            .name('Emission Strength')
        this.debugFolder
            .add(this.uniforms.uScale, 'value')
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
    }
}
