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

/**
 * Where the river is heard from — points on the channel, in world XZ.
 *
 * This used to measure the distance to the water MESH, which sounds right and
 * is not: `agua` is a single flat quad of FOURTEEN vertices scaled to about
 * 77 x 87 units, i.e. a sheet under the whole map that the terrain hides
 * except where the river cuts through it and where the sea shows at the beach.
 * So "distance to the nearest vertex" was the distance to one of a handful of
 * corners of a map-sized rectangle: the sound swelled in dry places and died
 * standing on the bank.
 *
 * The mesh cannot tell us where water is VISIBLE — only the terrain knows that
 * — so the audible course is stated here instead. It follows the channel under
 * the bridge (which spans X, so the river runs along Z). Add or move a pair to
 * change where the river can be heard; nothing else has to change.
 */
const RIVER_SOURCES = [
    [-35.4, -12.0], [-35.4, -6.0], [-35.4, 0.0],
    [-35.4, 4.4], [-35.4, 9.0], [-35.4, 15.0]
]

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
        // Keep the audible band tight so it only takes over from the ambience
        // when you are actually beside the water. See RIVER_SOURCES.
        id: 'river', kind: 'river', near: 2.5, far: 11.0,
        src: ['/sounds/water/river.webm', '/sounds/water/river.m4a']
    }
]

/**
 * One-shot SFX: fired by name, never looping, several allowed to overlap.
 *
 * `variants` is a ROUND-ROBIN, not a random pick: footsteps alternate left/right
 * and a random choice would sometimes play the same foot twice in a row, which
 * is instantly audible as a limp.
 *
 * `group` is what gets preloaded together. Only `ui` and `foot` are warmed at
 * world start — the rest is a minigame's, and loading it before anyone has
 * walked over to play is bandwidth spent on a maybe.
 */
