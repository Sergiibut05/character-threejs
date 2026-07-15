# Portfolio 3D Animal Crossing - Arquitectura & Estándares

## Descripción del Proyecto

Portfolio 3D interactivo con **Three.js** + **Rapier3D**, inspirado en **Animal Crossing**. El objetivo es crear una experiencia lo más óptima posible en rendimiento, calidad visual y experiencia de usuario.

## Arquitectura Core

### Experience Singleton Pattern
```javascript
// src/Experience/Experience.js
class Experience {
  constructor(canvas) {
    if (instance) return instance;
    instance = this;
    // Orchestrates: Debug, Quality, Sizes, Time, Scene, Resources, Camera, Renderer, World
  }
}
```

El `Experience` es el singleton central que orquesta todos los componentes. Todos los sub-sistemas se comunican a través de él.

### Componentes Base

1. **Time (src/Experience/Utils/Time.js)**
   - Global ticker usando `requestAnimationFrame`
   - Emite eventos 'tick' a ~60 FPS
   - Sincroniza física, animaciones y render

2. **Sizes (src/Experience/Utils/Sizes.js)**
   - Maneja redimensionamiento responsivo
   - Recalcula aspect ratio de cámara
   - Emite 'resize' para reescalado de canvas

3. **Quality (src/Experience/Utils/Quality.js)**
   - Ajusta dinámicamente LOD, resolución, efectos
   - Adapta rendimiento según FPS
   - Aplica settings por dispositivo

4. **Resources (src/Experience/Utils/Resources.js)**
   - Carga asíncrona de modelos glTF (.glb, .gltf)
   - Compresión Draco
   - Tracking de progreso para loading bar

5. **Renderer (src/Experience/Renderer.js)**
   - WebGPURenderer con fallback a WebGLRenderer
   - Iris transition effect (Animal Crossing style)
   - Post-processing hooks

6. **Camera (src/Experience/Camera.js)**
   - PerspectiveCamera con controles
   - Sigue el personaje del jugador
   - Frustum culling automático

## Optimización para Rendimiento

### Rendering Pipeline

```
Frame:
  1. Update Time
  2. Update Sizes
  3. Update Camera (follow player)
  4. Update World (physics, animations, LOD)
  5. Update Renderer (render + post-processing)
```

### Técnicas de Optimización Aplicadas

1. **Instancing**
   - Grass: Millones de instancias renderizadas en 1 draw call
   - Trees, Bushes: Instanced meshes con matriz de transformaciones

2. **LOD (Level of Detail)**
   - Árboles: High-poly cerca, low-poly lejos
   - Terreno: Resolución adaptativa
   - Objetos dinámicos: Deshabilitados fuera de vista

3. **Shader Optimization**
   - Shaders compilados a TSL (Three.js Shading Language)
   - Compiled to native WebGPU kernels
   - Sin branching innecesario
   - Precisión: Usar `mediump` en móviles si es posible

4. **Culling Strategies**
   - **Frustum Culling**: THREE.Frustum
   - **Occlusion Culling**: Marcar objetos "occluded" como invisible
   - **Distance Culling**: Desactivar objetos lejanos

5. **Memory Management**
   - Dispose de geometrías/materiales no usados
   - Resource pooling: Reutilizar meshes
   - Lazy loading de texturas

### Physics Optimization (Rapier3D)

- Bodies inactivos en "sleep" state
- Simplified collision shapes (box, sphere, capsule)
- Broadphase: AABB tree optimization
- Narrow phase: SAT algorithm

## Estética Animal Crossing

### Paleta de Colores
- Tonos pastel: Verdes suave (0x8BC34A), Azules cielo (0x87CEEB)
- Sin colores saturados
- Iluminación suave sin sombras duras

### Geometría
- Formas redondeadas (chamfered edges)
- Low-poly estilizado
- Proporciones cartoonish (cabeza grande, cuerpo compacto)

### Movimiento
- Animaciones fluidas y suaves
- Bounce físico realista
- Transiciones sin cutouts abruptos
- Delay en key poses (anticipation, recovery)

### UI
- Menús con estilo documento/carta
- Tonos acordes a la paleta
- Iconografía simple y clara

## Comunicación Entre Componentes

### Event Emitter Pattern
```javascript
class EventEmitter {
  on(event, callback) { /* ... */ }
  off(event, callback) { /* ... */ }
  emit(event, ...args) { /* ... */ }
}

this.time.on('tick', () => this.update());
this.sizes.on('resize', () => this.resize());
```

### Direct Reference Pattern
```javascript
const experience = window.experience;
experience.scene.add(mesh);
experience.renderer.setIrisTransitionSize(0.5);
```

## Estructura de Carpetas

```
src/
├── script.js                    # Entry point
├── Experience/
│   ├── Experience.js            # Singleton orchestrator
│   ├── Camera.js
│   ├── Renderer.js
│   ├── Utils/                   # Core utilities
│   │   ├── Debug.js
│   │   ├── Time.js
│   │   ├── Sizes.js
│   │   ├── Quality.js
│   │   ├── Resources.js
│   │   ├── EventEmitter.js
│   │   └── MobileControls.js
│   └── World/                   # Game world systems
│       ├── World.js             # World orchestrator
│       ├── Ground.js
│       ├── Grass.js
│       ├── Trees.js
│       ├── Environment.js
│       ├── Character.js
│       ├── Physics.js
│       ├── TSL/                 # Shaders WebGPU
│       │   ├── WaterShader.js
│       │   ├── GroundShader.js
│       │   └── NoiseNodes.js
│       └── Minigames/
│           └── FrisbeeMinigame.js
```

