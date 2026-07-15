/**
 * Leaderboard — score store shared by the frisbee session, the in-world
 * scoreboard and the settings UI.
 *
 *   submitScore({ name, score }) → Promise<{ rank, total, top10, entry }>
 *   getTop10()                   → Promise<Entry[]>          (sorted desc)
 *   getMyBest()                  → Promise<{ score, rank }>
 *   qualifiesForTop10(score)     → boolean                   (sync, cheap)
 *
 * Backend: Firebase Firestore (collection 'scores'), lazily imported so it
 * never touches the initial bundle. localStorage remains as: (1) offline
 * fallback store, (2) cache of the last server top-10 (keeps
 * qualifiesForTop10 synchronous), (3) queue for submissions made offline —
 * flushed automatically when the connection returns.
 *
 * Connection state is observable (settings UI shows En línea / Sin conexión):
 *   import { leaderboardStatus, getLeaderboardStatus } from '.../Leaderboard.js'
 *   leaderboardStatus.on('change', (status) => …)
 *   status ∈ 'disabled' (no env config) | 'connecting' | 'online' | 'offline'
 *
 * All module state is shared (module scope), so `new Leaderboard()` in many
 * places is fine — they all talk to the same backend + cache.
 */
import EventEmitter from './EventEmitter.js'

const STORAGE_KEY = 'frisbee.leaderboard.v1'
const BEST_KEY = 'frisbee.leaderboard.best'
const CACHE_KEY = 'frisbee.leaderboard.serverTop10'
const PENDING_KEY = 'frisbee.leaderboard.pending'
const MAX_ENTRIES = 50
const TOP_N = 10
const MAX_SCORE = 1500          // 5×100 + 5×(100+100) — session maximum
const NET_TIMEOUT_MS = 8000

// ─── Connection status (observable) ─────────────────────────────────────
export const leaderboardStatus = new EventEmitter()

const FIREBASE_CONFIG = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
}
const CONFIGURED = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId)

let _status = CONFIGURED ? 'connecting' : 'disabled'
function _setStatus(s) {
    if (s === _status) return
    _status = s
    leaderboardStatus.trigger('change', [s])
}
export function getLeaderboardStatus() { return _status }

// Browser connectivity nudges the state + flushes queued submissions.
if (typeof window !== 'undefined' && CONFIGURED) {
    window.addEventListener('online', () => { _fetchTop10().catch(() => { /* stays offline */ }) })
    window.addEventListener('offline', () => _setStatus('offline'))
}

// ─── Firebase (lazy singleton) ───────────────────────────────────────────
const FB = { db: null, fns: null, initPromise: null }

async function _ensureFirebase() {
    if (!CONFIGURED) return null
    if (!FB.initPromise) {
        FB.initPromise = (async () => {
            const [{ initializeApp }, fns] = await Promise.all([
                import('firebase/app'),
                import('firebase/firestore')
            ])
            const app = initializeApp(FIREBASE_CONFIG)
            FB.db = fns.getFirestore(app)
            FB.fns = fns
            return FB
        })().catch((e) => {
            console.warn('Leaderboard: firebase init failed —', e?.message)
            _setStatus('offline')
            FB.initPromise = null
            return null
        })
    }
    return FB.initPromise
}

function _withTimeout(promise, ms = NET_TIMEOUT_MS) {
    return Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ])
}

// ─── Local helpers (offline store / cache / queue) ───────────────────────
function _lsGet(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function _lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ephemeral */ }
}

function _sorted(list) {
    // Higher score first; older entry wins ties (got there first).
    return [...list].sort((a, b) => b.score - a.score || (a.t || 0) - (b.t || 0))
}

