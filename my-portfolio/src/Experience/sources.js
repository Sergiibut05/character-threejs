import * as THREE from 'three'

const colorTextureModifier = (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
}

const tiledColorTextureModifier = (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
}

const tiledLinearTextureModifier = (texture) => {
    texture.colorSpace = THREE.NoColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
}

/**
 * Each source can declare a `priority`:
 *   - 'critical'   (default) → must finish before "Explorar" enables.
 *                              The patio is unusable without these.
 *   - 'decorative'           → streamed in *after* the scene starts, so
 *                              they pop in over the first seconds of play.
 *
 * Bruno-Simon-style tiering: small critical batch unblocks the UI fast,
 * heavier decoration loads in parallel/behind it.
 */
const allSources = [
    // ─── Character / human ──────────────────────────────────────── critical
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

    // ─── Grass blade atlas ────────────────────────────────────────
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

    // ─── Flowers ──────────────────────────────────────────────────
    {
        name: 'flowerViolet',
        type: 'texture',
        path: '/texture/flowers/violet-flower.webp'
    },
    {
        name: 'flowerWhite',
        type: 'texture',
        path: '/texture/flowers/white-flower.webp'
    },
    {
        name: 'flowerYellow',
        type: 'texture',
        path: '/texture/flowers/yellow-flower.webp'
    },
    {
        name: 'flowerBlue',
        type: 'texture',
        path: '/texture/flowers/blue-flower.webp'
    },

    // ─── Atlas textures (shared by many props) ────────────────────
    {
        name: 'forestAtlas',
        type: 'textureKtx',
        path: '/texture/Atlas-textures/Forest_Atlas.ktx2',
        modifier: colorTextureModifier
    },
    {
        name: 'sushiAtlas',
        type: 'textureKtx',
        path: '/texture/Atlas-textures/Sushi_Atlas.ktx2',
        modifier: colorTextureModifier,
        priority: 'decorative'   // social-area + social-entrance
    },
    {
        name: 'tinyAtlas',
        type: 'textureKtx',
        path: '/texture/Atlas-textures/Tiny_Atlas.ktx2',
        modifier: colorTextureModifier,
        priority: 'decorative'
    },

    // ─── House ────────────────────────────────────────── decorative (pops in)
    {
        name: 'houseModel',
        type: 'gltfModel',
        path: '/models/house/house_compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'outsideHouseThingsModel',
        type: 'gltfModel',
        path: '/models/house/outside-house/outside-house-things-compressed.glb',
        priority: 'decorative'
    },

    // ─── Patio sub-models ─────────────────────────────────────────
    {
        name: 'floorModel',
        type: 'gltfModel',
        path: '/models/floor/floor-compressed.glb'
    },
    {
        name: 'grassFloor1Mask',
        type: 'textureKtx',
        path: '/models/floor/grass-floor-1.ktx2',
        modifier: (texture) => {
            texture.colorSpace = THREE.NoColorSpace
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping
            texture.flipY = false
        }
    },
    {
        name: 'grassFloor2Mask',
        type: 'textureKtx',
        path: '/models/floor/grass-floor-2.ktx2',
        modifier: (texture) => {
            texture.colorSpace = THREE.NoColorSpace
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping
            texture.flipY = false
        }
    },
    // 256×256 PNG copies of the masks for CPU-side sampling
    // (KTX2 textures can't be drawn on a 2D canvas).
    // Originals are 1024×1024 (~2.3 MB combined); these are ~150 kB total.
    // Generate them with `node tools/downsample-cpu-masks.mjs`.
    {
        name: 'grassFloor1MaskCpu',
        type: 'texture',
        path: '/models/floor/grass-floor-1-cpu.png'
    },
    {
        name: 'grassFloor2MaskCpu',
        type: 'texture',
        path: '/models/floor/grass-floor-2-cpu.png'
    },
    {
        name: 'slabsTexture',
        type: 'textureKtx',
        path: '/texture/slabs/slabs.ktx2',
        modifier: tiledLinearTextureModifier
    },
    {
        name: 'grassBordersModel',
        type: 'gltfModel',
        path: '/models/grass-borders/grass-borders-compressed.glb'
    },
    {
        name: 'riverModel',
        type: 'gltfModel',
        path: '/models/river/river-compressed.glb',
        priority: 'decorative'   // river shader is fancy but not critical
    },
    {
        name: 'bridgeModel',
        type: 'gltfModel',
        path: '/models/bridge/bridge-compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'wallsModel',
        type: 'gltfModel',
        path: '/models/walls/walls-compressed.glb'
    },
    {
        name: 'infoBoardModel',
        type: 'gltfModel',
        path: '/models/InfoBoard/InfoBoard-compressed.glb',
        priority: 'decorative'
    },
    // ─── Decoration props (load while the user already plays) ────── decorative
    {
        name: 'parkThingsModel',
        type: 'gltfModel',
        path: '/models/park-things/park-things-compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'parkRockModel',
        type: 'gltfModel',
        path: '/models/park-things/park-rock/park-rock-compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'parkRockInstances',
        type: 'json',
        path: '/models/park-things/park-rock/park-rock-references.json',
        priority: 'decorative'
    },
    {
        name: 'trunkModel',
        type: 'gltfModel',
        path: '/models/park-things/trunk/trunk-compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'trunkInstances',
        type: 'json',
        path: '/models/park-things/trunk/trunk-references.json',
        priority: 'decorative'
    },
    {
        name: 'postModel',
        type: 'gltfModel',
        path: '/models/posts/post-compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'postReferences',
        type: 'json',
        path: '/models/posts/post-references.json',
        priority: 'decorative'
    },
    {
        name: 'socialAreaModel',
        type: 'gltfModel',
        path: '/models/social-area/social-area-compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'socialEntranceModel',
        type: 'gltfModel',
        path: '/models/social-entrance/social-entrance-compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'socialTittleTexture',
        type: 'textureKtx',
        path: '/models/social-entrance/social-tittle-image.ktx2',
        modifier: (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping
            texture.minFilter = THREE.LinearMipMapLinearFilter
            texture.magFilter = THREE.LinearFilter
            texture.flipY = false
        },
        priority: 'decorative'
    },
    {
        name: 'baseballPitchModel',
        type: 'gltfModel',
        path: '/models/baseball-pitch/baseball-pitch-compressed.glb',
        priority: 'decorative'
    },
    {
        // Physical leaderboard by the pitch. Contains 'leaderboard' (structure,
        // Tiny atlas) + a plane named 'scoreboard' that ScoreboardScreen
        // auto-detects and paints with the live top-10 canvas.
        name: 'scoreboardModel',
        type: 'gltfModel',
        path: '/models/baseball-pitch/scoreboard-compressed.glb',
        priority: 'decorative'
    },
    {
        // 128px CPU-readable sand mask of the pitch texture (white = sand
        // diamond). Generated offline from the embedded webp; used by
        // BaseballPitch.isOnSand() so footprints only stamp on dirt/sand.
        name: 'pitchSandMaskCpu',
        type: 'texture',
        path: '/models/baseball-pitch/sand-mask-cpu.png',
        priority: 'decorative'
    },
    // ─── House interior (far-offset "island"; entered via the house door) ──
    {
        name: 'interiorModel',
        type: 'gltfModel',
        path: '/models/interior/interior-compressed.glb',
        priority: 'decorative'   // loads in the background; door gates on it
    },
    {
        // Objects with their own baked textures/colors (user-compressed).
        name: 'interiorSpecialModel',
        type: 'gltfModel',
        path: '/models/interior/interior-special-things-compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'blackCaveModel',
        type: 'gltfModel',
        path: '/models/black-cave/black-cave-compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'fenceModel',
        type: 'gltfModel',
        path: '/models/fence/fence-compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'fenceInstances',
        type: 'json',
        path: '/models/fence/fence_instances.json',
        priority: 'decorative'
    },
    {
        name: 'coblestoneModel',
        type: 'gltfModel',
        path: '/models/coblestone/coblestone-compressed.glb',
        priority: 'decorative'
    },
    {
        name: 'coblestoneInstances',
        type: 'json',
        path: '/models/coblestone/coblestone_instances.json',
        priority: 'decorative'
    },
    {
        name: 'collidersModel',
        type: 'gltfModel',
        path: '/models/collaiders/Collaiders-compressed.glb'
    },

    // ─── Activities / characters ──────────────────────────────────
    {
        // NOTE: loads the UNCOMPRESSED glb on purpose. This file is just an
        // empty marker node (the "Freesby-minigame-point" anchor, no mesh), and
        // Draco compression drops node-only glbs entirely — the compressed
        // sibling ends up with zero nodes, so the anchor would never resolve.
        // The raw file is < 1 KB, so there is nothing to gain from compressing.
        name: 'activitiesPointsModel',
        type: 'gltfModel',
        path: '/models/activities/activities-points.glb'
    },
    {
        name: 'frisbeeModel',
        type: 'gltfModel',
        path: '/models/frisbee/frisbee-draco.glb',
        priority: 'decorative'
    },
    {
        name: 'frisbeeTexture',
        type: 'textureKtx',
        path: '/models/frisbee/novea-texture.ktx2',
        priority: 'decorative',
        modifier: (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping
        }
    },
    {
        name: 'dogModel',
        type: 'gltfModel',
        path: '/models/dog/dog-draco.glb',
        priority: 'decorative'
    },
    {
        name: 'objectiveArrowTexture',
        type: 'texture',
        path: '/models/dog/dog-objective-sign.png',
        priority: 'decorative'
    },
    {
        name: 'checkTexture',
        type: 'texture',
        path: '/models/dog/check.png',
        priority: 'decorative'
    },

    // ─── Foliage SDF ──────────────────────────────────────────────
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

    // ─── Trees (visuals + Blender reference matrices) ────────────── critical
    // Loaded with the critical batch so World.setupTrees() has items when 'ready' fires.
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
    {
        name: 'abedulTreeReferences',
        type: 'json',
        path: '/models/trees/Abedul-tree/abedul-tree-references.json'
    },
    {
        name: 'normalTreeReferences',
        type: 'json',
        path: '/models/trees/Normal-tree/normal-tree-references.json'
    },
    {
        name: 'oldTreeReferences',
        type: 'json',
        path: '/models/trees/Old-tree/old-tree-references.json'
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
