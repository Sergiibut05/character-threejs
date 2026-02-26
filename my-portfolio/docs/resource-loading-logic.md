# Resource Loading Logic

## Overview

The resource system loads all models, textures, and compressed assets before the experience starts. It supports standard textures, GLTF models (with Draco compression), and KTX2 compressed textures (with Basis Universal transcoding).

## Architecture

```
Experience.js
  |
  |-- new Resources(sources)       // starts non-KTX loading immediately
  |-- new Renderer()
  |-- renderer.init()              // async, initializes WebGPU/WebGL backend
  |       |
  |       +-- resources.setRenderer(renderer)  // enables KTX2Loader, loads deferred KTX sources
  |
  |-- resources.on('ready')        // fires when ALL sources (including deferred) are loaded
          |
          +-- World builds trees, foliage, etc. using resources.items
```

## Files & Responsibilities

| File | Role |
|------|------|
| `Experience/sources.js` | Declares all resources as an array of `{ name, type, path, modifier? }` |
| `Experience/Utils/Resources.js` | Manages loader instances, caching, progress events, and deferred KTX loading |
| `Experience/Experience.js` | Wires up the loading flow, calls `resources.setRenderer()` after renderer init |

## Resource Types

| `type` value | Loader used | Notes |
|--------------|-------------|-------|
| `gltfModel` | `GLTFLoader` + `DRACOLoader` | Supports Draco-compressed `.glb` files |
| `texture` | `THREE.TextureLoader` | Standard image textures (PNG, JPG) |
| `textureKtx` | `KTX2Loader` | Requires Basis transcoder files in `/basis/` and renderer to be initialized |
| `cubeTexture` | `THREE.CubeTextureLoader` | Environment cube maps |

## Adding a New Resource

1. **Add the file** to `static/` in the appropriate subdirectory.
2. **Register it** in `sources.js`:
   ```js
   {
       name: 'myNewModel',         // key used in resources.items
       type: 'gltfModel',          // one of: gltfModel, texture, textureKtx, cubeTexture
       path: '/models/my-model.glb'
   }
   ```
3. **Access it** in any class after `resources.on('ready')`:
   ```js
   const gltf = this.resources.items.myNewModel
   ```

### Adding KTX2 Textures

KTX2 textures are deferred until the renderer is ready. Use `type: 'textureKtx'` and optionally add a `modifier` function to configure filtering:

```js
{
    name: 'myKtxTexture',
    type: 'textureKtx',
    path: '/texture/my-texture.ktx',
    modifier: (tex) => {
        tex.minFilter = THREE.NearestFilter
        tex.magFilter = THREE.NearestFilter
        tex.generateMipmaps = false
    }
}
```

## Caching

`Resources.js` maintains a `Map` keyed by `source.path`. If two entries share the same path, the second resolves instantly from cache. This avoids duplicate network requests for shared assets.

## DRACO & KTX2 Dependencies

- **Draco decoder**: WASM files served from `/draco/` (already in `static/draco/`).
- **Basis transcoder**: WASM + JS files served from `/basis/` (in `static/basis/`). Required for any `textureKtx` resource. These files are copied from `folio-2025-main/static/basis/` (originally from Three.js `examples/jsm/libs/basis/`).

## Loading Flow Diagram

```
┌────────────────────┐
│   sources.js       │  Array of { name, type, path }
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Resources(sources) │  Creates loaders, starts loading non-KTX immediately
│                    │  KTX sources → deferredSources[]
└────────┬───────────┘
         │
         │  (renderer.init() completes)
         │
         ▼
┌────────────────────┐
│  setRenderer()     │  Creates KTX2Loader, detectSupport(), loads deferred KTX
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  'ready' event     │  All sources loaded → World can initialize
└────────────────────┘
```
