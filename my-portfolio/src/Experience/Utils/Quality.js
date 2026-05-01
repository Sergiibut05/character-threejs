export default class Quality {
    constructor() {
        this.isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
        this.level = this.isMobile ? 1 : 0
    }

    get isLow() { return this.level >= 1 }
    get isHigh() { return this.level === 0 }
    get shadowMapSize() { return this.isLow ? 256 : 1024 }
    get shadowRadius() { return this.isLow ? 2 : 6 }
    get shadowCameraSize() { return this.isLow ? 15 : 20 }
    get antialias() { return this.isLow ? false : (Math.min(window.devicePixelRatio, 2) < 2) }
    get pixelRatio() { return this.isLow ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 2) }
    get grassCount() { return this.isLow ? 7000 : 10000 }
    get grassViewRadius() { return this.isLow ? 13 : 20 }
    get foliagePlanes() { return this.isLow ? 36 : 80 }
}
