import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Experience from './Experience.js'

export default class Camera
{
    constructor()
    {
        this.experience = new Experience()
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene
        this.canvas = this.experience.canvas

        this.setInstance()
        this.setOrbitControls()
    }

    setInstance()
    {
        this.instance = new THREE.PerspectiveCamera(35, this.sizes.width / this.sizes.height, 0.1, 100)
        // Initial position - will be updated to follow character
        this.instance.position.set(0, 8, 8)
        this.instance.lookAt(0, 0, 0)
        this.scene.add(this.instance)
    }

    setOrbitControls()
    {
        this.controls = new OrbitControls(this.instance, this.canvas)
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.05
        this.controls.target.set(0, 0, 0)
    }

    resize()
    {
        this.instance.aspect = this.sizes.width / this.sizes.height
        this.instance.updateProjectionMatrix()
    }

    update()
    {
        // Update OrbitControls
        this.controls.update()
        
        // Camera follows character (Animal Crossing style - fixed angle)
        // Temporarily disabled when using OrbitControls
        // if(this.experience.world.character)
        // {
        //     const characterPosition = this.experience.world.character.position
        //     const offset = new THREE.Vector3(0, 8, 8)
        //     
        //     this.instance.position.copy(characterPosition).add(offset)
        //     this.instance.lookAt(characterPosition)
        // }
    }
}
