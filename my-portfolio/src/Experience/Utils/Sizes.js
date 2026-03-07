import EventEmitter from './EventEmitter.js'

export default class Sizes extends EventEmitter
{
    constructor()
    {
        super()

        this.width = window.innerWidth
        this.height = window.innerHeight
        this.pixelRatio = Math.min(window.devicePixelRatio, 2)

        this._resizeTimeout = null

        window.addEventListener('resize', () =>
        {
            if (this._resizeTimeout) return
            this._resizeTimeout = setTimeout(() =>
            {
                this.width = window.innerWidth
                this.height = window.innerHeight
                this.pixelRatio = Math.min(window.devicePixelRatio, 2)
                this.trigger('resize')
                this._resizeTimeout = null
            }, 400)
        })
    }
}
