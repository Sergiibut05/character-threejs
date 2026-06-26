---
name: shader-techniques
version: "2.0.0"
description: |
  Shader optimization PRINCIPLES reference (operation costs, precision, MAD,
  branching, texture sampling). Code samples are Unity HLSL — REFERENCE ONLY,
  never copy-paste. In Three.js/WebGPU/TSL projects, translate ideas to TSL nodes.
sasmp_version: "1.3.0"
bonded_agent: 03-graphics-rendering
bond_type: PRIMARY_BOND

parameters:
  - name: shader_type
    type: string
    required: false
    validation:
      enum: [surface, unlit, post_process, compute, particle]
  - name: platform
    type: string
    required: false
    validation:
      enum: [pc, console, mobile, vr]

retry_policy:
  enabled: true
  max_attempts: 3
  backoff: exponential

observability:
  log_events: [start, complete, error, compile]
  metrics: [shader_variants, compile_time, gpu_time_ms]
---

# Shader Techniques

> ⚠️ **USE AS MENTAL REFERENCE ONLY — DO NOT COPY-PASTE THE CODE.**
> Every shader example below is **Unity Shaderlab/HLSL (CGPROGRAM)**. The project
> this is used in is **Three.js + WebGPURenderer + TSL** (no Unity, no HLSL).
> - ✅ Transfer the **principles**: operation cost tables, precision choices, MAD,
>   avoid fragment branching, minimize texture samples, atlasing, move work to vertex.
> - ❌ Never paste Unity HLSL/Shaderlab into the codebase. Re-express any idea as
>   **TSL node code** (`three/tsl`: `texture`, `uv`, `color`, `mix`, `smoothstep`, …)
>   following `src/Experience/World/TSL/*` and the `three-best-practices` skill.

