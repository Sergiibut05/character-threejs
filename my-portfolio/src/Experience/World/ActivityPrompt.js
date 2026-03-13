import * as THREE from 'three'
import Experience from '../Experience.js'

export default class ActivityPrompt {
    constructor() {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.camera = this.experience.camera
        this.sizes = this.experience.sizes

        this.anchorPosition = new THREE.Vector3()
        this.screenPosition = new THREE.Vector3()
        this.hasAnchor = false
        this.isInArea = false
        this.isHovered = false
        this.isOpen = false
        this.radius = 2.25
        this.fadeDistance = 14
        this.devLightMode = import.meta.env.VITE_DEV_LIGHT_MODE === 'true'
        this.previousMobileB = false
        this.pressResetTimeout = null

        this.setDom()
        this.setInput()
        this.resolveAnchorPoint()
    }

    setDom() {
        this.el = document.createElement('div')
        this.el.className = 'activity-prompt'
        this.el.innerHTML = `
            <div class="activity-prompt-badge">
                <span class="activity-prompt-icon">
                    <img class="activity-prompt-icon-img" src="/texture/coqui/coqui.svg" alt="coqui icon" />
                </span>
                <span class="activity-prompt-key">ENTER</span>
            </div>
        `
        document.body.appendChild(this.el)
        this.badgeEl = this.el.querySelector('.activity-prompt-badge')
        this.keyEl = this.el.querySelector('.activity-prompt-key')

        this.onMouseEnterBound = () => {
            this.isHovered = true
            this.updateOpenState()
        }
        this.onMouseLeaveBound = () => {
            this.isHovered = false
            this.updateOpenState()
        }
        this.onClickBound = (event) => {
            event.preventDefault()
            this.triggerPressAnimation()
        }

        this.badgeEl.addEventListener('mouseenter', this.onMouseEnterBound)
        this.badgeEl.addEventListener('mouseleave', this.onMouseLeaveBound)
        this.badgeEl.addEventListener('click', this.onClickBound)
    }

    setInput() {
        this.onKeyDownBound = (event) => {
            if (event.key !== 'Enter' || !this.isInArea) return
            const minigame = this.experience.world?.frisbeeMinigame
            if (minigame && minigame.state !== 'idle') return
            this.triggerPressAnimation()
        }
        window.addEventListener('keydown', this.onKeyDownBound)
    }

    triggerPressAnimation() {
        if (!this.badgeEl) return

        // Start the frisbee minigame if available
        const minigame = this.experience.world?.frisbeeMinigame
        if (minigame && minigame.state === 'idle' && this.isInArea) {
            minigame.start()
        }

        this.badgeEl.classList.remove('is-pressed')
        void this.badgeEl.offsetWidth
        this.badgeEl.classList.add('is-pressed')

        if (this.pressResetTimeout) {
            clearTimeout(this.pressResetTimeout)
        }

        this.pressResetTimeout = setTimeout(() => {
            this.badgeEl?.classList.remove('is-pressed')
            this.pressResetTimeout = null
        }, 180)
    }

    updateOpenState() {
        const shouldOpen = this.isInArea || this.isHovered
        if (shouldOpen === this.isOpen) return
        this.isOpen = shouldOpen
        this.el.classList.toggle('is-active', this.isOpen)
    }

    resolveAnchorPoint() {
        const gltf = this.resources.items.activitiesPointsModel
        const scene = gltf?.scene

        if (!scene) {
            if (this.devLightMode) {
                this.anchorPosition.set(0, 0, 0)
                this.hasAnchor = true
                return
            }
            this.el.classList.add('is-hidden')
            return
        }

        scene.updateMatrixWorld(true)

        let anchor = scene.getObjectByName('freesby-point')
        if (!anchor) {
            scene.traverse((child) => {
                if (anchor || !child?.name) return
                const lower = child.name.toLowerCase()
                const isFreestylePoint =
                    lower.includes('freesby-point') ||
                    lower.includes('frisbee-point') ||
                    (lower.includes('freesby') && lower.includes('point')) ||
                    (lower.includes('frisbee') && lower.includes('point'))

                if (isFreestylePoint) {
                    anchor = child
                }
            })
        }

        if (!anchor) {
            if (this.devLightMode) {
                scene.getWorldPosition(this.anchorPosition)
                this.hasAnchor = true
                return
            }
            this.el.classList.add('is-hidden')
            return
        }

        anchor.getWorldPosition(this.anchorPosition)
        this.hasAnchor = true
    }

    updateKeyLabel() {
        const mobileActive = this.experience.mobileControls?.isActive()
        this.keyEl.textContent = mobileActive ? 'B' : 'ENTER'
    }

    update() {
        if (!this.hasAnchor) return

        const character = this.experience.world?.character
        if (!character) return

        this.updateKeyLabel()

        const dx = character.position.x - this.anchorPosition.x
        const dz = character.position.z - this.anchorPosition.z
        const distance = Math.hypot(dx, dz)
        this.isInArea = distance <= this.radius
        this.updateOpenState()

        this.screenPosition.copy(this.anchorPosition)
        this.screenPosition.y += 1.5
        this.screenPosition.project(this.camera.instance)

        const isBehind = this.screenPosition.z > 1
        if (isBehind) {
            if (!this.devLightMode) {
                this.el.classList.add('is-hidden')
                return
            }
        } else {
            this.el.classList.remove('is-hidden')
        }

        const clampedX = THREE.MathUtils.clamp(
            (this.screenPosition.x * 0.5 + 0.5) * this.sizes.width,
            16,
            this.sizes.width - 16
        )
        const clampedY = THREE.MathUtils.clamp(
            (-this.screenPosition.y * 0.5 + 0.5) * this.sizes.height,
            16,
            this.sizes.height - 16
        )
        const visibility = THREE.MathUtils.clamp(1 - distance / this.fadeDistance, 0.25, 1)

        this.el.style.opacity = `${visibility}`
        this.el.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`

        const actions = this.experience.mobileControls?.getActions?.()
        const mobileB = actions?.button2 === true
        if (mobileB && !this.previousMobileB && this.isInArea) {
            this.triggerPressAnimation()
        }
        this.previousMobileB = mobileB
    }

    destroy() {
        if (this.onKeyDownBound) {
            window.removeEventListener('keydown', this.onKeyDownBound)
        }
        if (this.badgeEl) {
            this.badgeEl.removeEventListener('mouseenter', this.onMouseEnterBound)
            this.badgeEl.removeEventListener('mouseleave', this.onMouseLeaveBound)
            this.badgeEl.removeEventListener('click', this.onClickBound)
        }
        if (this.pressResetTimeout) {
            clearTimeout(this.pressResetTimeout)
            this.pressResetTimeout = null
        }
        this.el?.remove()
    }
}
