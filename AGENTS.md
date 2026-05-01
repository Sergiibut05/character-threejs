# Three.js & Rapier3D Portfolio - Proyecto Animal Crossing

## Visión General

Este es un portfolio interactivo 3D desarrollado con **Three.js** y **Rapier3D**, inspirado en el estilo visual y de interacción del juego **Animal Crossing**. El proyecto busca crear una experiencia inmersiva y performante, combinando gráficos 3D, física realista y controles intuitivos.

### Objetivo Principal
Crear un mundo 3D explorable y jugable que demuestre habilidades en desarrollo web 3D, optimización de rendimiento y diseño de experiencias interactivas.

---

## Stack Tecnológico

### Core
- **Three.js** (v0.183.1): Librería de gráficos 3D basada en WebGL/WebGPU
- **Rapier3D** (v0.19.3): Motor de física 3D para JavaScript
- **Vite** (v6.2.2): Bundler moderno y dev server
- **Lil-gui** (v0.20.0): UI de depuración en tiempo real

### Rendering Backend
- **WebGPURenderer**: Motor de renderizado de bajo nivel con soporte para TSL (Three.js Shading Language)
- **WebGLRenderer Fallback**: Compatibilidad en navegadores sin WebGPU

### Utilidades
- **NippleJS**: Control analógico para móviles
- **Draco Compression**: Compresión de modelos glTF para optimización
- **Event Emitter Pattern**: Sistema de eventos personalizado

---

## Arquitectura del Proyecto

```
src/
├── script.js                          # Punto de entrada
├── Experience/
│   ├── Experience.js                  # Singleton principal - orquesta todo
│   ├── Camera.js                      # Cámara perspectiva con controles
│   ├── Renderer.js                    # WebGPU renderer con iris transition
│   ├── Utils/
│   │   ├── Debug.js                   # Panel lil-gui para debugging
│   │   ├── Time.js                    # Gestor de tiempo global
│   │   ├── Sizes.js                   # Responsive viewport management
│   │   ├── Quality.js                 # Configuración dinámica de calidad
│   │   ├── Resources.js               # Loader de modelos/texturas
│   │   ├── EventEmitter.js            # Sistema base de eventos
│   │   └── MobileControls.js          # Controles táctiles
│   └── World/
│       ├── World.js                   # Orquestador de elementos del mundo
│       ├── Ground.js                  # Terreno base
│       ├── GroundPerlin.js            # Terreno procedural con ruido Perlin
│       ├── Grass.js                   # Sistema de hierba optimizado
│       ├── Bushes.js                  # Arbustos del mundo
│       ├── Trees.js                   # Árboles del mundo
│       ├── Foliage.js                 # Sistema de follaje general
│       ├── Environment.js             # Cielo, iluminación, niebla
│       ├── Character.js               # Personaje del jugador
│       ├── DogCompanion.js            # Perro compañero interactivo
│       ├── Physics.js                 # Sistema de física con Rapier
│       ├── Raycaster.js               # Detección de intersecciones
│       ├── PatioScene.js              # Escena principal del patio
│       ├── Balloon.js                 # Globo volador interactivo
│       ├── FrisbeeMinigame.js         # Minijuego de frisbee
│       ├── FrisbeeFlightController.js # Simulación de vuelo del frisbee
│       ├── InteractiveObject.js       # Base para objetos interactivos
│       ├── ObjectiveMarker.js         # Marcadores de objetivos
│       ├── ActivityPrompt.js          # Prompts de actividades
│       ├── ScoreFeedback.js           # Retroalimentación de puntuación
│       ├── FakeShadow.js              # Sombras proyectadas planas
│       └── TSL/
│           ├── WaterShader.js         # Shader de agua con olas
│           ├── GroundShader.js        # Shader del terreno
│           ├── CloudShader.js         # Shader de nubes
│           └── NoiseNodes.js          # Funciones de ruido reutilizables
```

---

## Características Principales

### 1. Rendering Avanzado
- **WebGPU + TSL**: Shaders personalizados compilados a bajo nivel
- **Iris Transition**: Efecto de transición visual tipo Animal Crossing
- **Deferred Rendering Ready**: Arquitectura preparada para deferred rendering
- **Dynamic Quality**: Ajuste automático de calidad según rendimiento

### 2. Física Realista
- **Rapier3D**: Motor de física 3D de alto rendimiento
- **Character Controller**: Sistema de movimiento del personaje
- **Objetos Dinámicos**: Frisbee, globos con físicas simuladas
- **Colisiones**: Detección de colisiones optimizada

