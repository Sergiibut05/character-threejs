import EventEmitter from './EventEmitter.js'

export default class Time extends EventEmitter
{
    constructor()
    {
        super()

        this.start = Date.now()
        this.current = this.start
        this.elapsed = 0
        this.delta = 16
        this.maxDelta = 33.33

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
        const currentTime = Date.now()
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
