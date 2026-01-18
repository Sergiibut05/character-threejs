export const gridVertexShader = `
    precision mediump float;
    
    varying vec3 vWorldPosition;
    varying vec3 vCameraPosition;
    varying float vDistance;
    
    uniform float uGridScale;
    
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        // Calculate distance from camera
        vec3 cameraPos = cameraPosition;
        vDistance = distance(worldPosition.xyz, cameraPos);
        
        // Calculate camera-relative position for grid snapping
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
    varying float vDistance;
    
    uniform float uGridScale;
    uniform vec2 uLineWidth;
    uniform vec3 uLineColor;
    uniform vec3 uCrossColor;
    uniform vec3 uBaseColor;
    uniform float uCrossDensity;
    uniform vec2 uCrossSize;
    uniform float uFadeDistance;
    
    // Anti-aliased grid based on MeshGridMaterial
    // Adapted from https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8
    float AntialiasedGrid(vec2 uv, float scale, vec2 thickness) {
        // Scale and prepare UV
        vec2 referenceUv = uv / scale;
        
        // Calculate derivatives for anti-aliasing
        vec2 uvDeriv = fwidth(referenceUv);
        
        // Calculate draw width (clamp thickness between derivative and 1.0)
        vec2 drawWidth = clamp(thickness, uvDeriv, vec2(1.0));
        vec2 lineAA = uvDeriv * 1.5;
        
        // Calculate grid pattern (triangle wave)
        vec2 gridUV = 1.0 - abs(fract(referenceUv) * 2.0 - 1.0);
        
        // Smooth step for lines with anti-aliasing
        vec2 grid2 = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUV);
        grid2 = grid2 * clamp(thickness / max(drawWidth, vec2(0.001)), 0.0, 1.0);
        
        // Fade based on derivative magnitude to suppress moiré
        vec2 fadeFactor = clamp(uvDeriv * 2.0 - 1.0, 0.0, 1.0);
        grid2 = mix(grid2, thickness, fadeFactor);
        
        // Combine both axes
        return mix(grid2.x, 1.0, grid2.y);
    }
    
    // Draw cross at a position within a cell
    float DrawSingleCross(vec2 pos, vec2 crossSize) {
        // Calculate derivatives for anti-aliasing
        vec2 dUV = fwidth(pos);
        
        // Create horizontal line (vertical cross arm) - length is crossSize.x, width is crossSize.y
        float horizontalLine = smoothstep(crossSize.x + dUV.x, crossSize.x - dUV.x, abs(pos.y));
        float horizontalWidth = smoothstep(crossSize.y * 0.5 + dUV.y, crossSize.y * 0.5 - dUV.y, abs(pos.x));
        float horizontal = horizontalLine * horizontalWidth;
        
        // Create vertical line (horizontal cross arm) - length is crossSize.x, width is crossSize.y
        float verticalLine = smoothstep(crossSize.x + dUV.y, crossSize.x - dUV.y, abs(pos.x));
        float verticalWidth = smoothstep(crossSize.y * 0.5 + dUV.x, crossSize.y * 0.5 - dUV.x, abs(pos.y));
        float vertical = verticalLine * verticalWidth;
        
        // Combine both lines
        return min(horizontal + vertical, 1.0);
    }
    
    // Draw multiple crosses within each grid cell using pattern repetition
    float DrawCrosses(vec2 cellUV, float density, vec2 crossSize) {
        // density determines grid of crosses: 0 = none, 1.0 = 1x1 (center), 2.0 = 2x2, 3.0 = 3x3, etc.
        float crossGrid = floor(density);
        if(crossGrid <= 0.0) return 0.0;
        
        // Create a pattern that repeats crosses within the cell
        // Scale cellUV to create the pattern - patternScale determines spacing
        float patternScale = crossGrid;
        vec2 patternUV = cellUV * patternScale;
        
        // Get the position within each sub-cell
        vec2 subCellUV = fract(patternUV);
        // Center the position (0.5 is center of sub-cell)
        vec2 subCellCenter = subCellUV - 0.5;
        
        // Draw the cross at the center of each sub-cell
        float cross = DrawSingleCross(subCellCenter, crossSize);
        
        return cross;
    }
    
    void main() {
        // Use XZ plane (ground) - vCameraPosition is already scaled by uGridScale in vertex shader
        vec2 uv = vCameraPosition.xz;
        
        // Calculate distance fade for grid lines (visible close, fade out when far)
        float distanceFade = 1.0 - smoothstep(0.0, uFadeDistance, vDistance);
        distanceFade = clamp(distanceFade, 0.0, 1.0);
        
        // Draw grid lines - uv is already scaled by uGridScale in vertex shader
        // Since uv is already scaled, we pass 1.0 as scale (don't divide again)
        // But wait - the scale in AntialiasedGrid divides uv/scale, so if uv is already scaled,
        // we need to pass 1.0 to not change it, or we need to think about this differently...
        // Actually, the issue is that we want gridScale to change the cell size.
        // If uv is scaled by gridScale, and we divide by gridScale again, we cancel it.
        // So we should pass 1.0, meaning "don't scale, use uv as-is"
        float grid = AntialiasedGrid(uv, 1.0, uLineWidth);
        grid = grid * distanceFade;
        
        // Draw crosses within each grid cell (independent)
        // cellUV is the position within the current grid cell (0-1 range)
        // Since uv is already scaled by uGridScale, fract(uv) gives us the position within each scaled cell
        vec2 cellUV = fract(uv);
        float cross = DrawCrosses(cellUV, uCrossDensity, uCrossSize);
        
        // Start with base color
        vec3 color = uBaseColor;
        
        // Apply grid lines color
        color = mix(color, uLineColor, grid);
        
        // Apply cross color (independent, doesn't affect grid lines)
        color = mix(color, uCrossColor, cross);
        
        gl_FragColor = vec4(color, 1.0);
    }
`
