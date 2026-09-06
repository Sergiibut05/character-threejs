/**
 * FrameSpy — finds out WHICH frame was slow, and who spent it.
 *
 * There is a one-off hitch a couple of seconds into the first walk that reads
 * as the character spasming. Two guesses at its cause have been wrong, so this
 * stops guessing: it times every `update()` in the world, every frame, and the
 * moment a frame runs long it prints where the milliseconds went.
 *
 * The single most useful number it reports is the LAST one, "sin contabilizar":
 * the part of the frame that no update() accounts for. Work scheduled outside
 * the render loop — a promise continuation finishing a model, a setTimeout
 * chunk, a texture upload, a shader compiled on first draw — lands there. So a
 * spike that shows up as unaccounted is not in the game loop at all, which is
 * as much of an answer as a named subsystem would be.
 *
 * Off unless asked for: add `#spy` to the URL, or call `window.frameSpy.start()`
 * from the console. Costs a pair of performance.now() calls per subsystem per
 * frame while running, and nothing at all while it is not.
 */

/** Frames slower than this (ms) get reported. ~4 frames at 60fps. */
const DEFAULT_THRESHOLD = 60

export default class FrameSpy {
    /**
     * @param {object} experience  the Experience singleton
     * @param {object} [options]
     * @param {number} [options.threshold]  ms above which a frame is reported
     */
    constructor(experience, options = {}) {
        this.experience = experience
        this.threshold = options.threshold ?? DEFAULT_THRESHOLD

        this.running = false
        this._costs = new Map()      // label -> ms spent this frame
        this._patched = []           // [{ owner, key, original }]
        this._last = performance.now()
        this._t0 = performance.now()
        this._reported = 0

        this._onTick = () => this._tick()
    }

    /** Wrap every update() we can find, and start watching. */
    start() {
        if (this.running) return
        this.running = true
        this._t0 = performance.now()
        this._last = performance.now()

        const world = this.experience.world
        if (world) {
            // Every subsystem hanging off World, by its property name — which
            // is also what the report calls it, so no list to keep in sync.
            for (const key of Object.keys(world)) {
                const value = world[key]
                if (value && typeof value.update === 'function') {
                    this._wrap(value, 'update', key)
                }
            }
        }
        this._wrap(this.experience.renderer, 'update', 'renderer')
        this._wrap(this.experience.camera, 'update', 'camera')

        this.experience.time.on('tick', this._onTick)
        console.log(
            `%cFrameSpy activo%c — avisando de frames de mas de ${this.threshold} ms. ` +
            `Anda un poco y espera al tiron.`,
            'background:#78ff72;color:#000;padding:2px 6px;border-radius:3px',
            'color:inherit'
        )
    }

    /** Put everything back the way it was. */
    stop() {
        if (!this.running) return
        this.running = false
        this.experience.time.off('tick', this._onTick)
        for (const { owner, key, original } of this._patched) owner[key] = original
        this._patched.length = 0
        console.log('FrameSpy detenido.')
    }

    _wrap(owner, key, label) {
        if (!owner || typeof owner[key] !== 'function') return
        const original = owner[key]
        const costs = this._costs
        owner[key] = function wrapped(...args) {
            const t = performance.now()
            try {
                return original.apply(this, args)
            } finally {
                costs.set(label, (costs.get(label) || 0) + (performance.now() - t))
            }
        }
        this._patched.push({ owner, key, original })
    }

    /** Runs last in the tick, so the accumulators hold this whole frame. */
    _tick() {
        const now = performance.now()
        const frameMs = now - this._last
        this._last = now

        if (frameMs >= this.threshold) this._report(frameMs, now)
        this._costs.clear()
    }

    _report(frameMs, now) {
        const rows = [...this._costs.entries()]
            .filter(([, ms]) => ms >= 0.5)
            .sort((a, b) => b[1] - a[1])

        const accounted = rows.reduce((sum, [, ms]) => sum + ms, 0)
        const unaccounted = frameMs - accounted

        this._reported++
        console.groupCollapsed(
            `%c⚠ frame de ${frameMs.toFixed(0)} ms%c  a los ${((now - this._t0) / 1000).toFixed(1)} s ` +
            `(aviso #${this._reported})`,
            'background:#ff7a59;color:#000;padding:2px 6px;border-radius:3px',
            'color:inherit'
        )
        for (const [label, ms] of rows) {
            console.log(`${ms.toFixed(1).padStart(7)} ms   ${label}`)
        }
        console.log(
            `${unaccounted.toFixed(1).padStart(7)} ms   ── sin contabilizar ` +
            `(fuera del bucle: promesas, setTimeout, subida de texturas, compilacion de shaders)`
        )
        console.groupEnd()
    }
}
