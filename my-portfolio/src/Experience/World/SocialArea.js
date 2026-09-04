import * as THREE from 'three'
import {
    Fn, float, vec3, vec4, uniform, positionLocal, smoothstep, sin, time,
    length, mix, instancedArray, instanceIndex, hash, uv, clamp
} from 'three/tsl'
import Experience from '../Experience.js'
import { seatOwnsInteract } from './seated.js'
import { SOCIALS } from './ui/socialData.js'
import { inputGlyph } from './ui/InputGlyph.js'
import { ignoreAO } from './aoMask.js'

/**
 * SocialArea — the social-statues plaza (social-area.glb).
 *
 * Three proximity states around the "Circle" platform:
 *   FAR   → nothing.
 *   NEAR  → a pulsing yellow aura ring glows around the platform.
 *   ACTIVE (character standing ON the circle) → subtle FOV zoom-in, the four
 *   statues (github / linkedIn / x / itchio) rise with a white outline, and
 *   one is "focused" (rises extra + slight scale). A bottom-center pill shows
 *   the focused network + the open glyph for the active input device.
 *
 * Input (all coexist):
 *   mouse    hover focuses · click opens
 *   touch    tap focuses · second tap on the focused one opens
 *   keyboard ← / → cycle · E / Enter open
 *   gamepad  dpad ← / → cycle · A opens (stick keeps moving the character)
 *
 * You leave the mode by simply walking off the circle — movement is never
 * locked. Gamepad "open" is not a browser user-gesture, so if window.open is
 * popup-blocked the pill turns into a real <a> link to confirm with a tap.
 */
const NAV_COOLDOWN_MS = 220

export default class SocialArea {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        // Tunables (GUI below)
        this.proximityRadius = 7.0   // aura appears within this distance
        this.activePadding = 0.25    // extra metres past the circle edge that still count as "on it"
        this.riseBase = 0.25         // all statues rise this much in ACTIVE
        this.riseExtra = 0.15        // the focused one rises this much more
        this.riseLerp = 0.10         // per-frame lerp factor (frame-rate corrected)
        // Aura — all values hand-tuned in the GUI on the real scene.
        this.auraPulseSpeed = 2.2
        this.auraRadius = 0.9        // where the glow starts (inner edge)
        this.auraWidth = 0.05        // core ring ~invisible: the look is pure glow
        this.auraGlow = 0.75         // soft halo fading outward
        this.auraStrength = 1.0      // overall opacity multiplier

        // Camera framing while standing on the platform (see _enterCamera).
        this.viewFov = 46
        this.viewMargin = 1.0        // world units of room past the outer statue
        this.viewFitHeight = 2.6     // vertical extent to keep in shot (statues + depth)
        this.viewHeight = 1.1
        this.viewLookHeight = 0.9
        this.viewBackDist = 2.6      // portrait: how far behind the player the shot sits
        this._viewDir = new THREE.Vector3(0, 0, 1)
        this._camPos = new THREE.Vector3()
        this._camLook = new THREE.Vector3()
        // Absolute world height, hand-tuned in the GUI.
        // NOTE: the Circle's top face measures y ≈ 0.290, so this sits slightly
        // under it. The ring keeps depth TEST on, so if the aura ever stops
        // showing, raise this above the platform surface first.
        this.auraY = 0.23006185411119

        this.state = 'far'           // 'far' | 'near' | 'active'
        this._ready = false
        this.statues = []            // { def, node, baseY, baseScale, offset, scale }
        this.focused = null
        this._navAt = 0
        this._prevDpadL = false
        this._prevDpadR = false
        this._prevPadA = false

        this._buildPill()
        this._onKeyDown = (e) => this._handleKey(e)
        window.addEventListener('keydown', this._onKeyDown)

