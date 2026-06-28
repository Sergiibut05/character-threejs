/**
 * Batch KTX2 conversion using toktx (KTX-Software) with UASTC + zstd.
 *
 * Converts the textures listed in TARGETS to .ktx2 sibling files. Uses UASTC
 * for color-rich textures (atlases, base colors) which yields good quality
 * for stylized art and supports transcoding to BC7/ASTC at runtime.
 *
 * Requirements: toktx.exe in PATH (KTX-Software).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..', 'static')
const FORCE = process.argv.includes('--force')

const TARGETS = [
    {
        // Character face atlas (2x2). Loader uses generateMipmaps:false +
        // LinearFilter, so encode WITHOUT mipmaps to match.
        in: 'models/human/human-atlas.png',
        out: 'models/human/human-atlas.ktx2',
        srgb: true,
        genmipmap: false
    },
    {
        in: 'texture/Atlas-textures/Forest_Atlas.png',
        out: 'texture/Atlas-textures/Forest_Atlas.ktx2',
        srgb: true,
        genmipmap: true
    },
    {
        in: 'texture/Atlas-textures/Sushi_Atlas.png',
        out: 'texture/Atlas-textures/Sushi_Atlas.ktx2',
        srgb: true,
        genmipmap: true
    },
    {
        in: 'texture/Atlas-textures/Tiny_Atlas.png',
        out: 'texture/Atlas-textures/Tiny_Atlas.ktx2',
        srgb: true,
        genmipmap: true
    },
    {
        in: 'texture/slabs/slabs.png',
        out: 'texture/slabs/slabs.ktx2',
        srgb: false,
        genmipmap: true
    },
    {
        in: 'models/floor/grass-floor-1.png',
        out: 'models/floor/grass-floor-1.ktx2',
        srgb: true,
        genmipmap: true
    },
    {
        in: 'models/floor/grass-floor-2.png',
        out: 'models/floor/grass-floor-2.ktx2',
        srgb: true,
        genmipmap: true
    },
    {
        in: 'models/social-entrance/social-tittle-image.png',
        out: 'models/social-entrance/social-tittle-image.ktx2',
        srgb: true,
        genmipmap: true
    }
]

function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        let stderr = ''
        let stdout = ''
        child.stdout.on('data', (d) => { stdout += d.toString() })
        child.stderr.on('data', (d) => { stderr += d.toString() })
        child.on('error', reject)
        child.on('close', (code) => {
            if (code === 0) resolve({ stdout, stderr })
            else reject(new Error(`${cmd} exited with ${code}: ${stderr || stdout}`))
        })
    })
}

async function fileExists(file) {
    try { await fs.access(file); return true } catch { return false }
}

async function processOne(target, idx, total) {
    const inPath = path.join(ROOT, target.in)
    const outPath = path.join(ROOT, target.out)

    if (!await fileExists(inPath)) {
        console.warn(`  [${idx + 1}/${total}] ⚠ missing  ${target.in}`)
        return { skipped: true }
    }

    if (!FORCE && await fileExists(outPath)) {
        const [a, b] = await Promise.all([fs.stat(inPath), fs.stat(outPath)])
        if (b.mtimeMs >= a.mtimeMs && b.size > 0) {
            console.log(`  [${idx + 1}/${total}] ✓ cached  ${target.out}`)
            return { cached: true }
        }
    }

    await fs.mkdir(path.dirname(outPath), { recursive: true })

    // toktx UASTC + zstd: high quality stylized textures
    const args = [
        '--t2',
        '--encode', 'uastc',
        '--uastc_quality', '4',
        '--zcmp', '22',
        '--assign_oetf', target.srgb ? 'srgb' : 'linear',
        '--assign_primaries', 'bt709'
    ]
    if (target.genmipmap) {
        args.push('--genmipmap')
        args.push('--filter', 'lanczos4')
    }
    args.push(outPath, inPath)

    try {
        await run('toktx', args)
        const [a, b] = await Promise.all([fs.stat(inPath), fs.stat(outPath)])
        const ratio = (b.size / a.size * 100).toFixed(1)
        console.log(
            `  [${idx + 1}/${total}] ✓ encoded ${target.out} ` +
            `(${(a.size / 1024).toFixed(0)} KB → ${(b.size / 1024).toFixed(0)} KB, ${ratio}%)`
        )
        return { ok: true }
    } catch (err) {
        console.error(`  [${idx + 1}/${total}] ✗ FAILED ${target.in}: ${err.message}`)
        return { error: err }
    }
}

async function main() {
    console.log(`Converting ${TARGETS.length} texture(s) to KTX2 (UASTC + zstd)`)

    const results = []
    for (let i = 0; i < TARGETS.length; i++) {
        results.push(await processOne(TARGETS[i], i, TARGETS.length))
    }

    const failed = results.filter((r) => r.error).length
    if (failed) {
        console.error(`\n${failed} texture(s) failed.`)
        process.exitCode = 1
    } else {
        console.log('\n✅ All textures processed.')
    }
}

main().catch((err) => {
    console.error('Fatal:', err)
    process.exit(1)
})
