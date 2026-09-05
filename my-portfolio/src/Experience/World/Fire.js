import * as THREE from 'three'
import {
    instancedArray, instanceIndex,
    hash, sin, cos, vec2, vec3, vec4, float, uniform,
    uv, time, smoothstep, mix, fract, length, clamp, positionLocal
} from 'three/tsl'
import Experience from '../Experience.js'
import { snoise } from './TSL/NoiseNodes.js'
import { excludeFromAO, ignoreAO } from './aoMask.js'

/**
 * Fire — stylized volumetric TSL fire
 * -----------------------------------
 * Visual reference: classic WebGL "low-poly campfire" look — a rounded
 * teardrop flame with a white-hot core, noise-eroded tongues, sparks that
 * shoot up fast then drift sideways, a warm halo, bloom and flickering light.
 *
 * Architecture (same GPU-driven pattern as Fireflies / Grass):
 *   - All fires share THREE meshes total (flame, embers, halo) via
 *     instancedArray + mesh.count → 3 draw calls for EVERY fire in the world.
 *   - All animation runs on the GPU via TSL `time`. The only CPU work per
 *     frame is the point-light intensity flicker (a few Math.sin calls).
 *
 * Flame technique:
 *   - REAL 3D geometry: a single lathe "teardrop" (rounded, elongated cone).
 *     Real volume from every camera angle — no billboard artifacts.
 *   - Noise EROSION with height-based threshold: cheap texture value noise
 *     (snoise) scrolls downward; pixels are discarded where noise exceeds a
 *     threshold that RISES with height. The base is solid most of the time
 *     (but can occasionally break), the tip shows up intermittently.
 *   - The white-hot colour lives on the EROSION RIM: every tongue edge burns
 *     white (HDR-boosted >1 so ACES + bloom blow it out), while the body is
 *     a smooth orange→red vertical gradient.
 *   - Rendered opaque with alphaTest (discard) → correct depth, no sorting.
 *
 * Embers: launched fast from the base, decelerate with an ease-out curve,
 * drift increasingly sideways, shrink and fade (matches the reference motion).
 *
 * Light: capped pool of PointLights (closest-first), intensity flickered
 * with layered sines in update() — smooth campfire flicker, no strobing.
 *
 * Usage:
 *   const fire = new Fire()
 *   fire.addFire(new THREE.Vector3(x, groundY, z), scale)
 */
export default class Fire {
    constructor(options = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        const isLow = this.experience.quality?.isLow

        this.maxFires = options.maxFires ?? 32
        this.embersPerFire = options.embersPerFire ?? (isLow ? 5 : 9)
        this.maxLights = options.maxLights ?? (isLow ? 1 : 3)
        this.fireCount = 0
        this.lights = []

        // ── Flame shape ──
        this.uElongation = uniform(1.2)    // vertical stretch of the cone
        this.uSwayAmt    = uniform(0.05)   // how much the tip sways

        // ── Noise / erosion ──
        this.uSpeed      = uniform(3.6)    // overall scroll speed
        this.uNoiseFreq  = uniform(16.0)   // XZ frequency (higher = smaller features)
        this.uNoiseFreqY = uniform(7.0)    // Y frequency (n2 = this × 1.4)
        this.uErodeBase  = uniform(0.0)    // threshold at the base (0 = always solid)
        this.uErodeTop   = uniform(0.75)   // threshold at the tip  (1 = never visible)
        this.uErodePow   = uniform(1.85)   // curve exponent (>1 = more solid low)
        this.uRimWidth   = uniform(0.25)   // width of the white-hot rim

        // ── Colour ──
        this.uColorCore  = uniform(new THREE.Color('#fff7d6'))
        this.uCoreBoost  = uniform(3.1)                         // HDR push → bloom
        this.uColorMid   = uniform(new THREE.Color('#ff9a2a'))
        this.uColorOuter = uniform(new THREE.Color('#ff4d12'))

        // ── Embers ──
        this.uEmberColor       = uniform(new THREE.Color('#ffac4d'))
        this.uEmberSize        = uniform(0.035)
        this.uEmberBrightness  = uniform(3.7)
        this.uEmberRise        = uniform(1.6)   // max rise height (× scale)
        this.uEmberDrift       = uniform(0.8)   // lateral drift amount (× scale)
        this.uEmberCycleSpeed  = uniform(0.6)   // how fast embers loop

        // ── Halo / glow ──
        this.uGlowColor    = uniform(new THREE.Color('#ff7a30'))
        this.uGlowStrength = uniform(0.54)
        // Cuanta noche hay, de 0 a 1. Lo escribe update() desde el ciclo
        // dia/noche del Environment -- ver el nodo del halo mas abajo.
        this.uGlowNight = uniform(1.0)
        this.uGlowSize     = uniform(1.2)       // halo sprite scale (× fire scale)
        this.uGlowHeight   = uniform(0.45)      // halo center height offset (× scale)

        // ── Point-light (CPU side) ──
        this.lightBaseIntensity = options.lightIntensity ?? 4.4
        this.lightDistance      = 8.5
        this.lightFlicker1      = 0.07
        this.lightFlicker2      = 0.04
        this.lightFlicker3      = 0.01

        this._debugScale = { value: 1.2 }

        this._buildFlames()
        this._buildEmbers()
        this._buildGlow()

        if (this.debug.active) this.setDebug()
    }

