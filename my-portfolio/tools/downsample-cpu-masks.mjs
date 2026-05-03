/**
 * downsample-cpu-masks.mjs
 *
 * The Floor shader uses two big PNG masks (`grass-floor-1.png`,
 * `grass-floor-2.png`) for **CPU-side** triangle weighting (figuring out
 * where to spawn grass blades). KTX2 versions exist for GPU sampling but
 * can't be drawn onto a 2D canvas, so the original PNG copies are loaded
 * separately. They weigh ~2.3 MB combined which is a *lot* for the
 * critical loading path.
 *
 * For CPU sampling we only need rough per-pixel "grass vs dirt" info, so
 * a 256×256 thumbnail is plenty. This script generates downsampled
 * companions named `*-cpu.png` next to the originals.
 *
 * Run:
 *     node tools/downsample-cpu-masks.mjs
 */
import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const TARGETS = [
    {
        in:  path.join(ROOT, 'static/models/floor/grass-floor-1.png'),
        out: path.join(ROOT, 'static/models/floor/grass-floor-1-cpu.png')
    },
    {
        in:  path.join(ROOT, 'static/models/floor/grass-floor-2.png'),
        out: path.join(ROOT, 'static/models/floor/grass-floor-2-cpu.png')
    }
]

const TARGET_SIZE = 256

async function run() {
    for (const t of TARGETS) {
        const src = await sharp(t.in).metadata()
        await sharp(t.in)
            .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'inside', kernel: 'lanczos3' })
            .png({ compressionLevel: 9, palette: true })
            .toFile(t.out)
        const stat = await sharp(t.out).metadata()
        const sizeIn  = (await sharp(t.in).toBuffer()).length
        const sizeOut = (await sharp(t.out).toBuffer()).length
        console.log(
            `${path.basename(t.in)}: ` +
            `${src.width}×${src.height} → ${stat.width}×${stat.height}  ` +
            `(${(sizeIn / 1024).toFixed(0)} kB → ${(sizeOut / 1024).toFixed(0)} kB)`
        )
    }
    console.log('\n✅ CPU masks downsampled. Update sources.js to point to the *-cpu.png files.')
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
