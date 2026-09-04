import * as THREE from 'three'
import Experience from '../Experience.js'
import { ignoreAO } from './aoMask.js'

/**
 * MusicNotes — floating ♪ ♫ that drift up from the character's head while idle
 * -----------------------------------------------------------------------------
 * Animal-Crossing style "the villager is humming" effect. When the character
 * has been idle (not moving / not in a minigame) for `startDelay` seconds, this
 * emitter spawns small pastel note sprites that rise, sway and fade out.
 *
 * Implementation notes:
 *   - Note glyphs are drawn procedurally to a <canvas> → THREE.Texture, so we
 *     add NO new asset to sources.js.
 *   - A small CPU pool of THREE.Sprite (auto-billboarded). Notes are only a
 *     handful at a time and only while idle, so a CPU pool is cheaper to reason
 *     about than a GPU instanced system and effectively free in perf terms.
 *   - Each sprite owns a cloned SpriteMaterial (shared texture) so it can fade
 *     its own opacity independently.
 */
export default class MusicNotes {
    constructor(options = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        // Tuning
        // Notes start after a random idle delay in [startDelayMin, startDelayMax].
        this.startDelayMin = options.startDelayMin ?? 9.0
        this.startDelayMax = options.startDelayMax ?? 14.0
        this.emitIntervalMin = options.emitIntervalMin ?? 0.6
        this.emitIntervalMax = options.emitIntervalMax ?? 1.2
        this.headOffsetY = options.headOffsetY ?? 0.15  // above character origin (capsule center)
        this.sideOffset = options.sideOffset ?? 0.22    // sideways spawn jitter
        this.life = options.life ?? 2.3                 // seconds a note lives
        this.riseHeight = options.riseHeight ?? 1.1     // world units it climbs over its life
        this.swayAmp = options.swayAmp ?? 0.18
        this.noteScale = options.noteScale ?? 0.16

        // Re-rolled each time the character stops, so the wait feels organic.
        this.startDelay = this._randomStartDelay()

        // Pastel palette (Animal Crossing vibe)
        this.colors = [
            '#ff8fb1', // pink
            '#8fd3ff', // sky blue
            '#ffd98f', // warm yellow
            '#b69bff', // lavender
            '#9be8a0', // mint
        ]

        this.poolSize = options.poolSize ?? (this.experience.quality?.isLow ? 6 : 10)
        this.enabled = true

        // True while the character has been idle long enough to be "humming".
        // Character.js reads this to switch its face to the singing variant.
        this.isSinging = false

        this._emitTimer = 0
        this._nextEmit = this._randomInterval()

        this._buildTextures()
        this._buildPool()

        if (this.debug.active) this.setDebug()
    }

    _randomInterval() {
        return this.emitIntervalMin + Math.random() * (this.emitIntervalMax - this.emitIntervalMin)
    }

    _randomStartDelay() {
        return this.startDelayMin + Math.random() * (this.startDelayMax - this.startDelayMin)
    }

    /** Draw the note glyphs once to canvases → reusable white textures (tinted per-sprite). */
    _buildTextures() {
        const glyphs = ['♪', '♫', '♬'] // ♪ ♫ ♬
        this.textures = glyphs.map((glyph) => {
            const size = 128
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = size
            const ctx = canvas.getContext('2d')

            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.font = `bold ${size * 0.72}px "Segoe UI Symbol", "Arial Unicode MS", sans-serif`

            // Soft dark outline for readability against bright grass/sky, then
            // fill white so a per-sprite color tint can recolor it cheaply.
            ctx.lineWidth = size * 0.09
            ctx.strokeStyle = 'rgba(40, 30, 60, 0.55)'
            ctx.strokeText(glyph, size / 2, size / 2 + size * 0.04)
            ctx.fillStyle = '#ffffff'
            ctx.fillText(glyph, size / 2, size / 2 + size * 0.04)

            const tex = new THREE.CanvasTexture(canvas)
            tex.colorSpace = THREE.SRGBColorSpace
            tex.minFilter = THREE.LinearMipMapLinearFilter
            tex.magFilter = THREE.LinearFilter
            return tex
        })
    }

    _buildPool() {
        this.group = new THREE.Group()
        this.group.name = 'MusicNotes'
        this.group.renderOrder = 6

        this.notes = []
        for (let i = 0; i < this.poolSize; i++) {
            const material = new THREE.SpriteMaterial({
                map: this.textures[0],
                transparent: true,
                depthWrite: false,
                opacity: 0,
            })
            // No depth write means no say over ambient occlusion -- it abstains
            // rather than overriding what is behind it. See aoMask.js.
            ignoreAO(material)
            const sprite = new THREE.Sprite(material)
            sprite.visible = false
            sprite.scale.setScalar(this.noteScale)
            this.group.add(sprite)
            this.notes.push({ sprite, material, active: false, age: 0 })
        }

        this.scene.add(this.group)
    }

