import { color, Fn, max, PI, positionWorld, texture, uniform, uv, vec3 } from 'three/tsl'
import { Game } from '../Game.js'
import { References } from '../References.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'

export class Scenery
{
    constructor()
    {
        this.game = Game.getInstance()

        this.references = new References()
        const model = [...this.game.resources.sceneryModel.scene.children]
        for(const child of model)
        {
            // Add
            if(typeof child.userData.prevent === 'undefined' || child.userData.prevent === false)
            {
                // Objects
                this.game.objects.addFromModel(
                    child,
                    {

                    },
                    {
                        position: child.position,
                        rotation: child.quaternion,
                        sleeping: true,
                        mass: child.userData.mass
                    }
                )
            }

            this.references.parse(child)
        }

        this.setRoad()
    }
    
    setRoad()
    {
        this.road = {}

        // Mesh and material
        const mesh = this.references.items.get('road')[0]
        
        this.road.color = uniform(color('#383039'))
        this.road.glitterScarcity = uniform(0.1)
        this.road.glitterLighten = uniform(0.28)
        this.road.middleLighten = uniform(0.1)

        const colorNode = Fn(() =>
        {
            const glitterUv = positionWorld.xz.mul(0.2)
            const glitter = texture(this.game.noises.hash, glitterUv).r
            
            const glitterLighten = glitter.remap(this.road.glitterScarcity.oneMinus(), 1, 0, this.road.glitterLighten)

            // return vec3(glitterLighten)
            
            const middleLighten = uv().y.mul(PI).sin().mul(this.road.middleLighten)

            const baseColor = this.road.color.toVar()
            baseColor.addAssign(max(glitterLighten, middleLighten).mul(0.2))

            return vec3(baseColor)
        })()

        const material = new MeshDefaultMaterial({
            colorNode: colorNode,

            hasLightBounce: false,
            hasWater: false,
        })
        mesh.material = material

        // Physics
        this.road.body = mesh.userData.object.physical.body
        this.road.body.setEnabled(false)

        // Debug
        if(this.game.debug.active)
        {
            const debugPanel = this.game.debug.panel.addFolder({
                title: '🛣️ Road',
                expanded: false
            })
            this.game.debug.addThreeColorBinding(debugPanel, this.road.color.value, 'color')
            debugPanel.addBinding(this.road.glitterScarcity, 'value', { label: 'glitterScarcity', min: 0, max: 1, step: 0.001 })
            debugPanel.addBinding(this.road.glitterLighten, 'value', { label: 'glitterLighten', min: 0, max: 1, step: 0.001 })
            debugPanel.addBinding(this.road.middleLighten, 'value', { label: 'middleLighten', min: 0, max: 0.2, step: 0.001 })
        }
    }

}