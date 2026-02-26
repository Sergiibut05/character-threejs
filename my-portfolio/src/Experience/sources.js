import * as THREE from 'three'

export default [
    {
        name: 'humanModel',
        type: 'gltfModel',
        path: '/models/human/human-walk-draco.glb'
    },
    {
        name: 'grassAtlas',
        type: 'textureKtx',
        path: '/texture/grass/grass_clump.ktx2',
        modifier: (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping
            texture.minFilter = THREE.LinearMipMapLinearFilter
            texture.magFilter = THREE.LinearFilter
            texture.flipY = false
          }
    },
    {
        name: 'patioModel',
        type: 'gltfModel',
        path: '/models/Patio/patio-draco.glb'
    },
    // Foliage SDF texture fallback (PNG)
    {
        name: 'foliageTexture',
        type: 'textureKtx',
        path: '/texture/foliage/foliageSDF.ktx2',
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
