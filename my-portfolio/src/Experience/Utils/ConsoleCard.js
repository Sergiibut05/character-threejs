import { LINKS } from '../World/ui/profileData.js'

/**
 * ConsoleCard — what a curious developer finds in the console.
 *
 * Anyone who opens devtools on a 3D portfolio came looking for how it works,
 * so this answers that instead of leaving them to read a minified bundle: the
 * stack, where the source is, and who to thank for it.
 *
 * Everything here is read from profileData.js rather than retyped, so the
 * console and the in-world panels cannot drift apart.
 */

const ART = [
    '███████╗███████╗██████╗  ██████╗ ██╗██╗',
    '██╔════╝██╔════╝██╔══██╗██╔════╝ ██║██║',
    '███████╗█████╗  ██████╔╝██║  ███╗██║██║',
    '╚════██║██╔══╝  ██╔══██╗██║   ██║██║██║',
    '███████║███████╗██║  ██║╚██████╔╝██║██║',
    '╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝╚═╝',
    '',
    '██████╗ ██╗   ██╗████████╗██████╗ ██╗██╗',
    '██╔══██╗██║   ██║╚══██╔══╝██╔══██╗██║██║',
    '██████╔╝██║   ██║   ██║   ██████╔╝██║██║',
    '██╔══██╗██║   ██║   ██║   ██╔══██╗██║██║',
    '██████╔╝╚██████╔╝   ██║   ██║  ██║██║██║',
    '╚═════╝  ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝'
].join('\n')

/** A titled box. The rule is padded to a fixed width so they all line up. */
function box(title, lines) {
    const WIDTH = 26
    const head = `╔═ ${title} ` + '═'.repeat(Math.max(1, WIDTH - title.length)) + '╗'
    const foot = '╚' + '═'.repeat(WIDTH + 3) + '╝'
    return [head, ...lines.map((l) => `║ ${l}`), foot].join('\n')
}

/** `label ⇒ value`, with the arrows in a column. */
function rows(pairs) {
    const w = Math.max(...pairs.map(([k]) => k.length))
    return pairs.map(([k, v]) => `${k.padEnd(w)} ⇒ ${v}`)
}

function print() {
    const title = 'color:#41a06e;font-weight:700;line-height:1.15'
    const body = 'color:inherit;line-height:1.5'

    console.log(`%c${ART}`, title)

    console.log('%c' + box('Hello', [
        'Thanks for opening the console — you are exactly the kind of',
        'visitor I built this for.',
        '',
        'This is a small island you can walk around. If you would rather',
        'read than explore, the "Quick overview" button on the start',
        'screen opens the whole portfolio as a plain page.'
    ]), body)

    console.log('%c' + box('Say hi', rows([
        ['Mail', LINKS.email],
        ['GitHub', LINKS.github],
        ['LinkedIn', LINKS.linkedin]
    ])), body)

    console.log('%c' + box('Stack', rows([
        ['Rendering', 'Three.js r183 — WebGPURenderer'],
        ['Shading', 'TSL (no GLSL strings anywhere)'],
        ['Physics', 'Rapier'],
        ['Audio', 'Howler.js'],
        ['Music', 'Suno AI — ' + LINKS.sunoPlaylist],
        ['Leaderboard', 'Firebase'],
        ['Art', 'Blender, low-poly'],
        ['Build', 'Vite — Draco meshes, KTX2 textures']
    ])), body)

    console.log('%c' + box('Poke at it', [
        'Add #debug to the URL and reload for the tweak panel:',
        'time of day, lighting, camera, every system in the world.',
        '',
        'window.experience is the whole thing, if you want a look around.'
    ]), body)

    console.log('%c' + box('Source', [
        'https://github.com/Sergiibut05/character-threejs'
    ]), body)

    console.log('%c' + box('Thank you', [
        'Bruno Simon, for Three.js Journey — where I learned most of what',
        'makes this run — and for his portfolio, the inspiration behind',
        'this one.',
        `  ${LINKS.threejsJourney}`,
        `  ${LINKS.brunoSimon}`,
        '',
        'Isa Lousberg, for the lovely low-poly models.',
        `  ${LINKS.isaLousberg}`,
        '',
        'And mrdoob and everyone on Three.js — plus Sunag, whose TSL is',
        'what let this be written once and run on WebGPU.',
        '  https://threejs.org/'
    ]), body)
}

/**
 * Print the card, and put it back if the console is cleared.
 *
 * `console.clear()` still clears — breaking it would be a rotten thing to do
 * to a developer poking around — but the card comes back after it, so the
 * credits and the source link cannot be lost by accident. The property is made
 * non-writable so a stray script (or an over-eager extension) cannot quietly
 * unhook it either.
 *
 * Guarded and wrapped in try/catch throughout: this is an easter egg, and an
 * easter egg has no business being able to break the site. A console that
 * refuses to be redefined, or is not there at all, just gets the one print.
 */
export default function printConsoleCard() {
    if (typeof console === 'undefined' || window.__consoleCardPrinted) return
    window.__consoleCardPrinted = true

    try { print() } catch { return }

    try {
        const original = console.clear.bind(console)
        const guarded = function clear() {
            original()
            try { print() } catch { /* never let the easter egg throw */ }
        }
        Object.defineProperty(console, 'clear', {
            value: guarded,
            writable: false,
            configurable: false
        })
    } catch { /* some environment already locked it — the card still printed */ }
}