## Shader Pipeline Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    RENDERING PIPELINE                        │
├─────────────────────────────────────────────────────────────┤
│  CPU (Game Logic)                                            │
│       ↓                                                      │
│  VERTEX SHADER                                               │
│  ├─ Transform vertices to clip space                        │
│  ├─ Calculate normals, tangents                             │
│  └─ Pass data to fragment shader                            │
│       ↓                                                      │
│  RASTERIZATION (Fixed function)                              │
│  ├─ Triangle setup                                          │
│  ├─ Pixel coverage                                          │
│  └─ Interpolation                                           │
│       ↓                                                      │
│  FRAGMENT/PIXEL SHADER                                       │
│  ├─ Sample textures                                         │
│  ├─ Calculate lighting                                      │
│  └─ Output final color                                      │
│       ↓                                                      │
│  OUTPUT (Framebuffer)                                        │
└─────────────────────────────────────────────────────────────┘
```

## Basic Shader Structure

```hlsl
// ✅ Production-Ready: Basic Surface Shader (Unity HLSL)
Shader "Custom/BasicSurface"
{
    Properties
    {
        _MainTex ("Albedo", 2D) = "white" {}
        _Color ("Color Tint", Color) = (1,1,1,1)
        _Metallic ("Metallic", Range(0,1)) = 0.0
        _Smoothness ("Smoothness", Range(0,1)) = 0.5
        _NormalMap ("Normal Map", 2D) = "bump" {}
        _NormalStrength ("Normal Strength", Range(0,2)) = 1.0
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        LOD 200

        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows
        #pragma target 3.0

        sampler2D _MainTex;
        sampler2D _NormalMap;
        half4 _Color;
        half _Metallic;
        half _Smoothness;
        half _NormalStrength;

        struct Input
        {
            float2 uv_MainTex;
            float2 uv_NormalMap;
        };

        void surf(Input IN, inout SurfaceOutputStandard o)
        {
            // Albedo
            half4 c = tex2D(_MainTex, IN.uv_MainTex) * _Color;
            o.Albedo = c.rgb;

            // Normal mapping
            half3 normal = UnpackNormal(tex2D(_NormalMap, IN.uv_NormalMap));
            normal.xy *= _NormalStrength;
            o.Normal = normalize(normal);

            // PBR properties
            o.Metallic = _Metallic;
            o.Smoothness = _Smoothness;
            o.Alpha = c.a;
        }
        ENDCG
    }
    FallBack "Diffuse"
}
```

## Advanced Effects

### Toon/Cel Shading

```hlsl
// ✅ Production-Ready: Toon Shader
Shader "Custom/Toon"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _Color ("Color", Color) = (1,1,1,1)
        _RampTex ("Ramp Texture", 2D) = "white" {}
        _OutlineColor ("Outline Color", Color) = (0,0,0,1)
        _OutlineWidth ("Outline Width", Range(0, 0.1)) = 0.02
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" }

        // Outline Pass
        Pass
        {
            Cull Front

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
            };

            float _OutlineWidth;
            float4 _OutlineColor;

            v2f vert(appdata v)
            {
                v2f o;
                // Expand vertices along normals
                float3 scaled = v.vertex.xyz + v.normal * _OutlineWidth;
                o.pos = UnityObjectToClipPos(float4(scaled, 1.0));
                return o;
            }

            half4 frag(v2f i) : SV_Target
            {
                return _OutlineColor;
            }
            ENDCG
        }

        // Main Toon Pass
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            sampler2D _MainTex;
            sampler2D _RampTex;
            float4 _Color;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                return o;
            }

            half4 frag(v2f i) : SV_Target
            {
                // Sample albedo
                half4 col = tex2D(_MainTex, i.uv) * _Color;

                // Calculate diffuse with ramp
                float3 lightDir = normalize(_WorldSpaceLightPos0.xyz);
                float NdotL = dot(i.worldNormal, lightDir) * 0.5 + 0.5;
                float3 ramp = tex2D(_RampTex, float2(NdotL, 0.5)).rgb;

                col.rgb *= ramp;
                return col;
            }
            ENDCG
        }
    }
}
```

### Dissolve Effect

```hlsl
// ✅ Production-Ready: Dissolve Shader
Shader "Custom/Dissolve"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _NoiseTex ("Noise Texture", 2D) = "white" {}
        _DissolveAmount ("Dissolve Amount", Range(0, 1)) = 0
        _EdgeColor ("Edge Color", Color) = (1, 0.5, 0, 1)
        _EdgeWidth ("Edge Width", Range(0, 0.2)) = 0.05
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" }

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            sampler2D _MainTex;
            sampler2D _NoiseTex;
            float _DissolveAmount;
            float4 _EdgeColor;
            float _EdgeWidth;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            v2f vert(appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.texcoord;
                return o;
            }

            half4 frag(v2f i) : SV_Target
            {
                half4 col = tex2D(_MainTex, i.uv);
                float noise = tex2D(_NoiseTex, i.uv).r;

                // Discard dissolved pixels
                clip(noise - _DissolveAmount);

                // Add edge glow
                float edge = 1 - smoothstep(0, _EdgeWidth, noise - _DissolveAmount);
                col.rgb = lerp(col.rgb, _EdgeColor.rgb, edge);

                return col;
            }
            ENDCG
        }
    }
}
```

## Post-Processing Effects

```hlsl
// ✅ Production-Ready: Screen-Space Vignette
Shader "PostProcess/Vignette"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _Intensity ("Intensity", Range(0, 1)) = 0.5
        _Smoothness ("Smoothness", Range(0.01, 1)) = 0.5
    }

    SubShader
    {
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag

            sampler2D _MainTex;
            float _Intensity;
            float _Smoothness;

            half4 frag(v2f_img i) : SV_Target
            {
                half4 col = tex2D(_MainTex, i.uv);

                // Calculate vignette
                float2 center = i.uv - 0.5;
                float dist = length(center);
                float vignette = smoothstep(0.5, 0.5 - _Smoothness, dist);
                vignette = lerp(1, vignette, _Intensity);

                col.rgb *= vignette;
                return col;
            }
            ENDCG
        }
    }
}
```

## Shader Optimization

```
OPTIMIZATION TECHNIQUES:
┌─────────────────────────────────────────────────────────────┐
│  PRECISION:                                                  │
│  • Use half instead of float where possible                 │
│  • Mobile: Always prefer half/fixed                         │
│  • PC: float for positions, half for colors                │
├─────────────────────────────────────────────────────────────┤
│  TEXTURE SAMPLING:                                           │
│  • Minimize texture samples                                 │
│  • Use texture atlases                                      │
│  • Avoid dependent texture reads                            │
│  • Use lower mipmap for distant objects                     │
├─────────────────────────────────────────────────────────────┤
│  MATH OPERATIONS:                                            │
│  • Replace div with mul (x/2 → x*0.5)                       │
│  • Use MAD operations (a*b+c)                               │
│  • Avoid branching in fragment shaders                      │
│  • Pre-compute constants                                    │
├─────────────────────────────────────────────────────────────┤
│  VARIANTS:                                                   │
│  • Minimize shader keywords                                 │
│  • Use multi_compile_local                                  │
│  • Strip unused variants                                    │
└─────────────────────────────────────────────────────────────┘

