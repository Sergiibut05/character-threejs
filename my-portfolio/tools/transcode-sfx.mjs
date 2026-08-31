/**
 * SFX transcode pipeline.
 *
 * Converts the raw sound-effect sources (large .wav / .mp3) into the pair the
 * game loads:
 *   - <name>.webm → Opus (Chrome / Firefox / Android)
 *   - <name>.m4a  → AAC  (Safari / iOS)
 *
 * Two formats because no single one is safe everywhere. Howler picks the first
 * the browser reports it can play, so only ONE is ever downloaded.
 *
 * Each entry carries its own channel count and bitrates, because the beds and
 * the one-shots want very different things: an ambience loop is a stereo bed
 * you hear for minutes, a footstep is a 0.2 s mono click you hear a thousand
 * times. Encoding a footstep like an ambience is ~8x the bytes for something
 * nobody can tell apart.
 *
 * Uses `ffmpeg-static`, so no system ffmpeg is needed.
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

// Profiles. `ch` is the output channel count — downmixing a percussive mono-ish
// clip to 1 channel halves it for no audible loss.
const BED = { ch: 2, opus: '96k', aac: '128k' }      // long looping ambience
const STINGER = { ch: 2, opus: '72k', aac: '112k' }  // short, but wants its stereo image
const IMPACT = { ch: 1, opus: '56k', aac: '80k' }    // UI clicks, throws, hits
const STEP = { ch: 1, opus: '40k', aac: '64k' }      // footsteps: tiny and constant

// { in: file in audio-source/sfx/, outDir: dir under static/, name: basename }
const SOURCES = [
    { in: 'ambience.wav', outDir: 'sounds/ambience', name: 'ambience', ...BED },
    { in: 'fire.mp3', outDir: 'sounds/fire', name: 'fire', ...BED },
    { in: 'river.wav', outDir: 'sounds/water', name: 'river', ...BED },

    // Footsteps. Two clips each, alternated at runtime so left and right differ.
    { in: 'walk/walk1.wav', outDir: 'sounds/walk', name: 'walk1', ...STEP },
    { in: 'walk/walk2.wav', outDir: 'sounds/walk', name: 'walk2', ...STEP },
    { in: 'run/run1.wav', outDir: 'sounds/run', name: 'run1', ...STEP },
    { in: 'run/run2.wav', outDir: 'sounds/run', name: 'run2', ...STEP },

    // One click for opening AND closing a panel. `menu/open.wav` is kept as a
    // source but deliberately NOT built: the longer flourish read as an event
    // of its own beside the short close tick.
    { in: 'menu/close.wav', outDir: 'sounds/menu', name: 'close', ...IMPACT },

    { in: 'freesby/throw.wav', outDir: 'sounds/freesby', name: 'throw', ...IMPACT },
    { in: 'beach/ball-sound.wav', outDir: 'sounds/beach', name: 'ball-sound', ...IMPACT },

    { in: 'freesby/good.wav', outDir: 'sounds/freesby', name: 'good', ...STINGER },
    { in: 'freesby/great.wav', outDir: 'sounds/freesby', name: 'great', ...STINGER },
    { in: 'freesby/excellent.wav', outDir: 'sounds/freesby', name: 'excellent', ...STINGER },
    { in: 'freesby/finish.wav', outDir: 'sounds/freesby', name: 'finish', ...STINGER }
]

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

async function encode(input, out, codec, bitrate, channels) {
    const args = ['-y', '-i', input, '-vn', '-ac', String(channels), '-c:a', codec, '-b:a', bitrate]
    if (codec === 'libopus') args.push('-vbr', 'on', '-application', 'audio')
    if (codec === 'aac') args.push('-movflags', '+faststart')
    args.push(out)
    const { code, stderr } = await ffmpeg(args)
    if (code !== 0) throw new Error(`${codec} failed:\n${stderr.split('\n').slice(-6).join('\n')}`)
}

async function main() {
    console.log(`Transcoding ${SOURCES.length} SFX with ffmpeg-static\n`)
    for (let i = 0; i < SOURCES.length; i++) {
        const { in: inFile, outDir, name: base, ch, opus, aac } = SOURCES[i]
        const input = path.join(SOURCE_DIR, inFile)
        if (!await fileExists(input)) { console.warn(`  ⚠ missing audio-source/sfx/${inFile}`); continue }

        const dir = path.join(STATIC, outDir)
        await fs.mkdir(dir, { recursive: true })
        const webm = path.join(dir, `${base}.webm`)
        const m4a = path.join(dir, `${base}.m4a`)

        console.log(`[${i + 1}/${SOURCES.length}] ${inFile}`)
        if (FORCE || !await fileExists(webm)) { await encode(input, webm, 'libopus', opus, ch); console.log(`   ✓ ${base}.webm`) }
        else console.log('   · webm cached')
        if (FORCE || !await fileExists(m4a)) { await encode(input, m4a, 'aac', aac, ch); console.log(`   ✓ ${base}.m4a`) }
        else console.log('   · m4a cached')

        const [a, b] = await Promise.all([fs.stat(webm), fs.stat(m4a)])
        console.log(`   (${(a.size / 1024).toFixed(0)} KB opus · ${(b.size / 1024).toFixed(0)} KB aac)\n`)
    }
    console.log('✅ SFX transcoded.')
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(1) })
