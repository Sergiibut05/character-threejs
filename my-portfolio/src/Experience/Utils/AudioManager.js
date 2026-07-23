import { Howl } from 'howler'
import EventEmitter from './EventEmitter.js'
import MusicToast from '../World/ui/MusicToast.js'

/**
 * AudioManager — music soundtrack + ambient SFX, driven by Howler.js.
 * (plan: AUDIO_SYSTEM_PLAN.md)
 *
 * MUSIC: playlist from /audio/tracks.json, streamed & rotated with fades, popped
 * as a "Now playing" toast, suspended during minigames. Mute + volume persisted.
 *
 * SFX (ambient beds, always looping, volume driven by proximity each frame):
 *   - ambience → always on (the world hum)
 *   - fire     → fades up when you approach a campfire
 *   - river    → fades up near water AND ducks the ambience (crossfade)
 *
 * Volume model: music and SFX are INDEPENDENT. Each owns its own gain
 *   gain = muted ? 0 : sliderVolume * ceiling
 * applied to its own Howl(s). We never touch Howler's global volume, so the two
 * groups don't interfere.
 *
 * Events: 'trackchange', 'volumechange', 'mutechange', 'playstate',
 *         'sfxvolumechange', 'sfxmutechange'.
 */

const LS = {
    musicMuted: 'portfolio.audio.muted',
    musicVolume: 'portfolio.audio.volume',
    sfxMuted: 'portfolio.audio.sfxMuted',
    sfxVolume: 'portfolio.audio.sfxVolume'
}
const MANIFEST_URL = '/audio/tracks.json'

const clamp01 = (v) => Math.max(0, Math.min(1, v))

// 0 when d ≤ near (fully audible), 1 when d ≥ far — smooth in between.
function proximity(near, far, d) {
    if (d <= near) return 1
    if (d >= far) return 0
    const t = (d - near) / (far - near)
    return 1 - (t * t * (3 - 2 * t)) // 1 → 0 smoothstep
}

// SFX bed definitions. `kind` drives how the per-frame target volume is computed.
const SFX_DEFS = [
    {
        id: 'ambience', kind: 'ambient',
        src: ['/sounds/ambience/ambience.webm', '/sounds/ambience/ambience.m4a']
    },
    {
        id: 'fire', kind: 'fire', near: 2.0, far: 8.0,
        src: ['/sounds/fire/fire.webm', '/sounds/fire/fire.m4a']
    },
    {
        // The water is a long, narrow strip — keep the audible band tight so it
        // only takes over from the ambience when you're actually beside it.
        id: 'river', kind: 'river', near: 1.5, far: 6.0,
        src: ['/sounds/water/river.webm', '/sounds/water/river.m4a']
    }
]

export default class AudioManager extends EventEmitter {
    constructor(experience) {
        super()
        this.experience = experience

        // Backend per device. Desktop: html5 streaming (low memory, instant
        // start). Mobile/iOS: WEB AUDIO — html5 <audio> on iOS ignores
        // programmatic volume (hardware-only) so proximity fades/mute break,
        // and play() calls outside the tap gesture get blocked (which silenced
        // the music: it starts after an async manifest fetch + delay). Web
        // Audio unlocks once on the first touch and volume works everywhere.
        this._useHtml5 = !(experience.quality?.isMobile)

        // ── Music tuning ──
        this.musicVolume = 0.5          // slider position (0..1)
        this.musicCeiling = 0.3         // real gain = musicVolume * musicCeiling
        this.fadeInMs = 2000
        this.fadeOutMs = 1500
        this.gapBetweenMs = 2500
        this.startDelayMs = 600
        this.resumeDelayMs = 600

        // ── SFX tuning ──
        this.sfxVolume = 0.45           // slider position (0..1) — low by default
        this.sfxCeiling = 0.3           // real gain = sfxVolume * sfxCeiling
        this._sfxLerp = 2.6             // proximity volume smoothing (per second)

        // ── Music state ──
        this.tracks = []
        this.index = -1
        this.howl = null
        this.soundId = null
        this.started = false
        this.suspended = false
        this._wasPlaying = false
        this._gapTimer = null
        this._fadeOutTimer = null
        this._resumeTimer = null
        this._manifestPromise = null

        // ── SFX state ──
        this.sfx = {}                   // id → { howl, soundId, level, def }
        this._sfxStarted = false

        // ── Restore persisted prefs ──
        this.muted = this._readBool(LS.musicMuted, false)
        const mv = this._readFloat(LS.musicVolume)
        if (mv !== null) this.musicVolume = clamp01(mv)
        this.sfxMuted = this._readBool(LS.sfxMuted, false)
        const sv = this._readFloat(LS.sfxVolume)
        if (sv !== null) this.sfxVolume = clamp01(sv)

        // "Now playing" toast.
        this.toast = new MusicToast()
        this.on('trackchange', (np) => { if (np) this.toast.show(np) })
    }

    // ─── Manifest ────────────────────────────────────────────────────────

