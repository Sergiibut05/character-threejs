/**
 * Inspect a GLB file: list mesh names, materials, and children hierarchy.
 * Usage: node tools/inspect-glb.mjs <file.glb> [<file2.glb> ...]
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

async function loadGltf(file) {
    const buffer = await fs.readFile(file)
    const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)

    const magic = dv.getUint32(0, true)
    if (magic !== 0x46546c67) throw new Error('Not a GLB (bad magic)')
    const length = dv.getUint32(8, true)

    let offset = 12
    let json = null
    while (offset < length) {
        const chunkLen = dv.getUint32(offset, true)
        const chunkType = dv.getUint32(offset + 4, true)
        if (chunkType === 0x4e4f534a) {
            const slice = new Uint8Array(buffer.buffer, buffer.byteOffset + offset + 8, chunkLen)
            json = JSON.parse(new TextDecoder().decode(slice))
            break
        }
        offset += 8 + chunkLen
    }
    return json
}

async function inspect(file) {
    console.log(`\n═══ ${path.basename(file)} ═══`)
    const gltf = await loadGltf(file)

    const meshes = (gltf.meshes || []).map((m, i) => ({
        index: i,
        name: m.name || `mesh_${i}`,
        primitives: m.primitives.length
    }))

    const materials = (gltf.materials || []).map((m, i) => ({
        index: i,
        name: m.name || `material_${i}`,
        baseColorTexture: m.pbrMetallicRoughness?.baseColorTexture?.index,
        baseColor: m.pbrMetallicRoughness?.baseColorFactor
    }))

    const images = (gltf.images || []).map((img, i) => ({
        index: i,
        name: img.name || img.uri || `image_${i}`,
        uri: img.uri,
        mimeType: img.mimeType
    }))

    const nodes = (gltf.nodes || []).map((n, i) => ({
        index: i,
        name: n.name || `node_${i}`,
        mesh: n.mesh,
        children: n.children
    }))

    console.log('Meshes:')
    for (const m of meshes) {
        console.log(`  [${m.index}] "${m.name}" (primitives: ${m.primitives})`)
    }

    console.log('Materials:')
    for (const m of materials) {
        console.log(
            `  [${m.index}] "${m.name}"` +
            (m.baseColorTexture !== undefined ? ` baseColorTex=${m.baseColorTexture}` : '') +
            (m.baseColor ? ` color=[${m.baseColor.map(v => v.toFixed(2)).join(',')}]` : '')
        )
    }

    if (images.length) {
        console.log('Images:')
        for (const img of images) {
            console.log(`  [${img.index}] "${img.name}" ${img.uri || ''} (${img.mimeType || 'embedded'})`)
        }
    }

    console.log('Nodes (hierarchy):')
    const rootScene = gltf.scenes?.[gltf.scene ?? 0]
    function printNode(idx, depth = 0) {
        const n = nodes[idx]
        const ind = '  '.repeat(depth + 1)
        let label = `[${idx}] "${n.name}"`
        if (n.mesh !== undefined) {
            const meshName = meshes[n.mesh]?.name || `mesh_${n.mesh}`
            label += ` → mesh "${meshName}"`
        }
        console.log(ind + label)
        for (const c of n.children || []) printNode(c, depth + 1)
    }
    if (rootScene) {
        for (const r of rootScene.nodes) printNode(r)
    }

    // Vertex attributes for first primitive of each mesh
    console.log('Mesh attributes:')
    for (let i = 0; i < gltf.meshes.length; i++) {
        const m = gltf.meshes[i]
        const p = m.primitives[0]
        const attrs = Object.keys(p.attributes).join(', ')
        console.log(`  "${m.name || `mesh_${i}`}": ${attrs}`)
    }
}

const files = process.argv.slice(2)
if (files.length === 0) {
    console.error('Usage: node tools/inspect-glb.mjs <file.glb> [...]')
    process.exit(1)
}

for (const f of files) {
    try { await inspect(f) } catch (e) { console.error(`✗ ${f}:`, e.message) }
}
