import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import Experience from './Experience.js'

export default class Renderer
{
    constructor()
    {
        this.experience = new Experience()
        this.canvas = this.experience.canvas
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene
        this.camera = this.experience.camera

        this.setInstance()
        this.setPostProcessing()
    }

    setInstance()
    {
        this.instance = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        })
        this.instance.toneMapping = THREE.CineonToneMapping
        this.instance.toneMappingExposure = 1.75
        this.instance.shadowMap.enabled = true
        this.instance.shadowMap.type = THREE.PCFSoftShadowMap
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(this.sizes.pixelRatio)
    }

    setPostProcessing()
    {
        // Create EffectComposer - manages the post-processing pipeline
        this.composer = new EffectComposer(this.instance)

        // RenderPass - renders the scene normally as the first pass
        const renderPass = new RenderPass(this.scene, this.camera.instance)
        this.composer.addPass(renderPass)

        // OutlinePass - adds outline effect to selected objects
        this.outlinePass = new OutlinePass(
            new THREE.Vector2(this.sizes.width, this.sizes.height),
            this.scene,
            this.camera.instance
        )

        // Configure outline appearance
        this.outlinePass.edgeStrength = 5.0      // How strong/visible the outline is
        this.outlinePass.edgeGlow = 0.5          // Glow effect around the edge
        this.outlinePass.edgeThickness = 2.0    // Thickness of the outline
        this.outlinePass.pulsePeriod = 0        // 0 = no pulse, >0 = pulsing glow
        this.outlinePass.visibleEdgeColor.set('#ffffff')  // Color when edge is visible
        this.outlinePass.hiddenEdgeColor.set('#ffffff')   // Color when edge is behind objects

        this.composer.addPass(this.outlinePass)

        // OutputPass - applies tone mapping and color space conversion
        // This fixes the darker scene issue caused by EffectComposer
        const outputPass = new OutputPass()
        this.composer.addPass(outputPass)

        // SMAAPass - high quality antialiasing for post-processing
        // Better than FXAA, handles edges smoothly without blurring
        const smaaPass = new SMAAPass(
            this.sizes.width * this.sizes.pixelRatio,
            this.sizes.height * this.sizes.pixelRatio
        )
        this.composer.addPass(smaaPass)
        this.smaaPass = smaaPass
    }

    // Add objects to be outlined
    setOutlinedObjects(objects)
    {
        this.outlinePass.selectedObjects = objects
    }

    // Add a single object to outline
    addOutlinedObject(object)
    {
        if(!this.outlinePass.selectedObjects.includes(object))
        {
            this.outlinePass.selectedObjects.push(object)
        }
    }

    // Remove a single object from outline
    removeOutlinedObject(object)
    {
        const index = this.outlinePass.selectedObjects.indexOf(object)
        if(index > -1)
        {
            this.outlinePass.selectedObjects.splice(index, 1)
        }
    }

    // Clear all outlined objects
    clearOutlinedObjects()
    {
        this.outlinePass.selectedObjects = []
    }

    resize()
    {
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(this.sizes.pixelRatio)

        // Update composer and passes on resize
        this.composer.setSize(this.sizes.width, this.sizes.height)
        this.outlinePass.resolution.set(this.sizes.width, this.sizes.height)
        
        // Update SMAA pass resolution
        if(this.smaaPass)
        {
            this.smaaPass.setSize(
                this.sizes.width * this.sizes.pixelRatio,
                this.sizes.height * this.sizes.pixelRatio
            )
        }
    }

    update()
    {
        // Use composer instead of direct render for post-processing
        this.composer.render()
    }
}
