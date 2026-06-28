import { Howl, Howler } from 'howler'
import EventEmitter from './EventEmitter.js'
import MusicToast from '../World/ui/MusicToast.js'

/**
 * AudioManager — soundtrack director (plan: AUDIO_SYSTEM_PLAN.md).
 *
 * Owns the music playlist and drives it with Howler.js:
 *   - Loads /audio/tracks.json (manifest produced by tools/transcode-audio.mjs).
 *   - Streams tracks (html5:true) and rotates them with a gap + fade in/out.
 *   - Only plays while you walk the world; minigames suspend it (fade-out) and
 *     resume it (fade-in) via suspendForMinigame()/resumeAfterMinigame().
 *   - Pops a "Now playing" toast on every track change.
 *   - Mute + volume are user-controllable and persisted in localStorage.
 *
 * Volume model: each Howl plays at its own 0..1 volume (used purely for fades),
 * while Howler's GLOBAL volume acts as the user master = muted ? 0 : musicVolume.
 *
 * Events (EventEmitter.trigger): 'trackchange', 'volumechange', 'mutechange',
 * 'playstate'.
 */

const LS_MUTED = 'portfolio.audio.muted'
const LS_VOLUME = 'portfolio.audio.volume'
const MANIFEST_URL = '/audio/tracks.json'

const clamp01 = (v) => Math.max(0, Math.min(1, v))

export default class AudioManager extends EventEmitter {
    constructor(experience) {
        super()
        this.experience = experience

        // Tuning (mirrors AUDIO_SYSTEM_PLAN.md §4.3)
        this.musicVolume = 0.5      // slider position (0..1) shown to the user
        // Real output ceiling: actual gain = musicVolume * masterCeiling, so even
        // a half-full slider stays gentle background music (not in-your-face).
        this.masterCeiling = 0.3
        this.fadeInMs = 2000
        this.fadeOutMs = 1500
        this.gapBetweenMs = 2500
        this.startDelayMs = 600
        this.resumeDelayMs = 600    // small beat before music returns after a minigame

        // State
        this.tracks = []
        this.index = -1
        this.howl = null
        this.soundId = null
        this.started = false
        this.suspended = false      // paused by a minigame
        this._wasPlaying = false    // were we mid-track when suspended?
        this._gapTimer = null
        this._fadeOutTimer = null
        this._resumeTimer = null
        this._manifestPromise = null

        // Restore persisted preferences
        this.muted = this._readBool(LS_MUTED, false)
        const vol = this._readFloat(LS_VOLUME)
        if (vol !== null) this.musicVolume = clamp01(vol)

        this._applyMaster()

        // Self-owned "now playing" toast.
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
        await this.loadManifest()
        if (!this.tracks.length) return
        this.index = 0
        await this._wait(this.startDelayMs)
        if (this.suspended) return // entered a minigame during the intro delay
        this._playCurrent({ fadeIn: true })
    }

    stopSoundtrack({ fadeOut = true } = {}) {
        this._clearTimers()
        if (this.howl && fadeOut && this.soundId != null) {
            const id = this.soundId
            this.howl.fade(this.howl.volume(id) ?? 1, 0, this.fadeOutMs, id)
            setTimeout(() => this._destroyHowl(), this.fadeOutMs)
        } else {
            this._destroyHowl()
        }
        this.started = false
        this.trigger('playstate', [false])
    }

    // ─── Playback core ───────────────────────────────────────────────────

    _playCurrent({ fadeIn = true, seekTo = 0, announce = true } = {}) {
        this._clearTimers()
        this._destroyHowl()

        const track = this.tracks[this.index]
        if (!track) return

        this.howl = new Howl({
            src: track.src,
            html5: true,              // stream large files, low memory
            volume: fadeIn ? 0 : 1,
            onend: () => this._onTrackEnd(),
            onloaderror: () => { console.warn('AudioManager: load error', track.id); this._advance() },
            onplayerror: () => {
                // Autoplay/lock hiccup — retry on the next unlock.
                this.howl?.once('unlock', () => { try { this.howl?.play(this.soundId) } catch { /* */ } })
            }
        })

        this.soundId = this.howl.play()
        // Howler queues the seek until the stream is loaded, so this is safe even
        // right after play() (used to resume mid-track after a minigame).
        if (seekTo > 0) { try { this.howl.seek(seekTo, this.soundId) } catch { /* */ } }
        if (fadeIn) this.howl.fade(0, 1, this.fadeInMs, this.soundId)

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

    // ─── Minigame suspend / resume ───────────────────────────────────────

    suspendForMinigame() {
        if (this.suspended) return
        this.suspended = true
        this._clearTimers()

        this._wasPlaying = !!(this.howl && this.soundId != null && this.howl.playing(this.soundId))
        if (this._wasPlaying) {
            const id = this.soundId
            this.howl.fade(this.howl.volume(id) ?? 1, 0, this.fadeOutMs, id)
            this._fadeOutTimer = setTimeout(() => { try { this.howl?.pause(id) } catch { /* */ } }, this.fadeOutMs)
        }
        this.trigger('playstate', [false])
    }

    resumeAfterMinigame() {
        if (!this.suspended) return
        this.suspended = false
        if (!this.started) return

        this._wasPlaying = false
        // Short beat before the music comes back, so it doesn't clip in while the
        // exit camera/UI settle. We restart the current track from the top rather
        // than seek into it — seeking a streamed (html5) file mid-resume causes a
        // re-buffer stutter a second or two in (the glitch you noticed).
        this._clearTimers()
        this._resumeTimer = setTimeout(() => {
            this._resumeTimer = null
            if (this.suspended) return // re-entered a minigame during the delay
            this._playCurrent({ fadeIn: true, announce: false })
        }, this.resumeDelayMs)
    }

    // ─── Manual control (settings) ───────────────────────────────────────

    next() { if (this.started && !this.suspended && this.tracks.length) this._advance(1) }
    prev() { if (this.started && !this.suspended && this.tracks.length) this._advance(-1) }

    setMuted(muted) {
        this.muted = !!muted
        this._applyMaster()
        this._persist()
        this.trigger('mutechange', [this.muted])
    }

    toggleMute() { this.setMuted(!this.muted) }

    setVolume(v) {
        this.musicVolume = clamp01(v)
        // Dragging the slider above 0 implicitly unmutes (common player UX).
        if (this.musicVolume > 0 && this.muted) {
            this.muted = false
            this.trigger('mutechange', [false])
        }
        this._applyMaster()
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
            id: t.id,
            title: t.title,
            cover: t.cover,
            index: this.index,
            total: this.tracks.length,
            duration: t.duration || (this.howl ? this.howl.duration() : 0) || 0,
            position,
            playing: !!(this.howl && this.soundId != null && this.howl.playing(this.soundId)),
            muted: this.muted,
            volume: this.musicVolume
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    _applyMaster() { Howler.volume(this.muted ? 0 : this.musicVolume * this.masterCeiling) }

    _destroyHowl() {
        if (this.howl) {
            try { this.howl.stop(); this.howl.unload() } catch { /* */ }
        }
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
            localStorage.setItem(LS_MUTED, this.muted ? '1' : '0')
            localStorage.setItem(LS_VOLUME, String(this.musicVolume))
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
        this.toast?.destroy()
    }
}