### 3. Sistema de Mundo
- **Terreno Procedural**: Generación con ruido Perlin
- **Vegetación Optimizada**: 
  - Hierba instanciada (millones de instancias)
  - LOD (Level of Detail) para árboles y arbustos
  - Foliage billboarding
- **Iluminación Dinámica**: Luces ambiente y direccionales
- **Atmosféricos**: Cielo, niebla, nubes animadas

### 4. Interactividad
- **Controles Dual**: Teclado/Ratón y táctiles
- **Minijuegos**: Frisbee, globos
- **Compañero IA**: Perro que sigue al jugador
- **Sistema de Puntuación**: Feedback en tiempo real
- **NippleJS**: Joystick analógico virtual para móviles

### 5. Optimización de Rendimiento
- **LOD (Level of Detail)**: Reducción de polígonos según distancia
- **Occlusion Culling**: Frustum culling
- **Instancing**: Renderizado de múltiples elementos iguales
- **Lazy Loading**: Carga asíncrona de recursos
- **Draco Compression**: Modelos comprimidos en glTF
- **Adaptive Rendering**: Ajuste dinámico de resolución y efectos

---

## Flujo de Inicialización

1. **script.js** → Crea instancia de `Experience`
2. **Experience Constructor** → Inicializa componentes base:
   - Debug panel
   - Quality settings
   - Viewport sizes
   - Scene (THREE.Scene)
   - Resources loader
   - Camera
   - Renderer
   - World
   - Mobile controls

3. **Renderer Initialization** → WebGPU backend setup
4. **Resources Loading** → Carga asíncrona de modelos/texturas
5. **Warm-up Render** → Compilación de shaders con 3 frames
6. **Iris Transition** → Efecto de apertura de iris
7. **Main Loop** → Update de cámara → World → Renderer

---

## Optimizaciones Clave

### Rendering
- **Shader Compilation**: Pre-compilación durante warm-up
- **Batch Rendering**: Instancing para objetos repetidos
- **Texture Atlasing**: Múltiples texturas en una sola
- **WebGPU TSL**: Shaders compilados a máquina virtual

### Physics
- **Sleeping Bodies**: Cuerpos inmóviles en sleep mode
- **Simplified Shapes**: Cajas/esferas para colisiones
- **Raycasting Optimizado**: Caché de raycast queries

### Memory
- **Resource Pooling**: Reutilización de geometrías/materiales
- **Garbage Collection**: Disposal correcto de geometrías
- **LOD Switching**: Reducción de memoria con distancia

### Mobile
- **Touch Optimization**: Eventos de toque comprimidos
- **Responsive Canvas**: Escalado automático
- **Radios Adaptativos**: Quality settings por dispositivo

---

## Estilo Visual: Animal Crossing

### Color Palette
- Tonos pastel suave (verdes, azules, amarillos)
- Bordes antialiasing mínimos
- Sin sombras duras (soft shadows)

### Geometría
- Formas redondeadas
- Modelos low-poly estilizados
- Proporción cartoonish

### Animaciones
- Movimiento fluido sin transiciones abruptas
- Bouncing natural (gravedad)
- Deformaciones suaves

---

## Sistema de Documentación Three.js

Cuando trabajemos con Three.js, se utiliza automáticamente la documentación incluida en `llms-full.txt` del proyecto. Este archivo contiene:

- Guías de uso de WebGLRenderer vs WebGPURenderer
- Patrones de TSL (Three.js Shading Language)
- Ejemplos completos de escenas 3D
- Best practices para optimización
- Configuración de import maps modernos

**Referencia**: `@my-portfolio/llms-full.txt`

---

## Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo local (localhost:8080)
npm run dev

# Producción (build optimizado)
npm run build

# Debugging en UI
# Abre el panel lil-gui en la esquina superior derecha
```

---

## Métricas de Rendimiento

El proyecto busca mantener:
- **60 FPS** en dispositivos de escritorio
- **30+ FPS** en dispositivos móviles
- **< 1.5 MB** bundle size (comprimido)
- **< 100 ms** tiempo de carga inicial

---

## Áreas de Mejora Futuras

1. **Audio**: Sistema de sonido ambiental
2. **NPCs**: Personajes no jugadores con IA
3. **Persistencia**: LocalStorage de progreso
4. **Multiplayer**: WebSocket para juego compartido
5. **Mobile VR**: Compatibilidad con WebXR
6. **Asset Store**: Sistema de customización del mundo

---

## Contacto & Contribuciones

Este portfolio es una demostración de habilidades en:
- Desarrollo de gráficos web 3D
- Optimización de rendimiento
- Arquitectura de proyectos escalables
- UI/UX en entornos 3D