    // ─────────────────────────────────────────────────────────── Flame ──

    _createFlameGeometry() {
        // Rounded teardrop profile: [radiusFactor, heightFactor].
        // Slim and elongated — bulge low (~26 % height), closed tip.
        // Local Y stays 0..1 so the fragment erosion math is normalized;
        // the extra height is applied in the vertex stage.
        const profile = [
            [0.00, 0.00],
            [0.55, 0.02],
            [0.85, 0.10],
            [1.00, 0.26],
            [0.90, 0.44],
            [0.68, 0.62],
            [0.42, 0.78],
            [0.18, 0.90],
            [0.00, 1.00]
        ]
        const RADIUS = 0.26
        const points = profile.map(([r, h]) => new THREE.Vector2(r * RADIUS, h))
        return new THREE.LatheGeometry(points, 14)
    }

    _buildFlames() {
        // Per-fire data: xyz = base position, w = scale
        this._flameData = new Float32Array(this.maxFires * 4)
        this._flameBuffer = instancedArray(this._flameData, 'vec4')
        const flame = this._flameBuffer.toAttribute()

        const base = flame.xyz
        const fireScale = flame.w
        const seed = hash(instanceIndex).mul(100.0)

        // ── Vertex: organic sway (stronger toward the tip) + breathe pulse ──
        const h = positionLocal.y   // 0 (base) .. 1 (tip), normalized
        const swayX = sin(h.mul(3.0).add(time.mul(6.2)).add(seed)).mul(h).mul(this.uSwayAmt)
        const swayZ = cos(h.mul(2.4).add(time.mul(5.1)).add(seed)).mul(h).mul(this.uSwayAmt)
        const pulse = sin(time.mul(8.0).add(seed)).mul(0.05).add(1.0)

        const local = vec3(
            positionLocal.x.add(swayX),
            positionLocal.y.mul(this.uElongation).mul(pulse),
            positionLocal.z.add(swayZ)
        )

        const material = new THREE.MeshBasicNodeMaterial()
        material.positionNode = base.add(local.mul(fireScale))
        material.side = THREE.DoubleSide

        // ── Fragment: noise erosion with height-based threshold ──
        const t = time.mul(this.uSpeed)

        const n1 = snoise(vec2(positionLocal.x.mul(this.uNoiseFreq).add(seed),  h.mul(this.uNoiseFreqY).sub(t.mul(1.6))))
        const n2 = snoise(vec2(positionLocal.z.mul(this.uNoiseFreq).sub(seed),  h.mul(this.uNoiseFreqY.mul(1.4)).sub(t.mul(2.3))))
        const n01 = n1.add(n2).mul(0.25).add(0.5)   // ≈ 0..1

        const threshold = mix(this.uErodeBase, this.uErodeTop, h.pow(this.uErodePow))
        const erode = n01.sub(threshold)

        // ── Colour: white-hot EROSION RIM over an orange→red body gradient ──
        const bodyCol = mix(this.uColorMid, this.uColorOuter, smoothstep(0.10, 0.85, h))
        const rim = smoothstep(0.0, this.uRimWidth, erode)
        const coreCol = this.uColorCore.mul(this.uCoreBoost)

        material.colorNode = mix(coreCol, bodyCol, rim)
        material.opacityNode = smoothstep(0.0, 0.06, erode)
        material.alphaTest = 0.5       // discard → opaque pass, no sorting issues
        material.transparent = false
        material.fog = false

        this.flameMesh = new THREE.Mesh(this._createFlameGeometry(), material)
        this.flameMesh.count = 1
        this.flameMesh.visible = false             // until the first addFire()
        this.flameMesh.frustumCulled = false       // positions live in instance data
        // A fire does not receive shade. It is the light.
        //
        // The flame takes the OPAQUE path on purpose -- alphaTest instead of
        // transparency, so it needs no sorting -- which is right for the
        // renderer and wrong for the ambient occlusion, because that path also
        // means "solid surface, shade me like a rock". It was coming out
        // blotched with grey inside the flame body: dirt on the one thing in
        // the scene that should never have any.
        //
        // excludeFromAO and not ignoreAO: the flame DOES write depth, so it
        // still states its normal and still occludes whatever is behind it,
        // like any solid. It just stops receiving.
        excludeFromAO(material)

        this.scene.add(this.flameMesh)
        this.flameMaterial = material
    }

