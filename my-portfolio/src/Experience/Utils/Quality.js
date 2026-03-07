export default class Quality {
    constructor() {
        this.isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
        this.level = this.isMobile ? 1 : 0
    }

    get isLow() { return this.level >= 1 }
    get isHigh() { return this.level === 0 }
    get shadowMapSize() { return this.isLow ? 512 : 1024 }
    get shadowRadius() { return this.isLow ? 3 : 6 }
    get antialias() { return this.isLow ? false : (Math.min(window.devicePixelRatio, 2) < 2) }
    get pixelRatio() { return this.isLow ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2) }
}