    loadManifest() {
        if (this._manifestPromise) return this._manifestPromise
        this._manifestPromise = fetch(MANIFEST_URL)
            .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then((list) => { this.tracks = Array.isArray(list) ? list : []; return this.tracks })
            .catch((err) => { console.warn('AudioManager: manifest load failed', err); this.tracks = []; return this.tracks })
        return this._manifestPromise
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────

    /** Called once from Experience.startExperience() (user gesture → autoplay OK). */
    async startSoundtrack() {
        if (this.started) return
        this.started = true
        this.startSfx()
        await this.loadManifest()
        if (!this.tracks.length) return
        this.index = 0
        await this._wait(this.startDelayMs)
        if (this.suspended) return
        this._playCurrent({ fadeIn: true })
    }

    stopSoundtrack({ fadeOut = true } = {}) {
        this._clearTimers()
        if (this.howl && fadeOut && this.soundId != null) {
            const id = this.soundId
            this.howl.fade(this.howl.volume(id) ?? this._musicGain(), 0, this.fadeOutMs, id)
            setTimeout(() => this._destroyHowl(), this.fadeOutMs)
        } else {
            this._destroyHowl()
        }
        this.started = false
        this.trigger('playstate', [false])
    }

    // ─── Music playback core ─────────────────────────────────────────────

    _musicGain() { return this.muted ? 0 : this.musicVolume * this.musicCeiling }

    _playCurrent({ fadeIn = true, announce = true } = {}) {
        this._clearTimers()
        this._destroyHowl()

        const track = this.tracks[this.index]
        if (!track) return

        const gain = this._musicGain()
        this.howl = new Howl({
            src: track.src,
            html5: this._useHtml5,
            volume: fadeIn ? 0 : gain,
            onend: () => this._onTrackEnd(),
            onloaderror: () => { console.warn('AudioManager: load error', track.id); this._advance() },
            onplayerror: () => {
                this.howl?.once('unlock', () => { try { this.howl?.play(this.soundId) } catch { /* */ } })
            }
        })

        this.soundId = this.howl.play()
        if (fadeIn) this.howl.fade(0, gain, this.fadeInMs, this.soundId)

        if (announce) this.trigger('trackchange', [this.getNowPlaying()])
        this.trigger('playstate', [true])
    }

    _onTrackEnd() {
        if (this.suspended) return
        this.trigger('playstate', [false])
        this._gapTimer = setTimeout(() => this._advance(), this.gapBetweenMs)
    }

    _advance(dir = 1) {
        if (!this.tracks.length) return
        this.index = (this.index + dir + this.tracks.length) % this.tracks.length
        this._playCurrent({ fadeIn: true })
    }

    _applyMusicGain() {
        if (this.howl && this.soundId != null) {
            try { this.howl.volume(this._musicGain(), this.soundId) } catch { /* */ }
        }
    }

    // ─── Minigame suspend / resume ───────────────────────────────────────

    suspendForMinigame() {
        if (this.suspended) return
        this.suspended = true
        this._clearTimers()

        this._wasPlaying = !!(this.howl && this.soundId != null && this.howl.playing(this.soundId))
        if (this._wasPlaying) {
            const id = this.soundId
            this.howl.fade(this.howl.volume(id) ?? this._musicGain(), 0, this.fadeOutMs, id)
            this._fadeOutTimer = setTimeout(() => { try { this.howl?.pause(id) } catch { /* */ } }, this.fadeOutMs)
        }
        this.trigger('playstate', [false])
    }

    resumeAfterMinigame() {
        if (!this.suspended) return
        this.suspended = false
        if (!this.started) return

        this._wasPlaying = false
        this._clearTimers()
        this._resumeTimer = setTimeout(() => {
            this._resumeTimer = null
            if (this.suspended) return
            this._playCurrent({ fadeIn: true, announce: false })
        }, this.resumeDelayMs)
    }

    // ─── Music manual control (settings) ─────────────────────────────────

    next() { if (this.started && !this.suspended && this.tracks.length) this._advance(1) }
    prev() { if (this.started && !this.suspended && this.tracks.length) this._advance(-1) }

    setMuted(muted) {
        this.muted = !!muted
        this._applyMusicGain()
        this._persist()
        this.trigger('mutechange', [this.muted])
    }

    toggleMute() { this.setMuted(!this.muted) }

    setVolume(v) {
        this.musicVolume = clamp01(v)
        if (this.musicVolume > 0 && this.muted) {
            this.muted = false
            this.trigger('mutechange', [false])
        }
        this._applyMusicGain()
        this._persist()
        this.trigger('volumechange', [this.musicVolume])
    }

    isMuted() { return this.muted }
    getVolume() { return this.musicVolume }

    getNowPlaying() {
        const t = this.tracks[this.index]
        if (!t) return null
        let position = 0
        try { position = this.howl ? Number(this.howl.seek(this.soundId)) || 0 : 0 } catch { /* */ }
        return {
            id: t.id, title: t.title, cover: t.cover,
            index: this.index, total: this.tracks.length,
            duration: t.duration || (this.howl ? this.howl.duration() : 0) || 0,
            position,
            playing: !!(this.howl && this.soundId != null && this.howl.playing(this.soundId)),
            muted: this.muted, volume: this.musicVolume
        }
    }

    // ─── SFX (ambient beds) ──────────────────────────────────────────────

    _sfxGain() { return this.sfxMuted ? 0 : this.sfxVolume * this.sfxCeiling }

    /** Create the looping beds (silent) and start them. User-gesture safe. */
    startSfx() {
        if (this._sfxStarted) return
        this._sfxStarted = true
        for (const def of SFX_DEFS) {
            const howl = new Howl({
                src: def.src,
                html5: this._useHtml5,
                loop: true,
                volume: 0,
                onplayerror: function () { this.once('unlock', () => { try { this.play() } catch { /* */ } }) }
            })
            const soundId = howl.play()
            this.sfx[def.id] = { howl, soundId, level: 0, def }
        }
    }

    /** Per-frame: drive each bed's volume from the character's proximity. */
    update() {
        if (!this._sfxStarted) return
        const dt = Math.min(0.05, (this.experience.time?.delta || 16) * 0.001)
        const char = this.experience.world?.character?.position
        if (!char) return

        // Targets
        const fireDist = this.experience.world?.fire?.nearestFireDistanceXZ?.(char.x, char.z) ?? Infinity
        const fireTarget = Number.isFinite(fireDist)
            ? proximity(this._defOf('fire').near, this._defOf('fire').far, fireDist) : 0

        const samples = this.experience.world?.patioScene?.pieces?.river?.getWaterSamples?.()
        let riverTarget = 0
        if (samples && samples.length) {
            let min2 = Infinity
            for (let i = 0; i < samples.length; i += 2) {
                const dx = char.x - samples[i]
                const dz = char.z - samples[i + 1]
                const d2 = dx * dx + dz * dz
                if (d2 < min2) min2 = d2
            }
            const wd = Math.sqrt(min2)
            const rdef = this._defOf('river')
            riverTarget = proximity(rdef.near, rdef.far, wd)
        }

        // Ambience ducks as the river rises (crossfade ambience ↔ river), and
        // drops to a whisper inside the house (outdoor hum through the "walls").
        const inside = this.experience.world?.houseInterior?.isInside === true
        const ambienceTarget = inside ? 0.15 : (1 - riverTarget)

        const targets = { ambience: ambienceTarget, fire: fireTarget, river: riverTarget }
        const gain = this._sfxGain()
        const k = Math.min(1, dt * this._sfxLerp)

        for (const id in this.sfx) {
            const s = this.sfx[id]
            const target = targets[id] ?? 0
            s.level += (target - s.level) * k
            const vol = clamp01(gain * s.level)
            try { s.howl.volume(vol, s.soundId) } catch { /* */ }
        }
    }

    _defOf(id) { return SFX_DEFS.find((d) => d.id === id) }

    setSfxVolume(v) {
        this.sfxVolume = clamp01(v)
        if (this.sfxVolume > 0 && this.sfxMuted) {
            this.sfxMuted = false
            this.trigger('sfxmutechange', [false])
        }
        this._persist()
        this.trigger('sfxvolumechange', [this.sfxVolume])
        // The per-frame update() applies it, but nudge instantly when paused too.
    }

    setSfxMuted(muted) {
        this.sfxMuted = !!muted
        this._persist()
        this.trigger('sfxmutechange', [this.sfxMuted])
    }

    toggleSfxMute() { this.setSfxMuted(!this.sfxMuted) }
    getSfxVolume() { return this.sfxVolume }
    isSfxMuted() { return this.sfxMuted }

    // ─── Helpers ─────────────────────────────────────────────────────────

    _destroyHowl() {
        if (this.howl) { try { this.howl.stop(); this.howl.unload() } catch { /* */ } }
        this.howl = null
        this.soundId = null
    }

    _clearTimers() {
        if (this._gapTimer) { clearTimeout(this._gapTimer); this._gapTimer = null }
        if (this._fadeOutTimer) { clearTimeout(this._fadeOutTimer); this._fadeOutTimer = null }
        if (this._resumeTimer) { clearTimeout(this._resumeTimer); this._resumeTimer = null }
    }

    _wait(ms) { return new Promise((r) => setTimeout(r, ms)) }

    _persist() {
        try {
            localStorage.setItem(LS.musicMuted, this.muted ? '1' : '0')
            localStorage.setItem(LS.musicVolume, String(this.musicVolume))
            localStorage.setItem(LS.sfxMuted, this.sfxMuted ? '1' : '0')
            localStorage.setItem(LS.sfxVolume, String(this.sfxVolume))
        } catch { /* ignore */ }
    }

    _readBool(key, fallback) {
        try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1' }
        catch { return fallback }
    }

    _readFloat(key) {
        try { const v = localStorage.getItem(key); if (v === null) return null; const n = parseFloat(v); return Number.isFinite(n) ? n : null }
        catch { return null }
    }

    destroy() {
        this._clearTimers()
        this._destroyHowl()
        for (const id in this.sfx) {
            try { this.sfx[id].howl.stop(); this.sfx[id].howl.unload() } catch { /* */ }
        }
        this.sfx = {}
        this.toast?.destroy()
    }
}