## Performance Targets

- **Desktop**: 60 FPS, 1080p
- **Tablet**: 30+ FPS, 720p
- **Mobile**: 30 FPS, 360p adaptive
- **Bundle**: < 1.5 MB gzipped
- **Initial Load**: < 2 seconds

---

# Three.js & WebGPU/TSL Guide

## Import Maps & Setup

Always use modern import maps pattern, NOT outdated CDN patterns:

```javascript
// ✅ CORRECT
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ❌ WRONG
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
```

## Renderer Selection

- **WebGLRenderer**: Maximum compatibility (default, mature backend)
- **WebGPURenderer**: Use for custom shaders, TSL, compute shaders, advanced materials

This project uses **WebGPURenderer**.

## TSL (Three.js Shading Language)

When using WebGPURenderer, use TSL instead of raw GLSL:

```javascript
// ✅ Use TSL nodes
import { texture, uv, color, time } from 'three/tsl';
const material = new THREE.MeshStandardNodeMaterial();
material.colorNode = texture(myTexture).mul(color(0xff0000));

// ❌ Don't use raw GLSL strings
material.onBeforeCompile = (shader) => { /* string manipulation */ }
```

## Node Material Classes (for WebGPU/TSL)

- `MeshBasicNodeMaterial`
- `MeshStandardNodeMaterial`
- `MeshPhysicalNodeMaterial`
- `LineBasicNodeMaterial`
- `SpriteNodeMaterial`

## Shader Files Reference

- Water shader: `src/Experience/World/TSL/WaterShader.js`
- Ground shader: `src/Experience/World/TSL/GroundShader.js`
- Cloud shader: `src/Experience/World/TSL/CloudShader.js`
- Noise utilities: `src/Experience/World/TSL/NoiseNodes.js`

Always check `llms-full.txt` for complete Three.js examples and API documentation.

---

# Performance Optimization Checklist

When adding new features or modifying existing code, verify:

### Rendering
- [ ] Using instancing for repeated objects (not individual meshes)
- [ ] LOD system enabled for complex geometry
- [ ] Shaders compiled to TSL, not raw GLSL
- [ ] Unnecessary draw calls eliminated
- [ ] Textures atlased or compressed with Draco
- [ ] Fog/bloom effects limited to visible area

### Physics
- [ ] Collision shapes simplified (box/sphere, not mesh)
- [ ] Sleeping bodies properly configured
- [ ] Raycast queries cached/throttled
- [ ] Physics update rate synchronized with render

### Memory
- [ ] Disposed geometries/materials on cleanup
- [ ] No memory leaks from event listeners
- [ ] Texture atlasing to reduce VRAM usage
- [ ] Resource pooling for frequently created objects

### Mobile Specific
- [ ] Quality settings adapted for low-end devices
- [ ] Touch events debounced/throttled
- [ ] Canvas resolution adaptive
- [ ] No memory spike from resource loading

## Common Patterns

### Instancing (Grass, Trees)
```javascript
// ✅ CORRECT
const instancedMesh = new THREE.InstancedMesh(geometry, material, count);

// ❌ WRONG
for (let i = 0; i < count; i++) {
  scene.add(new THREE.Mesh(geometry, material));
}
```

### Terrain LOD
```javascript
const distance = camera.position.distanceTo(terrainPosition);
if (distance < 50) terrain.setDetail('high');
else if (distance < 200) terrain.setDetail('medium');
else terrain.setDetail('low');
```

### Shader Optimization
```javascript
// ✅ EFFICIENT
const colorNode = texture(baseMap).mul(color(diffuse));

// ❌ INEFFICIENT - Multiple samples
const final = texture(map1).mul(texture(map2)).add(texture(map3));
```

### Physics Bodies
```javascript
// ✅ CORRECT - Sleeping, simple shapes
const body = world.createRigidBody(RigidBodyDesc.fixed());
const shape = ColliderDesc.box(1, 1, 1);
body.sleep();

// ❌ WRONG - Complex mesh collider, always active
const collider = ColliderDesc.trimesh(vertices, indices);
```

## Adaptive Quality System

The project uses `Quality.js` to automatically scale:

```javascript
if (avgFps < 30) quality.decrease();
else if (avgFps > 50) quality.increase();
```

Settings adjusted:
1. **Shadow Resolution**: 512px → 256px
2. **Particle Count**: 100% → 50% → 25%
3. **LOD Distances**: Increased (objects disappear sooner)
4. **Bloom**: Off → Quarter resolution → Full
5. **Canvas Resolution**: Full → 3/4 → 1/2

## Performance Targets by Device

- **High-end Desktop** (RTX 3080): 144 FPS
- **Mid-range Desktop** (RTX 2070): 60 FPS
- **Low-end Laptop** (Intel UHD): 30 FPS
- **Tablet** (iPad Pro): 60 FPS
- **Mobile** (iPhone 15): 30 FPS
- **Old Mobile** (iPhone 12): 20 FPS

## Mobile-Specific Optimizations

```javascript
// Touch throttling
let lastTouchTime = 0;
canvas.addEventListener('touchmove', (e) => {
  const now = Date.now();
  if (now - lastTouchTime < 16) return;
  lastTouchTime = now;
});

// Pause when hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) renderer.setAnimationLoop(null);
  else renderer.setAnimationLoop(animate);
});
```

## Debugging

```javascript
// Access lil-gui panel from console
window.experience.debug.ui.open();
```
