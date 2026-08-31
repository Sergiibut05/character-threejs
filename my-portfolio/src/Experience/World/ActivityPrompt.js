import * as THREE from 'three'
import Experience from '../Experience.js'
import StartEmblem from './ui/StartEmblem.js'

// Known location of the frisbee activity anchor (where the dog waits / the
// player starts the minigame), in Blender Z-up space: (6.6989, -5.72696,
// 0.221253). Converted to Three Y-up with the standard (bx, bz, -by) swap.
// Used as a fallback when the GLB marker node can't be resolved.
const FREESBY_POINT_THREE = new THREE.Vector3(6.6989, 0.221253, 5.72696)

// Flying disc mark. The prompt used to carry the portfolio leaf — the same
// shape as the favicon — which said "portfolio", not "frisbee". Each activity
// now wears its own object so they're told apart from across the map.
const DISC_SVG = `
<svg class="fz-emblem-svg fz-emblem-disc" viewBox="0 0 48 48" aria-hidden="true">
  <ellipse cx="24" cy="30" rx="18" ry="8" fill="#41a06e"/>
  <ellipse cx="24" cy="26" rx="18" ry="8" fill="#9be4ca" stroke="#2f7c56" stroke-width="2.2"/>
  <ellipse cx="24" cy="26" rx="11" ry="4.6" fill="#e7faf1" stroke="#2f7c56" stroke-width="1.8"/>
  <ellipse cx="24" cy="26" rx="4.6" ry="1.9" fill="#5fc594" stroke="#2f7c56" stroke-width="1.4"/>
  <path d="M8 27.5c0 4.4 7.2 8 16 8s16-3.6 16-8" fill="none" stroke="#2f7c56" stroke-width="2.2" stroke-linecap="round"/>
</svg>`

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
        this.previousPadA = false
        this.pressResetTimeout = null

        // Occlusion test: hide the emblem when solid geometry sits between the
        // camera and the anchor (so the logo can't float through walls/props).
        this._occRay = new THREE.Raycaster()
        this._occRay.near = 0.1
        this._occDir = new THREE.Vector3()
        this._occTarget = new THREE.Vector3()
        this._occluders = null
        this._occluded = false
        this._occFrame = 0

        this.setDom()
        this.setInput()
        this.resolveAnchorPoint()
    }

    setDom() {
        // Reusable "Órbita" emblem (the portfolio's start mark). ActivityPrompt
        // projects the 3D anchor and drives its position/proximity/active state.
        this.emblem = new StartEmblem({ svg: DISC_SVG })
        this.emblem.setLabelKey('frisbee.title')
        this.el = this.emblem.el

        this.onMouseEnterBound = () => { this.isHovered = true; this.updateOpenState() }
        this.onMouseLeaveBound = () => { this.isHovered = false; this.updateOpenState() }
        this.onClickBound = (event) => { event.preventDefault(); this.triggerPressAnimation() }

        this.el.addEventListener('mouseenter', this.onMouseEnterBound)
        this.el.addEventListener('mouseleave', this.onMouseLeaveBound)
        this.el.addEventListener('click', this.onClickBound)
    }

    setInput() {
        this.onKeyDownBound = (event) => {
            if (event.key !== 'Enter' || !this.isInArea) return
            const world = this.experience.world
            if (world?.frisbeeMinigame && world.frisbeeMinigame.state !== 'idle') return
            if (world?.frisbeeSession?.isModalOpen()) return // modal handles Enter
            this.triggerPressAnimation()
        }
        window.addEventListener('keydown', this.onKeyDownBound)
    }

    triggerPressAnimation() {
        // Open the mode-select modal (Competitivo / Libre) instead of throwing
        // straight away — FrisbeeSession then launches the chosen mode.
        const world = this.experience.world
        const minigame = world?.frisbeeMinigame
        const session = world?.frisbeeSession
        if (minigame?.state === 'idle' && !session?.isModalOpen() && this.isInArea) {
            session?.openModeSelect()
        }

        this.emblem?.press()
        if (this.pressResetTimeout) clearTimeout(this.pressResetTimeout)
        this.pressResetTimeout = setTimeout(() => {
            this.emblem?.el.classList.remove('is-pressed')
            this.pressResetTimeout = null
        }, 180)
    }

    updateOpenState() {
        const shouldOpen = this.isInArea
        if (shouldOpen === this.isOpen) return
        this.isOpen = shouldOpen
        this.emblem?.setActive(this.isOpen)
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
            this._useFallbackAnchor()
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
            this._useFallbackAnchor()
            return
        }

        anchor.getWorldPosition(this.anchorPosition)
        this.hasAnchor = true
    }

    /** Build the occluder list once (solid pieces only; skips ground/thin ones). */
    _getOccluders() {
        if (this._occluders) return this._occluders
        const pieces = this.experience.world?.patioScene?.pieces
        if (!pieces) return null
        const SKIP = new Set(['floor', 'grassBorders', 'river', 'coblestone', 'baseballPitch', 'fence'])
        const roots = []
        for (const [key, piece] of Object.entries(pieces)) {
            if (SKIP.has(key)) continue
            const root = piece?.root
            if (root && root.isObject3D) roots.push(root)
        }
        if (roots.length) this._occluders = roots
        return this._occluders
    }

    /** True when geometry blocks the camera→anchor segment (throttled, cached). */
    _isOccluded() {
        const occluders = this._getOccluders()
        if (!occluders || occluders.length === 0) return false
        // One raycast every 3rd frame; reuse the last result in between.
        this._occFrame = (this._occFrame + 1) % 3
        if (this._occFrame !== 0) return this._occluded

        const camPos = this.camera.instance.position
        this._occTarget.copy(this.anchorPosition)
        this._occTarget.y += 0.9
        this._occDir.copy(this._occTarget).sub(camPos)
        const dist = this._occDir.length()
        this._occDir.normalize()
        this._occRay.set(camPos, this._occDir)
        this._occRay.far = Math.max(0.01, dist - 0.5)
        this._occluded = this._occRay.intersectObjects(occluders, true).length > 0
        return this._occluded
    }

    /** Resolve to the known hardcoded anchor when the GLB marker is missing. */
    _useFallbackAnchor() {
        this.anchorPosition.copy(FREESBY_POINT_THREE)
        this.hasAnchor = true
        console.warn('ActivityPrompt: GLB anchor not found — using hardcoded Freesby point')
    }

    update() {
        if (!this.hasAnchor) return

        const character = this.experience.world?.character
        if (!character) return

        const dx = character.position.x - this.anchorPosition.x
        const dz = character.position.z - this.anchorPosition.z
        const distance = Math.hypot(dx, dz)
        this.isInArea = distance <= this.radius
        this.el.classList.toggle('is-out-of-range', !this.isInArea)
        this.updateOpenState()

        this.screenPosition.copy(this.anchorPosition)
        this.screenPosition.y += 0.9
        this.screenPosition.project(this.camera.instance)

        // Hide when off-screen — behind the camera OR projected outside the
        // viewport (the old code only handled "behind", so a side-exit left a
        // sliver clamped to the edge forever).
        const onScreen = this.screenPosition.z <= 1 &&
            Math.abs(this.screenPosition.x) <= 1.05 &&
            Math.abs(this.screenPosition.y) <= 1.05
        // Also gone once you have simply walked away. The opacity below floors
        // at 0.35 so the emblem stays readable at a glance from across the
        // park — but a floor means it NEVER reaches zero, so without this the
        // logo hung in the sky for the whole map. BeachPrompt already cuts it
        // the same way; this one had been left behind.
        const tooFar = distance > this.fadeDistance
        if ((!onScreen || tooFar) && !this.devLightMode) {
            this.emblem.setVisible(false)
            return
        }
        // Hide when something solid blocks the camera→anchor line of sight.
        if (!this.devLightMode && this._isOccluded()) {
            this.emblem.setVisible(false)
            return
        }
        this.emblem.setVisible(true)

        const x = (this.screenPosition.x * 0.5 + 0.5) * this.sizes.width
        const y = (-this.screenPosition.y * 0.5 + 0.5) * this.sizes.height
        const visibility = THREE.MathUtils.clamp(1 - distance / this.fadeDistance, 0.35, 1)
        // Proximity 0→1 as the player closes in (1 within range).
        const proximity = THREE.MathUtils.clamp((this.radius + 4 - distance) / 4, 0, 1)

        this.emblem.setPosition(x, y)
        this.emblem.setOpacity(visibility)
        this.emblem.setProximity(proximity)

        const actions = this.experience.mobileControls?.getActions?.()
        const mobileB = actions?.button2 === true
        if (mobileB && !this.previousMobileB && this.isInArea) {
            this.triggerPressAnimation()
        }
        this.previousMobileB = mobileB

        const padA = this.experience.gamepad?.getActions?.().button2 === true
        if (padA && !this.previousPadA && this.isInArea) {
            this.triggerPressAnimation()
        }
        this.previousPadA = padA
    }

    destroy() {
        if (this.onKeyDownBound) {
            window.removeEventListener('keydown', this.onKeyDownBound)
        }
        if (this.el) {
            this.el.removeEventListener('mouseenter', this.onMouseEnterBound)
            this.el.removeEventListener('mouseleave', this.onMouseLeaveBound)
            this.el.removeEventListener('click', this.onClickBound)
        }
        if (this.pressResetTimeout) {
            clearTimeout(this.pressResetTimeout)
            this.pressResetTimeout = null
        }
        this.emblem?.destroy()
    }
}
