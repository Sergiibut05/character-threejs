/**
 * Leaderboard — swappable score store behind a tiny async interface so a
 * Firebase adapter can drop in later (plan §4.G) without touching consumers:
 *
 *   submitScore({ name, score }) → Promise<{ rank, total, top10, entry }>
 *   getTop10()                   → Promise<Entry[]>          (sorted desc)
 *   getMyBest()                  → Promise<{ score, rank }>
 *   qualifiesForTop10(score)     → boolean                   (sync, cheap)
 *
 * Ships with a localStorage adapter that is also the offline fallback.
 */

const STORAGE_KEY = 'frisbee.leaderboard.v1'
const BEST_KEY = 'frisbee.leaderboard.best'
const MAX_ENTRIES = 50
const TOP_N = 10

class LocalLeaderboardAdapter {
    _read() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] }
        catch { return [] }
    }

    _write(list) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) }
        catch { /* storage unavailable — ephemeral */ }
    }

    _sorted(list) {
        // Higher score first; older entry wins ties (got there first).
        return [...list].sort((a, b) => b.score - a.score || a.t - b.t)
    }

    _rankOf(score) {
        const better = this._read().filter((e) => e.score > score).length
        return better + 1
    }

    async getTop10() {
        return this._sorted(this._read()).slice(0, TOP_N)
    }

    async getMyBest() {
        let best = 0
        try { best = Number(localStorage.getItem(BEST_KEY)) || 0 } catch { /* noop */ }
        if (!best) return { score: 0, rank: null }
        return { score: best, rank: this._rankOf(best) }
    }

    qualifiesForTop10(score) {
        if (!(score > 0)) return false
        const top = this._sorted(this._read())
        if (top.length < TOP_N) return true
        return score > top[TOP_N - 1].score
    }

    async submitScore({ name, score }) {
        const clean = String(name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || '???'
        const entry = { name: clean, score, t: Date.now() }
        const sorted = this._sorted([...this._read(), entry]).slice(0, MAX_ENTRIES)
        this._write(sorted)

        try {
            const prev = Number(localStorage.getItem(BEST_KEY)) || 0
            if (score > prev) localStorage.setItem(BEST_KEY, String(score))
        } catch { /* noop */ }

        return {
            rank: this._rankOf(score),
            total: sorted.length,
            top10: sorted.slice(0, TOP_N),
            entry
        }
    }
}

export default class Leaderboard {
    constructor() {
        this.adapter = new LocalLeaderboardAdapter()
    }

    getTop10() { return this.adapter.getTop10() }
    getMyBest() { return this.adapter.getMyBest() }
    qualifiesForTop10(score) { return this.adapter.qualifiesForTop10(score) }
    submitScore(payload) { return this.adapter.submitScore(payload) }
}