        if (this.debug.active) this.setDebug()
    }

    // ─── Lazy init (social-area streams in after first paint) ────────────
    _tryInit() {
        const piece = this.experience.world?.patioScene?.pieces?.socialArea
        const root = piece?.root
        if (!root) return

        root.updateMatrixWorld(true)
        const circle = root.getObjectByName('Circle')
        if (!circle) return

        const bbox = new THREE.Box3().setFromObject(circle)
        const size = new THREE.Vector3()
        bbox.getSize(size)
        this.center = bbox.getCenter(new THREE.Vector3())
        this.circleRadius = Math.max(size.x, size.z) * 0.5
        this.circleTopY = bbox.max.y
        // Hand-tuned in the GUI: the GLB bbox centre lands slightly off the
        // platform's visual centre, so override with the calibrated position.
        this.center.x = -5.4933
        this.center.z = 17.9674
        if (this.debug.active) {
            console.log(
                `SocialArea: Circle center (${this.center.x.toFixed(2)}, ${this.center.z.toFixed(2)}) ` +
                `radius ${this.circleRadius.toFixed(2)} topY ${this.circleTopY.toFixed(2)}`
            )
        }

        for (const def of SOCIALS) {
            const node = root.getObjectByName(def.node)
            if (!node) { console.warn(`SocialArea: statue node "${def.node}" not found`); continue }
            const worldPos = new THREE.Vector3()
            node.getWorldPosition(worldPos)
            const entry = {
                def,
                node,
                worldPos,
                baseY: node.position.y,
                baseScale: node.scale.clone(),
                offset: 0,
                scaleT: 0
            }
            this.statues.push(entry)
            this._registerInteractive(entry)
        }
        if (this.statues.length === 0) return

        this._buildRing()
        this._buildAura()
        this._buildFireflies()
        this._ready = true
    }

    _registerInteractive(entry) {
        const self = this
        const io = {
            mesh: entry.node,
            position: entry.worldPos,
            // On the platform the statues sit at ~circleRadius; keep hover
            // alive for the whole ring, not just the closest one.
            proximityRadius: this.circleRadius + 2,
            onClick() {
                if (self.state !== 'active') return
                if (self.focused === entry) self._open()
                else self._setFocused(entry)
            },
            onHover() {
                if (self.state !== 'active') return
                self._setFocused(entry)
                document.body.style.cursor = 'pointer'
            },
            onUnhover() {
                document.body.style.cursor = ''
            }
        }
        entry.node.userData.interactiveObject = io
        entry.node.traverse((c) => { if (c.isMesh) c.userData.interactiveObject = io })
        this.experience.world?.raycaster?.addInteractiveObject(io)
    }

    // ─── Aura ring (1 draw call, additive TSL) ───────────────────────────
    _buildAura() {
        // The geometry is a WIDE canvas; the visible band is drawn inside it
        // purely from the uniforms below, so radius/width tune live from the
        // GUI without rebuilding geometry.
        const geometry = new THREE.RingGeometry(
            Math.max(0.1, this.circleRadius * 0.4),
            this.circleRadius + 5.5,
            72
        )

        this.uAuraOpacity = uniform(0)
        this.uPulseSpeed = uniform(this.auraPulseSpeed)
        this.uAuraInner = uniform(this.auraRadius)
        this.uAuraWidth = uniform(this.auraWidth)
        this.uAuraGlow = uniform(this.auraGlow)
        this.uAuraStrength = uniform(this.auraStrength)

        // NORMAL blending on purpose: additive glow over the pale cobblestones
        // outside the platform blew out to white blobs and the uneven dirt
        // broke the ring's shape. A flat alpha band always reads as a clean,
        // perfectly round circle regardless of what's underneath.
        const material = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        })
        // No depth write means no say over ambient occlusion -- it abstains
        // rather than overriding what is behind it. See aoMask.js.
        ignoreAO(material)
        material.colorNode = Fn(() => {
            // Crisp thin ring + a soft halo fading OUTWARD from it. The pulse
            // only modulates opacity — the radius never moves.
            const r = length(positionLocal.xy)
            const t = r.sub(this.uAuraInner).div(this.uAuraWidth).clamp(0, 1)
            const core = smoothstep(0.0, 0.3, t).mul(smoothstep(1.0, 0.7, t))

            const outerEdge = this.uAuraInner.add(this.uAuraWidth)
            const glowFall = float(1).sub(r.sub(outerEdge).div(this.uAuraGlow).clamp(0, 1))
            // Gate so the halo only exists from the ring outward (never fills
            // the platform interior).
            const glowGate = smoothstep(this.uAuraInner, outerEdge, r)
            const halo = glowFall.mul(glowFall).mul(glowGate).mul(0.32)

            const pulse = sin(time.mul(this.uPulseSpeed)).mul(0.2).add(0.8)
            const alphaOut = core.mul(0.9).max(halo)
                .mul(pulse).mul(this.uAuraOpacity).mul(this.uAuraStrength)

            const warmYellow = vec3(1.0, 0.8, 0.32)
            const coreGold = vec3(1.0, 0.92, 0.6)
            const col = mix(warmYellow, coreGold, core)
            return vec4(col, alphaOut.clamp(0, 1))
        })()

        this.aura = new THREE.Mesh(geometry, material)
        this.aura.rotation.x = -Math.PI / 2
        this.aura.position.set(this.center.x, this.auraY, this.center.z)
        this.aura.renderOrder = 2
        this.aura.visible = false
        this.scene.add(this.aura)

        if (this.debug.active) this._setAuraDebug()
    }

    /**
     * Five yellow fireflies that fade in with the proximity aura and drift
     * around the ring. Same SpriteNodeMaterial + instancedArray pattern as
     * the street-lamp embers — one draw call, GPU drift, additive glow.
     */
    _buildFireflies() {
        const COUNT = 5
        const positions = new Float32Array(COUNT * 3)
        for (let i = 0; i < COUNT; i++) {
            const a = (i / COUNT) * Math.PI * 2 + (i * 0.37)
            // Orbit the visible yellow band (inner radius + glow), not the
            // Circle mesh — its bbox is only ~1 m and would park them inside.
            const rad = this.auraRadius + 0.2 + (i % 3) * 0.22
            positions[i * 3 + 0] = this.center.x + Math.cos(a) * rad
            positions[i * 3 + 1] = this.auraY + 0.32 + (i % 5) * 0.14
            positions[i * 3 + 2] = this.center.z + Math.sin(a) * rad
        }

        this.uFireflyOpacity = uniform(0)
        const posAttr = instancedArray(positions, 'vec3').toAttribute()
        const d = length(uv().sub(0.5))
        const glow = clamp(float(0.05).div(d).sub(0.1), 0.0, 1.0)
        const baseTime = time.add(hash(instanceIndex).mul(999))
        const blink = sin(baseTime.mul(1.15)).mul(0.5).add(0.5).mul(0.55).add(0.45)
        const flyOffset = vec3(
            sin(baseTime.mul(0.55)).mul(0.85),
            sin(baseTime.mul(1.05)).mul(0.28),
            sin(baseTime.mul(0.42)).mul(0.85)
        )

        const yellow = vec3(1.0, 0.86, 0.32)
        const material = new THREE.SpriteNodeMaterial()
        material.positionNode = posAttr.add(flyOffset)
        material.scaleNode = float(0.07).mul(this.uFireflyOpacity)
        material.outputNode = vec4(yellow.mul(glow).mul(2.0), glow.mul(blink).mul(this.uFireflyOpacity))
        material.blending = THREE.AdditiveBlending
        material.transparent = true
        material.depthWrite = false

        const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 8), material)
        mesh.count = COUNT
        mesh.frustumCulled = false
        mesh.renderOrder = 6
        mesh.visible = false
        this.scene.add(mesh)
        this.fireflies = mesh
    }

    // ─── Bottom pill UI ──────────────────────────────────────────────────
    _buildPill() {
        this.pill = document.createElement('div')
        this.pill.className = 'fz-social-pill'
        document.body.appendChild(this.pill)
        this._unsubInput = null
    }

    _renderPill() {
        if (!this.focused) return
        const def = this.focused.def
        this.pill.innerHTML = ''

        // Explicit prev/next. Cycling used to be keyboard/gamepad only, so on a
        // phone the ONLY way to choose was tapping the statue itself — hopeless
        // for any that sat off-screen or behind another. These make every
        // network reachable regardless of what the camera happens to show.
        this.pill.appendChild(this._cycleButton(-1, 'Anterior'))

        const main = document.createElement('button')
        main.type = 'button'
        main.className = 'fz-social-main'
        main.setAttribute('aria-label', `Abrir ${def.name}`)
        main.innerHTML =
            `<span class="fz-social-icon">${def.icon}</span>` +
            `<span class="fz-social-name">${def.name}</span>`
        main.addEventListener('click', () => this._open())
        this.pill.appendChild(main)

        this.pill.appendChild(this._cycleButton(1, 'Siguiente'))

        // The glyph is a HINT for keyboard/pad users; on touch the buttons
        // themselves are the affordance, so it would just be noise.
        if (this.experience.input?.device !== 'touch') {
            this.pill.appendChild(inputGlyph('interact'))
        }
    }

    _cycleButton(dir, label) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'fz-social-cycle'
        b.setAttribute('aria-label', label)
        b.innerHTML = dir < 0
            ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'
            : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
        b.addEventListener('click', (e) => { e.stopPropagation(); this._cycle(dir) })
        return b
    }

    /** Popup-blocked (gamepad open isn't a user gesture) → confirmable link. */
    _renderPillAsLink(url) {
        if (!this.focused) return
        const def = this.focused.def
        this.pill.innerHTML = ''
        const a = document.createElement('a')
        a.className = 'fz-social-open-link'
        a.href = url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.innerHTML = `<span class="fz-social-icon">${def.icon}</span><span class="fz-social-name">Abrir ${def.name}</span>`
        this.pill.appendChild(a)
    }

    _showPill() {
        this._renderPill()
        this.pill.classList.add('is-visible')
        this._unsubInput?.()
        this._unsubInput = this.experience.input?.onChange?.(() => {
            if (this.state === 'active') this._renderPill()
        }) || null
    }

    _hidePill() {
        this.pill.classList.remove('is-visible')
        this._unsubInput?.()
        this._unsubInput = null
    }

    // ─── State transitions ───────────────────────────────────────────────
    _enterActive() {
        this.state = 'active'
        const renderer = this.experience.renderer
        for (const s of this.statues) renderer.addOutlinedObject(s.node)
        this._setFocused(this._statueFacingCamera(), true)
        this._enterCamera()
        this._showPill()
    }

    _exitActive() {
        this.state = 'near'
        const renderer = this.experience.renderer
        for (const s of this.statues) renderer.removeOutlinedObject(s.node)
        const camera = this.experience.camera
        if (camera) {
            camera.zoomFovOffset = 0
            // Ease back out, mirroring how it eased in.
            if (camera.mode === 'focus') camera.releaseFocus()
        }
        this.focused = null
        this._hidePill()
        document.body.style.cursor = ''
    }

    /**
     * Frame the WHOLE ring of statues.
     *
     * The old behaviour just nudged the follow camera's FOV, which on a phone
     * (narrow lens, tight portrait aspect) left two of the four statues off the
     * sides — you could not even see what you were choosing between, let alone
     * tap it. Now the camera pulls back to a vantage that fits every statue,
     * with the distance derived from the real FOV and aspect so portrait simply
     * backs up further instead of cropping.
     */
    _enterCamera() {
        const camera = this.experience.camera
        if (!camera) return

        // Freeze the approach direction so the shot doesn't swing around while
        // the player shuffles about on the platform.
        const cam = camera.instance
        this._viewDir.set(cam.position.x - this.center.x, 0, cam.position.z - this.center.z)
        if (this._viewDir.lengthSq() < 1e-4) this._viewDir.set(0, 0, 1)
        this._viewDir.normalize()

        camera.focusFov = this.viewFov
        camera.setMode('focus')
        this._updateCamera()
    }

    _updateCamera() {
        const camera = this.experience.camera
        if (!camera || camera.mode !== 'focus') return

        const aspect = camera.instance.aspect || 1
        const halfFov = THREE.MathUtils.degToRad(camera.focusFov * 0.5)
        const tan = Math.max(0.05, Math.tan(halfFov))

        // Portrait: fitting the whole ring would push the camera ~22 units out
        // and leave each statue about 5% of the screen — technically visible,
        // useless in practice. Instead the shot TURNS to the selected statue and
        // stays close, so whatever you have selected is always big and centred;
        // the pill's arrows are what move you around the ring.
        if (aspect < 1.35 && this.focused) {
            const dx = this.focused.worldPos.x - this.center.x
            const dz = this.focused.worldPos.z - this.center.z
            const len = Math.hypot(dx, dz) || 1
            const nx = dx / len
            const nz = dz / len
            this._camPos.set(
                this.center.x - nx * this.viewBackDist,
                this.center.y + this.viewHeight + 0.5,
                this.center.z - nz * this.viewBackDist
            )
            this._camLook.set(
                this.focused.worldPos.x,
                this.center.y + this.viewLookHeight,
                this.focused.worldPos.z
            )
            camera.setFocusView(this._camPos, this._camLook)
            return
        }

        // Wide screen: fit every statue, so the whole choice is on show.
        let reach = 0
        for (const s of this.statues) {
            reach = Math.max(reach, Math.hypot(s.worldPos.x - this.center.x, s.worldPos.z - this.center.z))
        }
        // Width has to cover the ring; HEIGHT only has to cover the statues plus
        // the ring's foreshortened depth. Feeding the ring's radius into the
        // vertical requirement too is what parked the camera ~11 units out with
        // each statue at 10% of the screen — far more headroom than anything
        // needed. Separating them brings the shot in to a comfortable framing.
        const needH = reach + this.viewMargin
        const dist = THREE.MathUtils.clamp(
            Math.max(needH / Math.max(0.05, tan * aspect), this.viewFitHeight / tan), 3, 26
        )

        this._camPos.set(
            this.center.x + this._viewDir.x * dist,
            this.center.y + this.viewHeight + dist * 0.28,
            this.center.z + this._viewDir.z * dist
        )
        this._camLook.set(this.center.x, this.center.y + this.viewLookHeight, this.center.z)
        camera.setFocusView(this._camPos, this._camLook)
    }

    _setFocused(entry, force = false) {
        if (!entry || (this.focused === entry && !force)) return
        this.focused = entry
        if (this.state === 'active') this._renderPill()
    }

    /** The statue the camera is most looking at — default focus on entry. */
    _statueFacingCamera() {
        const cam = this.experience.camera.instance
        const fwd = new THREE.Vector3()
        cam.getWorldDirection(fwd)
        let best = this.statues[0]
        let bestDot = -Infinity
        const to = new THREE.Vector3()
        for (const s of this.statues) {
            to.copy(s.worldPos).sub(cam.position).normalize()
            const d = to.dot(fwd)
            if (d > bestDot) { bestDot = d; best = s }
        }
        return best
    }

    /**
     * Step around the ring in its FIXED layout order.
     *
     * This used to sort by the camera's right vector, which broke badly once
     * the portrait camera started turning to face the selection: every step
     * re-sorted against a new heading, so the order reshuffled as you pressed
     * and cycling felt random. The ring never moves, so its order shouldn't
     * either — sorted once by angle, it always reads LinkedIn → GitHub → X →
     * itch.io and back.
     */
    _cycle(dir) {
        const ring = this._ring
        if (!ring?.length) return
        const i = ring.indexOf(this.focused)
        const ni = i === -1 ? 0 : (i + dir + ring.length) % ring.length
        this._setFocused(ring[ni])
    }

    /** Order the statues once, by their angle around the platform. */
    _buildRing() {
        this._ring = [...this.statues].sort((a, b) => (
            Math.atan2(a.worldPos.z - this.center.z, a.worldPos.x - this.center.x) -
            Math.atan2(b.worldPos.z - this.center.z, b.worldPos.x - this.center.x)
        ))
    }

    _open() {
        if (!this.focused) return
        const url = this.focused.def.url
        const w = window.open(url, '_blank', 'noopener')
        if (!w) this._renderPillAsLink(url)
    }

    // ─── Input ───────────────────────────────────────────────────────────
    _handleKey(e) {
        if (this.state !== 'active') return
        // Don't fight open modals / typing fields.
        if (document.querySelector('.fz-modal-overlay.is-open, .fz-proj.is-open')) return
        if (seatOwnsInteract()) return  // the seat you are at wins the key
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return

        if (e.key === 'ArrowLeft') { e.preventDefault(); this._cycle(-1) }
        else if (e.key === 'ArrowRight') { e.preventDefault(); this._cycle(1) }
        else if (e.key === 'Enter' || e.key.toLowerCase() === 'e') this._open()
    }

    _pollGamepad() {
        const pad = this.experience.gamepad
        if (!pad?.connected) return
        const dpad = pad.getDpad?.() || {}
        const now = performance.now()

        const left = dpad.left && !this._prevDpadL
        const right = dpad.right && !this._prevDpadR
        if ((left || right) && now - this._navAt > NAV_COOLDOWN_MS) {
            this._navAt = now
            this._cycle(right ? 1 : -1)
        }
        this._prevDpadL = !!dpad.left
        this._prevDpadR = !!dpad.right

        const a = pad.getActions?.().button2 === true
        if (a && !this._prevPadA) this._open()
        this._prevPadA = a
    }

    // ─── Frame update ────────────────────────────────────────────────────
    update() {
        if (!this._ready) { this._tryInit(); if (!this._ready) return }
        const character = this.experience.world?.character
        if (!character) return

        const dx = character.position.x - this.center.x
        const dz = character.position.z - this.center.z
        const dist = Math.hypot(dx, dz)

        const onCircle = dist <= this.circleRadius + this.activePadding
        // Hysteresis so the edge doesn't flicker the mode on/off.
        const offCircle = dist > this.circleRadius + this.activePadding + 0.35

        if (onCircle && this.state !== 'active') this._enterActive()
        else if (this.state === 'active' && offCircle) this._exitActive()
        if (this.state !== 'active') {
            this.state = dist <= this.proximityRadius ? 'near' : 'far'
        }

        // Early-out when far and everything already settled.
        const auraTarget = this.state === 'active' ? 0.4 : (this.state === 'near' ? 1 : 0)
        const fireflyTarget = this.state === 'far' ? 0 : 1
        if (this.state === 'far' && !this.aura.visible && !this.fireflies?.visible && this._settled) return

        const dt = Math.min(this.experience.time.delta * 0.001, 0.1)
        const alpha = (f) => 1 - Math.pow(1 - f, dt * 60)

        // Aura fade
        const op = this.uAuraOpacity.value
        this.uAuraOpacity.value = op + (auraTarget - op) * alpha(0.08)
        this.aura.visible = this.uAuraOpacity.value > 0.01 || auraTarget > 0

        if (this.uFireflyOpacity) {
            const fo = this.uFireflyOpacity.value
            this.uFireflyOpacity.value = fo + (fireflyTarget - fo) * alpha(0.08)
            if (this.fireflies) {
                this.fireflies.visible = this.uFireflyOpacity.value > 0.01 || fireflyTarget > 0
            }
        }

        // Statue rise / focus scale
        this._settled = true
        const a = alpha(this.riseLerp)
        for (const s of this.statues) {
            const targetOffset = this.state === 'active'
                ? (this.focused === s ? this.riseBase + this.riseExtra : this.riseBase)
                : 0
            const targetScaleT = (this.state === 'active' && this.focused === s) ? 1 : 0

            s.offset += (targetOffset - s.offset) * a
            s.scaleT += (targetScaleT - s.scaleT) * a
            if (Math.abs(targetOffset - s.offset) > 0.001 || Math.abs(targetScaleT - s.scaleT) > 0.001) {
                this._settled = false
            }

            s.node.position.y = s.baseY + s.offset
            const k = 1 + s.scaleT * 0.05
            s.node.scale.set(s.baseScale.x * k, s.baseScale.y * k, s.baseScale.z * k)
        }

        if (this.state === 'active') {
            this._updateCamera()   // keeps framing correct across a resize
            this._pollGamepad()
        }
    }

    _setAuraDebug() {
        const f = this.debugFolder
        if (!f) return
        f.add(this.uAuraInner, 'value', 0.5, 15, 0.05).name('Aura Radius (inner)')
        f.add(this.uAuraWidth, 'value', 0.05, 5, 0.05).name('Aura Width')
        f.add(this.uAuraGlow, 'value', 0, 2, 0.05).name('Aura Glow')
        f.add(this.uAuraStrength, 'value', 0, 1.5, 0.05).name('Aura Opacity')
        f.add(this.aura.position, 'x', this.center.x - 4, this.center.x + 4, 0.05).name('Aura X')
        f.add(this.aura.position, 'z', this.center.z - 4, this.center.z + 4, 0.05).name('Aura Z')
        f.add(this.aura.position, 'y', this.circleTopY - 0.5, this.circleTopY + 1.5, 0.01).name('Aura Y')
    }

    setDebug() {
        const f = this.debugFolder = this.debug.ui.addFolder('Social Area')
        f.close()
        f.add(this, 'proximityRadius', 2, 15, 0.5).name('Aura Radius')
        f.add(this, 'activePadding', 0, 2, 0.05).name('Active Padding')
        f.add(this, 'riseBase', 0, 1, 0.01).name('Rise Base')
        f.add(this, 'riseExtra', 0, 1, 0.01).name('Rise Extra (focus)')
        f.add(this, 'viewFov', 25, 80, 1).name('Cam FOV')
        f.add(this, 'viewMargin', 0, 5, 0.1).name('Cam margen')
        f.add(this, 'viewHeight', 0, 5, 0.1).name('Cam altura')
        f.add(this, 'viewLookHeight', 0, 3, 0.1).name('Cam mirada Y')
        f.add(this, 'auraPulseSpeed', 0.2, 6, 0.1).name('Aura Pulse Speed')
            .onChange((v) => { if (this.uPulseSpeed) this.uPulseSpeed.value = v })
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown)
        this._unsubInput?.()
        this.pill?.remove()
        if (this.aura) {
            this.scene.remove(this.aura)
            this.aura.geometry.dispose()
            this.aura.material.dispose()
        }
        if (this.fireflies) {
            this.scene.remove(this.fireflies)
            this.fireflies.geometry.dispose()
            this.fireflies.material.dispose()
            this.fireflies = null
        }
    }
}