function _cleanEntry({ name, score }) {
    const clean = String(name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || '???'
    const s = Math.max(0, Math.min(MAX_SCORE, Math.round(Number(score) || 0)))
    return { name: clean, score: s, t: Date.now() }
}

function _localAdd(entry) {
    const sorted = _sorted([..._lsGet(STORAGE_KEY, []), entry]).slice(0, MAX_ENTRIES)
    _lsSet(STORAGE_KEY, sorted)
    const prev = Number(_lsGet(BEST_KEY, 0)) || 0
    if (entry.score > prev) _lsSet(BEST_KEY, entry.score)
    return sorted
}

/** Best top-10 view we can build WITHOUT the network (server cache ∪ local). */
function _bestKnownTop10() {
    const cached = _lsGet(CACHE_KEY, null)
    const local = _lsGet(STORAGE_KEY, [])
    const merged = cached ? [...cached, ...local] : [...local]
    // De-dupe by name+score+t (a queued entry may also be in the cache later).
    const seen = new Set()
    const unique = merged.filter((e) => {
        const k = `${e.name}|${e.score}|${e.t}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
    })
    return _sorted(unique).slice(0, TOP_N)
}

// ─── Server operations ───────────────────────────────────────────────────
async function _fetchTop10() {
    const fb = await _ensureFirebase()
    if (!fb?.db) return null
    const { collection, query, orderBy, limit, getDocs } = fb.fns
    const q = query(collection(fb.db, 'scores'), orderBy('score', 'desc'), limit(TOP_N))
    const snap = await _withTimeout(getDocs(q))
    const list = _sorted(snap.docs.map((d) => {
        const v = d.data()
        return { name: v.name, score: v.score, t: v.t || 0 }
    }))
    _lsSet(CACHE_KEY, list)
    _setStatus('online')
    _flushPending() // fire & forget
    return list
}

async function _serverRankOf(score) {
    const fb = await _ensureFirebase()
    if (!fb?.db) return null
    const { collection, query, where, getCountFromServer } = fb.fns
    const q = query(collection(fb.db, 'scores'), where('score', '>', score))
    const snap = await _withTimeout(getCountFromServer(q))
    return snap.data().count + 1
}

async function _serverAdd(entry) {
    const fb = await _ensureFirebase()
    if (!fb?.db) throw new Error('no backend')
    const { collection, addDoc, serverTimestamp } = fb.fns
    await _withTimeout(addDoc(collection(fb.db, 'scores'), {
        name: entry.name,
        score: entry.score,
        t: entry.t,
        created: serverTimestamp()
    }))
}

let _flushing = false
async function _flushPending() {
    if (_flushing) return
    const pending = _lsGet(PENDING_KEY, [])
    if (!pending.length) return
    _flushing = true
    try {
        const remaining = []
        for (const entry of pending) {
            try { await _serverAdd(entry) }
            catch { remaining.push(entry) }
        }
        _lsSet(PENDING_KEY, remaining)
    } finally {
        _flushing = false
    }
}

// ─── Public API ──────────────────────────────────────────────────────────
export default class Leaderboard {
    /** Top 10 — server first, cache/local when offline. */
    async getTop10() {
        if (CONFIGURED) {
            try {
                const list = await _fetchTop10()
                if (list) return list
            } catch (e) {
                _setStatus('offline')
            }
        }
        return _bestKnownTop10()
    }

    /** Your device's best score + its live server rank when online. */
    async getMyBest() {
        const best = Number(_lsGet(BEST_KEY, 0)) || 0
        if (!best) return { score: 0, rank: null }
        if (CONFIGURED && _status !== 'offline') {
            try { return { score: best, rank: await _serverRankOf(best) } }
            catch { _setStatus('offline') }
        }
        const idx = _bestKnownTop10().findIndex((e) => best >= e.score)
        return { score: best, rank: idx === -1 ? null : idx + 1 }
    }

    /** Sync check against the freshest top-10 we know (server cache ∪ local). */
    qualifiesForTop10(score) {
        if (!(score > 0)) return false
        const top = _bestKnownTop10()
        if (top.length < TOP_N) return true
        return score > top[TOP_N - 1].score
    }

    /**
     * Save a score. Always mirrored locally; sent to Firestore when possible,
     * queued (and auto-flushed on reconnect) when not.
     */
    async submitScore(payload) {
        const entry = _cleanEntry(payload)
        _localAdd(entry)

        if (CONFIGURED) {
            try {
                await _serverAdd(entry)
                const [top10, rank] = await Promise.all([
                    _fetchTop10(),
                    _serverRankOf(entry.score)
                ])
                return {
                    rank: rank ?? null,
                    total: null, // not tracked server-side (needs no UI today)
                    top10: top10 ?? _bestKnownTop10(),
                    entry
                }
            } catch (e) {
                _setStatus('offline')
                // Queue for when the connection comes back.
                _lsSet(PENDING_KEY, [..._lsGet(PENDING_KEY, []), entry])
            }
        }

        const top10 = _bestKnownTop10()
        const rank = top10.filter((e) => e.score > entry.score).length + 1
        return { rank, total: top10.length, top10, entry }
    }
}
