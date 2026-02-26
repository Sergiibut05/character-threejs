import * as THREE from 'three'

export default [
    {
        name: 'humanModel',
        type: 'gltfModel',
        path: '/models/human/human-walk-draco.glb'
    },
    {
        name: 'grassAtlas',
        type: 'texture',
        path: '/models/grass_clump.png'
    },
    {
        name: 'patioModel',
        type: 'gltfModel',
        path: '/models/Patio/patio-draco.glb'
    },
    // Foliage SDF texture fallback (PNG)
    {
        name: 'foliageTexture',
        type: 'texture',
        path: '/texture/foliage/foliageSDF.png',
        modifier: (texture) => {
            texture.colorSpace = THREE.NoColorSpace
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping
            texture.minFilter = THREE.NearestFilter
            texture.magFilter = THREE.NearestFilter
            texture.generateMipmaps = false
        }
    },
    // Tree visuals (compressed with Draco)
    {
        name: 'abedulTreeVisual',
        type: 'gltfModel',
        path: '/models/trees/Abedul-tree/Abedul-tree-compressed.glb'
    },
    {
        name: 'normalTreeVisual',
        type: 'gltfModel',
        path: '/models/trees/Normal-tree/Normal-tree-compressed.glb'
    },
    {
        name: 'oldTreeVisual',
        type: 'gltfModel',
        path: '/models/trees/Old-tree/Old-tree-compressed.glb'
    },
    // Tree references — positions/rotations for tree instances
    {
        name: 'abedulTreeReferences',
        type: 'gltfModel',
        path: '/models/trees/Abedul-tree/Abedul-tree-references-compressed.glb'
    },
    {
        name: 'normalTreeReferences',
        type: 'gltfModel',
        path: '/models/trees/Normal-tree/Normal-tree-references-compressed.glb'
    },
    {
        name: 'oldTreeReferences',
        type: 'gltfModel',
        path: '/models/trees/Old-tree/Old-tree-references-compressed.glb'
    }
]
