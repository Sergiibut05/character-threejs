import * as THREE from 'three'
import { uniform, vec2, color } from 'three/tsl'
import Experience from '../Experience.js'
import { createGridColorNode } from './Ground/GridShader.js'

export default class Ground {
    constructor() {
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
            gridScale: 0.2,
            lineThickness: 0.01,
            lineWidthX: 0.01,
            lineWidthY: 0.01,
            crossDensity: 5.0,
            crossSizeX: 0.08,
            crossSizeY: 0.02,
            lineColor: '#ffffff',
            crossColor: '#938ccf',
            baseColor: '#18181B',
            fadeDistance: 20.0
        }

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setPhysics()

        if (this.debug.active) {
            this.setDebug()
        }
    }

    setGeometry() {
        this.geometry = new THREE.PlaneGeometry(this.size.x, this.size.z, 32, 32)
    }

    setMaterial() {
        // TSL uniforms
        this.uGridScale = uniform(this.gridParams.gridScale)
        this.uLineWidth = uniform(new THREE.Vector2(this.gridParams.lineWidthX, this.gridParams.lineWidthY))
        this.uCrossDensity = uniform(this.gridParams.crossDensity)
        this.uCrossSize = uniform(new THREE.Vector2(this.gridParams.crossSizeX, this.gridParams.crossSizeY))
        this.uLineColor = uniform(new THREE.Color(this.gridParams.lineColor))
        this.uCrossColor = uniform(new THREE.Color(this.gridParams.crossColor))
        this.uBaseColor = uniform(new THREE.Color(this.gridParams.baseColor))
        this.uFadeDistance = uniform(this.gridParams.fadeDistance)

        // Create grid color node from TSL GridShader
        const gridColorNode = createGridColorNode({
            uGridScale: this.uGridScale,
            uLineWidth: this.uLineWidth,
            uCrossDensity: this.uCrossDensity,
            uCrossSize: this.uCrossSize,
            uLineColor: this.uLineColor,
            uCrossColor: this.uCrossColor,
            uBaseColor: this.uBaseColor,
            uFadeDistance: this.uFadeDistance
        })

        // MeshBasicNodeMaterial (unlit grid)
        this.material = new THREE.MeshBasicNodeMaterial()
        this.material.fragmentNode = gridColorNode
    }

    setMesh() {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.rotation.x = -Math.PI * 0.5
        this.mesh.position.set(this.position.x, this.position.y, this.position.z)
        this.mesh.receiveShadow = true
        this.scene.add(this.mesh)
    }

    setPhysics() {
        // Wait a bit for physics to initialize
        setTimeout(() => {
            if (this.physics.world) {
                this.physics.createGround(
                    this.size,
                    this.position
                )
            }
        }, 100)
    }

    setDebug() {
        this.debugFolder = this.debug.ui.addFolder('Ground')

        this.debugFolder
            .add(this.gridParams, 'gridScale')
            .min(0.1)
            .max(10)
            .step(0.1)
            .name('Grid Scale (cell size)')
            .onChange(() => {
                this.uGridScale.value = this.gridParams.gridScale
            })

        this.debugFolder
            .add(this.gridParams, 'lineThickness')
            .min(0)
            .max(0.5)
            .step(0.001)
            .name('Line Thickness')
            .onChange(() => {
                this.gridParams.lineWidthX = this.gridParams.lineThickness
                this.gridParams.lineWidthY = this.gridParams.lineThickness
                this.uLineWidth.value.x = this.gridParams.lineThickness
                this.uLineWidth.value.y = this.gridParams.lineThickness
            })

        this.debugFolder
            .add(this.gridParams, 'lineWidthX')
            .min(0)
            .max(0.5)
            .step(0.001)
            .name('Line Width X (fine)')
            .onChange(() => {
                this.uLineWidth.value.x = this.gridParams.lineWidthX
            })

        this.debugFolder
            .add(this.gridParams, 'lineWidthY')
            .min(0)
            .max(0.5)
            .step(0.001)
            .name('Line Width Y (fine)')
            .onChange(() => {
                this.uLineWidth.value.y = this.gridParams.lineWidthY
            })

        this.debugFolder
            .add(this.gridParams, 'crossDensity')
            .min(0)
            .max(5)
            .step(1)
            .name('Cross Density (crosses per cell)')
            .onChange(() => {
                this.uCrossDensity.value = this.gridParams.crossDensity
            })

        this.debugFolder
            .add(this.gridParams, 'crossSizeX')
            .min(0)
            .max(0.5)
            .step(0.001)
            .name('Cross Size X')
            .onChange(() => {
                this.uCrossSize.value.x = this.gridParams.crossSizeX
            })

        this.debugFolder
            .add(this.gridParams, 'crossSizeY')
            .min(0)
            .max(0.5)
            .step(0.001)
            .name('Cross Size Y')
            .onChange(() => {
                this.uCrossSize.value.y = this.gridParams.crossSizeY
            })

        this.debugFolder
            .add(this.gridParams, 'fadeDistance')
            .min(0)
            .max(100)
            .step(1)
            .name('Fade Distance')
            .onChange(() => {
                this.uFadeDistance.value = this.gridParams.fadeDistance
            })

        this.debugFolder
            .addColor(this.gridParams, 'lineColor')
            .name('Line Color')
            .onChange(() => {
                this.uLineColor.value = new THREE.Color(this.gridParams.lineColor)
            })

        this.debugFolder
            .addColor(this.gridParams, 'crossColor')
            .name('Cross Color')
            .onChange(() => {
                this.uCrossColor.value = new THREE.Color(this.gridParams.crossColor)
            })

        this.debugFolder
            .addColor(this.gridParams, 'baseColor')
            .name('Base Color')
            .onChange(() => {
                this.uBaseColor.value = new THREE.Color(this.gridParams.baseColor)
            })
    }
}