    // ────────────────────────────────────────────────────────── Embers ──

    _buildEmbers() {
        // Per-ember data: xyz = fire base position (+ jitter), w = fire scale
        const maxEmbers = this.maxFires * this.embersPerFire
        this._emberData = new Float32Array(maxEmbers * 4)
        this._emberBuffer = instancedArray(this._emberData, 'vec4')
        const ember = this._emberBuffer.toAttribute()

        const fireScale = ember.w
        const seed = hash(instanceIndex.add(123))
        const dirAngle = hash(instanceIndex.add(77)).mul(6.2831)
        const speed = hash(instanceIndex.add(45)).mul(0.4).add(0.8)

        // Life cycle 0 → 1
        const c = fract(time.mul(this.uEmberCycleSpeed).mul(speed).add(seed))

        // SHOT upward then decelerating (ease-out) — reference behaviour
        const eased = float(1.0).sub(float(1.0).sub(c).pow(2.4))
        const rise = eased.mul(fireScale.mul(this.uEmberRise)).add(fireScale.mul(0.15))

        // Lateral drift grows over the life → embers wander away sideways
        const driftAmt = c.pow(1.7).mul(fireScale.mul(this.uEmberDrift))
        const driftX = cos(dirAngle).mul(driftAmt)
            .add(sin(c.mul(9.0).add(seed.mul(40.0))).mul(0.04))
        const driftZ = sin(dirAngle).mul(driftAmt)
            .add(cos(c.mul(7.0).add(seed.mul(31.0))).mul(0.04))

        const worldPos = ember.xyz.add(vec3(driftX, rise, driftZ))

        // Bruno Simon glow: 0.05 / d – 0.1
        const d = length(uv().sub(0.5))
        const glow = clamp(float(0.05).div(d).sub(0.1), 0.0, 1.0)

        // Pop in fast, fade out over the second half, shrink while rising
        const fade = smoothstep(0.0, 0.06, c).mul(smoothstep(1.0, 0.55, c))

        const material = new THREE.SpriteNodeMaterial()
        material.positionNode = worldPos
        material.scaleNode = this.uEmberSize.mul(fireScale).mul(float(1.0).sub(c.mul(0.55)))
        material.outputNode = vec4(
            this.uEmberColor.mul(glow).mul(this.uEmberBrightness),
            glow.mul(fade)
        )
        material.blending = THREE.AdditiveBlending
        material.transparent = true
        material.depthWrite = false
        // Las ascuas no opinan sobre la oclusion: no escriben profundidad, asi
        // que su normal es la de un cuadrado orientado a camara sobre un suelo
        // del que no saben nada. Sin esto estampan esa normal por TODO su quad
        // y el AO calcula la oclusion del claro contra ella -- el aura oscura
        // alrededor de la hoguera, otra vez, ahora en naranja. Ver aoMask.js.
        ignoreAO(material)

        this.emberMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 8), material)
        this.emberMesh.count = 1
        this.emberMesh.visible = false
        this.emberMesh.frustumCulled = false
        this.emberMesh.renderOrder = 5
        this.scene.add(this.emberMesh)
        this.emberMaterial = material
    }

    // ──────────────────────────────────────────────────────────── Halo ──

    _buildGlow() {
        // Soft additive halo behind each flame — fakes bloom on low quality
        // and reinforces it on high. Per-fire data mirrors the flame buffer.
        this._glowData = new Float32Array(this.maxFires * 4)
        this._glowBuffer = instancedArray(this._glowData, 'vec4')
        const glowAttr = this._glowBuffer.toAttribute()

        const seed = hash(instanceIndex.add(7)).mul(10.0)
        const d = length(uv().sub(0.5))
        const halo = smoothstep(0.5, 0.0, d).pow(2.0)

        // Gentle brightness flicker (layered sines, never strobes)
        const flicker = float(1.0)
            .add(sin(time.mul(7.3).add(seed)).mul(0.12))
            .add(sin(time.mul(13.7).add(seed.mul(2.0))).mul(0.08))

        const material = new THREE.SpriteNodeMaterial()
        material.positionNode = glowAttr.xyz.add(vec3(0.0, glowAttr.w.mul(this.uGlowHeight), 0.0))
        material.scaleNode = glowAttr.w.mul(this.uGlowSize)
        material.outputNode = vec4(
            // El halo se apaga con el sol.
            //
            // Es aditivo, asi que de dia estaba SUMANDO luz calida sobre
            // tierra ya clara: se satura, y despues del tone mapping ACES eso
            // no se lee como mas brillo sino como un disco APAGADO de ocho
            // metros alrededor de la hoguera. Parecia un artefacto de la
            // oclusion ambiental y no lo era en absoluto.
            //
            // Un charco de luz de hoguera solo existe cuando alrededor hay
            // menos luz que en el fuego. De dia no hay nada que iluminar, asi
            // que no debe haber halo. Uniform aparte y no multiplicar sobre
            // uGlowStrength: ese es el valor autorado y lo edita el panel; si
            // update() escribiera encima, cada frame lo iria acercando a cero.
            this.uGlowColor.mul(halo).mul(this.uGlowStrength)
                .mul(this.uGlowNight).mul(flicker),
            halo
        )
        material.blending = THREE.AdditiveBlending
        material.transparent = true
        material.depthWrite = false
        // Igual que las ascuas. Ocultarlo de dia quito el disco apagado, pero
        // de noche sigue dibujandose y su normal seguia entrando: la mitad del
        // aura que quedaba era esta. Ver aoMask.js.
        ignoreAO(material)

        this.glowMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 16), material)
        this.glowMesh.count = 1
        this.glowMesh.visible = false
        this.glowMesh.frustumCulled = false
        this.glowMesh.renderOrder = 4
        this.scene.add(this.glowMesh)
        this.glowMaterial = material
    }

    // ───────────────────────────────────────────────────────────── API ──

    /**
     * Place a fire anywhere in the world.
     * @param {THREE.Vector3} position  Base of the flame (on the ground)
     * @param {number} scale            1 = campfire-sized (~1 unit tall)
     * @returns {number} fire index, or -1 if capacity is full
     */
    addFire(position, scale = 1.0) {
        if (this.fireCount >= this.maxFires) {
            console.warn(`Fire: max capacity reached (${this.maxFires})`)
            return -1
        }

        const i = this.fireCount++
        this._flameData.set([position.x, position.y, position.z, scale], i * 4)
        this._glowData.set([position.x, position.y, position.z, scale], i * 4)

        // Jitter ember spawn points around the flame axis
        for (let e = 0; e < this.embersPerFire; e++) {
            const j = (i * this.embersPerFire + e) * 4
            this._emberData[j + 0] = position.x + (Math.random() - 0.5) * 0.15 * scale
            this._emberData[j + 1] = position.y
            this._emberData[j + 2] = position.z + (Math.random() - 0.5) * 0.15 * scale
            this._emberData[j + 3] = scale
        }

        this._flameBuffer.value.needsUpdate = true
        this._glowBuffer.value.needsUpdate = true
        this._emberBuffer.value.needsUpdate = true

        this.flameMesh.count = this.fireCount
        this.glowMesh.count = this.fireCount
        this.emberMesh.count = this.fireCount * this.embersPerFire
        this.flameMesh.visible = true
        this.glowMesh.visible = true
        this.emberMesh.visible = true

        // Flickering point light — the thing that paints the surroundings
        // warm. Pooled and capped (lights are the only real per-fire cost).
        if (this.lights.length < this.maxLights) {
            const light = new THREE.PointLight(this.uGlowColor.value, 0, this.lightDistance * scale, 2)
            light.position.set(position.x, position.y + 0.7 * scale, position.z)
            light.userData.baseIntensity = this.lightBaseIntensity * scale
            light.userData.seed = Math.random() * 100
            this.scene.add(light)
            this.lights.push(light)
        }

        return i
    }

    setFireScale(index, newScale) {
        if (index < 0 || index >= this.fireCount) return
        const base = index * 4
        this._flameData[base + 3] = newScale
        this._glowData[base + 3] = newScale
        for (let e = 0; e < this.embersPerFire; e++) {
            this._emberData[(index * this.embersPerFire + e) * 4 + 3] = newScale
        }
        this._flameBuffer.value.needsUpdate = true
        this._glowBuffer.value.needsUpdate = true
        this._emberBuffer.value.needsUpdate = true
        if (this.lights[index]) {
            this.lights[index].userData.baseIntensity = this.lightBaseIntensity * newScale
            this.lights[index].distance = this.lightDistance * newScale
        }
    }

    /** Min XZ distance from (x,z) to any active fire — for proximity audio. */
    nearestFireDistanceXZ(x, z) {
        let min = Infinity
        for (let i = 0; i < this.fireCount; i++) {
            const dx = this._flameData[i * 4] - x
            const dz = this._flameData[i * 4 + 2] - z
            const d = Math.hypot(dx, dz)
            if (d < min) min = d
        }
        return min
    }

    update() {
        // El halo sigue al ciclo dia/noche -- ver el nodo donde se usa.
        // Environment interpola nightFactor entre sus paradas horarias, asi que
        // esto ya viene suavizado; no hace falta amortiguarlo aqui.
        const night = this.experience.world?.environment?.skyNightFactor?.value
        if (night !== undefined) this.uGlowNight.value = night

        // La MISMA curva para la luz real de la hoguera, y por el mismo motivo.
        //
        // Es una PointLight con distance finita, asi que ilumina una esfera y
        // cae a cero de golpe en su radio: sobre suelo plano eso es un CIRCULO
        // de diez metros. De noche es justo lo que se quiere. De dia estaba
        // encendida a plena potencia sumando luz calida sobre tierra que ya
        // esta clara -- satura, y tras el tone mapping ACES sale un disco
        // apagado con un borde circular visible alrededor de la fogata.
        //
        // Aislado apagando solo estas luces sin tocar nada mas: el arco
        // desaparece y el suelo queda uniforme de lado a lado.
        //
        // Se multiplica aqui, sobre el valor que ya calcula el parpadeo, y no
        // sobre baseIntensity: eso lo escribe addFire() a partir de la escala
        // del fuego y pisarlo lo perderia.
        const lightNight = night === undefined ? 1 : night

        // Y el halo se DEJA DE DIBUJAR, no solo se pone a cero.
        //
        // Bajarle el color a cero deja el quad rasterizandose igual, y eso
        // basta para ensuciar: sobre la tierra del claro aparecia una mancha
        // oscura con la forma del sprite, visible de dia, de noche, y mas
        // cuanto mas se subia la intensidad del AO. Con el color ya a cero.
        //
        // Es la misma leccion que el confeti: alpha 0 esconde un fragmento de
        // la imagen, no lo saca del frame. Lo unico que garantiza no aportar
        // nada es no estar.
        if (this.glowMesh) this.glowMesh.visible = lightNight > 0.01

        // Smooth campfire flicker: three sines at non-harmonic frequencies.
        // Only CPU cost of the whole system (a few Math.sin per frame).
        const t = this.experience.time.elapsed * 0.001
        for (const light of this.lights) {
            const s = light.userData.seed
            light.intensity = light.userData.baseIntensity * lightNight * (
                1.0
                + this.lightFlicker1 * Math.sin(t * 7.3  + s)
                + this.lightFlicker2 * Math.sin(t * 13.1 + s * 2.0)
                + this.lightFlicker3 * Math.sin(t * 23.7 + s * 0.5)
            )
        }
    }

    setDebug() {
        const root = this.debug.ui.addFolder('🔥 Fire')
        root.close()

        // ── Shape ──────────────────────────────────────────────────────
        const fShape = root.addFolder('Shape')
        fShape.add(this._debugScale, 'value', 0.1, 5.0, 0.05).name('Scale')
            .onChange(v => { for (let i = 0; i < this.fireCount; i++) this.setFireScale(i, v) })
        fShape.add(this.uElongation, 'value', 0.5, 3.0, 0.05).name('Elongation')
        fShape.add(this.uSwayAmt,    'value', 0.0, 0.3, 0.005).name('Sway Amount')

        // ── Noise / Erosion ────────────────────────────────────────────
        const fNoise = root.addFolder('Noise & Erosion')
        fNoise.add(this.uSpeed,      'value', 0.1, 5.0,  0.05).name('Scroll Speed')
        fNoise.add(this.uNoiseFreq,  'value', 1.0, 25.0, 0.5 ).name('Freq XZ (fine ↑)')
        fNoise.add(this.uNoiseFreqY, 'value', 1.0, 20.0, 0.5 ).name('Freq Y  (fine ↑)')
        fNoise.add(this.uErodeBase,  'value', 0.0, 0.5,  0.01).name('Threshold Base')
        fNoise.add(this.uErodeTop,   'value', 0.3, 1.0,  0.01).name('Threshold Tip')
        fNoise.add(this.uErodePow,   'value', 0.3, 4.0,  0.05).name('Curve Power')
        fNoise.add(this.uRimWidth,   'value', 0.0, 0.5,  0.01).name('Rim Width')

        // ── Colour ─────────────────────────────────────────────────────
        const fColor = root.addFolder('Colours')
        fColor.addColor({ value: this.uColorCore.value  }, 'value').name('Rim / Core')
            .onChange(v => this.uColorCore.value.copy(v))
        fColor.add(this.uCoreBoost, 'value', 1.0, 6.0, 0.1).name('Core Boost HDR')
        fColor.addColor({ value: this.uColorMid.value   }, 'value').name('Body Mid')
            .onChange(v => this.uColorMid.value.copy(v))
        fColor.addColor({ value: this.uColorOuter.value }, 'value').name('Body Outer')
            .onChange(v => this.uColorOuter.value.copy(v))

        // ── Embers ─────────────────────────────────────────────────────
        const fEmber = root.addFolder('Embers')
        fEmber.addColor({ value: this.uEmberColor.value }, 'value').name('Color')
            .onChange(v => this.uEmberColor.value.copy(v))
        fEmber.add(this.uEmberSize,       'value', 0.005, 0.2,  0.005).name('Size')
        fEmber.add(this.uEmberBrightness, 'value', 0.1,   6.0,  0.1  ).name('Brightness HDR')
        fEmber.add(this.uEmberRise,       'value', 0.5,   5.0,  0.1  ).name('Rise Height')
        fEmber.add(this.uEmberDrift,      'value', 0.0,   2.0,  0.05 ).name('Lateral Drift')
        fEmber.add(this.uEmberCycleSpeed, 'value', 0.1,   2.0,  0.05 ).name('Cycle Speed')

        // ── Halo ───────────────────────────────────────────────────────
        const fHalo = root.addFolder('Halo')
        fHalo.addColor({ value: this.uGlowColor.value }, 'value').name('Color')
            .onChange(v => {
                this.uGlowColor.value.copy(v)
                for (const light of this.lights) light.color.copy(this.uGlowColor.value)
            })
        fHalo.add(this.uGlowStrength, 'value', 0.0, 1.0,  0.01).name('Strength')
        fHalo.add(this.uGlowSize,     'value', 0.5, 6.0,  0.1 ).name('Size')
        fHalo.add(this.uGlowHeight,   'value', 0.0, 2.0,  0.05).name('Height Offset')

        // ── Point Light ────────────────────────────────────────────────
        const fLight = root.addFolder('Point Light')
        fLight.add(this, 'lightBaseIntensity', 0.0, 15.0, 0.1).name('Intensity')
            .onChange(v => { for (const l of this.lights) l.userData.baseIntensity = v })
        fLight.add(this, 'lightDistance', 1.0, 30.0, 0.5).name('Radius')
            .onChange(v => { for (const l of this.lights) l.distance = v })
        fLight.add(this, 'lightFlicker1', 0.0, 0.5, 0.01).name('Flicker Slow')
        fLight.add(this, 'lightFlicker2', 0.0, 0.5, 0.01).name('Flicker Mid')
        fLight.add(this, 'lightFlicker3', 0.0, 0.5, 0.01).name('Flicker Fast')
    }

    dispose() {
        for (const mesh of [this.flameMesh, this.emberMesh, this.glowMesh]) {
            if (!mesh) continue
            this.scene.remove(mesh)
            mesh.geometry?.dispose()
            mesh.material?.dispose()
        }
        for (const light of this.lights) {
            this.scene.remove(light)
            light.dispose()
        }
        this.lights = []
        this.flameMesh = null
        this.emberMesh = null
        this.glowMesh = null
    }
}