COST COMPARISON (Relative):
┌─────────────────────────────────────────────────────────────┐
│  Operation          │ Cost  │ Notes                         │
├─────────────────────┼───────┼───────────────────────────────┤
│  Add/Multiply       │ 1x    │ Baseline                      │
│  Divide             │ 4x    │ Avoid in loops                │
│  Sqrt               │ 4x    │ Use rsqrt when possible       │
│  Sin/Cos            │ 8x    │ Use lookup tables on mobile   │
│  Texture Sample     │ 4-8x  │ Varies by hardware            │
│  Pow                │ 8x    │ Use exp2(x*log2(y))          │
│  Normalize          │ 4x    │ Pre-normalize in vertex      │
└─────────────────────┴───────┴───────────────────────────────┘
```

## 🔧 Troubleshooting

```
┌─────────────────────────────────────────────────────────────┐
│ PROBLEM: Shader not compiling                               │
├─────────────────────────────────────────────────────────────┤
│ SOLUTIONS:                                                   │
│ → Check for syntax errors (missing semicolons)              │
│ → Verify all variables are declared                         │
│ → Check target platform compatibility                       │
│ → Look for mismatched semantics                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PROBLEM: Pink/magenta material                              │
├─────────────────────────────────────────────────────────────┤
│ SOLUTIONS:                                                   │
│ → Shader failed to compile - check console                  │
│ → Missing shader on target platform                         │
│ → Add fallback shader                                       │
│ → Check render pipeline compatibility                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PROBLEM: Shader too slow                                    │
├─────────────────────────────────────────────────────────────┤
│ SOLUTIONS:                                                   │
│ → Profile with GPU debugger (RenderDoc)                     │
│ → Reduce texture samples                                    │
│ → Use lower precision                                       │
│ → Simplify math operations                                  │
│ → Move calculations to vertex shader                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PROBLEM: Too many shader variants                           │
├─────────────────────────────────────────────────────────────┤
│ SOLUTIONS:                                                   │
│ → Use shader_feature instead of multi_compile               │
│ → Strip unused variants in build settings                   │
│ → Combine keywords where possible                           │
│ → Use material property blocks                              │
└─────────────────────────────────────────────────────────────┘
```

## Shader Languages by Engine

| Engine | Language | Notes |
|--------|----------|-------|
| Unity URP/HDRP | HLSL + ShaderGraph | Visual + code |
| Unity Built-in | CG/HLSL | Legacy surface shaders |
| Unreal | HLSL + Material Editor | Node-based preferred |
| Godot | Godot Shading Language | Similar to GLSL |
| OpenGL | GLSL | Cross-platform |
| DirectX | HLSL | Windows/Xbox |
| Vulkan | SPIR-V (from GLSL) | Low-level |

---

**Use this skill**: When creating custom visuals, optimizing rendering, or implementing advanced effects.
