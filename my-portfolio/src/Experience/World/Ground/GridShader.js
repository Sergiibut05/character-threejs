/**
 * Grid Shader as TSL Nodes
 * Replaces the GLSL gridVertexShader + gridFragmentShader
 * Anti-aliased grid based on https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8
 */
import {
    Fn, float, vec2, vec4,
    uniform, positionWorld, cameraPosition,
    floor, fract, abs, smoothstep, clamp, min, mix,
    fwidth, distance
} from 'three/tsl'

// --- Anti-aliased Grid ---
const AntialiasedGrid = Fn(([uv_input, scale, thickness]) => {

    const referenceUv = uv_input.div(scale).toVar()

    // Derivatives for anti-aliasing
    const uvDeriv = fwidth(referenceUv).toVar()

    // Draw width — clamp thickness between derivative and 1.0
    const drawWidth = clamp(thickness, uvDeriv, vec2(1.0)).toVar()
    const lineAA = uvDeriv.mul(1.5).toVar()

    // Triangle wave pattern for grid
    const gridUV = float(1.0).sub(abs(fract(referenceUv).mul(2.0).sub(1.0))).toVar()

    // Smooth step for lines with anti-aliasing
    const grid2 = smoothstep(drawWidth.add(lineAA), drawWidth.sub(lineAA), gridUV).toVar()
    grid2.assign(grid2.mul(clamp(thickness.div(max(drawWidth, vec2(0.001))), 0.0, 1.0)))

    // Fade based on derivative magnitude to suppress moiré
    const fadeFactor = clamp(uvDeriv.mul(2.0).sub(1.0), 0.0, 1.0).toVar()
    grid2.assign(mix(grid2, thickness, fadeFactor))

    // Combine both axes
    return mix(grid2.x, 1.0, grid2.y)

})

// --- Draw Single Cross ---
const DrawSingleCross = Fn(([pos, crossSize]) => {

    const dUV = fwidth(pos).toVar()

    // Horizontal line
    const horizontalLine = smoothstep(crossSize.x.add(dUV.x), crossSize.x.sub(dUV.x), abs(pos.y))
    const horizontalWidth = smoothstep(crossSize.y.mul(0.5).add(dUV.y), crossSize.y.mul(0.5).sub(dUV.y), abs(pos.x))
    const horizontal = horizontalLine.mul(horizontalWidth)

    // Vertical line
    const verticalLine = smoothstep(crossSize.x.add(dUV.y), crossSize.x.sub(dUV.y), abs(pos.x))
    const verticalWidth = smoothstep(crossSize.y.mul(0.5).add(dUV.x), crossSize.y.mul(0.5).sub(dUV.x), abs(pos.y))
    const vertical = verticalLine.mul(verticalWidth)

    return min(horizontal.add(vertical), 1.0)

})

// --- Draw Crosses within grid cell ---
const DrawCrosses = Fn(([cellUV, density, crossSize]) => {

    const crossGrid = floor(density).toVar()

    // Pattern repetition within cell
    const patternUV = cellUV.mul(crossGrid).toVar()
    const subCellCenter = fract(patternUV).sub(0.5).toVar()

    return DrawSingleCross(subCellCenter, crossSize)

})

// --- Main Grid Fragment Node builder ---
export const createGridColorNode = (params) => {

    const uGridScale = params.uGridScale
    const uLineWidth = params.uLineWidth
    const uCrossDensity = params.uCrossDensity
    const uCrossSize = params.uCrossSize
    const uLineColor = params.uLineColor
    const uCrossColor = params.uCrossColor
    const uBaseColor = params.uBaseColor
    const uFadeDistance = params.uFadeDistance

    return Fn(() => {

        // World position and camera snapping for grid
        const worldPos = positionWorld.toVar()

        // Calculate distance fade
        const dist = distance(worldPos, cameraPosition)
        const distanceFade = clamp(
            float(1.0).sub(smoothstep(0.0, uFadeDistance, dist)),
            0.0, 1.0
        )

        // Scale and snap UV to camera
        const snap = floor(cameraPosition.mul(uGridScale))
        const uv = worldPos.mul(uGridScale).sub(snap).toVar()
        const gridUV = uv.xz.toVar()

        // Draw grid lines
        const grid = AntialiasedGrid(gridUV, float(1.0), uLineWidth).mul(distanceFade).toVar()

        // Draw crosses
        const cellUV = fract(gridUV)
        const cross = DrawCrosses(cellUV, uCrossDensity, uCrossSize)

        // Compose final color
        const finalColor = mix(uBaseColor, uLineColor, grid).toVar()
        finalColor.assign(mix(finalColor, uCrossColor, cross))

        return vec4(finalColor, 1.0)

    })()

}
