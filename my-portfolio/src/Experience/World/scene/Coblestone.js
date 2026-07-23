/**
 * Coblestone — single-mesh InstancedMesh placed via `coblestone_instances.json`.
 *
 * No cast shadow; stylized material that reuses the GLB's own base colour. The
 * JSON stores raw Blender Z-up matrices (rotation included, like the Fence) so
 * InstancedFromJSON converts each transform on the fly.
 */
import * as THREE from 'three'
import InstancedFromJSON from './InstancedFromJSON.js'
import { createStylizedPropNodeMaterial } from './StylizedPropMaterial.js'

export default class Coblestone extends InstancedFromJSON {
    constructor(gltf, instances) {
        super('Coblestone', gltf, instances, {
            singleMesh: true,
            meshFilter: (m) => m.name.startsWith('cobble_stones'),
            materialFactory: (tpl) => {
                // The GLB ships NO material data, so three defaults the template
                // colour to pure white — never trust it: force the earth brown
                // (only keep the template colour when it's actually authored).
                const c = tpl.material?.color
                const authored = c && (c.r < 0.98 || c.g < 0.98 || c.b < 0.98)
                return createStylizedPropNodeMaterial({
                    color: authored ? c.clone() : new THREE.Color(0xab8268),
                    map: tpl.material?.map || null
                })
            },
            castShadow: false,
            dynamic: true
        })

        const debug = this.experience.debug
        if (debug?.active) {
            const uTint = this.meshes[0]?.material?.userData?.uTint
            if (uTint) {
                const params = { color: '#ab8268' }
                const f = debug.ui.addFolder('Coblestone')
                f.close()
                f.addColor(params, 'color').name('Stone Color').onChange((v) => {
                    const col = new THREE.Color(v)
                    uTint.value.set(col.r, col.g, col.b)
                })
            }
        }
    }
}
