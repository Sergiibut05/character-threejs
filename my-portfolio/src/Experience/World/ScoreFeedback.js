/**
 * Calculates frisbee score based on dog catch position vs target center,
 * and shows an animated CSS overlay with the result.
 */
export default class ScoreFeedback {
    constructor() {
        this._hideTimeout = null
        this.setupUI()
    }

    setupUI() {
        this.overlay = document.createElement('div')
        this.overlay.className = 'frisbee-score-overlay'

        this.label = document.createElement('div')
        this.label.className = 'frisbee-score-label'

        this.points = document.createElement('div')
        this.points.className = 'frisbee-score-points'

        this.overlay.appendChild(this.label)
        this.overlay.appendChild(this.points)
        document.body.appendChild(this.overlay)
    }

    /**
     * Calculate score and show feedback.
     * @param {THREE.Vector3} catchPos - dog position at catch moment
     * @param {THREE.Vector3} targetCenter - bullseye center
     * @returns {{ zone: string, points: number, distance: number }}
     */
    evaluate(catchPos, targetCenter) {
        const dx = catchPos.x - targetCenter.x
        const dz = catchPos.z - targetCenter.z
        const dist = Math.sqrt(dx * dx + dz * dz)

        let zone, pts, color
        if (dist <= 2) {
            zone = 'PERFECTO!'
            pts = 100
            color = '#ffd426'
        } else if (dist <= 5) {
            zone = 'GENIAL!'
            pts = 50
            color = '#40c864'
        } else if (dist <= 10) {
            zone = 'BIEN!'
            pts = 10
            color = '#5a8af5'
        } else {
            zone = ''
            pts = 0
            color = '#aaa'
        }

        this._show(zone, pts, color)
        return { zone, points: pts, distance: dist }
    }

    _show(zone, pts, color) {
        if (this._hideTimeout) clearTimeout(this._hideTimeout)

        if (!zone) {
            this.overlay.classList.remove('is-visible')
            return
        }

        this.label.textContent = zone
        this.points.textContent = `+${pts}`
        this.label.style.color = color
        this.points.style.color = color
        this.overlay.classList.add('is-visible')

        this._hideTimeout = setTimeout(() => {
            this.overlay.classList.remove('is-visible')
        }, 2200)
    }

    hide() {
        if (this._hideTimeout) clearTimeout(this._hideTimeout)
        this.overlay.classList.remove('is-visible')
    }

    destroy() {
        this.hide()
        this.overlay?.remove()
    }
}
