export const gridVertexShader = `
    precision mediump float;
    
    varying vec3 vWorldPosition;
    varying vec3 vCameraPosition;
    
    uniform float uGridScale;
    
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        // Calculate camera-relative position for grid snapping
        vec3 cameraPos = cameraPosition;
        vec3 snap = floor(cameraPos * uGridScale);
        vec3 camSnapped = worldPosition.xyz * uGridScale - snap;
        
        // Use XZ plane for grid (ground)
        vCameraPosition = camSnapped;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

export const gridFragmentShader = `
    #ifdef GL_OES_standard_derivatives
    #extension GL_OES_standard_derivatives : enable
    #endif
    
    precision mediump float;
    
    varying vec3 vWorldPosition;
    varying vec3 vCameraPosition;
    
    uniform float uGridScale;
    uniform vec2 uLineWidth;
    uniform vec3 uLineColor;
    uniform vec3 uBaseColor;
    
    // Pristine Grid function based on Ben Golus' article
    float PristineGrid(vec2 uv, vec2 lineWidth) {
        lineWidth = clamp(lineWidth, 0.0, 1.0);
        
        // Compute derivatives (anti-aliasing)
        vec2 uvDeriv = vec2(
            length(vec2(dFdx(uv.x), dFdy(uv.x))),
            length(vec2(dFdx(uv.y), dFdy(uv.y)))
        );
        
        // Invert logic if desired width > 0.5
        vec2 invertMask = step(vec2(0.5), lineWidth);
        vec2 targetWidth = mix(lineWidth, 1.0 - lineWidth, invertMask);
        
        // Clamp width and set anti-aliasing width
        vec2 minDeriv = uvDeriv;
        vec2 maxWidth = vec2(0.5);
        vec2 drawWidth = clamp(targetWidth, minDeriv, maxWidth);
        vec2 lineAA = uvDeriv * 1.5;
        
        // Compute grid UV (triangle wave)
        vec2 gridUV = abs(fract(uv) * 2.0 - 1.0);
        gridUV = mix(1.0 - gridUV, gridUV, invertMask);
        
        // Smooth step for lines - order matters: smoothstep(edge0, edge1, x)
        vec2 edge0 = drawWidth - lineAA;
        vec2 edge1 = drawWidth + lineAA;
        edge0 = max(edge0, vec2(0.0));
        vec2 grid2 = smoothstep(edge0, edge1, gridUV);
        
        // Prevent division by zero
        vec2 drawWidthSafe = max(drawWidth, vec2(0.001));
        grid2 = grid2 * clamp(targetWidth / drawWidthSafe, 0.0, 1.0);
        
        // Fade based on derivative magnitude to suppress moiré
        vec2 fadeFactor = clamp(uvDeriv * 2.0 - 1.0, 0.0, 1.0);
        grid2 = mix(grid2, targetWidth, fadeFactor);
        
        // If inverted, flip
        grid2 = mix(grid2, 1.0 - grid2, invertMask);
        
        // Combine both axes
        return mix(grid2.x, 1.0, grid2.y);
    }
    
    void main() {
        // Use XZ plane (ground)
        vec2 uv = vCameraPosition.xz;
        
        float grid = PristineGrid(uv, uLineWidth);
        
        vec3 color = mix(uBaseColor, uLineColor, grid);
        
        gl_FragColor = vec4(color, 1.0);
    }
`
