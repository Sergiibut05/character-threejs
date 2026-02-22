import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Environment {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        this.setAmbientLight()
        this.setSunLight()
    }

    setAmbientLight() {
        this.ambientLight = new THREE.AmbientLight('#ffffff', 0.8)
        this.scene.add(this.ambientLight)
    }

    setSunLight() {
        this.sunLight = new THREE.DirectionalLight('#fff4e6', 2.5)
        this.sunLight.castShadow = true
        this.sunLight.shadow.camera.far = 20
        this.sunLight.shadow.mapSize.set(2048, 2048)
        this.sunLight.shadow.normalBias = 0.03
        this.sunLight.shadow.radius = 4
        this.sunLight.position.set(4, 5, -3)
        this.scene.add(this.sunLight)

        this.skyLight = new THREE.HemisphereLight('#dbeafe', '#fef3c7', 0.5)
        this.scene.add(this.skyLight)
    }
}
