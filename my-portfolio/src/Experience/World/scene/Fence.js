/**
 * Fence — InstancedMesh of `fence_open_wide_long` placed via
 * `fence_instances.json`. Uses the shared Tiny atlas as base map.
 *
 * The source GLB ships hundreds of redundant duplicates from the Blender pack;
 * we only consume the first `fence_open_wide_long*` mesh as instance template
 * and rely on the JSON for placement. This fence's JSON rotation is complete
 * (it carries the upright π/2 baseline), so we DON'T inherit the template node
 * orientation — the conversion in InstancedFromJSON is enough.
 */
import InstancedFromJSON from './InstancedFromJSON.js'
import { createStylizedPropNodeMaterial } from './StylizedPropMaterial.js'

export default class Fence extends InstancedFromJSON {
    constructor(gltf, instances, atlasMap) {
        super('Fence', gltf, instances, {
            singleMesh: true,
            meshFilter: (m) =>
                m.name.startsWith('fence_open_wide_long') ||
                m.name.toLowerCase().includes('fence'),
            materialFactory: () =>
                createStylizedPropNodeMaterial({ map: atlasMap || null, color: 0xffffff }),
            dynamic: true
        })
    }
}
