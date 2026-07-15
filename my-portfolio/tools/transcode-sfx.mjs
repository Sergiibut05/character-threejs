/**
 * SFX transcode pipeline.
 *
 * Converts the raw sound-effect sources (large .wav / .mp3) into web-ready
 * looping assets next to their source:
 *   - <name>.webm → Opus  ~96 kbps (Chrome / Firefox / Android)
 *   - <name>.m4a  → AAC   ~128 kbps (Safari / iOS)
 *
 * Uses `ffmpeg-static` (no system ffmpeg needed).
 *
 * Run:  node tools/transcode-sfx.mjs [--force]
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT = path.resolve(__dirname, '..')
const SOURCE_DIR = path.join(PROJECT, 'audio-source', 'sfx')   // heavy raw files (not shipped)
const STATIC = path.join(PROJECT, 'static')
const FORCE = process.argv.includes('--force')

// { in: file in audio-source/sfx/, outDir: dir under static/, name: output basename }
const SOURCES = [
    { in: 'ambience.wav', outDir: 'sounds/ambience', name: 'ambience' },
    { in: 'fire.mp3', outDir: 'sounds/fire', name: 'fire' },
    { in: 'river.wav', outDir: 'sounds/water', name: 'river' }
]

const OPUS_BITRATE = '96k'
const AAC_BITRATE = '128k'

function ffmpeg(args) {
    return new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
        let stderr = ''
        child.stderr.on('data', (d) => { stderr += d.toString() })
        child.on('error', reject)
        child.on('close', (code) => resolve({ code, stderr }))
    })
}

async function fileExists(f) { try { await fs.access(f); return true } catch { return false } }

async function encode(input, out, codec, bitrate) {
    const args = ['-y', '-i', input, '-vn', '-c:a', codec, '-b:a', bitrate]
    if (codec === 'aac') args.push('-movflags', '+faststart')
    args.push(out)
    const { code, stderr } = await ffmpeg(args)
    if (code !== 0) throw new Error(`${codec} failed:\n${stderr.split('\n').slice(-6).join('\n')}`)
}

async function main() {
    console.log(`Transcoding ${SOURCES.length} SFX with ffmpeg-static\n`)
    for (let i = 0; i < SOURCES.length; i++) {
        const { in: inFile, outDir, name: base } = SOURCES[i]
        const input = path.join(SOURCE_DIR, inFile)
        if (!await fileExists(input)) { console.warn(`  ⚠ missing audio-source/sfx/${inFile}`); continue }

        const dir = path.join(STATIC, outDir)
        await fs.mkdir(dir, { recursive: true })
        const webm = path.join(dir, `${base}.webm`)
        const m4a = path.join(dir, `${base}.m4a`)

        console.log(`[${i + 1}/${SOURCES.length}] ${inFile}`)
        if (FORCE || !await fileExists(webm)) { await encode(input, webm, 'libopus', OPUS_BITRATE); console.log(`   ✓ ${base}.webm`) }
        else console.log('   · webm cached')
        if (FORCE || !await fileExists(m4a)) { await encode(input, m4a, 'aac', AAC_BITRATE); console.log(`   ✓ ${base}.m4a`) }
        else console.log('   · m4a cached')

        const [a, b] = await Promise.all([fs.stat(webm), fs.stat(m4a)])
        console.log(`   (${(a.size / 1024).toFixed(0)} KB opus · ${(b.size / 1024).toFixed(0)} KB aac)\n`)
    }
    console.log('✅ SFX transcoded.')
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(1) })
