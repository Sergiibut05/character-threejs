# Documentación Generada - Guía de Uso

## ¿Qué se creó?

He creado una documentación completa para tu portfolio 3D con Three.js + Rapier3D en estilo Animal Crossing. Aquí está lo que se generó:

### 1. **AGENTS.md** (Raíz del Proyecto)
📄 `AGENTS.md`

**Propósito**: Documento maestro que explica todo el proyecto

**Contenido**:
- Visión general del proyecto (portfolio 3D Animal Crossing)
- Stack tecnológico completo (Three.js, Rapier3D, Vite, etc.)
- Arquitectura completa del proyecto con árbol de carpetas
- Descripción de todas las características principales
- Flujo de inicialización paso a paso
- Técnicas de optimización aplicadas
- Explicación del estilo visual Animal Crossing
- Referencia a la documentación Three.js en `llms-full.txt`
- Comandos de desarrollo
- Métricas de rendimiento objetivo
- Áreas de mejora futuras

**Cuándo leerlo**: Para entender la estructura completa del proyecto.

---

### 2. **Cursor Rules** (.cursor/rules/)

Se crearon 3 reglas que se aplican automáticamente en TODAS tus sesiones de Cursor:

#### 2.1 **threejs-optimization.mdc**
🎯 **Enfoque**: Three.js + WebGPU/TSL best practices

**Contenido**:
- Cuándo usar WebGLRenderer vs WebGPURenderer
- Patrones correctos de import maps
- TSL (Three.js Shading Language) vs raw GLSL
- Material classes recomendadas
- Técnicas de optimización de rendimiento
- Integración con Rapier3D
- Referencias a archivos de shaders del proyecto

**Activación**: ✅ SIEMPRE ACTIVA (`alwaysApply: true`)

**Beneficio**: Cada vez que menciones Three.js, el AI assistant utilizará automáticamente la documentación de `llms-full.txt` y aplicará best practices.

---

#### 2.2 **project-architecture.mdc**
🏗️ **Enfoque**: Arquitectura del proyecto, patrones, estándares

**Contenido**:
- Descripción del proyecto
- Patrón Singleton de Experience
- Componentes base explicados (Time, Sizes, Quality, Resources, Renderer, Camera)
- Optimizaciones aplicadas (Instancing, LOD, Shaders, Culling, Memory)
- Optimizaciones Rapier3D
- Patrón Event Emitter
- Estructura de carpetas completa
- Objetivos de rendimiento
- Comandos de debugging

**Activación**: ✅ SIEMPRE ACTIVA (`alwaysApply: true`)

**Beneficio**: El assistant siempre tendrá contexto de la arquitectura del proyecto.

---

#### 2.3 **performance-optimization.mdc**
⚡ **Enfoque**: Checklist de optimización y profiling

**Contenido**:
- Checklist de rendimiento (rendering, física, memoria, móvil)
- Herramientas de profiling (DevTools, Three.js Stats, WebGPU)
- Soluciones para bottlenecks comunes
- Optimizaciones específicas por sistema (grass, terrain LOD, shaders, física)
- Sistema de calidad adaptativa
- Optimizaciones de red y assets
- Optimizaciones mobile
- Benchmarks por dispositivo

**Activación**: ✅ SIEMPRE ACTIVA (`alwaysApply: true`)

**Beneficio**: Checklist automático cuando trabajemos en optimización.

---

## Cómo Usar Esta Documentación

### Escenario 1: Desarrollando Features de Three.js
```
Tú: "Necesito crear un shader de agua animada con TSL"
↓
Cursor AI: 
  - Automáticamente usa threejs-optimization.mdc
  - Referencia documentación de llms-full.txt
  - Sugiere usar TSL nodes en lugar de raw GLSL
  - Verifica performance considerations
```

### Escenario 2: Optimizando Rendimiento
```
Tú: "El FPS bajó a 30 en móviles"
↓
Cursor AI:
  - Utiliza performance-optimization.mdc
  - Aplica checklist de optimización
  - Sugiere profiling tools
  - Propone soluciones específicas (LOD, culling, etc.)
```

### Escenario 3: Entendiendo la Arquitectura
```
Tú: "¿Cómo agregar un nuevo componente al World?"
↓
Cursor AI:
  - Usa project-architecture.mdc
  - Explica el patrón Event Emitter
  - Referencia Experience singleton
  - Sugiere estructura correcta
```

---

## Estructura de Archivos Creados

```
c:/Users/mnsa1/Desktop/portfolio/
├── AGENTS.md                          # 📄 Documento maestro del proyecto
└── .cursor/
    └── rules/
        ├── threejs-optimization.mdc   # 🎯 Three.js + WebGPU/TSL
        ├── project-architecture.mdc   # 🏗️ Arquitectura + patrones
        └── performance-optimization.mdc # ⚡ Profiling + checklist
```

---

## Cambios en Git

Se creó un commit con los nuevos archivos:

```bash
commit 445ddd4
Author: AI Assistant
Date:   [Fecha actual]

    docs: add AGENTS.md and Cursor rules for Three.js optimization and project architecture

    + AGENTS.md: Project overview and architecture documentation
    + .cursor/rules/threejs-optimization.mdc: Three.js best practices
    + .cursor/rules/project-architecture.mdc: Project patterns and architecture
    + .cursor/rules/performance-optimization.mdc: Performance checklist and profiling
```

---

## Próximos Pasos Recomendados

1. **Lee AGENTS.md** para entender el proyecto completo
2. **Las reglas de Cursor se activan automáticamente** - no necesitas hacer nada
3. **Cuando trabajes con Three.js**, el AI assistant ahora:
   - Referenciará automáticamente `llms-full.txt`
   - Aplicará best practices de TSL y WebGPU
   - Verificará optimizaciones
   - Sugerirá patrones correctos

4. **Para optimizar rendimiento**, usa el checklist en `performance-optimization.mdc`

---

## Importante: Documentación Three.js

La regla `threejs-optimization.mdc` está configurada para que SIEMPRE que menciones Three.js se use la documentación en:

📚 `@my-portfolio/llms-full.txt`

Este archivo contiene:
- Versión Three.js: 0.182.0+
- Guías de WebGL vs WebGPU
- Ejemplos de TSL completos
- Best practices de performance
- Configuración moderna de import maps

---

## Dudas Frecuentes

**P: ¿Necesito hacer algo para activar las reglas?**
A: No, se activan automáticamente. Cursor las carga en cada sesión.

**P: ¿Puedo modificar estas reglas?**
A: Sí, están en `.cursor/rules/` como archivos `.mdc` normales.

**P: ¿Las reglas se usan en todas las sesiones?**
A: Sí, porque tienen `alwaysApply: true`. Se cargan automáticamente.

**P: ¿Dónde está la referencia a llms-full.txt?**
A: En `threejs-optimization.mdc`. Es parte de la regla de Three.js.

---

## Resumen

✅ **AGENTS.md**: Documento completo del proyecto (es el que lees primero)
✅ **threejs-optimization.mdc**: Regla de Three.js + WebGPU + TSL (siempre activa)
✅ **project-architecture.mdc**: Regla de arquitectura (siempre activa)
✅ **performance-optimization.mdc**: Regla de optimización (siempre activa)

**Resultado**: Ahora tienes documentación completa integrada con Cursor que se usa automáticamente en TODAS tus sesiones de desarrollo.
