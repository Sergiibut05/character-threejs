/**
 * LoadSpy — what actually blocked the loading screen, shown on the screen it
 * blocked.
 *
 * FrameSpy answers the same question for frames of gameplay, but it starts
 * after the world exists and it answers into the console, and neither of those
 * is any use for a phone that stutters BEFORE the world exists. So this is the
 * loading-time half: it runs from the first line of the app, and it draws its
 * report over the loading screen where you can read it on the device.
 *
 * It watches two different things on purpose, because during loading they
 * genuinely come apart:
 *
 *   TAREAS LARGAS — main-thread work over 50 ms, from the browser's own
 *   longtask entries. This is parsing, instancing, uploading: things a phone
 *   does five to ten times slower than the desktop they were tuned on, which
 *   is how a task that is invisible here becomes a freeze there.
 *
 *   SALTOS — gaps between animation frames. These can be much longer than any
 *   long task, and when they are, that is the finding: something outside the
 *   main thread stalled the browser. In this app that is the GPU process,
 *   compiling shaders or uploading textures, which the compositor shares. See
 *   Experience.warmUpRender() for why that one cannot simply be moved.
 *
 * A big long task and a big gap with no long task under it have completely
 * different fixes, and telling them apart from a description alone is not
 * possible -- hence a number you can screenshot.
 *
 * Off unless asked for: add `#spy` to the URL. Costs nothing when off.
 */

/** Gaps between frames longer than this (ms) are worth naming. */
const GAP_MS = 50

export default class LoadSpy {
    static wanted() {
        return typeof window !== 'undefined' && window.location.hash.includes('spy')
    }

    constructor() {
        // NO t0 of its own, deliberately. performance.now() is already measured
        // from navigation start, which is also the clock longtask entries use --
        // so leaving it alone puts marks, gaps and tasks on ONE timeline. An
        // earlier version subtracted the moment this class was built, which put
        // its own marks about 0.9 s ahead of the tasks they were there to
        // explain, on a phone slow enough to take that long to run the bundle.
        this.tasks = []
        this.gaps = []
        this.marks = []
        this.el = null
        this._done = false

        // buffered: true hands over the entries from before this line ran, so
        // the boot work that happens before the app exists is not a blind spot.
        try {
            this._obs = new PerformanceObserver((list) => {
                for (const e of list.getEntries()) {
                    this.tasks.push({ at: e.startTime, ms: e.duration })
                }
            })
            this._obs.observe({ type: 'longtask', buffered: true })
        } catch (e) {
            this._noLongtask = true   // Safari, mainly
        }

        let prev = performance.now()
        const tick = () => {
            const now = performance.now()
            const gap = now - prev
            prev = now
            if (gap > GAP_MS) this.gaps.push({ at: now, ms: gap, from: now - gap })
            if (!this._done) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)

        this._paint = setInterval(() => this.render(), 1000)
        this.mark('arranque')
    }

    /** Name a moment, so the numbers above can be placed against the phases. */
    mark(label) {
        this.marks.push({ label, at: performance.now() })
        this.render()
    }

    /** Stop watching, leave the final report up. */
    finish() {
        if (this._done) return
        this._done = true
        clearInterval(this._paint)
        setTimeout(() => this.render(), 400)  // catch the last frames
    }

    render() {
        if (!this.el) {
            this.el = document.createElement('pre')
            this.el.id = 'load-spy'
            this.el.style.cssText = `
                position: fixed; left: 8px; top: 8px; z-index: 4000;
                margin: 0; padding: 8px 10px; max-width: calc(100vw - 16px);
                max-height: 60vh; overflow: auto;
                background: rgba(12, 16, 22, 0.86); color: #cfe9ff;
                font: 11px/1.45 ui-monospace, Menlo, Consolas, monospace;
                border-radius: 8px; white-space: pre; pointer-events: none;
                text-shadow: 0 1px 0 rgba(0,0,0,0.6);
            `
            document.body.appendChild(this.el)
        }

        const blocked = this.tasks.reduce((s, t) => s + t.ms, 0)
        const worstTasks = [...this.tasks].sort((a, b) => b.ms - a.ms).slice(0, 5)
        const worstGaps = [...this.gaps].sort((a, b) => b.ms - a.ms).slice(0, 5)
        const s = (ms) => (ms / 1000).toFixed(1) + 's'

        // FASES first: it is the part that says WHERE the time went, and on a
        // phone it is the part that risks falling off the bottom of the screen.
        const lines = []
        lines.push(`LoadSpy  dpr ${(window.devicePixelRatio || 1).toFixed(2)}  ${innerWidth}x${innerHeight}`)
        lines.push('')
        lines.push('FASES')
        for (const m of this.marks) lines.push(`${s(m.at).padStart(6)}  ${m.label}`)
        lines.push('')
        lines.push(`TAREAS LARGAS ${this.tasks.length} · bloqueado ${Math.round(blocked)} ms`)
        if (this._noLongtask) {
            lines.push('  (este navegador no reporta longtask)')
        } else if (!worstTasks.length) {
            lines.push('  ninguna — el hilo principal no es el problema')
        } else {
            for (const t of worstTasks) lines.push(`  ${String(Math.round(t.ms)).padStart(5)} ms  ${s(t.at)}->${s(t.at + t.ms)}`)
        }
        lines.push('')
        lines.push(`SALTOS ENTRE FRAMES ${this.gaps.length}`)
        if (!worstGaps.length) {
            lines.push('  ninguno — la pantalla no se paro')
        } else {
            for (const g of worstGaps) lines.push(`  ${String(Math.round(g.ms)).padStart(5)} ms  ${s(g.from)}->${s(g.at)}`)
        }

        this.el.textContent = lines.join('\n')
    }
}