const ONESHOT_DEFS = {
    // One click for opening AND closing. The longer open flourish read as an
    // event of its own next to the short close tick, which made the two halves
    // of the same gesture feel like different things.
    ui: { group: 'ui', volume: 0.9, src: ['/sounds/menu/close.webm', '/sounds/menu/close.m4a'] },

    // Deliberately quiet: this is the one sound that plays every second and a
    // half for the whole session, and it has to sit under everything else.
    walk: {
        group: 'foot', volume: 0.30,
        variants: [
            ['/sounds/walk/walk1.webm', '/sounds/walk/walk1.m4a'],
            ['/sounds/walk/walk2.webm', '/sounds/walk/walk2.m4a']
        ]
    },
    run: {
        group: 'foot', volume: 0.38,
        variants: [
            ['/sounds/run/run1.webm', '/sounds/run/run1.m4a'],
            ['/sounds/run/run2.webm', '/sounds/run/run2.m4a']
        ]
    },

    frisbeeThrow: { group: 'frisbee', volume: 0.9, src: ['/sounds/freesby/throw.webm', '/sounds/freesby/throw.m4a'] },
    scoreGood: { group: 'frisbee', volume: 0.9, src: ['/sounds/freesby/good.webm', '/sounds/freesby/good.m4a'] },
    scoreGreat: { group: 'frisbee', volume: 0.9, src: ['/sounds/freesby/great.webm', '/sounds/freesby/great.m4a'] },
    scoreExcellent: { group: 'frisbee', volume: 0.95, src: ['/sounds/freesby/excellent.webm', '/sounds/freesby/excellent.m4a'] },
    // Shared by both minigames' ranked results screen.
    finish: { group: 'frisbee', volume: 0.95, src: ['/sounds/freesby/finish.webm', '/sounds/freesby/finish.m4a'] },

    ballHit: { group: 'beach', volume: 0.75, src: ['/sounds/beach/ball-sound.webm', '/sounds/beach/ball-sound.m4a'] }
}

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
        // Music ducking while a panel is open. 0.25 is deliberately audible:
        // the point is to make the modal feel like it took over the screen, and
        // a polite 0.8 just sounds like the track wandered off.
        this.duckLevel = 0.25
        this.duckInMs = 220             // quick to get out of the way
        this.duckOutMs = 600            // slow to come back, so it is not a pop
        this._duck = 1
        this._openPanels = 0
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

        // One-shots: lazily built Howls, keyed by name. `_oneShotTurn` holds the
        // round-robin cursor for the ones with variants.
        this._oneShots = {}
        this._oneShotTurn = {}

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

    _musicGain() {
        return this.muted ? 0 : this.musicVolume * this.musicCeiling * this._duck
    }

    /**
     * Panels duck the music. Counted, not a boolean: a results screen opens the
     * leaderboard on top of itself, and closing the top one must not bring the
     * music back while a panel is still up.
     *
     * Only the MUSIC ducks. The ambience is the world still being there behind
     * the panel; silencing it would feel like the world had been switched off.
     */
    pushPanel() {
        this._openPanels++
        if (this._openPanels === 1) this._applyDuck(this.duckLevel, this.duckInMs)
    }

    popPanel() {
        this._openPanels = Math.max(0, this._openPanels - 1)
        if (this._openPanels === 0) this._applyDuck(1, this.duckOutMs)
    }

    _applyDuck(target, ms) {
        if (this._duck === target) return
        this._duck = target
        if (!this.howl || this.soundId == null) return
        try {
            const from = this.howl.volume(this.soundId)
            const to = this._musicGain()
            // fade() from the CURRENT value, not from the nominal one: a track
            // may still be in its own fade-in, and jumping to full first would
            // be the exact pop this is meant to avoid.
            this.howl.fade(typeof from === 'number' ? from : to, to, ms, this.soundId)
        } catch { /* */ }
    }

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

        // Warmed here rather than at construction: this runs on the gesture
        // that enters the world, which is also when the audio context unlocks.
        this.preloadSfx('ui')
        this.preloadSfx('foot')
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

        let min2 = Infinity
        for (const [sx, sz] of RIVER_SOURCES) {
            const dx = char.x - sx
            const dz = char.z - sz
            const d2 = dx * dx + dz * dz
            if (d2 < min2) min2 = d2
        }
        const rdef = this._defOf('river')
        const riverTarget = proximity(rdef.near, rdef.far, Math.sqrt(min2))

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

    // ─── SFX (one-shots) ─────────────────────────────────────────────────

    /**
     * Build (once) the Howls for a group so the first play is not late.
     *
     * ALWAYS Web Audio, whatever the beds use: an <audio> element cannot play
     * over itself, so two footsteps in quick succession would cut each other
     * off, and it carries a start latency that a hit sound cannot afford.
     * These files are a few KB each, so decoding them into memory is cheap.
     */
    preloadSfx(group) {
        for (const name in ONESHOT_DEFS) {
            if (ONESHOT_DEFS[name].group === group) this._oneShot(name)
        }
    }

    _oneShot(name) {
        if (this._oneShots[name]) return this._oneShots[name]
        const def = ONESHOT_DEFS[name]
        if (!def) return null

        const make = (src) => new Howl({ src, html5: false, preload: true, volume: 0 })
        const entry = def.variants
            ? { def, howls: def.variants.map(make) }
            : { def, howls: [make(def.src)] }
        this._oneShots[name] = entry
        return entry
    }

    /**
     * Fire a one-shot by name. Silent (and free) while SFX are muted.
     *
     * @param {string} name  key in ONESHOT_DEFS
     * @param {number} scale extra multiplier, for callers that want a softer
     *                       instance of the same sound
     */
    playSfx(name, scale = 1) {
        const gain = this._sfxGain()
        if (gain <= 0) return
        const entry = this._oneShot(name)
        if (!entry) return

        let howl = entry.howls[0]
        if (entry.howls.length > 1) {
            const i = (this._oneShotTurn[name] || 0) % entry.howls.length
            this._oneShotTurn[name] = i + 1
            howl = entry.howls[i]
        }

        try {
            // Volume is set on the returned id, not on the Howl: setting it on
            // the Howl would also retune every copy already playing.
            const id = howl.play()
            howl.volume(clamp01(gain * (entry.def.volume ?? 1) * scale), id)
        } catch { /* a blocked autoplay is not worth breaking a frame over */ }
    }

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
