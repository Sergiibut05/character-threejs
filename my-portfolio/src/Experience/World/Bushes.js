import * as THREE from 'three'
import { color, uniform } from 'three/tsl'
import Foliage from './Foliage.js'
import Experience from '../Experience.js'

export default class Bushes {
    constructor() {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.resources = this.experience.resources

        this.colorANode = uniform(color('#b4b536'))
        this.colorBNode = uniform(color('#d8cf3b'))
        this.foliage = null

        const references = this.resources.items?.bushesReferences?.scene?.children
        if (references && references.length > 0) {
            this.foliage = new Foliage(references, this.colorANode, this.colorBNode)
        }

        if (this.debug.active) {
            this.setDebug()
        }
    }

    update() {
        if (this.foliage) {
            this.foliage.update()
        }
    }

    setDebug() {
        this.debugFolder = this.debug.ui.addFolder('Bushes')
        this.debugFolder.close()

        this.debugFolder.addColor({ value: this.colorANode.value }, 'value')
            .name('Color A')
            .onChange(v => this.colorANode.value.copy(v))
        this.debugFolder.addColor({ value: this.colorBNode.value }, 'value')
            .name('Color B')
            .onChange(v => this.colorBNode.value.copy(v))

        if (this.foliage) {
            this.debugFolder.add(this.foliage.material.shadowOffset, 'value', 0, 2, 0.001).name('Shadow Offset')
        }
    }
}
