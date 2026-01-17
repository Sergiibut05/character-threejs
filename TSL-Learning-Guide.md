# Guía Completa de Aprendizaje: TSL (Three.js Shading Language)

> **Una guía práctica para aprender TSL analizando el proyecto folio-2025**

---

## 📚 Tabla de Contenidos

1. [Introducción a TSL](#introducción-a-tsl)
2. [Fundamentos: Conceptos Básicos](#fundamentos-conceptos-básicos)
3. [Sintaxis y Operaciones](#sintaxis-y-operaciones)
4. [Estructura de un Proyecto TSL](#estructura-de-un-proyecto-tsl)
5. [Patrones Avanzados](#patrones-avanzados)
6. [Ejemplos Prácticos del Proyecto](#ejemplos-prácticos-del-proyecto)
7. [Migración de GLSL a TSL](#migración-de-glsl-a-tsl)
8. [Mejores Prácticas](#mejores-prácticas)

---

## Introducción a TSL

### ¿Qué es TSL?

**TSL (Three.js Shading Language)** es un sistema de nodos que permite crear shaders usando JavaScript en lugar de escribir GLSL directamente. Es parte de Three.js r160+ y requiere WebGPU.

### ¿Por qué TSL?

**Ventajas:**
- ✅ **Todo en JavaScript**: No necesitas archivos `.glsl` separados
- ✅ **Type-safe**: Mejor autocompletado y detección de errores
- ✅ **Modular**: Funciones reutilizables fácilmente
- ✅ **Dinámico**: Construcción programática de shaders
- ✅ **Mantenible**: Código más legible y organizado

**Desventajas:**
- ⚠️ Requiere WebGPU (no funciona en WebGL)
- ⚠️ API en desarrollo (puede cambiar)
- ⚠️ Curva de aprendizaje si vienes de GLSL

### ¿Es difícil de aprender?

**Respuesta:** No es muy difícil si ya conoces GLSL. La curva de aprendizaje es moderada:

- **Si sabes GLSL**: TSL es principalmente una sintaxis diferente para los mismos conceptos
- **Si no sabes GLSL**: Aprende primero los conceptos básicos de shaders, luego TSL será más fácil

---

## Fundamentos: Conceptos Básicos

### 1. Imports Básicos

```javascript
import { 
    // Tipos básicos
    float, vec2, vec3, vec4, color,
    
    // Funciones principales
    Fn, uniform, mix, smoothstep, step,
    
    // Variables built-in del shader
    positionWorld, normalWorld, uv,
    positionLocal, normalLocal, positionGeometry,
    
    // Operaciones
    texture, sin, cos, length, dot, clamp,
    
    // Para compute shaders
    instancedArray, instanceIndex,
    
    // Para attributes y varyings
    attribute, varying
} from 'three/tsl'
```

### 2. Uniforms - Valores Dinámicos

Los **uniforms** son valores que puedes cambiar desde JavaScript en tiempo de ejecución.

```javascript
// Crear uniforms
this.strength = uniform(0.5)                    // float
this.myColor = uniform(color(0xff0000))         // color
this.direction = uniform(vec2(1.0, 0.5))       // vec2
this.position = uniform(vec3(0, 1, 0))         // vec3

// Acceder y modificar valores
this.strength.value = 0.8
this.myColor.value.setHex(0x00ff00)
this.direction.value.set(0.3, 0.7)
```

**Ejemplo del proyecto (Wind.js):**
```javascript
this.direction = uniform(vec2(
    Math.sin(this.angle),
    Math.cos(this.angle)
))
this.strength = uniform(0.5)
this.localTime = uniform(0)
```

### 3. Funciones (Fn) - El Corazón de TSL

Las funciones TSL se crean con `Fn()`. Pueden ser:
- **Sin parámetros**: `Fn(() => { return value })()`
- **Con parámetros**: `Fn(([param1, param2]) => { return value })`

```javascript
// Función simple
const myNode = Fn(() => {
    return vec3(1, 0, 0)
})()

// Función con parámetros
const mixColors = Fn(([colorA, colorB, t]) => {
    return mix(colorA, colorB, t)
})

// Usar la función
const result = mixColors(color1, color2, 0.5)
```

**Ejemplo del proyecto (Foliage.js):**
```javascript
const alphaNode = Fn(() => {
    let alpha = float(1)
    
    // Leer textura
    alpha.assign(texture(this.game.resources.foliageTexture).r)
    
    // Restar threshold
    alpha.subAssign(this.material.threshold)
    
    return alpha
})()
```

### 4. Variables Locales (toVar)

Para crear variables que puedes modificar dentro de una función:

```javascript
// Crear variable mutable
const myVar = float(0).toVar()
const myVec = vec3(0).toVar()

// Asignar valores
myVar.assign(1.0)
myVec.assign(vec3(1, 2, 3))

// Operaciones de asignación
myVar.addAssign(0.5)      // myVar += 0.5
myVar.mulAssign(2.0)      // myVar *= 2.0
myVar.subAssign(0.1)      // myVar -= 0.1
```

**Ejemplo del proyecto (MeshDefaultMaterial.js):**
```javascript
const baseColor = this._colorNode.toVar()
const outputColor = this._colorNode.toVar()
outputColor.mulAssign(this.game.lighting.colorUniform)
```

### 5. Attributes - Datos de la Geometría

Los **attributes** son datos que vienen de la geometría (posición, UV, normales, etc.).

```javascript
// Leer attribute
const position = attribute('position')      // vec3
const uvCoords = attribute('uv')           // vec2
const customData = attribute('heightRandomness')  // float

// Ejemplo del proyecto (Grass.js):
const position = attribute('position')
const heightRandomness = attribute('heightRandomness')
```

### 6. Varyings - Variables entre Vertex y Fragment

Los **varyings** pasan datos del vertex shader al fragment shader.

```javascript
// Crear varying
const myVarying = varying(vec2())
const tipness = varying(float(0))

// Asignar en vertex shader
myVarying.assign(someValue)

// Usar en fragment shader
const value = myVarying
```

**Ejemplo del proyecto (Grass.js):**
```javascript
const vertexLoopIndex = varying(vertexIndex.toFloat().mod(3))
const tipness = varying(step(vertexLoopIndex, 0.5))
const wind = varying(vec2())
```

---

## Sintaxis y Operaciones

### Operaciones Matemáticas

TSL usa **método chaining** (encadenamiento de métodos):

```javascript
// En GLSL: position.x * 0.5 + time
// En TSL:
position.x.mul(0.5).add(time)

// En GLSL: clamp(value, 0, 1)
// En TSL:
value.clamp(0, 1)

// En GLSL: smoothstep(0, 1, t)
// En TSL:
t.smoothstep(0, 1)

// En GLSL: mix(a, b, t)
// En TSL:
mix(a, b, t)
// O:
a.mix(b, t)
```

### Operaciones Comunes

```javascript
// Aritméticas
value.add(other)           // +
value.sub(other)           // -
value.mul(other)           // *
value.div(other)           // /
value.mod(other)           // %

// Comparaciones
value.greaterThan(other)   // >
value.lessThan(other)      // <
value.equal(other)       // ==

// Funciones matemáticas
value.abs()                // abs()
value.floor()              // floor()
value.ceil()               // ceil()
value.fract()              // fract()
value.pow(exponent)        // pow()
value.sqrt()               // sqrt()
value.sin()                // sin()
value.cos()                // cos()
value.atan()               // atan()

// Vectoriales
vec.length()               // length()
vec.normalize()            // normalize()
vec1.dot(vec2)             // dot()
vec1.cross(vec2)           // cross()

// Utilidades
value.clamp(min, max)      // clamp()
value.smoothstep(edge0, edge1)  // smoothstep()
value.step(edge)          // step()
value.oneMinus()           // 1.0 - value
value.select(a, b)         // condition ? a : b
```

### Acceso a Componentes

```javascript
// Vec2
vec2.xy                    // swizzling
vec2.x, vec2.y

// Vec3
vec3.xyz, vec3.xy, vec3.xz
vec3.x, vec3.y, vec3.z
vec3.rgb, vec3.rg

// Vec4
vec4.xyzw, vec4.rgba
vec4.x, vec4.y, vec4.z, vec4.w
```

**Ejemplo del proyecto:**
```javascript
// Foliage.js línea 144
const wind = this.game.wind.offsetNode(positionLocal.xz)  // Usa .xz
return positionLocal.add(vec3(wind.x, 0, wind.y))         // Accede a .x y .y
```

### Condicionales

```javascript
// If simple
If(condition, () => {
    // código si es verdadero
})

// If con else (usando select)
const result = condition.select(valueIfTrue, valueIfFalse)

// Ejemplo del proyecto (MeshDefaultMaterial.js):
If(frontFacing.not(), () => {
    reorientedNormal.mulAssign(-1)
})
```

### Texturas

```javascript
// Leer textura
const texColor = texture(myTexture, uv).rgb
const texValue = texture(myTexture, uv).r      // Solo canal rojo
const texData = texture(myTexture, uv)         // Vec4 completo

// Ejemplo del proyecto (Foliage.js):
const foliageSDF = texture(this.game.resources.foliageTexture).r
```

---

## Estructura de un Proyecto TSL

### Patrón General del Proyecto

El proyecto sigue una estructura muy clara:

```
Game/
├── Materials/              # Materiales base reutilizables
│   ├── MeshDefaultMaterial.js
│   └── MeshGridMaterial.js
├── World/                 # Elementos del mundo (cada uno es una clase)
│   ├── Foliage.js
│   ├── Leaves.js
│   ├── Grass.js
│   ├── WaterSurface.js
│   └── ...
├── Wind.js               # Sistemas globales
├── Terrain.js
├── Lighting.js
└── ...
```

### Estructura de una Clase Típica

Cada elemento del mundo sigue este patrón:

```javascript
export class MiElemento
{
    constructor()
    {
        this.game = Game.getInstance()
        
        // 1. Setup inicial
        this.setGeometry()
        this.setMaterial()      // Aquí va toda la lógica TSL
        this.setMesh()
        
        // 2. Update loop
        this.game.ticker.events.on('tick', () => {
            this.update()
        })
    }
    
    setGeometry()
    {
        // Geometría Three.js normal
        this.geometry = new THREE.PlaneGeometry(1, 1)
    }
    
    setMaterial()
    {
        // TODO: Lógica TSL aquí
    }
    
    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.game.scene.add(this.mesh)
    }
    
    update()
    {
        // Actualizar uniforms si es necesario
    }
}
```

### Patrón 1: Material Simple

```javascript
setMaterial()
{
    // 1. Crear uniforms
    this.material.threshold = uniform(0.3)
    this.material.strength = uniform(0.5)
    
    // 2. Crear nodos con Fn
    const colorNode = Fn(() => {
        return color(0x00ff00)
    })()
    
    const alphaNode = Fn(() => {
        let alpha = float(1)
        alpha.assign(texture(texture, uv()).r)
        alpha.subAssign(this.material.threshold)
        return alpha
    })()
    
    // 3. Crear material base
    this.material.instance = new MeshDefaultMaterial({
        colorNode: colorNode,
        alphaNode: alphaNode,
        transparent: true
    })
}
```

### Patrón 2: Material con Position Node

Para modificar la posición de los vértices:

```javascript
setMaterial()
{
    // ... crear material ...
    
    // Modificar positionNode
    this.material.instance.positionNode = Fn(() => {
        // Obtener offset de viento
        const wind = this.game.wind.offsetNode(positionLocal.xz)
        
        // Multiplicador basado en altura
        const multiplier = positionLocal.y.clamp(0, 1)
        
        // Aplicar offset
        return positionLocal.add(
            vec3(wind.x, 0, wind.y).mul(multiplier)
        )
    })()
}
```

**Ejemplo del proyecto (Foliage.js líneas 147-152):**
```javascript
this.material.instance.positionNode = Fn(({ object }) => {
    // Para instanced rendering
    instance(object.count, this.instanceMatrix).toStack()
    
    const wind = this.game.wind.offsetNode(positionLocal.xz)
    const multiplier = positionLocal.y.clamp(0, 1).mul(1)
    
    return positionLocal.add(vec3(wind.x, 0, wind.y).mul(multiplier))
})()
```

---

## Patrones Avanzados

### Patrón 1: Sistema de Viento Reutilizable

**Wind.js** crea un nodo reutilizable que otros materiales pueden usar:

```javascript
// En Wind.js
this.offsetNode = Fn(([position]) => {
    // Calcular UV para noise
    const noiseUv = position.mul(this.positionFrequency)
        .add(this.direction.mul(this.localTime))
    
    // Leer noise (dos octavas para más detalle)
    const noise1 = texture(this.game.noises.perlin, noiseUv.mul(0.2))
        .r.sub(0.5)
    const noise2 = texture(this.game.noises.perlin, noiseUv.mul(0.1))
        .r.sub(0.5)
    
    // Combinar
    const intensity = noise2.add(noise1)
    
    // Aplicar dirección y fuerza
    return vec2(
        this.direction.mul(intensity).mul(this.strength)
    )
})

// Usar en otros materiales (Foliage.js):
const wind = this.game.wind.offsetNode(positionLocal.xz)
const offset = vec3(wind.x, 0, wind.y).mul(heightFactor)
return positionLocal.add(offset)
```

### Patrón 2: Funciones Helper Reutilizables

**MeshGridMaterial.js** muestra cómo crear funciones fuera de la clase:

```javascript
// Funciones helper (fuera de la clase)
const toMask = Fn(([normal]) => {
    const vecX = vec3(1, 0, 0)
    const vecY = vec3(0, 1, 0)
    const vecZ = vec3(0, 0, 1)
    
    const dotX = normal.dot(vecX).abs()
    const dotY = normal.dot(vecY).abs()
    const dotZ = normal.dot(vecZ).abs()
    
    let mask = vecX
    If(dotZ.greaterThan(dotX), () => {
        mask.assign(vecZ)
    })
    If(dotY.greaterThan(dotX).and(dotY.greaterThan(dotZ)), () => {
        mask.assign(vecY)
    })
    
    return mask
})

// Usar en el material
class MeshGridMaterial extends NodeMaterial {
    constructor() {
        const mask = toMask(normalWorld)
        // ... usar mask ...
    }
}
```

### Patrón 3: Compute Shaders (Sistema de Partículas)

Para sistemas con física (como Leaves.js):

```javascript
setMaterial()
{
    // 1. Crear buffers
    this.positionBuffer = instancedArray(this.count, 'vec3')
    this.velocityBuffer = instancedArray(this.count, 'vec3')
    
    // 2. Crear función de update
    const update = Fn(() => {
        const position = this.positionBuffer.element(instanceIndex)
        const velocity = this.velocityBuffer.element(instanceIndex)
        const weight = weightBuffer.element(instanceIndex)
        
        // Física aquí
        // Viento
        const noiseUv = position.xz.mul(this.windFrequency)
            .add(this.game.wind.direction.mul(this.game.wind.localTime))
        const noise = texture(this.game.noises.perlin, noiseUv).r
        const windStrength = this.game.wind.strength
            .sub(noise)
            .mul(weight)
            .mul(this.windMultiplier)
            .max(0)
        velocity.x.addAssign(this.game.wind.direction.x.mul(windStrength))
        velocity.z.addAssign(this.game.wind.direction.y.mul(windStrength))
        
        // Gravedad
        velocity.y = velocity.y.sub(this.gravity.mul(weight))
        
        // Aplicar velocidad
        position.addAssign(velocity.mul(this.game.ticker.deltaScaledUniform))
        
        return position
    })()
    
    // 3. Crear compute shader
    this.updateCompute = update.compute(this.count)
}

update()
{
    // 4. Ejecutar cada frame
    this.game.rendering.renderer.computeAsync(this.updateCompute)
}
```

### Patrón 4: Nodos Anidados y Reutilización

**Terrain.js** muestra cómo crear nodos que otros sistemas pueden usar:

```javascript
// En Terrain.js
this.terrainNode = Fn(([position]) => {
    const textureUv = worldPositionToUvNode(position)
    const data = texture(this.game.resources.terrainTexture, textureUv)
    
    // Procesar datos
    // ...
    
    return data  // Retorna datos del terreno
})

this.colorNode = Fn(([terrainData]) => {
    const baseColor = texture(this.gradientTexture, vec2(0, terrainData.b.oneMinus()))
    baseColor.assign(mix(baseColor, this.grassColorUniform, terrainData.g))
    return baseColor.rgb
})

// Usar en otros materiales (Grass.js):
const terrainData = this.game.terrain.terrainNode(bladePosition)
const color = this.game.terrain.colorNode(terrainData)
```

---

## Ejemplos Prácticos del Proyecto

### Ejemplo 1: Alpha con Threshold (Foliage.js)

```javascript
const alphaNode = Fn(() => {
    let alpha = float(1)
    
    // Leer textura
    alpha.assign(texture(this.game.resources.foliageTexture).r)
    
    // Restar threshold (técnica para bordes limpios)
    // Valores por debajo del threshold se vuelven negativos
    alpha.subAssign(this.material.threshold)
    
    return alpha
})()
```

**Explicación:** Esta técnica crea bordes más limpios en alpha maps. Al restar el threshold, los valores bajos se vuelven negativos y luego se descartan.

### Ejemplo 2: Mix de Colores con Iluminación (Foliage.js)

```javascript
const colorNode = Fn(() => {
    // Calcular mix basado en iluminación
    // dot product entre normal y dirección de luz
    const mixStrength = normalWorld
        .dot(this.game.lighting.directionUniform)
        .smoothstep(0, 1)  // Suavizar transición
    
    // Mezclar colores
    return mix(this.colorANode, this.colorBNode, mixStrength)
})()
```

**Explicación:** Mezcla dos colores basándose en cómo la superficie está orientada respecto a la luz.

### Ejemplo 3: Viento con Noise Multi-octava (Wind.js)

```javascript
this.offsetNode = Fn(([position]) => {
    // Calcular UV para noise
    const noiseUv = position.mul(this.positionFrequency)
        .add(this.direction.mul(this.localTime))
    
    // Leer noise en dos escalas diferentes (octavas)
    const noise1 = texture(this.game.noises.perlin, noiseUv.mul(0.2))
        .r.sub(0.5)  // Centrar en 0
    const noise2 = texture(this.game.noises.perlin, noiseUv.mul(0.1))
        .r.sub(0.5)
    
    // Combinar (suma de octavas)
    const intensity = noise2.add(noise1)
    
    // Aplicar dirección y fuerza
    return vec2(
        this.direction.mul(intensity).mul(this.strength)
    )
})
```

**Explicación:** Usa dos octavas de noise para crear movimiento más natural y detallado.

### Ejemplo 4: Grass con Rotación hacia Cámara (Grass.js)

```javascript
this.material.positionNode = Fn(() => {
    // Posición de la hoja
    const position = attribute('position')
    const position3 = vec3(position.x, 0, position.y)
    
    // Calcular ángulo hacia la cámara
    const worldPosition = modelWorldMatrix.mul(position3)
    const angleToCamera = atan(
        worldPosition.z.sub(cameraPosition.z),
        worldPosition.x.sub(cameraPosition.x)
    ).add(-Math.PI * 0.5)
    
    // Rotar vértices para que miren a la cámara
    vertexPosition.xz.assign(
        rotateUV(vertexPosition.xz, angleToCamera, worldPosition.xz)
    )
    
    // Aplicar viento
    wind.assign(
        this.game.wind.offsetNode(worldPosition.xz)
            .mul(tipness)
            .mul(height)
            .mul(2)
    )
    vertexPosition.addAssign(vec3(wind.x, 0, wind.y))
    
    return vertexPosition
})()
```

**Explicación:** Rota cada hoja de hierba para que siempre mire hacia la cámara (billboarding), y aplica viento proporcional a la altura.

### Ejemplo 5: Water Ripples (WaterSurface.js)

```javascript
const ripplesNode = Fn(([terrainData]) => {
    // Calcular índice de ripple basado en tiempo y posición
    const baseRipple = terrainData.b
        .add(this.game.wind.localTime.mul(0.5))
        .mul(ripplesSlopeFrequency)
    const rippleIndex = baseRipple.floor()
    
    // Noise para variación
    const ripplesNoise = texture(
        this.game.noises.perlin,
        positionWorld.xz
            .add(rippleIndex.div(ripplesNoiseOffset))
            .mul(ripplesNoiseFrequency)
    ).r
    
    // Calcular ripples
    const ripples = terrainData.b
        .add(this.game.wind.localTime.mul(0.5))
        .mul(ripplesSlopeFrequency)
        .mod(1)
        .sub(terrainData.b.remap(0, 1, -0.3, 1).oneMinus())
        .add(ripplesNoise)
    
    // Aplicar ratio y threshold
    ripples.assign(
        this.ripplesRatio
            .remap(0, 1, -1, -0.4)
            .step(ripples)
    )
    
    return ripples
})
```

**Explicación:** Crea ondas animadas en el agua usando noise y tiempo, con control de intensidad.

---

## Migración de GLSL a TSL

### Comparación Directa

| GLSL | TSL |
|------|-----|
| `uniform float time;` | `uniform(0.0)` |
| `varying vec2 vUv;` | `varying(vec2())` o `uv()` |
| `attribute vec3 position;` | `attribute('position')` |
| `gl_Position = ...` | `return vec4(...)` en `positionNode` |
| `gl_FragColor = ...` | `return vec4(...)` en `outputNode` |
| `mix(a, b, t)` | `mix(a, b, t)` o `a.mix(b, t)` |
| `smoothstep(0, 1, t)` | `t.smoothstep(0, 1)` |
| `clamp(v, 0, 1)` | `v.clamp(0, 1)` |
| `if(condition) { }` | `If(condition, () => { })` |
| `float x = 1.0;` | `const x = float(1)` |
| `x += 0.5;` | `x.addAssign(0.5)` |
| `x *= 2.0;` | `x.mulAssign(2.0)` |

### Ejemplo de Migración

**GLSL:**
```glsl
uniform float time;
uniform float strength;
varying vec2 vUv;

void main() {
    vec2 uv = vUv;
    float offset = sin(uv.x * 10.0 + time) * strength;
    vec3 position = vec3(uv.x, uv.y + offset, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

**TSL:**
```javascript
this.time = uniform(0)
this.strength = uniform(0.1)

this.material.positionNode = Fn(() => {
    const uv = uv()
    const offset = sin(uv.x.mul(10).add(this.time)).mul(this.strength)
    const position = vec3(uv.x, uv.y.add(offset), 0)
    return position
})()
```

---

## Mejores Prácticas

### 1. Organización del Código

```javascript
setMaterial()
{
    // 1. Uniforms primero
    this.material.strength = uniform(0.5)
    this.material.threshold = uniform(0.3)
    
    // 2. Funciones helper (si son reutilizables)
    const helperFunction = Fn(([param]) => {
        // ...
    })
    
    // 3. Nodos principales
    const colorNode = Fn(() => {
        // ...
    })()
    
    const alphaNode = Fn(() => {
        // ...
    })()
    
    // 4. Material base
    this.material.instance = new MeshDefaultMaterial({
        colorNode: colorNode,
        alphaNode: alphaNode
    })
    
    // 5. Modificaciones especiales (positionNode, etc.)
    this.material.instance.positionNode = Fn(() => {
        // ...
    })()
}
```

### 2. Nombres Descriptivos

```javascript
// ❌ Mal
const n = uniform(0.5)
const c = Fn(() => { return color(0xff0000) })()

// ✅ Bien
this.windStrength = uniform(0.5)
const foliageColor = Fn(() => {
    return color(0xff0000)
})()
```

### 3. Reutilización de Nodos

```javascript
// Crear nodo reutilizable (como Wind.js)
this.offsetNode = Fn(([position]) => {
    // Lógica compleja aquí
    return offset
})

// Usar en múltiples lugares
const wind1 = this.wind.offsetNode(position1)
const wind2 = this.wind.offsetNode(position2)
```

### 4. Debug con GUI

```javascript
// Añadir controles para ajustar en tiempo real
if(this.game.debug.active) {
    this.debugPanel.addBinding(
        this.material.strength,
        'value',
        { label: 'strength', min: 0, max: 1, step: 0.01 }
    )
}
```

### 5. Comentarios Explicativos

```javascript
// Calcular mix basado en iluminación
// dot product entre normal y dirección de luz
const mixStrength = normalWorld
    .dot(this.game.lighting.directionUniform)
    .smoothstep(0, 1)  // Suavizar transición
```

### 6. Evitar Cálculos Redundantes

```javascript
// ❌ Mal - calcula terrainData dos veces
const color = this.game.terrain.colorNode(
    this.game.terrain.terrainNode(position)
)
const height = this.game.terrain.terrainNode(position).b

// ✅ Bien - calcula una vez
const terrainData = this.game.terrain.terrainNode(position)
const color = this.game.terrain.colorNode(terrainData)
const height = terrainData.b
```

---

## Variables Built-in Importantes

### Posiciones y Transformaciones:
- `positionWorld` - Posición en espacio del mundo
- `positionLocal` - Posición en espacio local del objeto
- `positionGeometry` - Posición original de la geometría
- `modelWorldMatrix` - Matriz de transformación modelo->mundo
- `modelViewMatrix` - Matriz de transformación modelo->vista

### Normales:
- `normalWorld` - Normal en espacio del mundo
- `normalLocal` - Normal en espacio local

### UVs y Pantalla:
- `uv()` - Coordenadas UV (0-1)
- `screenUV` - UV de la pantalla (0-1)
- `screenSize` - Tamaño de la pantalla (vec2)

### Cámara:
- `cameraPosition` - Posición de la cámara en espacio del mundo

### Instancias:
- `instanceIndex` - Índice de la instancia actual
- `instance(count, matrix)` - Para instanced rendering

### Otros:
- `frontFacing` - Boolean: si es la cara frontal
- `vertexIndex` - Índice del vértice actual
- `viewportResolution` - Resolución del viewport

---

## Estructura Recomendada para Empezar

```javascript
import * as THREE from 'three/webgpu'
import { vec3, vec4, Fn, uniform, float, color, mix } from 'three/tsl'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'

export class MiPrimerElementoTSL
{
    constructor()
    {
        this.game = Game.getInstance()
        
        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        
        this.game.ticker.events.on('tick', () => {
            this.update()
        })
    }
    
    setGeometry()
    {
        // Geometría Three.js normal
        this.geometry = new THREE.PlaneGeometry(1, 1)
    }
    
    setMaterial()
    {
        // 1. Uniforms
        this.material.strength = uniform(0.5)
        this.material.time = uniform(0)
        
        // 2. Nodos
        const colorNode = Fn(() => {
            // Lógica del color
            return color(0x00ff00)
        })()
        
        const alphaNode = Fn(() => {
            // Lógica del alpha
            return float(1)
        })()
        
        // 3. Material
        this.material.instance = new MeshDefaultMaterial({
            colorNode: colorNode,
            alphaNode: alphaNode,
            transparent: false
        })
        
        // 4. Position node (opcional - para modificar vértices)
        this.material.instance.positionNode = Fn(() => {
            // Modificar posición aquí si es necesario
            return positionLocal
        })()
    }
    
    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material.instance)
        this.game.scene.add(this.mesh)
    }
    
    update()
    {
        // Actualizar uniforms cada frame
        this.material.time.value += this.game.ticker.deltaScaled
    }
}
```

---

## Recursos y Referencias

### Archivos Clave del Proyecto para Estudiar:

1. **Wind.js** - Sistema de viento reutilizable (patrón de nodos)
2. **Foliage.js** - Material con alpha y position node
3. **Grass.js** - Material complejo con attributes y varyings
4. **Leaves.js** - Compute shaders y física
5. **MeshDefaultMaterial.js** - Material base con muchos efectos
6. **Terrain.js** - Nodos reutilizables y anidados
7. **WaterSurface.js** - Efectos complejos con múltiples nodos

### Orden Recomendado de Estudio:

1. **Wind.js** - Entender Fn() y uniforms básicos
2. **Foliage.js** - Entender positionNode y alpha
3. **MeshDefaultMaterial.js** - Ver cómo se estructura un material completo
4. **Grass.js** - Entender attributes y varyings
5. **Terrain.js** - Entender nodos anidados
6. **Leaves.js** - Entender compute shaders (avanzado)
7. **WaterSurface.js** - Ver efectos complejos combinados

---

## Conclusión

TSL es una forma poderosa y moderna de crear shaders en Three.js. Aunque requiere WebGPU y tiene una sintaxis diferente a GLSL, ofrece ventajas significativas en organización, mantenibilidad y reutilización de código.

**Puntos clave para recordar:**
- TSL usa JavaScript, no archivos `.glsl` separados
- Los uniforms son valores dinámicos desde JavaScript
- `Fn()` crea funciones/nodos
- `toVar()` crea variables mutables
- El método chaining es común (`.mul().add()`)
- Los materiales se estructuran con `colorNode`, `alphaNode`, `positionNode`

**Siguiente paso:** Empieza con un ejemplo simple (como Wind.js) y ve añadiendo complejidad gradualmente. El proyecto del profesor es una excelente referencia con patrones claros y bien organizados.

---

*Esta guía está basada en el análisis del proyecto folio-2025. Los ejemplos y patrones provienen directamente del código del proyecto.*

