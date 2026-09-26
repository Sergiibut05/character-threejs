/**
 * Cut a headline into its rendered lines, so each one can arrive on its own.
 *
 * `.ov-rise` already brings a headline up out of a mask -- `clip-path: inset(-6%
 * 0 105% 0)` wiping open as it goes. This is the same idea spent per line
 * instead of per block, which is the whole difference between a headline that
 * appears and one that is delivered: three lines rising a tenth of a second
 * apart read as someone speaking, and a three-line block rising as one slab
 * reads as a panel sliding in.
 *
 * ── Lines are not a thing the DOM will tell you about ────────────────────
 *
 * There is no selector for "the second line", because where a line ends is a
 * result of layout and changes with every width, font and translation. So the
 * text is cut into words, laid out, ASKED where each word landed, and then
 * reassembled with one wrapper per group of words that share a top. Which also
 * means it has to be redone whenever the width changes -- the caller owns
 * that, and the original text is kept here so a re-split is not a re-split of
 * the previous split.
 *
 * Plain text only, on purpose. These headlines are set with textContent and
 * nothing else; anything carrying markup is left exactly as it was rather than
 * silently flattened.
 */
const SOURCE = new WeakMap()

/** @param {HTMLElement} el */
export function splitLines(el) {
    if (!el) return
    let text = SOURCE.get(el)
    if (text === undefined) {
        // Only claim elements whose content is a single run of text.
        if (el.children.length) return
        text = el.textContent
        SOURCE.set(el, text)
    }

    const words = text.split(/\s+/).filter(Boolean)
    if (!words.length) return

    // Pass one: every word its own box, so the layout can be interrogated.
    el.textContent = ''
    const spans = words.map((w) => {
        const s = document.createElement('span')
        s.textContent = w
        return s
    })
    for (const s of spans) {
        el.appendChild(s)
        el.appendChild(document.createTextNode(' '))
    }

    // Pass two: read. All the appends are done, so the first of these forces
    // one layout and the rest come out of it for free.
    const lines = []
    let top = null
    for (let i = 0; i < spans.length; i++) {
        const t = spans[i].offsetTop
        // A pixel of slack: superscripts and mixed font sizes can sit a
        // fraction off their neighbours without being on another line.
        if (top === null || Math.abs(t - top) > 1) {
            lines.push([])
            top = t
        }
        lines[lines.length - 1].push(words[i])
    }

    // Pass three: rebuild, one mask per line with the words back inside it.
    el.textContent = ''
    lines.forEach((line, i) => {
        const mask = document.createElement('span')
        mask.className = 'ov-line'
        mask.style.setProperty('--l', i)
        const inner = document.createElement('span')
        inner.className = 'ov-line-i'
        inner.textContent = line.join(' ')
        mask.appendChild(inner)
        el.appendChild(mask)
        // A space BETWEEN the masks, and it is not cosmetic. The masks are
        // display: block, so nothing on screen changes -- but textContent is
        // a plain concatenation, and without this the headline reads back as
        // "construidoy esta funcionando" to anything that asks for it as
        // text: a screen reader, a copy, a search. The whitespace collapses
        // to nothing when rendered and survives when read.
        if (i < lines.length - 1) el.appendChild(document.createTextNode(' '))
    })
    el.classList.add('ov-split')
}

/** Put it back the way it was found. */
export function unsplitLines(el) {
    const text = SOURCE.get(el)
    if (text === undefined) return
    el.textContent = text
    el.classList.remove('ov-split')
    SOURCE.delete(el)
}
