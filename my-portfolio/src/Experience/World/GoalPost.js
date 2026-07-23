import * as THREE from 'three'
import Experience from '../Experience.js'
import { createStylizedPropNodeMaterial } from './scene/StylizedPropMaterial.js'

/**
 * GoalPost — the goal by the carts. The GLB ships the goal ('porteria', Tiny
 * atlas) and a helper plane named 'Plane' underneath it: that plane is hidden
 * and turned into the GOAL TRIGGER volume — when the ball sits over it, the
 * Ball system fires the confetti celebration.
 */
export default class GoalPost {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        this.ready = false
        this.triggerBox = null   // THREE.Box3 (world), y-expanded

        this._tryBuild()
        if (!this.ready) {
            this._onSourceLoaded = () => this._tryBuild()
            this.resources.on('sourceLoaded', this._onSourceLoaded)
        }
    }

    _tryBuild() {
        if (this.ready) return
        const r = this.resources.items
        if (!r.goalpostModel || !r.tinyAtlas) return

        this.root = r.goalpostModel.scene
        this.root.name = 'GoalPost'
        this.root.updateMatrixWorld(true)

        this.root.traverse((child) => {
            if (!child.isMesh) return
            if (child.name.toLowerCase().startsWith('plane')) return // trigger, handled below
            const old = child.material
            // Plain white goal (classic look) with the stylized shading.
            child.material = createStylizedPropNodeMaterial({ color: 0xffffff })
            old?.dispose?.()
            child.castShadow = !this.experience.quality?.isLow
            child.receiveShadow = false
        })

        // Trigger plane → invisible volume over the goal mouth/floor.
        const plane = this.root.getObjectByName('Plane')
        if (plane) {
            plane.updateWorldMatrix(true, true)
            this.triggerBox = new THREE.Box3().setFromObject(plane)
            // Give the flat plane some height so a rolling/bouncing ball counts.
            this.triggerBox.max.y += 1.1
            this.triggerBox.min.y -= 0.2
            plane.visible = false
        } else {
            console.warn('GoalPost: trigger "Plane" not found')
        }

        this.scene.add(this.root)
        this.ready = true
        if (this._onSourceLoaded) {
            this.resources.off('sourceLoaded', this._onSourceLoaded)
            this._onSourceLoaded = null
        }
    }

    /** True when a world point is inside the goal trigger. */
    containsPoint(p) {
        return this.ready && this.triggerBox ? this.triggerBox.containsPoint(p) : false
    }
}
