import * as THREE from 'three'
import Experience from '../Experience.js'
import { gridVertexShader, gridFragmentShader } from './Ground/GridShader.js'

export default class Ground
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.physics = this.experience.world.physics
        this.debug = this.experience.debug

        // Ground parameters
        this.size = { x: 50, y: 0.1, z: 50 }
        this.position = { x: 0, y: 0, z: 0 }

        // Grid shader parameters
        this.gridParams = {
            gridScale: 1.0,
            lineWidthX: 0.01,
            lineWidthY: 0.01,
            lineColor: '#ffffff',
            baseColor: '#1a1a1a'
        }

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setPhysics()
        
        if(this.debug.active)
        {
            this.setDebug()
        }
    }

    setGeometry()
    {
        this.geometry = new THREE.PlaneGeometry(this.size.x, this.size.z, 32, 32)
    }

    setMaterial()
    {
        this.material = new THREE.ShaderMaterial({
            vertexShader: gridVertexShader,
            fragmentShader: gridFragmentShader,
            uniforms: {
                uGridScale: { value: this.gridParams.gridScale },
                uLineWidth: { value: new THREE.Vector2(this.gridParams.lineWidthX, this.gridParams.lineWidthY) },
                uLineColor: { value: new THREE.Color(this.gridParams.lineColor) },
                uBaseColor: { value: new THREE.Color(this.gridParams.baseColor) }
            }
        })
    }

    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.rotation.x = -Math.PI * 0.5
        this.mesh.position.set(this.position.x, this.position.y, this.position.z)
        this.mesh.receiveShadow = true
        this.scene.add(this.mesh)
    }

    setPhysics()
    {
        // Wait a bit for physics to initialize
        setTimeout(() => {
            if(this.physics.world)
            {
                this.physics.createGround(
                    this.size,
                    this.position
                )
            }
        }, 100)
    }

    setDebug()
    {
        this.debugFolder = this.debug.ui.addFolder('Ground')

        this.debugFolder
            .add(this.gridParams, 'gridScale')
            .min(0.1)
            .max(10)
            .step(0.1)
            .name('Grid Scale')
            .onChange(() => {
                this.material.uniforms.uGridScale.value = this.gridParams.gridScale
            })

        this.debugFolder
            .add(this.gridParams, 'lineWidthX')
            .min(0)
            .max(0.5)
            .step(0.001)
            .name('Line Width X')
            .onChange(() => {
                this.material.uniforms.uLineWidth.value.x = this.gridParams.lineWidthX
            })

        this.debugFolder
            .add(this.gridParams, 'lineWidthY')
            .min(0)
            .max(0.5)
            .step(0.001)
            .name('Line Width Y')
            .onChange(() => {
                this.material.uniforms.uLineWidth.value.y = this.gridParams.lineWidthY
            })

        this.debugFolder
            .addColor(this.gridParams, 'lineColor')
            .name('Line Color')
            .onChange(() => {
                this.material.uniforms.uLineColor.value = new THREE.Color(this.gridParams.lineColor)
            })

        this.debugFolder
            .addColor(this.gridParams, 'baseColor')
            .name('Base Color')
            .onChange(() => {
                this.material.uniforms.uBaseColor.value = new THREE.Color(this.gridParams.baseColor)
            })
    }
}
