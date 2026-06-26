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
            materialFactory: (tpl) =>
                createStylizedPropNodeMaterial({
                    color: tpl.material?.color?.clone?.() || new THREE.Color(0xab8268),
                    map: tpl.material?.map || null
                }),
            castShadow: false,
            dynamic: true
        })
    }
}
