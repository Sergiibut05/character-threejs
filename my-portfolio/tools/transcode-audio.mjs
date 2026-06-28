/**
 * Audio transcode pipeline for the soundtrack.
 *
 * Reads the source .mp3 files (exported from Suno, cover art embedded) from
 * `audio-source/` and produces web-ready assets under `static/audio/`:
 *   - <id>.webm  → Opus  ~96 kbps  (Chrome / Firefox / Android)
 *   - <id>.m4a   → AAC   ~128 kbps (Safari / iOS)
 *   - covers/<id>.jpg → embedded cover art, re-encoded & resized to 512px
 *   - tracks.json → manifest consumed by AudioManager
 *
 * Uses the `ffmpeg-static` binary, so no system ffmpeg install is needed.
 *
 * Run:  node tools/transcode-audio.mjs [--force]
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT = path.resolve(__dirname, '..')
const SOURCE_DIR = path.join(PROJECT, 'audio-source')
const OUT_DIR = path.join(PROJECT, 'static', 'audio')
const TRACKS_DIR = path.join(OUT_DIR, 'tracks')
const COVERS_DIR = path.join(OUT_DIR, 'covers')
const MANIFEST = path.join(OUT_DIR, 'tracks.json')
const FORCE = process.argv.includes('--force')

const OPUS_BITRATE = '96k'
const AAC_BITRATE = '128k'
const COVER_SIZE = 512

function slugify(name) {
    return name
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

/** Run ffmpeg; resolves with { code, stderr }. Never rejects on non-zero. */
function ffmpeg(args) {
    return new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
        let stderr = ''
        child.stderr.on('data', (d) => { stderr += d.toString() })
        child.on('error', reject)
        child.on('close', (code) => resolve({ code, stderr }))
    })
}

async function fileExists(f) {
    try { await fs.access(f); return true } catch { return false }
}

/** Parse "Duration: HH:MM:SS.xx" from ffmpeg stderr → seconds (int). */
function parseDuration(stderr) {
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (!m) return null
    return Math.round(+m[1] * 3600 + +m[2] * 60 + +m[3])
}

async function probeDuration(input) {
    const { stderr } = await ffmpeg(['-i', input])   // no output → ffmpeg exits 1, that's fine
    return parseDuration(stderr)
}

async function encodeOpus(input, out) {
    const { code, stderr } = await ffmpeg([
        '-y', '-i', input, '-vn', '-c:a', 'libopus', '-b:a', OPUS_BITRATE, out
    ])
    if (code !== 0) throw new Error(`Opus encode failed:\n${stderr.split('\n').slice(-6).join('\n')}`)
}

async function encodeAac(input, out) {
    const { code, stderr } = await ffmpeg([
        '-y', '-i', input, '-vn', '-c:a', 'aac', '-b:a', AAC_BITRATE, '-movflags', '+faststart', out
    ])
    if (code !== 0) throw new Error(`AAC encode failed:\n${stderr.split('\n').slice(-6).join('\n')}`)
}

/** Extract embedded cover art → square jpg. Returns true if a cover was written. */
async function extractCover(input, out) {
    const { code } = await ffmpeg([
        '-y', '-i', input, '-an', '-vframes', '1',
        '-vf', `scale=${COVER_SIZE}:${COVER_SIZE}:force_original_aspect_ratio=increase,crop=${COVER_SIZE}:${COVER_SIZE}`,
        '-q:v', '3', out
    ])
    return code === 0 && await fileExists(out)
}

async function main() {
    if (!await fileExists(SOURCE_DIR)) {
        console.error(`✗ Source dir not found: ${SOURCE_DIR}`)
        process.exit(1)
    }
    await fs.mkdir(TRACKS_DIR, { recursive: true })
    await fs.mkdir(COVERS_DIR, { recursive: true })

    const all = await fs.readdir(SOURCE_DIR)
    const mp3s = all.filter((f) => f.toLowerCase().endsWith('.mp3')).sort()
    if (mp3s.length === 0) {
        console.error(`✗ No .mp3 files in ${SOURCE_DIR}`)
        process.exit(1)
    }

    console.log(`Transcoding ${mp3s.length} track(s) with ffmpeg-static\n`)
    const manifest = []

    for (let i = 0; i < mp3s.length; i++) {
        const file = mp3s[i]
        const title = path.basename(file, path.extname(file))
        const id = slugify(title)
        const input = path.join(SOURCE_DIR, file)
        const webm = path.join(TRACKS_DIR, `${id}.webm`)
        const m4a = path.join(TRACKS_DIR, `${id}.m4a`)
        const cover = path.join(COVERS_DIR, `${id}.jpg`)
        const tag = `[${i + 1}/${mp3s.length}]`

        console.log(`${tag} ${title}  →  ${id}`)

        const duration = await probeDuration(input)

        const needOpus = FORCE || !await fileExists(webm)
        const needAac = FORCE || !await fileExists(m4a)
        const needCover = FORCE || !await fileExists(cover)

        if (needOpus) { await encodeOpus(input, webm); console.log(`   ✓ opus  ${id}.webm`) }
        else console.log(`   · opus cached`)
        if (needAac) { await encodeAac(input, m4a); console.log(`   ✓ aac   ${id}.m4a`) }
        else console.log(`   · aac cached`)

        let hasCover = await fileExists(cover)
        if (needCover) {
            hasCover = await extractCover(input, cover)
            console.log(hasCover ? `   ✓ cover ${id}.jpg` : `   ⚠ no embedded cover art`)
        }

        const [ws, ms] = await Promise.all([fs.stat(webm), fs.stat(m4a)])
        console.log(`   (${(ws.size / 1024).toFixed(0)} KB opus · ${(ms.size / 1024).toFixed(0)} KB aac · ${duration ?? '?'}s)\n`)

        manifest.push({
            id,
            title,
            src: [`/audio/tracks/${id}.webm`, `/audio/tracks/${id}.m4a`],
            cover: hasCover ? `/audio/covers/${id}.jpg` : null,
            duration: duration ?? null
        })
    }

    await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
    console.log(`✅ Wrote manifest: ${path.relative(PROJECT, MANIFEST)} (${manifest.length} tracks)`)
}

main().catch((err) => {
    console.error('Fatal:', err.message)
    process.exit(1)
})
