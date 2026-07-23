import EventEmitter from './EventEmitter.js'

export default class Time extends EventEmitter
{
    constructor()
    {
        super()

        // performance.now(): sub-millisecond precision. Date.now() (integer ms)
        // quantized frame deltas — on a 120 Hz display frames alternated 8/9 ms
        // (±6% speed noise every frame), reading as constant micro-stutter.
        this.start = performance.now()
        this.current = this.start
        this.elapsed = 0
        this.delta = 16

        // Spike guard ONLY (tab switches, GC pauses, shader compiles). It must
        // stay far above real frame times: the old 33.33 ms cap meant any
        // device below 30 fps ran in slow motion (movement AND animations
        // advanced less than real time — the "ralentizado" feel on old phones).
        this.maxDelta = 100

        this._history = new Float32Array(30)
        this._historyIndex = 0
        this._historyFilled = false
        this.deltaSmooth = 16

        window.requestAnimationFrame(() =>
        {
            this.tick()
        })
    }

    tick()
    {
        const currentTime = performance.now()
        const rawDelta = currentTime - this.current
        this.delta = Math.min(rawDelta, this.maxDelta)
        this.current = currentTime
        this.elapsed = this.current - this.start

        this._history[this._historyIndex] = this.delta
        this._historyIndex = (this._historyIndex + 1) % this._history.length
        if (this._historyIndex === 0) this._historyFilled = true

        const count = this._historyFilled ? this._history.length : this._historyIndex || 1
        let sum = 0
        for (let i = 0; i < count; i++) sum += this._history[i]
        this.deltaSmooth = sum / count

        this.trigger('tick')

        window.requestAnimationFrame(() =>
        {
            this.tick()
        })
    }
}
