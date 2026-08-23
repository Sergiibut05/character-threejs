/**
 * Batch Draco compression for GLB files.
 *
 * Compresses every uncompressed .glb under static/models/ into a sibling
 * <name>-compressed.glb. Skips files that already end with -compressed,
 * -draco, or where a fresh compressed sibling already exists.
 *
 * Usage:
 *   node tools/compress-glbs.mjs [--force]
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import gltfPipeline from 'gltf-pipeline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..', 'static', 'models')

const DRACO_OPTIONS = {
    dracoOptions: {
        compressionLevel: 10,
        quantizePositionBits: 14,
        quantizeNormalBits: 10,
        quantizeTexcoordBits: 12,
        quantizeColorBits: 8,
        quantizeGenericBits: 12,
        unifiedQuantization: true,
        uncompressedFallback: false
    }
}

// Both separators appear in the asset tree (palm-tree_compressed.glb ships
// pre-compressed from its source, and re-encoding it just errors out).
const SKIP_SUFFIXES = ['-compressed.glb', '_compressed.glb', '-draco.glb']
const FORCE = process.argv.includes('--force')

async function* walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            yield* walk(full)
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
            yield full
        }
    }
}

function shouldSkip(file) {
    const name = file.toLowerCase()
    return SKIP_SUFFIXES.some((suffix) => name.endsWith(suffix))
}

function compressedSibling(file) {
    const dir = path.dirname(file)
    const base = path.basename(file, '.glb')
    return path.join(dir, `${base}-compressed.glb`)
}

async function fileExists(file) {
    try {
        await fs.access(file)
        return true
    } catch { return false }
}

/** Parse a .glb's JSON chunk, or null if it isn't readable as one. */
function glbJson(buffer) {
    if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') return null
    const jsonLength = buffer.readUInt32LE(12)
    if (jsonLength <= 0 || 20 + jsonLength > buffer.length) return null
    try {
        return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength))
    } catch { return null }
}

/** True when a .glb already declares KHR_draco_mesh_compression. */
function isDracoEncoded(buffer) {
    const json = glbJson(buffer)
    return !!json && (json.extensionsUsed || []).includes('KHR_draco_mesh_compression')
}

/** How many meshes a .glb carries (0 for marker-only files). */
function meshCount(buffer) {
    const json = glbJson(buffer)
    return json ? (json.meshes || []).length : -1
}

async function compressOne(file) {
    const out = compressedSibling(file)

    if (!FORCE && (await fileExists(out))) {
        const [srcStat, outStat] = await Promise.all([fs.stat(file), fs.stat(out)])
        if (outStat.mtimeMs >= srcStat.mtimeMs && outStat.size > 0) {
            return { file, out, status: 'cached', srcKB: srcStat.size / 1024 }
        }
    }

    const buffer = await fs.readFile(file)

    // Marker-only files (sit-points.glb is empties, no geometry) have nothing
    // for Draco to work on — compressing them just leaves a second file to keep
    // in sync with no bytes saved.
    if (meshCount(buffer) === 0) {
        return { file, out, status: 'skipped', srcKB: buffer.length / 1024 }
    }

    // A source exported from Blender with "Compression" ticked is ALREADY
    // Draco-encoded. Feeding one of those back through the encoder throws a
    // bare "Draco encoding failed", which reads like a corrupt model rather
    // than a double-compress — and gltf-pipeline cannot decode it first
    // (processGlb leaves KHR_draco_mesh_compression in place). So pass it
    // straight through: it is already compressed, and the only thing another
    // round trip could add is loss. Untick Compression in the exporter to get
    // this project's own settings instead.
    if (isDracoEncoded(buffer)) {
        await fs.writeFile(out, buffer)
        const stat = await fs.stat(file)
        return { file, out, status: 'passthrough', srcKB: stat.size / 1024 }
    }

    const result = await gltfPipeline.processGlb(buffer, DRACO_OPTIONS)
    await fs.writeFile(out, result.glb)

    const [srcStat, outStat] = await Promise.all([fs.stat(file), fs.stat(out)])
    return {
        file,
        out,
        status: 'compressed',
        srcKB: srcStat.size / 1024,
        outKB: outStat.size / 1024,
        ratio: outStat.size / srcStat.size
    }
}

async function main() {
    const targets = []
    for await (const file of walk(ROOT)) {
        if (shouldSkip(file)) continue
        targets.push(file)
    }

    console.log(`Found ${targets.length} candidate GLB(s) under ${ROOT}`)

    const concurrency = Math.max(1, Math.min(4, targets.length))
    const queue = targets.slice()
    const errors = []
    let completed = 0

    async function worker() {
        while (queue.length > 0) {
            const file = queue.shift()
            const rel = path.relative(ROOT, file)
            try {
                const result = await compressOne(file)
                completed++
                if (result.status === 'cached') {
                    console.log(`  [${completed}/${targets.length}] ✓ cached    ${rel}`)
                } else if (result.status === 'skipped') {
                    console.log(`  [${completed}/${targets.length}] – sin mallas ${rel}`)
                } else if (result.status === 'passthrough') {
                    console.log(
                        `  [${completed}/${targets.length}] ↪ passthrough ${rel} ` +
                        `(${result.srcKB.toFixed(0)} KB — ya venía con Draco del exportador)`
                    )
                } else {
                    const ratio = (result.ratio * 100).toFixed(1)
                    console.log(
                        `  [${completed}/${targets.length}] ✓ compressed ${rel} ` +
                        `(${result.srcKB.toFixed(0)} KB → ${result.outKB.toFixed(0)} KB, ${ratio}%)`
                    )
                }
            } catch (err) {
                completed++
                console.error(`  [${completed}/${targets.length}] ✗ FAILED    ${rel}: ${err.message}`)
                errors.push({ file, err })
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, worker))

    if (errors.length) {
        console.error(`\n${errors.length} file(s) failed.`)
        process.exitCode = 1
    } else {
        console.log(`\n✅ All ${targets.length} GLB(s) processed.`)
    }
}

main().catch((err) => {
    console.error('Fatal:', err)
    process.exit(1)
})