    _spawn(origin) {
        const note = this.notes.find((n) => !n.active)
        if (!note) return // pool exhausted — drop this note, no big deal

        note.active = true
        note.age = 0
        note.life = this.life * (0.85 + Math.random() * 0.4)
        note.swayPhase = Math.random() * Math.PI * 2
        note.swayFreq = 2.0 + Math.random() * 1.6
        note.swayDir = Math.random() < 0.5 ? -1 : 1
        note.spin = (Math.random() - 0.5) * 1.4

        // Side-of-head spawn jitter
        note.startX = origin.x + (Math.random() - 0.5) * this.sideOffset * 2
        note.startY = origin.y + (Math.random() - 0.5) * 0.1
        note.startZ = origin.z + (Math.random() - 0.5) * this.sideOffset * 2

        // Random glyph + pastel tint
        note.material.map = this.textures[(Math.random() * this.textures.length) | 0]
        note.material.color.set(this.colors[(Math.random() * this.colors.length) | 0])
        note.material.rotation = (Math.random() - 0.5) * 0.5

        note.sprite.position.set(note.startX, note.startY, note.startZ)
        note.sprite.visible = true
    }

    update() {
        const dt = this.experience.time.delta * 0.001
        const character = this.experience.world?.character

        // ── Emission: only while the character is idle long enough ──
        const idle = character?.idleTime ?? 0
        this.isSinging = this.enabled && !!character && idle >= this.startDelay
        if (this.isSinging) {
            this._emitTimer += dt
            if (this._emitTimer >= this._nextEmit) {
                this._emitTimer = 0
                this._nextEmit = this._randomInterval()
                const origin = character.container.position
                this._spawn({
                    x: origin.x,
                    y: origin.y + this.headOffsetY,
                    z: origin.z,
                })
            }
        } else {
            this._emitTimer = this._nextEmit // ready to pop the next note instantly when idle resumes
            // Character is moving (or no longer idle) → re-roll the wait for next stop.
            if (idle < this.startDelay) this.startDelay = this._randomStartDelay()
        }

        // ── Animate live notes ──
        for (const note of this.notes) {
            if (!note.active) continue
            note.age += dt
            const t = note.age / note.life
            if (t >= 1) {
                note.active = false
                note.sprite.visible = false
                note.material.opacity = 0
                continue
            }

            // Rise + sideways sway
            const sway = Math.sin(note.swayPhase + note.age * note.swayFreq) * this.swayAmp * note.swayDir
            note.sprite.position.x = note.startX + sway
            note.sprite.position.y = note.startY + this.riseHeight * t
            note.sprite.position.z = note.startZ + sway * 0.4

            // Fade: quick pop-in (first 18%), gentle fade-out (last 40%)
            let alpha = 1
            if (t < 0.18) alpha = t / 0.18
            else if (t > 0.6) alpha = 1 - (t - 0.6) / 0.4
            note.material.opacity = alpha

            // Pop-in scale with a little overshoot
            const popT = Math.min(t / 0.18, 1)
            const pop = 1 + 0.25 * Math.sin(popT * Math.PI) // bump to 1.25 then back to 1
            note.sprite.scale.setScalar(this.noteScale * (0.4 + 0.6 * popT) * pop)

            // Lazy wobble
            note.material.rotation += note.spin * dt
        }
    }

    setDebug() {
        const f = this.debug.ui.addFolder('Music Notes')
        f.close()
        f.add(this, 'enabled').name('Enabled')
        f.add(this, 'startDelayMin', 0, 15, 0.5).name('Idle Delay Min (s)')
        f.add(this, 'startDelayMax', 0, 20, 0.5).name('Idle Delay Max (s)')
        f.add(this, 'noteScale', 0.05, 0.8, 0.01).name('Note Size')
        f.add(this, 'riseHeight', 0.3, 2.5, 0.1).name('Rise Height')
        f.add(this, 'swayAmp', 0, 0.6, 0.02).name('Sway Amount')
        f.add(this, 'headOffsetY', 0.8, 2.2, 0.05).name('Head Height')
    }

    dispose() {
        if (this.group) {
            this.scene.remove(this.group)
            for (const note of this.notes) note.material.dispose()
            for (const tex of this.textures) tex.dispose()
            this.notes = []
        }
    }
}
