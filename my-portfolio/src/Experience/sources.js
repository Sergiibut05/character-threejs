import * as THREE from 'three'

const allSources = [
    {
        name: 'humanModel',
        type: 'gltfModel',
        path: '/models/human/human-walk-draco.glb'
    },
    {
        name: 'humanAtlas',
        type: 'textureKtx',
        path: '/models/human/human-atlas.ktx2',
        modifier: (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter
            texture.generateMipmaps = false
        }
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
    {
        name: 'activitiesPointsModel',
        type: 'gltfModel',
        path: '/models/activities/activities-points-compressed.glb'
    },
    {
        name: 'frisbeeModel',
        type: 'gltfModel',
        path: '/models/frisbee/frisbee-draco.glb'
    },
    {
        name: 'frisbeeTexture',
        type: 'textureKtx',
        path: '/models/frisbee/novea-texture.ktx2',
        modifier: (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping
        }
    },
    {
        name: 'dogModel',
        type: 'gltfModel',
        path: '/models/dog/dog-draco.glb'
    },
    {
        name: 'objectiveArrowTexture',
        type: 'texture',
        path: '/models/dog/dog-objective-sign.png'
    },
    {
        name: 'checkTexture',
        type: 'texture',
        path: '/models/dog/check.png'
    },
    {
        name: 'houseTexture',
        type: 'textureKtx',
        path: '/models/Patio/house-texture.ktx2',
        modifier: (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping
        }
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

const devLightMode = import.meta.env.VITE_DEV_LIGHT_MODE === 'true'

const devLightSources = allSources.filter((source) => {
    return source.name === 'humanModel' ||
        source.name === 'humanAtlas' ||
        source.name === 'activitiesPointsModel' ||
        source.name === 'frisbeeModel' ||
        source.name === 'frisbeeTexture' ||
        source.name === 'dogModel' ||
        source.name === 'objectiveArrowTexture' ||
        source.name === 'checkTexture'
})

export default devLightMode ? devLightSources : allSources
