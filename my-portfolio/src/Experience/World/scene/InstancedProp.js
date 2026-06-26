/**
 * InstancedProp — generic instanced decorative prop (park-rock, trunk, …).
 *
 * Traverses all meshes in a GLB and creates one InstancedMesh per mesh, all
 * sharing the transforms from a references JSON.
 *
 * These props were authored upright in Blender's Z-up space (no +π/2 X baseline
 * like the fence), and the export script now writes each instance's REAL world
 * rotation (decomposed from `obj.matrix_world`). The only correct Blender→Three
 * conversion for an arbitrary world rotation is the true change-of-basis
 * ('conjugate' = Q · q_blender · Q⁻¹ with Q = −90° X), which is also the basis
 * used for the position swap (bx, bz, −by). The global default 'rawNegZ' is a
 * fence-specific shortcut that tilts these upright props on a pure heading
 * rotation, so we force 'conjugate' here instead.
 *
 * NOTE: this relies on the references JSON carrying real rotations. A prop whose
 * JSON still has [0,0,0] everywhere (not yet re-exported with the updated
 * script) will render upright/unrotated.
 */
import InstancedFromJSON from './InstancedFromJSON.js'

export default class InstancedProp extends InstancedFromJSON {
    constructor(name, gltf, instances, map = null) {
        super(name, gltf, instances, {
            map: map || null,
            color: 0xffffff,
            rotationMode: 'conjugate'
        })
    }
}
