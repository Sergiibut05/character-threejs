import * as THREE from 'three'
import { Fn, float, vec3, vec4, uniform, positionLocal, smoothstep, sin, time, length, mix } from 'three/tsl'
import Experience from '../Experience.js'
import { SOCIALS } from './ui/socialData.js'
import { inputGlyph } from './ui/InputGlyph.js'

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
        this.auraY = 0.2201          // world height of the ring plane
        this.fovZoomDelta = -4       // follow-camera FOV offset while ACTIVE

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
        this.center.z = 17.9174
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

        this._buildAura()
        this._ready = true
    }

    _registerInteractive(entry) {
        const self = this
        const io = {
            mesh: entry.node,
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

        const icon = document.createElement('span')
        icon.className = 'fz-social-icon'
        icon.innerHTML = def.icon
        this.pill.appendChild(icon)

        const name = document.createElement('span')
        name.className = 'fz-social-name'
        name.textContent = def.name
        this.pill.appendChild(name)

        this.pill.appendChild(inputGlyph('interact'))
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
        if (this.experience.camera) this.experience.camera.zoomFovOffset = this.fovZoomDelta
        this._setFocused(this._statueFacingCamera(), true)
        this._showPill()
    }

    _exitActive() {
        this.state = 'near'
        const renderer = this.experience.renderer
        for (const s of this.statues) renderer.removeOutlinedObject(s.node)
        if (this.experience.camera) this.experience.camera.zoomFovOffset = 0
        this.focused = null
        this._hidePill()
        document.body.style.cursor = ''
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

    /** Cycle focus left/right as seen on screen (camera-relative order). */
    _cycle(dir) {
        if (!this.statues.length) return
        const cam = this.experience.camera.instance
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
        right.y = 0
        if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
        right.normalize()
        const sorted = [...this.statues].sort((a, b) => {
            const ka = (a.worldPos.x - this.center.x) * right.x + (a.worldPos.z - this.center.z) * right.z
            const kb = (b.worldPos.x - this.center.x) * right.x + (b.worldPos.z - this.center.z) * right.z
            return ka - kb
        })
        const i = sorted.indexOf(this.focused)
        const ni = i === -1 ? 0 : (i + dir + sorted.length) % sorted.length
        this._setFocused(sorted[ni])
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
        if (this.state === 'far' && !this.aura.visible && this._settled) return

        const dt = Math.min(this.experience.time.delta * 0.001, 0.1)
        const alpha = (f) => 1 - Math.pow(1 - f, dt * 60)

        // Aura fade
        const op = this.uAuraOpacity.value
        this.uAuraOpacity.value = op + (auraTarget - op) * alpha(0.08)
        this.aura.visible = this.uAuraOpacity.value > 0.01 || auraTarget > 0

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

        if (this.state === 'active') this._pollGamepad()
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
        f.add(this, 'fovZoomDelta', -12, 0, 0.5).name('FOV Zoom Delta')
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
    }
}
