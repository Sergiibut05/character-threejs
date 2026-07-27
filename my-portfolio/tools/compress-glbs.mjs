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

async function compressOne(file) {
    const out = compressedSibling(file)

    if (!FORCE && (await fileExists(out))) {
        const [srcStat, outStat] = await Promise.all([fs.stat(file), fs.stat(out)])
        if (outStat.mtimeMs >= srcStat.mtimeMs && outStat.size > 0) {
            return { file, out, status: 'cached', srcKB: srcStat.size / 1024 }
        }
    }

    const buffer = await fs.readFile(file)
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
