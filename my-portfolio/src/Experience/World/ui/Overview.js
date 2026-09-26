/**
 * Overview — the "Quick overview" reading of this portfolio.
 *
 * A conventional, scannable document for anyone who does not have five minutes
 * to walk a 3D world. It needs none of the 3D assets, so it opens instantly
 * while the world is still downloading in the background.
 *
 * Everything is built in JS rather than markup in index.html so the whole
 * feature (module + stylesheet) code-splits out of the main bundle: visitors
 * who go straight to the world never download any of it.
 *
 * Motion is CSS transitions driven by one IntersectionObserver, plus a single
 * rAF loop for the progress bar and the nav. No animation library — this page
 * exists to be fast, and a 70 KB tweening engine would work against that.
 */
import './overview.css'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import i18n, { LOCALES } from '../../Utils/i18n.js'
import { getContent, richText } from './overviewContent.js'
import { SOCIALS } from './socialData.js'
import ProjectFrame from './ProjectFrame.js'
import Magnetic from '../../Utils/Magnetic.js'
import Tilt from '../../Utils/Tilt.js'
import { splitLines } from '../../Utils/SplitLines.js'
import CountUp from '../../Utils/CountUp.js'

const CV_URL = '/cv.pdf'

// ─── Icons (inline SVG, currentColor — no emoji, per the project's UI rules) ─
const SVG = {
    back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`,
    arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`,
    external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l5 5L19 7"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`,
    cap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9l10-5 10 5-10 5Z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/></svg>`,
    /* The dashed outline for the two provisional surfaces — "a few more" and
       the upcoming-project card. It is an SVG and not `border-style: dashed`
       because a CSS dashed border cannot be animated: the dashes are painted
       by the border algorithm and there is no property to move them. A rect's
       stroke-dashoffset IS animatable, which is what lets them march.
       Deliberately no viewBox — see .ov-dash in overview.css. */
    dashRing: `<svg class="ov-dash" aria-hidden="true" focusable="false"><rect/></svg>`
}

/** One dash plus one gap, in px. Must match `stroke-dasharray: 12 9` on
 *  .ov-dash rect, and the distance ov-dash-march travels in one loop. */
const DASH_PERIOD = 21

const el = (tag, cls, html) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (html != null) n.innerHTML = html
    return n
}

const txt = (tag, cls, text) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    n.textContent = text
    return n
}

const NAV_ITEMS = ['about', 'projects', 'path', 'skills', 'contact']

/**
 * A project name with its arrow sized on purpose.
 *
 * "SQL → 3D ER" read weaker than the other two titles beside it and there
 * is a measurable reason: Fredoka has no U+2192, so the browser substitutes
 * the glyph from a system font. Measured at 38px, that arrow is 38px wide --
 * a full em -- while Fredoka's own capitals are around 21. So the title
 * carried one oversized, lighter-weight character from a different typeface
 * right through its middle, and the eye reads the whole line as thinner.
 *
 * Nothing can make Fredoka draw an arrow it does not have. What this does is
 * stop the substitute from looking like an accident: two thirds of the size,
 * heavier to match the density around it, nudged onto the caps' optical
 * centre. Any title without an arrow goes through untouched.
 */
const projectName = (title) => {
    const node = el('span', 'ov-work-name')
    String(title).split('\u2192').forEach((part, i) => {
        if (i) node.appendChild(txt('span', 'ov-glyph-arrow', '\u2192'))
        if (part) node.appendChild(document.createTextNode(part))
    })
    return node
}


export default class Overview {
    /** Shared across instances: the CV either ships with the site or it does not. */
    static _cvProbe = null
    static _cvExists = false

    /**
     * @param {object} opts
     * @param {() => void} opts.onExplore  Leave the overview and enter the 3D world.
     * @param {() => void} [opts.onClose]  Back to the start screen.
     * @param {boolean} [opts.worldReady]  Whether the world can be entered yet.
     * @param {object} [opts.resources]    Experience resources, for the live portrait.
     */
    constructor({ onExplore, onClose, worldReady = false, resources = null } = {}) {
        this.onExplore = onExplore
        this.onClose = onClose
        this.worldReady = worldReady
        this.resources = resources
        this.isOpen = false

        this.sections = []
        this._navButtons = []
        this._frameQueued = false

        this._onKeyDown = this._onKeyDown.bind(this)
        this._onScroll = this._onScroll.bind(this)
        this._onResize = this._onResize.bind(this)
    }

    /** Loads the catalog for the detected locale, then builds the DOM. */
    async init() {
        // init() is idempotent and does the same detect() — whichever of the
        // world boot and this page runs first wins, and neither persists a
        // merely detected locale.
        await i18n.init()
        this._build()
        this._watchResources()
        return this
    }

    // ═══ Build ════════════════════════════════════════════════════════════
    _build() {
        this.el = el('div', 'ov-root')
        this.el.setAttribute('role', 'dialog')
        this.el.setAttribute('aria-modal', 'true')
        this.el.setAttribute('aria-label', 'Portfolio')
        // Focusable, but never in the tab order: opening the page parks focus
        // here rather than on a control. See open().
        this.el.tabIndex = -1
        this.el.hidden = true

        this.skip = el('a', 'ov-skip')
        this.skip.href = '#ov-main'

        this.bar = el('header', 'ov-bar')
        this.progress = el('span', 'ov-progress')

        this.backBtn = el('button', 'ov-back')
        this.backBtn.type = 'button'
        this.backBtn.addEventListener('click', () => this.close())

        this.nav = el('nav', 'ov-nav')
        this.navPill = el('span', 'ov-nav-pill')

        // Mobile: one button opening a top-layer sheet. Popover gives light
        // dismiss, Escape and focus handling natively — no JS for any of it.
        this.menuBtn = el('button', 'ov-menu-btn')
        this.menuBtn.type = 'button'
        this.menuBtn.setAttribute('popovertarget', 'ov-menu')

        this.menu = el('div', 'ov-sheet')
        this.menu.id = 'ov-menu'
        // Opening the menu is a request for the controls, so the bar comes
        // back with it: otherwise the close button has nothing to return to.
        this.menu.addEventListener('toggle', (e) => {
            this._menuOpen = e.newState === 'open'
            if (this._menuOpen) this.bar.classList.remove('is-tucked')
        })
        // Lenis listens on the window and would otherwise eat a wheel or a
        // drag meant for a sheet that has scrolled past its own height.
        this.menu.setAttribute('data-lenis-prevent', '')
        this.menu.popover = 'auto'

        /*
         * The grab handle, at the BOTTOM, because this sheet comes down from
         * the top and closes upwards. The bar is the phone convention for
         * "this panel can be pushed away", and the direction it implies is
         * whichever edge it sits on.
         *
         * It is not decoration. A handle that only looks draggable is worse
         * than no handle, because the gesture it invites silently fails, so
         * the drag below is the reason this element exists rather than a
         * ::after on the sheet -- pseudo-elements cannot take pointer events.
         *
         * The native popover keeps its click-outside and its Escape, and the
         * close button stays. This is a third way out for the thumb that is
         * already at the bottom of the screen, not a replacement for any of
         * them, which is also why it is aria-hidden: it adds no capability a
         * keyboard or screen-reader user does not already have.
         */
        this.sheetGrab = el('div', 'ov-sheet-grab')
        this.sheetGrab.setAttribute('aria-hidden', 'true')
        this.sheetGrab.appendChild(el('span', 'ov-sheet-grab-bar'))
        this._bindSheetDrag()

        this.langWrap = el('div', 'ov-lang')
        this.langWrap.setAttribute('role', 'group')

        this.bar.append(this.backBtn, this.nav, this.langWrap, this.menuBtn)

        this.main = el('main', 'ov-main')
        this.main.id = 'ov-main'

        // Created ONCE and re-parented on every render. A language switch
        // rebuilds the hero, and a fresh <canvas> would leave the renderer bound
        // to the detached one — the character would simply vanish.
        this.portalCanvas = el('canvas', 'ov-portal-canvas')
        this.portalCanvas.setAttribute('aria-hidden', 'true')

        // Same deal for the dog closing the page — one canvas, re-parented.
        this.dogCanvas = el('canvas', 'ov-dog-canvas')
        this.dogCanvas.setAttribute('aria-hidden', 'true')

        // Head tracking listens on the whole page, not on the character's own
        // box: he is standing in the open now, and a gaze that only woke up
        // inside an invisible rectangle read as broken.
        this._onPointerMove = (e) => {
            // The background field leans toward the cursor whether or not the
            // character has loaded, so this runs before the viewport check.
            if (this.heroPattern) {
                const nx = (e.clientX / window.innerWidth) * 2 - 1
                const ny = (e.clientY / window.innerHeight) * 2 - 1
                this.heroPattern.style.setProperty('--ov-mx', `${(-nx * 16).toFixed(1)}px`)
                this.heroPattern.style.setProperty('--ov-my', `${(-ny * 12).toFixed(1)}px`)
            }

            if (!this.viewport?.ready || !this.portal) return
            const r = this.portal.getBoundingClientRect()
            const cx = r.left + r.width * 0.5
            const cy = r.top + r.height * 0.45

            // Normalise against the room on EACH side, not half the viewport.
            // He stands in the right-hand column, so there is much less screen
            // to his right than to his left — dividing by half the width capped
            // the rightward look at 0.5 while the left reached a full 1.0, and
            // he visibly under-turned in that direction.
            const dx = e.clientX - cx
            const dy = e.clientY - cy
            this.viewport.setPointer(
                dx / Math.max(1, dx >= 0 ? window.innerWidth - cx : cx),
                dy / Math.max(1, dy >= 0 ? window.innerHeight - cy : cy)
            )
        }

        // The progress line is a child of the ROOT, not of the bar: it is
        // fixed to the top edge of the window now, and inside the bar it would
        // be positioned against a sticky element that moves.
        this.el.append(this.skip, this.bar, this.progress, this.menu, this.main)
        document.body.appendChild(this.el)

        // Before _render: the figures are written during it.
        this._count = new CountUp()

        this._renderLangToggle()
        this._render()

        // On `window`, not on the element: the page itself is the scroller
        // now (see .ov-root in overview.css).
        window.addEventListener('scroll', this._onScroll, { passive: true })
    }

    /** The language pill travels too, for the same reason the nav's does. */
    _litLang(i) {
        const at = i == null ? this._langIndex : i
        this.langWrap.style.setProperty('--lang-i', at)
        this.langWrap.style.setProperty('--lang-s', i == null ? '1' : '1.12')
        for (const [n, b] of this._langButtons.entries()) {
            b.classList.toggle('is-lit', n === at)
            b.classList.toggle('is-hot', i != null && n === i)
        }
    }

    _renderLangToggle() {
        this.langWrap.innerHTML = ''
        this._langButtons = []
        // The pill behind the buttons is ONE object that moves, the same way
        // the nav's does. Two buttons that each paint their own background
        // swap states; one pill that travels between them is a thing changing
        // its mind, and it costs a transform.
        this.langWrap.style.setProperty('--lang-n', LOCALES.length)
        this._langIndex = Math.max(0, LOCALES.indexOf(i18n.locale))
        LOCALES.forEach((code, i) => {
            const b = txt('button', 'ov-lang-btn', code.toUpperCase())
            b.type = 'button'
            b.setAttribute('aria-pressed', String(code === i18n.locale))
            b.addEventListener('click', () => this.setLang(code))
            b.addEventListener('pointerenter', () => this._litLang(i))
            b.addEventListener('focus', () => this._litLang(i))
            b.addEventListener('blur', () => this._litLang())
            this.langWrap.appendChild(b)
            this._langButtons.push(b)
        })
        this.langWrap.onpointerleave = () => this._litLang()
        this._litLang()
    }

    /** Rebuild every piece of language-dependent DOM. */
    _render() {
        const c = getContent()
        this.content = c

        this.el.setAttribute('lang', i18n.locale)
        this.skip.textContent = c.a11y.skip
        this.backBtn.innerHTML = `${SVG.back}<span>${c.a11y.close}</span>`
        this.backBtn.setAttribute('aria-label', c.a11y.close)
        this.menuBtn.innerHTML = SVG.menu
        this.menuBtn.setAttribute('aria-label', c.a11y.openMenu)
        this.langWrap.setAttribute('aria-label', c.a11y.langSwitch)

        this._renderNav(c)
        this._renderSheet(c)

        // BEFORE the DOM is thrown away, and nowhere else.
        //
        // This lived at the top of _projects(), which looks like the same
        // moment and is not: _fx is created DURING _projects, so on the render
        // after a language switch the dispose ran against canvases that had
        // just been attached, pulled them back out, and left every card with
        // the has-fx class and nothing behind it. Here it can only ever see the
        // previous render's.
        this._workIo?.disconnect()
        this._frame?.dispose()
        this._frame = null
        clearTimeout(this._detailTimer)

        this.main.innerHTML = ''
        this.main.append(
            this._hero(c),
            this._about(c),
            this._projects(c),
            this._path(c),
            this._skills(c),
            this._contact(c),
            this._footer(c)
        )

        this.sections = Array.from(this.main.querySelectorAll('.ov-section[id]'))
        this._observeReveals()
        this._observeDashRings()
        this._syncExploreButtons()
        this._mountPortrait()
        this._mountDog()
        this._observeDogStage()

        // The nav buttons are new objects with no aria-current, so the cached id
        // has to go too — otherwise the spy short-circuits and the active item
        // stays unmarked (and loses its white text) until the next scroll.
        this._currentId = null
        this._syncBarHeight()
        this._updateScrollState()
        requestAnimationFrame(() => this._movePill())
    }

    _renderNav(c) {
        this.nav.innerHTML = ''
        this.nav.appendChild(this.navPill)
        this._navButtons = []

        for (const key of NAV_ITEMS) {
            const b = txt('button', 'ov-nav-link', c.nav[key])
            b.type = 'button'
            b.dataset.target = `ov-${key}`
            b.addEventListener('click', () => this._goTo(`ov-${key}`))
            // The pill GOES to whatever you are pointing at, and comes back
            // when you stop. See _movePill.
            b.addEventListener('pointerenter', () => this._movePill(b))
            b.addEventListener('focus', () => this._movePill(b))
            b.addEventListener('blur', () => this._movePill())
            this.nav.appendChild(b)
            this._navButtons.push(b)
        }
        this.nav.addEventListener('pointerleave', () => this._movePill())
    }

    /**
     * The menu, which is an INDEX and not a list of cards.
     *
     * It was five white boxes with borders, an arrow each and a 56px minimum
     * height -- the shape every mobile menu has had since about 2016, and a
     * shape this page uses nowhere else. Five destinations do not need five
     * containers to be told apart: on an empty sheet they are already the only
     * things on screen, and the boxes were drawing a distinction that nothing
     * needed drawing.
     *
     * So the boxes come off and the names go up to display size, numbered, on
     * dashed rules. That is not an idea invented for the sheet: it is exactly
     * the Projects index, which is this page's own way of presenting a short
     * list of places you can go. The menu now reads as part of the document
     * rather than as the operating system's contribution to it.
     *
     * The numbers earn their place twice over. They say how long the page is
     * before you commit to it, and they are what makes a row scan as a line of
     * an index rather than as a link that has lost its underline.
     */
    /**
     * Drag the sheet up to dismiss it.
     *
     * Only upward travel counts: down is where the sheet already is, and
     * letting it stretch that way would invent a state it does not have.
     *
     * The transition is switched off for the duration so the panel tracks the
     * finger exactly, then restored on release so it either springs back or
     * animates out with the same curve it opened with. Clearing the inline
     * transform hands control back to the stylesheet rather than freezing it
     * at whatever the last frame happened to be.
     *
     * Pointer capture matters more than it looks: without it a fast flick
     * leaves the element before the pointerup lands, the gesture never ends,
     * and the sheet stays stuck mid-drag with its transition still disabled.
     */
    _bindSheetDrag() {
        const CLOSE_AT = 56      // px of upward travel that counts as "away"
        let startY = 0
        let travel = 0
        let dragging = false

        const finish = () => {
            if (!dragging) return
            dragging = false
            this.menu.style.transition = ''
            this.menu.style.transform = ''
            if (travel < -CLOSE_AT) this.menu.hidePopover()
        }

        this.sheetGrab.addEventListener('pointerdown', (e) => {
            dragging = true
            startY = e.clientY
            travel = 0
            this.sheetGrab.setPointerCapture(e.pointerId)
            this.menu.style.transition = 'none'
        })
        this.sheetGrab.addEventListener('pointermove', (e) => {
            if (!dragging) return
            travel = Math.min(0, e.clientY - startY)
            this.menu.style.transform = `translateY(${travel}px)`
        })
        this.sheetGrab.addEventListener('pointerup', finish)
        this.sheetGrab.addEventListener('pointercancel', finish)
    }

    _renderSheet(c) {
        this.menu.innerHTML = ''
        this._sheetButtons = []

        const head = el('div', 'ov-sheet-head')
        head.appendChild(txt('span', 'ov-sheet-title', c.a11y.menuTitle))
        const closeBtn = el('button', 'ov-sheet-close', SVG.close)
        closeBtn.type = 'button'
        closeBtn.setAttribute('aria-label', c.a11y.closeMenu)
        closeBtn.setAttribute('popovertarget', 'ov-menu')
        closeBtn.setAttribute('popovertargetaction', 'hide')
        head.appendChild(closeBtn)

        const list = el('nav', 'ov-sheet-list')
        list.setAttribute('aria-label', c.a11y.menuTitle)
        NAV_ITEMS.forEach((key, i) => {
            const b = el('button', 'ov-sheet-link')
            b.type = 'button'
            b.dataset.target = `ov-${key}`
            // The stagger is read from here rather than written per rule, so
            // adding a section to NAV_ITEMS needs no CSS at all.
            b.style.setProperty('--i', i)
            b.appendChild(txt('span', 'ov-sheet-num', String(i + 1).padStart(2, '0')))
            b.appendChild(txt('span', 'ov-sheet-name', c.nav[key]))
            b.addEventListener('click', () => {
                this.menu.hidePopover()
                this._goTo(`ov-${key}`)
            })
            list.appendChild(b)
            this._sheetButtons.push(b)
        })

        this.menu.append(head, list, this.sheetGrab)
        this._markSheet()
    }

    /** Mark the section the reader is actually in, as the nav pill does. */
    _markSheet() {
        if (!this._sheetButtons?.length) return
        for (const b of this._sheetButtons) {
            const on = b.dataset.target === this._currentId
            b.classList.toggle('is-on', on)
            b.setAttribute('aria-current', String(on))
        }
    }

    // ═══ Sections ═════════════════════════════════════════════════════════
    /**
     * A section masthead: a small label, then the sentence set large.
     *
     * It used to be the other way round — the category ("Proyectos") at display
     * size with a green rule growing out of it, and the sentence underneath in
     * body copy. That put the page's biggest type on its least interesting
     * word, five times over, and the rule was decoration standing in for a
     * hierarchy the type was not providing.
     *
     * Turned around, the label is a tab in the margin and the SENTENCE is the
     * headline, which is the one thing in each section worth reading at size.
     * The rule then has nothing left to do and is gone, along with it the
     * reason every section on this page started with a horizontal line.
     *
     * The <h2> is still the category, so the document outline and the nav spy
     * are unchanged: what moved is which of the two is big, not which is the
     * heading.
     */
    _section(id, title, blurb, modifier) {
        const s = el('section', modifier ? `ov-section ${modifier}` : 'ov-section')
        s.id = id
        // The head is no longer one reveal: the label fades in and the
        // headline comes up out of a mask behind it, which is the one piece of
        // motion on this page worth spending a curve on.
        const head = el('div', 'ov-section-head')
        head.appendChild(txt('h2', 'ov-eyebrow ov-reveal', title))
        if (blurb) {
            // Two sentences cannot be a headline. Contact's blurb is a short
            // pitch rather than a title, and at display size it came out five
            // lines deep and swallowed the section under it.
            const long = blurb.length > 78
            head.appendChild(txt('p',
                (long ? 'ov-display ov-display--sm' : 'ov-display') + ' ov-rise'))
            head.lastChild.textContent = blurb
        }
        s.appendChild(head)
        return s
    }

    _hero(c) {
        const hero = el('header', 'ov-hero')

        // Tone-on-tone doodle field, drifting corner to corner. Confined to the
        // hero on purpose: peripheral motion behind long-form text is tiring to
        // read, and everything below here is prose.
        const pattern = el('div', 'ov-hero-pattern')
        pattern.setAttribute('aria-hidden', 'true')
        hero.appendChild(pattern)
        this.heroPattern = pattern

        const inner = el('div', 'ov-hero-inner')

        const text = el('div', 'ov-hero-text')

        const name = txt('h1', 'ov-name ov-reveal', c.name)
        const role = txt('p', 'ov-role ov-reveal', c.hero.role)
        role.style.setProperty('--i', 1)
        const ctas = el('div', 'ov-cta-row ov-reveal')
        ctas.style.setProperty('--i', 3)

        this.heroExplore = el('button', 'ov-btn ov-btn--primary')
        this.heroExplore.type = 'button'
        this.heroExplore.addEventListener('click', () => this._explore())
        ctas.appendChild(this.heroExplore)

        // Always shown so the hero reads complete. Until a cv.pdf actually
        // ships it stays inert rather than handing out a 404 — the probe flips
        // it into a real download the moment the file appears, no code change.
        const cv = el('a', 'ov-btn ov-btn--ghost', `${SVG.download}<span>${c.hero.cv}</span>`)
        cv.href = CV_URL
        cv.setAttribute('download', '')
        cv.addEventListener('click', (e) => {
            if (!Overview._cvExists) e.preventDefault()
        })
        ctas.appendChild(cv)
        this.cvBtn = cv
        this._probeCv()

        text.append(name, role, ctas)

        // ── The window: the character from the world ──
        //
        // A picture, not a door. It used to enter the world when clicked, and
        // nothing said so -- there is no label, no hover, no cursor change
        // worth the name, just a character standing there. A control that
        // takes you somewhere else while looking exactly like an illustration
        // is a trapdoor, and the two "Entrar al mundo" buttons already say the
        // thing out loud. So it is a div now, with the role that describes what
        // it actually is.
        const portal = el('div', 'ov-portal ov-reveal')
        portal.setAttribute('role', 'img')
        portal.setAttribute('aria-label', c.a11y.portrait)
        portal.style.setProperty('--i', 2)

        portal.appendChild(this.portalCanvas)
        portal.appendChild(el('span', 'ov-portal-glow'))
        this.portal = portal

        inner.append(text, portal)
        hero.appendChild(inner)

        // Above the fold: reveal on open rather than waiting for a scroll that
        // may never come. Queued as a task rather than a frame so a throttled
        // tab cannot leave the hero stuck invisible.
        setTimeout(() => {
            hero.querySelectorAll('.ov-reveal').forEach((n) => n.classList.add('is-in'))
        }, 30)
        return hero
    }

    /**
     * About — the one block on this page that exists to be READ.
     *
     * It used to be prose beside a bordered white card, and the card was the
     * problem: a panel with a border, a radius and a shadow reads as a widget
     * dropped into the page, so the section came out looking like a dashboard
     * with a paragraph next to it. What is actually here is a short statement,
     * two facts about where and what, and evidence for the claim the statement
     * makes. That is a column of prose and a rail of specifications, and a rail
     * is drawn with rules, not with a box.
     *
     * The line set large is a STATEMENT, and it is not the first paragraph.
     *
     * It was the first paragraph, and that was the problem: "I finished my
     * higher diploma in Multiplatform App Development at Málaga TechPark" is a
     * line from a CV, and at 34px it is a line from a CV in a very large font.
     * The typography promised editorial and the sentence delivered
     * administrative, which is exactly the mismatch that made the section feel
     * off however well the columns were balanced.
     *
     * So the big line is now a sentence that sounds like a person — taken, as
     * it happens, from the second paragraph, where it had always been sitting
     * unread — and the diploma, the internship and Málaga go back to being
     * what they are: facts, in body copy, underneath.
     */
    _about(c) {
        const s = this._section('ov-about', c.about.title)
        const grid = el('div', 'ov-about')
        const prose = el('div', 'ov-prose')
        if (c.about.statement) {
            const lede = el('p', 'ov-about-lede')
            // One line per SENTENCE, and that is not a flourish.
            //
            // `text-wrap: balance` balances the LENGTH of the lines and knows
            // nothing about meaning, so it broke "Aprendo construyendo. Esta /
            // pagina es una de esas cosas" -- a break two words past the full
            // stop, which is the one place the line should never break. The
            // sentence boundary is the only break here that carries meaning,
            // so it is the one the markup decides; the rest is still left to
            // the browser inside each line.
            //
            // No lookbehind in the pattern: Safari only shipped it in 16.4 and
            // this file has no business being the reason someone's About is
            // one long line.
            const parts = c.about.statement.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g)
            for (const part of parts || [c.about.statement]) {
                lede.appendChild(txt('span', 'ov-lede-line', part.trim()))
            }
            prose.appendChild(lede)
        }
        // richText, not plain text: the story marks its load-bearing nouns with
        // **bold**, the same convention the project highlights already use. Two
        // solid paragraphs of even grey is a wall you decide not to read; a
        // couple of anchors in each give the eye somewhere to land and turn it
        // into something scannable without shortening a word of it.
        for (const p of c.about.story) {
            prose.appendChild(el('p', 'ov-reveal', richText(p)))
        }

        // ── Two facts and a place ────────────────────────────────────────
        const facts = el('dl', 'ov-facts ov-reveal')
        for (const [label, value] of [
            [c.about.basedLabel, c.about.basedValue],
            [c.about.focusLabel, c.about.focusValue],
            [c.about.langsLabel, c.about.langsValue]
        ]) {
            const row = el('div', 'ov-fact')
            row.appendChild(txt('dt', null, label))
            row.appendChild(txt('dd', null, value))
            facts.appendChild(row)
        }

        // Evidence beside the claim: the story says "built by hand", this says
        // what by. Same source the in-world computer reads.
        //
        // ONE run of text, and it lives inside the prose column rather than in
        // a band of its own. As a six-cell grid with an icon in every cell it
        // sat between About and Projects belonging to neither, and the labels
        // it needed to make a grid work ("GRAPHICS", "PHYSICS") were carrying
        // no information a reader could not get from the tool names. As a
        // sentence it is two lines under the paragraph it is evidence for.
        /*
         * A colophon, which is what this always was.
         *
         * Every version of this block until now tried to be two things at
         * once. It carried a category for each tool ("GRAPHICS", "SOUND",
         * "ART") AND an icon for the same category, so it said everything
         * twice and then had to wrap across three ragged lines to fit. What it
         * ended up looking like was a small table that had failed to become a
         * table.
         *
         * The category is the half that goes, because the icon is already
         * saying it in a tenth of the width. What is left is the shape this
         * block has wanted all along: a lead-in and six tools on one line,
         * under everything else, the way a book names its typeface on the last
         * page. It does not compete with the section, which is the whole job.
         *
         * A flex row rather than a run of inline text, so the spacing is a gap
         * and not a middle dot pretending to be one. That also retires the
         * zero-width-space trick the separators needed to stay wrappable.
         */
        const made = el('p', 'ov-made ov-reveal')
        made.appendChild(txt('span', 'ov-made-title', c.about.madeTitle))
        for (const item of c.about.made) {
            const pair = el('span', 'ov-made-pair')
            // The same icon the in-world computer shows for this same entry.
            if (item.icon) pair.appendChild(el('span', 'ov-made-icon', item.icon))
            const cut = item.title.indexOf(':')
            pair.appendChild(txt('span', 'ov-made-value',
                cut > 0 ? item.title.slice(cut + 1).trim() : item.title))
            made.appendChild(pair)
        }

        /*
         * Three children, and the order is the argument.
         *
         * `made` used to be appended INSIDE the prose, which put a line about
         * how the 3D island is built in the middle of a paragraph about the
         * person. It is evidence for the statement, but it is evidence about
         * the SITE, and it was sitting where the reader was still being told
         * who they were reading about.
         *
         * As a third child it spans both columns underneath them, which is
         * what the .ov-made grid-column rule has said all along, and on a
         * phone it falls last: statement, paragraph, the three facts, then the
         * stack. Each block answers a different question and they arrive in
         * the order the questions occur to anybody.
         */
        grid.append(prose, facts, made)
        s.appendChild(grid)
        return s
    }

    /**
     * Projects — an index and one window, and that is the whole section.
     *
     * It was a carousel before this: three cards on a shallow stage, the two
     * behind it rotated and hazed, with arrows, a counter, a rail, drag and a
     * spring. Every piece of that was well made and the form was still wrong.
     * Cards fanned in perspective with arrows under them is coverflow, and
     * coverflow is 2010; no amount of easing rescues a dated genre.
     *
     * There was also a tell I should have read much earlier: THERE ARE THREE
     * PROJECTS. A carousel exists for when things do not fit. Three fit. All
     * that machinery — the wrapping, the inertia, the dots — was solving a
     * problem this page does not have.
     *
     * So: the names in a column at display size, and one frame beside them.
     * Point at a name and the frame becomes that project; stay on it and the
     * still gives way to the product running. One surface, not three players.
     * The shader stops being a detail inside a card and becomes the thing the
     * section is built around, which is the only place on this page where it
     * changes what you actually see.
     */
    _projects(c) {
        const s = this._section('ov-projects', c.projects.title, c.projects.blurb)
        const items = c.projects.items
        const pad = (n) => String(n).padStart(2, '0')
        const hasPointer = matchMedia('(hover: hover) and (pointer: fine)').matches
        const noMotion = matchMedia('(prefers-reduced-motion: reduce)').matches ||
            !!navigator.connection?.saveData

        const wrap = el('div', 'ov-work')

        // ── The frame ────────────────────────────────────────────────────
        const figure = el('div', 'ov-work-frame ov-reveal ov-reveal--art')
        // The picture layers live in their own box. Stacked straight into the
        // frame they are `inset: 0` against the whole column and would cover
        // the caption underneath them.
        const view = el('div', 'ov-work-view')
        // Two stills rather than one, alternating. When the shader is running
        // the canvas covers both and none of this is visible; when it is not —
        // no WebGPU, reduced motion, a boot that threw — these ARE the section,
        // and swapping a single src would blink white between projects.
        const shots = [new Image(), new Image()]
        shots.forEach((img, n) => {
            img.className = 'ov-work-shot'
            img.decoding = 'async'
            img.loading = n === 0 ? 'eager' : 'lazy'
            img.alt = ''
            view.appendChild(img)
        })
        let shotOn = 0

        const canvas = el('canvas', 'ov-work-canvas')
        canvas.width = 1200
        canvas.height = 800
        canvas.setAttribute('aria-hidden', 'true')
        view.appendChild(canvas)

        // ONE video element for the whole section. It is a decoder, not a
        // player: nothing ever sees it, the frame samples it.
        const video = document.createElement('video')
        video.className = 'ov-work-video'
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.preload = 'none'
        video.tabIndex = -1
        video.setAttribute('aria-hidden', 'true')
        view.appendChild(video)

        this._frame = new ProjectFrame(canvas)
        const frame = this._frame

        // ── The caption under it ─────────────────────────────────────────
        const meta = el('div', 'ov-work-meta')
        figure.append(view, meta)

        // ── The index ────────────────────────────────────────────────────
        const list = el('ol', 'ov-work-list')
        const rows = []

        let active = -1
        let videoTimer = null

        /** Best format this browser will take, decided once. */
        const pickSrc = (p) => {
            const v = p.spread?.video
            if (!v) return null
            if (v.webm && video.canPlayType('video/webm; codecs="vp9"')) return v.webm
            return v.mp4 || v.webm || null
        }

        /**
         * Put the video away.
         *
         * The video is NOT paused here, and that is the whole point of the
         * shape of this. Pausing it first froze the picture on its last frame
         * and then spent the length of the transition wiping that frozen frame
         * off the screen -- which is exactly what it looked like from the
         * section below: a video stuck half way through a morph. It keeps
         * running until the frame has finished travelling back to the still,
         * and stops then, when nothing on screen is sampling it any more.
         *
         * `instant` when the picture has left the viewport: there is nobody to
         * show the travel to, so it snaps and the video stops now rather than
         * decoding for another three quarters of a second off screen.
         */
        const stopVideo = (instant = false) => {
            clearTimeout(videoTimer)
            frame.hideVideo({
                instant,
                onDone: () => {
                    video.pause()
                    video.classList.remove('is-playing')
                }
            })
        }

        /**
         * The picture, and when there is a video the picture IS the video.
         *
         * ── Why this waits ──────────────────────────────────────────────
         *
         * It used to wipe to the still immediately and then wipe again to the
         * video a moment later, and the second wipe always cut the first one
         * off at about a third of its travel. Queueing the second one fixed
         * the interruption but not the real problem: there were still two
         * transitions for one decision, and the eye reads that as one
         * transition that went wrong.
         *
         * The obvious repair -- keep the wipe to the still and then swap the
         * video in underneath with no transition at all -- does not work here,
         * and that is worth writing down. The stills are not the videos' first
         * frames: measured against frame zero they differ by a mean of 37/255
         * on Volumine and 12/255 on SQL to 3D ER. A silent swap would be a
         * visible jump cut.
         *
         * So there is ONE transition and it goes where the reader is actually
         * going. The row and the caption answer the moment you point at them,
         * which is where the feedback lives; the picture changes once, and
         * when it does it is already moving.
         *
         * ── And why it does not wait forever ────────────────────────────
         *
         * These files are small (0.2 to 0.4 MB) and come back in about 20ms
         * locally, but a phone on a bad connection is a different machine. If
         * the video has not arrived within the budget the still goes in
         * instead, because a picture that does not change for a second reads
         * as broken however good the reason is. On that path the video still
         * takes over when it lands, and by then the two events are far enough
         * apart to read as "the picture, and now it is playing" rather than as
         * one broken morph.
         */
        const PICTURE_BUDGET = 600

        /** A short dwell before touching the network, so running the pointer
         *  down the list does not start three fetches. Short, because the
         *  picture now waits behind it. */
        const DWELL = 90

        let pickToken = 0

        const showPicture = (p, back) => {
            const token = pickToken
            const still = p.spread?.image || p.image
            const src = pickSrc(p)

            // Nothing to wait for: no file for this one, or motion is off.
            if (!src || noMotion) {
                if (still) frame.showStill(still, false, back)
                return
            }

            let settled = false
            let budget = null

            const toStill = () => {
                if (settled || token !== pickToken) return
                settled = true
                clearTimeout(budget)
                if (still) frame.showStill(still, false, back)
            }

            const toVideo = () => {
                if (settled || token !== pickToken) return
                settled = true
                clearTimeout(budget)
                // With the shader running, the frame samples this element and
                // nobody ever sees it. Without one there is nothing to sample
                // it, so it becomes the picture itself.
                if (frame.live) frame.showVideo(video, { back, still })
                else video.classList.add('is-playing')
                video.play().catch(() => {
                    // Refused. Undo the claim and fall back to the still.
                    settled = false
                    toStill()
                })
            }

            const start = () => {
                if (token !== pickToken) return
                budget = setTimeout(toStill, PICTURE_BUDGET)
                video.dataset.for = p.id
                // Already decoded and still the same file: no wait at all.
                if (video.dataset.src === src && video.readyState >= 2) {
                    toVideo()
                    return
                }
                // preload="none" is on the element so that opening the
                // section fetches nothing at all. It also means assigning
                // .src fetches nothing: the browser is doing exactly what it
                // was told, and loadeddata never fires. Lifting it HERE is
                // the difference between "never load a video nobody asked
                // for" and "never load a video".
                video.preload = 'auto'
                video.dataset.src = src
                video.src = src
                video.addEventListener('loadeddata', toVideo, { once: true })
                video.addEventListener('error', toStill, { once: true })
            }

            videoTimer = setTimeout(start, DWELL)
        }

        /*
         * The caption: numbers, the badge if there is one, and the way out.
         *
         * Two things used to live at the top of this and neither survived the
         * question "what does this say that something else does not".
         *
         * The PARAGRAPH said the engineering, which sounded load bearing until
         * you read it next to the figures underneath it. "The whole
         * configuration travels compressed inside the link, so there is no
         * database to keep" is "0 round trips to the server" at four times the
         * length; "two parsers, one in the browser and a Python one" is "2
         * parsing engines". Each paragraph also opened by restating the first
         * figure word for word. The numbers were already the denser version of
         * the same claim, and they are the part anybody actually reads.
         *
         * The TECH PILLS said Angular, Express, Kotlin. Skills is twelve tiles
         * that each name the projects that used them, cross-linked into this
         * very list -- the same relation, read the other way. Printing it
         * twice made the page look like it was padding.
         *
         * What is left is what only this project can say: its numbers, whether
         * it was the final course project, and where to go if you want more.
         */
        const paintMeta = (p) => {
            meta.innerHTML = ''
            if (!p || p.upcoming) return
            /*
             * The badge FIRST, right under the picture.
             *
             * It sat between the numbers and the links, which is the one place
             * on this caption where it interrupted something: "here is how big
             * it is" / "this was my final project" / "here is the way in". The
             * middle line answers a question nobody was in the middle of
             * asking, and the two it split belong together.
             *
             * At the top it is a caption on the picture, which is what it
             * actually is -- a fact about what this project WAS, not about how
             * it is built or where it lives. The caption then reads in one
             * direction: what this is, how big it is, where to go.
             */
            if (p.finalProject) {
                const line = el('p', 'ov-work-tech')
                line.appendChild(el('span', 'ov-badge',
                    `${SVG.cap}<span>${c.projects.finalProjectBadge}</span>`))
                meta.appendChild(line)
            }
            if (p.figures?.length) {
                const figs = el('dl', 'ov-figures')
                for (const f of p.figures) {
                    const cell = el('div', 'ov-figure')
                    const dt = txt('dt', null, '')
                    // Set through CountUp rather than written straight in: it
                    // puts the value there itself and, if there is a number in
                    // it, counts up to it the moment the cell is looked at.
                    this._count.watch(dt, f.value)
                    cell.appendChild(dt)
                    cell.appendChild(txt('dd', null, f.label))
                    figs.appendChild(cell)
                }
                meta.appendChild(figs)
            }
            const links = p.links || []
            if (links.length) {
                const row = el('div', 'ov-work-links')
                const a = el('a', 'ov-project-go', `<span>${links[0].label}</span>${SVG.arrow}`)
                a.href = links[0].url
                a.target = '_blank'
                a.rel = 'noopener noreferrer'
                row.appendChild(a)
                if (links[1]) {
                    const b = el('a', 'ov-project-alt',
                        `<span>${links[1].label}</span>${SVG.external}`)
                    b.href = links[1].url
                    b.target = '_blank'
                    b.rel = 'noopener noreferrer'
                    row.appendChild(b)
                }
                meta.appendChild(row)
            }
        }

        const select = (i, first = false) => {
            if (i === active || !items[i] || items[i].upcoming) return
            // Which way along the list, before `active` is overwritten. Going
            // back up runs the same frontier in the opposite direction, which
            // is what stops the index feeling like a slideshow that only goes
            // one way -- moving back should look like moving back.
            const back = active >= 0 && i < active
            active = i
            const p = items[i]

            rows.forEach((r, n) => {
                if (!r) return
                r.classList.toggle('is-on', n === i)
                r.setAttribute('aria-current', String(n === i))
            })

            // Everything in flight for the project we are leaving is stale.
            pickToken++
            clearTimeout(videoTimer)
            // Released, NOT retreated: the picture is about to be replaced, so
            // travelling back to the old still first would be a wipe nobody
            // asked for and the next one would undo it half a second later.
            frame.releaseVideo(() => {
                video.pause()
                video.classList.remove('is-playing')
            })
            paintMeta(p)

            const still = p.spread?.image || p.image
            if (still) {
                // The hidden one takes the new picture and then becomes the
                // visible one, so the swap crossfades instead of blinking.
                const next = shots[shotOn ^ 1]
                next.src = still
                next.alt = p.title
                if (p.spread?.imageSm) {
                    next.srcset = `${p.spread.imageSm} 810w, ${p.spread.image} 1620w`
                    next.sizes = '(max-width: 900px) 92vw, 620px'
                }
                shots.forEach((img, n) => img.classList.toggle('is-on', n !== shotOn))
                shotOn ^= 1
            }

            // The FIRST paint is the still and nothing else. The section opens
            // on project 01 without anybody asking for it, and fetching and
            // playing a video off the back of that is autoplay however it is
            // dressed up: bytes spent and motion started for a reader who has
            // not moved yet. Every later change goes through showPicture,
            // which answers with the video.
            if (first) frame.showStill(still, true, back)
            else showPicture(p, back)
        }

        items.forEach((p, i) => {
            const li = el('li', 'ov-work-item ov-reveal')

            if (p.upcoming) {
                const quiet = el('div', 'ov-work-row ov-work-row--soon')
                quiet.appendChild(txt('span', 'ov-work-num', pad(i + 1)))
                const body = el('span', 'ov-work-body')
                body.appendChild(txt('span', 'ov-work-name', p.title))
                body.appendChild(txt('span', 'ov-work-line', p.tagline))
                quiet.appendChild(body)
                li.appendChild(quiet)
                list.appendChild(li)
                rows.push(null)
                return
            }

            // A BUTTON, and never a link.
            //
            // It was a link, on the reasoning that the row is the project, so
            // pressing it should go there. That was wrong twice over. On a
            // phone there is no hover at all, so the only way to change the
            // picture is to press a row -- and pressing it navigated away,
            // which is the opposite of what the person wanted. And on a
            // desktop nobody knows the list answers to hover until they have
            // tried it, so the natural first move is a click, and that click
            // also left the page.
            //
            // Pressing a row now does exactly what hovering it does. The way
            // out is the labelled button under the picture, which was already
            // there and is the only thing on screen that claims to be one.
            const row = el('button', 'ov-work-row')
            row.type = 'button'
            row.appendChild(txt('span', 'ov-work-num', pad(i + 1)))
            const body = el('span', 'ov-work-body')
            body.appendChild(projectName(p.title))
            body.appendChild(txt('span', 'ov-work-line', p.tagline))
            row.appendChild(body)
            if (hasPointer) row.addEventListener('pointerenter', () => select(i))
            // Focus, not just hover: arrowing or tabbing down the list has to
            // move the picture too, or the frame tells a keyboard reader
            // nothing.
            row.addEventListener('focus', () => select(i))
            row.addEventListener('click', () => select(i))

            li.appendChild(row)
            list.appendChild(li)
            rows.push(row)
        })

        // Up and down move through the work; Home and End jump the ends.
        list.addEventListener('keydown', (e) => {
            const live = rows.filter(Boolean)
            const at = live.indexOf(document.activeElement)
            if (at < 0) return
            let next = null
            if (e.key === 'ArrowDown') next = live[Math.min(at + 1, live.length - 1)]
            else if (e.key === 'ArrowUp') next = live[Math.max(at - 1, 0)]
            else if (e.key === 'Home') next = live[0]
            else if (e.key === 'End') next = live[live.length - 1]
            if (!next) return
            e.preventDefault()
            next.focus()
        })

        wrap.append(list, figure)
        s.appendChild(wrap)

        const firstReal = items.findIndex((p) => !p.upcoming)
        if (firstReal >= 0) select(firstReal, true)

        /*
         * Nothing decodes when the picture is not on screen.
         *
         * Watching the PICTURE and not the section around it. The section is
         * far taller than the frame -- on a phone the frame is at the bottom
         * of it -- so a threshold on the section fired while the picture was
         * still sitting in plain view, and the reader watched the video put
         * itself away for no reason they could see.
         *
         * Two thresholds, two different answers. Below 45% the picture is on
         * its way out and the travel back to the still is worth showing. At 0
         * it is gone and the travel would be a private performance, so it
         * snaps instead.
         */
        this._workIo?.disconnect()
        if (typeof IntersectionObserver !== 'undefined') {
            this._workIo = new IntersectionObserver(([e]) => {
                if (e.intersectionRatio >= 0.45) return
                stopVideo(e.intersectionRatio === 0)
            }, { threshold: [0, 0.45] })
            this._workIo.observe(view)
        }

        return s
    }

    _timeline(title, entries, mapper) {
        const wrap = el('div', 'ov-reveal')
        wrap.appendChild(txt('h3', 'ov-eyebrow ov-eyebrow--sub', title))
        const ul = el('ul', 'ov-timeline')
        for (const e of entries) {
            const m = mapper(e)
            const li = el('li', 'ov-tl-item')
            li.appendChild(txt('div', 'ov-tl-period', m.period))
            li.appendChild(txt('h4', 'ov-tl-title', m.title))
            li.appendChild(txt('p', 'ov-tl-org', m.org))
            if (m.detail) li.appendChild(txt('p', 'ov-tl-detail', m.detail))
            ul.appendChild(li)
        }
        wrap.appendChild(ul)
        return wrap
    }

    _path(c) {
        const s = this._section('ov-path', c.path.title, c.path.blurb)
        const grid = el('div', 'ov-path')

        const exp = this._timeline(c.path.experienceTitle, c.path.experience,
            (e) => ({ period: e.period, title: e.role, org: e.org, detail: e.detail }))
        exp.style.setProperty('--i', 1)

        const edu = this._timeline(c.path.educationTitle, c.path.education,
            (e) => ({ period: e.period, title: e.title, org: e.org, detail: e.detail }))
        edu.style.setProperty('--i', 2)

        grid.append(exp, edu)
        // Full width under both columns rather than tacked onto Education: it
        // belongs to neither, and hanging it off one made that column run far
        // longer than the other.
        s.append(grid, this._certificates(c))
        return s
    }

    /**
     * Credentials, as a list of records and not as a wall of cards.
     *
     * Nine bordered tiles in a grid is an inventory, and an inventory of nine
     * online courses argues against itself: it reads as padding toward looking
     * senior, and it drags the one entry that genuinely matters down to the
     * level of the other eight. Three rows, and a count for the rest.
     *
     * Nothing is lost. The full set is still one click away here, still in the
     * in-world trophy shelf, and still on the CV, which is where an exhaustive
     * list belongs.
     */
    _certificates(c) {
        const block = el('div', 'ov-certs ov-reveal')
        block.style.setProperty('--i', 3)
        block.appendChild(txt('h3', 'ov-certs-title', c.path.certsTitle))

        const row = (cert) => {
            const a = el('a', 'ov-cert')
            a.href = cert.url
            a.target = '_blank'
            a.rel = 'noopener noreferrer'
            a.setAttribute('aria-label', `${cert.title} — ${c.path.viewCredential}`)
            // The year alone. The month is stored because the CV wants it and
            // the trophy shelf shows it; in a list whose job is "when, and
            // what", "September" is four syllables of nothing.
            const year = String(cert.date).match(/\d{4}/)?.[0] || ''
            a.appendChild(txt('span', 'ov-cert-year', year))
            a.appendChild(txt('span', 'ov-cert-title', cert.title))
            a.appendChild(txt('span', 'ov-cert-issuer', cert.issuer))
            a.appendChild(el('span', 'ov-cert-go', SVG.external))
            return a
        }

        const listed = el('div', 'ov-cert-list')
        for (const cert of c.path.certificatesFeatured) listed.appendChild(row(cert))
        block.appendChild(listed)

        const rest = c.path.certificatesRest
        if (!rest.length) return block

        // Two elements, not one: the outer is a grid whose single row animates
        // from 0fr to 1fr, which is the one way to transition to a content
        // height the browser has to measure. The inner clips during the run.
        const more = el('div', 'ov-cert-rest')
        more.id = 'ov-cert-rest'
        const moreInner = el('div', 'ov-cert-list ov-cert-rest-inner')
        for (const cert of rest) moreInner.appendChild(row(cert))
        more.appendChild(moreInner)

        // BOTH labels resolved once, here.
        //
        // The click handler used to write c.path.certsMore straight back into
        // the button, which is the raw catalog string: the first open turned
        // "+8 more" into the literal "+{n} more" and it never recovered. The
        // count belongs to the label, so the label is what carries it.
        const labels = {
            more: c.path.certsMore.replace('{n}', String(rest.length)),
            less: c.path.certsLess.replace('{n}', String(rest.length))
        }
        const toggle = el('button', 'ov-cert-toggle',
            `${SVG.dashRing}<span class="ov-cert-toggle-text">${labels.more}</span>${SVG.chevron}`)
        toggle.type = 'button'
        toggle.setAttribute('aria-expanded', 'false')
        toggle.setAttribute('aria-controls', 'ov-cert-rest')
        // The inner box clips while the track grows; open, that clip is what
        // sliced the first row's border on hover and flattened the last row's
        // shadow. Drop it, but only once the opening has finished.
        let settleTimer = null
        const settle = () =>
            more.classList.toggle('is-settled', more.classList.contains('is-open'))
        more.addEventListener('transitionend', (e) => {
            if (e.target === more && e.propertyName === 'grid-template-rows') settle()
        })

        toggle.addEventListener('click', () => {
            const open = toggle.getAttribute('aria-expanded') === 'true'
            toggle.setAttribute('aria-expanded', String(!open))
            // Not [hidden]: that is a display switch and cannot transition.
            // Collapsed, the row is 0fr AND visibility:hidden, so the rows stay
            // out of the accessibility tree and out of the tab order.
            more.classList.toggle('is-open', !open)
            // Clip again before it starts collapsing, whichever way we go.
            more.classList.remove('is-settled')
            clearTimeout(settleTimer)
            // Reduced motion drops the transition entirely, so transitionend
            // never arrives; this is the only path to settled in that case.
            settleTimer = setTimeout(settle, 460)
            toggle.querySelector('.ov-cert-toggle-text').textContent =
                open ? labels.more : labels.less
            // "+8 more" and "Show fewer" are not the same width, so the
            // perimeter just changed and the ring has to be re-divided.
            this._fitDashRing(toggle.querySelector('.ov-dash rect'))
        })

        // The region FIRST, the button after it.
        //
        // With the button in between, opening it left a control sitting in the
        // middle of what is otherwise one continuous list of credentials: it
        // read as a separator rather than as something you pressed. After the
        // region, the button is always at the end of the list, in both states,
        // and it never jumps — the rows grow above it and it rides down on the
        // same curve, which is the whole transition, for free, in normal flow.
        //
        // Fine for a screen reader too, and not by luck: collapsed, the region
        // is `visibility: hidden` and out of the accessibility tree entirely,
        // so the reading order is three rows then "+8 more". Opened, it is
        // eleven rows then "Show fewer". Both read exactly as they look.
        block.append(more, toggle)
        return block
    }

    /**
     * Twelve names, and every one of them says where it was used.
     *
     * This section has been four things. Five ruled rows of pills, which was a
     * table with its borders showing. The same rows without the rules, which
     * left the labels floating. A label column, which fixed the layout and
     * left the real problem alone. Then seven bare names, which fixed the
     * content and left the section with nothing to say beyond the words.
     *
     * A name on its own is the weakest thing a portfolio can print: "Angular"
     * on this page and "Angular" on every other one are the same claim, and
     * neither is worth anything. The line underneath is what makes it worth
     * something, and it is not written by hand — it comes out of the project
     * stacks, so it cannot drift from the work it describes.
     *
     * Those labels are also controls. "Where did you use Kotlin?" is answered
     * by pressing the answer: the stage brings that project to the front and
     * the page travels to it. It is the only place on this page where one
     * section knows about another, and it costs a handful of lines because
     * both halves already existed.
     */
    _skills(c) {
        /*
         * It DOES get a headline, after all.
         *
         * It lost one because "What I work with day to day" was the third
         * section in a row opening on the same cadence as "What I have
         * built..." and "Where I have worked...", and it was the one with the
         * least to add. But the fix for a bad sentence is a better sentence,
         * not silence: with no display line this was the only section on the
         * page that opened on a micro-label and went straight into content,
         * and it read as unfinished rather than as restrained.
         *
         * The one it has now is not the same shape as the others -- no "What",
         * no "Where" -- and it says the only thing about this section that is
         * worth saying out loud: every name below links to something you can
         * open. That is the whole reason it is twelve tiles of evidence rather
         * than thirty tiles of vocabulary.
         */
        const s = this._section('ov-skills', c.skills.title, c.skills.blurb)
        const grid = el('div', 'ov-skillset')

        c.skills.core.forEach((skill, i) => {
            // The reveal lives on the CELL: on the grid it would fade twelve
            // cells in as one block, and the stagger below would have nothing
            // to stagger.
            const cell = el('div', 'ov-skillset-cell ov-reveal')
            // Staggered by column rather than one long cascade: twelve cells
            // revealing one after another would take longer than anyone waits.
            cell.style.setProperty('--i', (i % 4) + 1)
            cell.appendChild(txt('h3', 'ov-skillset-name', skill.name))

            const used = el('p', 'ov-skillset-used')
            skill.usedIn.forEach((place, n) => {
                if (n) used.appendChild(txt('span', 'ov-skillset-sep', '\u00b7'))
                if (place.index === null) {
                    // No index, no control: the page IS the evidence, and
                    // there is nowhere to send anybody.
                    used.appendChild(txt('span', 'ov-skillset-site', place.label))
                    return
                }
                const go = txt('button', 'ov-skillset-go', place.label)
                go.type = 'button'
                go.setAttribute('aria-label',
                    c.skills.goTo.replace('{name}', place.label))
                go.addEventListener('click', () => {
                    // Focusing the row is what selects it, so the frame is
                    // already showing that project by the time the scroll
                    // arrives -- and the reader lands with the keyboard on it.
                    this._goTo('ov-projects')
                    const rows = this.main.querySelectorAll('.ov-work-row')
                    rows[place.index]?.focus?.({ preventScroll: true })
                })
                used.appendChild(go)
            })
            cell.appendChild(used)
            grid.appendChild(cell)
        })

        s.appendChild(grid)

        // ── The tail ─────────────────────────────────────────────────────
        // Twelve tiles is a cut, not the whole truth, and this line is where
        // that gets admitted. It used to admit it twice: a second list of six
        // more names, in the same tone, directly under twelve that each had a
        // project attached. Those six had nothing attached, so they read as
        // the keyword padding the tiles were built to replace -- and a list of
        // skills with no evidence is the exact thing this section exists to
        // not be. The link on its own says the same and claims nothing.
        const also = el('p', 'ov-skillset-also ov-reveal')
        also.style.setProperty('--i', 2)

        const cv = el('a', 'ov-skillset-also-cv',
            `<span>${c.skills.alsoCv}</span>${SVG.download}`)
        cv.href = CV_URL
        cv.setAttribute('download', '')
        // Same guard as the hero's button: until the probe says the file is
        // really there, this points nowhere and refuses to pretend otherwise.
        cv.addEventListener('click', (e) => {
            if (!Overview._cvExists) e.preventDefault()
        })
        also.appendChild(cv)
        s.appendChild(also)

        return s
    }

    _contact(c) {
        const s = this._section('ov-contact', c.contact.title, c.contact.blurb)

        // One card, not two. They are both "how to reach me", they were short
        // enough to look padded out as separate cards, and the column has to
        // give up its right hand side to the dog now.
        const card = el('div', 'ov-card ov-contact-card ov-reveal')
        card.style.setProperty('--i', 1)

        const mailField = el('div', 'ov-contact-field')
        mailField.appendChild(txt('div', 'ov-fact-label', c.contact.emailLabel))
        const mail = el('a', 'ov-contact-mail')
        mail.href = `mailto:${c.links.email}`
        mail.textContent = c.links.email
        mailField.appendChild(mail)

        const socialField = el('div', 'ov-contact-field')
        socialField.appendChild(txt('div', 'ov-fact-label', c.contact.elsewhere))
        const socials = el('div', 'ov-socials')
        for (const so of SOCIALS) {
            const a = el('a', 'ov-social', so.icon)
            a.href = so.url
            a.target = '_blank'
            a.rel = 'noopener noreferrer'
            a.setAttribute('aria-label', so.name)
            a.title = so.name
            socials.appendChild(a)
        }
        socialField.appendChild(socials)

        card.append(mailField, socialField)

        // The closing card is a two-column pitch: the invitation on the left,
        // the dog sitting in the other half. He belongs to what the card is
        // offering — the world you can walk around — so putting him inside it
        // rather than beside it is the whole argument in one picture.
        // Decorative: hidden from assistive tech, and never a control.
        const outro = el('div', 'ov-outro ov-reveal')
        outro.style.setProperty('--i', 2)

        const outroText = el('div', 'ov-outro-text')
        outroText.appendChild(txt('h3', 'ov-outro-title', c.contact.outroTitle))
        outroText.appendChild(txt('p', 'ov-outro-body', c.contact.outroBody))
        this.outroExplore = el('button', 'ov-btn ov-btn--primary')
        this.outroExplore.type = 'button'
        this.outroExplore.addEventListener('click', () => this._explore())
        outroText.appendChild(this.outroExplore)

        const stage = el('div', 'ov-dog')
        stage.setAttribute('aria-hidden', 'true')
        // Shadow BEFORE the canvas: both are absolutely positioned, so DOM
        // order decides who paints on top. With the canvas last its
        // transparent background lets the shadow through around him while his
        // own pixels cover it — which is what standing on a shadow looks like.
        // The other way round the ellipse washed straight over his legs.
        stage.append(el('span', 'ov-dog-glow'), this.dogCanvas)
        this.dogStage = stage

        outro.append(outroText, stage)
        s.append(card, outro)
        return s
    }

    _footer(c) {
        const f = el('footer', 'ov-foot')
        f.appendChild(txt('p', null, `${c.name} · ${new Date().getFullYear()}`))
        return f
    }

    // ═══ Live portrait ════════════════════════════════════════════════════
    /**
     * The character GLB is a critical resource for the world, so it is already
     * on its way down. Upgrade the frame the moment it lands — and never block
     * on it.
     */
    _watchResources() {
        if (!this.resources) return
        const items = this.resources.items
        if (items?.humanModel) this._mountPortrait()
        if (items?.dogModel) this._mountDog()
        if (items?.humanModel && items?.dogModel) return

        this._onSourceLoaded = (name) => {
            if (name === 'humanModel') this._mountPortrait()
            else if (name === 'dogModel') this._mountDog()
            else return
            const now = this.resources.items
            if (now.humanModel && now.dogModel) {
                this.resources.off('sourceLoaded', this._onSourceLoaded)
                this._onSourceLoaded = null
            }
        }
        this.resources.on('sourceLoaded', this._onSourceLoaded)
    }

    async _mountPortrait() {
        const gltf = this.resources?.items?.humanModel
        if (!gltf || !this.portalCanvas || this._portraitPending) return
        this._portraitPending = true

        try {
            if (!this.viewport) {
                const { default: HeroViewport } = await import('./HeroViewport.js')
                this.viewport = new HeroViewport(this.portalCanvas)
            } else {
                // Re-rendered by a language switch: the canvas node is new.
                this.viewport.canvas = this.portalCanvas
            }
            if (!this.viewport.ready) {
                await this.viewport.setModel(gltf, this.resources.items.humanAtlas)
            }
            this.viewport.resize()
            if (this.isOpen) this.viewport.start()
        } catch (err) {
            console.error('Overview: live portrait unavailable', err)
        } finally {
            this._portraitPending = false
        }
    }

    /**
     * The dog is a `decorative` resource, so it lands well after the character.
     * Same contract as the portrait: mount when it arrives, never wait for it.
     */
    async _mountDog() {
        const gltf = this.resources?.items?.dogModel
        if (!gltf || !this.dogCanvas || this._dogPending) return
        this._dogPending = true

        try {
            if (!this.dogPortrait) {
                const { default: DogPortrait } = await import('./DogPortrait.js')
                this.dogPortrait = new DogPortrait(this.dogCanvas)
            }
            if (!this.dogPortrait.ready) await this.dogPortrait.setModel(gltf)
            this.dogPortrait.resize()
            this._observeDogStage()
            this._syncDog()
        } catch (err) {
            console.error('Overview: dog unavailable', err)
        } finally {
            this._dogPending = false
        }
    }

    /**
     * It sits at the very bottom of a long page, so it is off screen almost all
     * the time — an observer keeps its loop off until the reader gets there.
     */
    _observeDogStage() {
        if (!this.dogStage) return
        if (!this._dogIo) {
            this._dogIo = new IntersectionObserver((entries) => {
                this._dogVisible = entries.some((e) => e.isIntersecting)
                this._syncDog()
                // Viewport root, for the same reason as _observeReveals().
            }, { rootMargin: '120px' })
        } else {
            this._dogIo.disconnect()
        }
        this._dogIo.observe(this.dogStage)
    }

    _syncDog() {
        if (!this.dogPortrait?.ready) return
        if (this._dogVisible && this.isOpen) this.dogPortrait.start()
        else this.dogPortrait.stop()
    }

    // ═══ CV ═══════════════════════════════════════════════════════════════
    /**
     * One HEAD request, cached across renders. The dev server answers unknown
     * paths with index.html, so the content type has to be checked too —
     * otherwise the button would show up in dev and 404 in production.
     */
    async _probeCv() {
        if (!Overview._cvProbe) {
            Overview._cvProbe = fetch(CV_URL, { method: 'HEAD' })
                .then((r) => r.ok && (r.headers.get('content-type') || '').includes('pdf'))
                .catch(() => false)
        }
        const ok = await Overview._cvProbe
        Overview._cvExists = ok
        // Kept visible either way; this only marks whether it can really deliver.
        this.cvBtn?.setAttribute('aria-disabled', String(!ok))
    }

    // ═══ Explore button state ═════════════════════════════════════════════
    /** The world loads while this page is being read; enable entry when it lands. */
    setWorldReady(ready) {
        this.worldReady = ready
        this._syncExploreButtons()
    }

    _syncExploreButtons() {
        const c = this.content
        if (!c) return
        const label = this.worldReady ? c.hero.enter : c.hero.enterLoading
        for (const btn of [this.heroExplore, this.outroExplore]) {
            if (!btn) continue
            btn.innerHTML = `<span>${label}</span><span class="ov-btn-arrow">${SVG.arrow}</span>`
            btn.disabled = !this.worldReady
        }
    }

    _explore() {
        if (!this.worldReady) return
        this.close({ silent: true })
        this.onExplore?.()
    }

    // ═══ Language ═════════════════════════════════════════════════════════
    async setLang(locale) {
        if (locale === i18n.locale) return
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
        const y = window.scrollY

        if (!reduce) {
            this.main.style.transition = 'opacity 0.2s ease'
            this.main.style.opacity = '0'
            await new Promise((r) => setTimeout(r, 200))
        }
        await i18n.setLocale(locale)
        this._renderLangToggle()
        this._render()
        window.scrollTo(0, y)
        this.main.style.opacity = '1'
    }

    // ═══ Dashed rings ═════════════════════════════════════════════════════
    /**
     * Make each ring's perimeter a whole number of dashes.
     *
     * A rect's dash pattern starts at the top-left and runs the whole way
     * round, so unless the perimeter divides exactly by the 21px period the
     * last dash before the start point is cut short. That leaves a permanent
     * stub-and-double-gap at the top-left corner -- a fixed defect in the
     * outline that the marching animation slides past without ever fixing,
     * since moving by exactly one period puts the same broken join back.
     *
     * `pathLength` is the fix: it tells the dash maths to treat the perimeter
     * as that many units regardless of its real size. Rounded to the nearest
     * whole number of periods, the pattern closes on itself perfectly and each
     * dash is at most a few percent off 21px, which is not a difference the
     * eye has anything to compare against.
     *
     * A ResizeObserver rather than a one-off: the button is measured before the
     * webfont lands, and it changes width again every time its label swaps
     * between "y algunos más" and "ocultar".
     */
    _fitDashRing(rect) {
        // Measure the geometry, never a length we already remapped.
        rect.removeAttribute('pathLength')
        const length = rect.getTotalLength?.() ?? 0
        if (!length) return
        const periods = Math.max(4, Math.round(length / DASH_PERIOD))
        rect.setAttribute('pathLength', periods * DASH_PERIOD)
    }

    /** Fit every ring now, without waiting on a frame. The ResizeObserver
     *  below is the right tool for later changes, but it delivers on the
     *  rendering steps, and a backgrounded tab does not run those -- the same
     *  reason open() flushes layout by hand instead of double-rAF. */
    _fitDashRings() {
        this.main?.querySelectorAll('.ov-dash rect')
            .forEach((rect) => this._fitDashRing(rect))
    }

    _observeDashRings() {
        this._dashRo?.disconnect()
        if (typeof ResizeObserver === 'undefined') return
        this._dashRo = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const rect = entry.target.querySelector('.ov-dash rect')
                if (rect) this._fitDashRing(rect)
            }
        })
        // The host element, not the <svg>: the ring is pinned to it with inset,
        // and an HTML box is the case every ResizeObserver handles well.
        this.main.querySelectorAll('.ov-dash').forEach((svg) => {
            if (svg.parentElement) this._dashRo.observe(svg.parentElement)
        })
    }

    /**
     * The section headlines, cut into their rendered lines (SplitLines.js).
     *
     * Only .ov-display: they are the only text on this page set at display
     * size and the only text that runs to three lines, which is what makes a
     * per-line arrival worth the work. Doing it to body copy would be twelve
     * masks per paragraph to stagger something nobody reads as a gesture.
     */
    _splitDisplays() {
        for (const el of this.el.querySelectorAll('.ov-display')) splitLines(el)
    }

    /**
     * Skills, read the other way round.
     *
     * The heading of that section promises that nothing in it is there without
     * a project behind it, and then prints the evidence -- the project names
     * under each skill -- in the smallest grey type on the page. This makes
     * the promise operable: point at a project and every skill it paid for
     * lights up, and the rest of the grid steps back. Point at a skill and
     * only that one does.
     *
     * ── One system, and why that is the whole fix ────────────────────────
     *
     * The first version of this had two. A pure-CSS `:hover` rule dimmed the
     * cells you were not on, and these classes dimmed the ones that did not
     * match, and a third rule tried to switch the first off while the second
     * was running. Sweeping across the grid they took turns, a frame apart,
     * and the thing flickered. Worse, moving off a project name onto the bare
     * part of its cell matched neither, so the last highlight simply stayed
     * on until you left the grid entirely.
     *
     * So the CSS no longer decides anything: every state the grid can be in is
     * one of the three below, written here, and nothing is ever half applied.
     *
     * ── And pointermove, with the early return ───────────────────────────
     *
     * The key is what the pointer is ON, not that it moved. Crossing forty
     * pixels of the same label recomputes nothing and touches no classList --
     * which is the other half of why this is smooth now, because writing the
     * same classes back every mouse event is its own kind of churn.
     */
    _wireSkillLinks() {
        const grid = this.el.querySelector('.ov-skillset')
        if (!grid) return
        const cells = [...grid.querySelectorAll('.ov-skillset-cell')]
        const TAGS = '.ov-skillset-go, .ov-skillset-site'
        let on = ''

        /**
         * @param {string} key  '' clears; 'p:<label>' a project; 'c:<n>' a cell
         */
        const paint = (key) => {
            // A STRING and not the element or a little object, because this is
            // compared on every mouse event and two freshly built objects are
            // never equal -- which quietly turned the early return below into
            // dead code the first time round, and wrote the same classes back
            // sixty times a second.
            if (key === on) return
            on = key
            if (!key) {
                for (const c of cells) c.classList.remove('is-lit', 'is-dim')
                return
            }
            const label = key.startsWith('p:') ? key.slice(2) : null
            const one = label === null ? cells[+key.slice(2)] : null
            for (const c of cells) {
                const hit = c === one || (label !== null
                    && [...c.querySelectorAll(TAGS)]
                        .some((n) => n.textContent.trim() === label))
                c.classList.toggle('is-lit', hit)
                c.classList.toggle('is-dim', !hit)
            }
        }

        this._onSkillMove = (e) => {
            const tag = e.target.closest?.(TAGS)
            if (tag) { paint('p:' + tag.textContent.trim()); return }
            const cell = e.target.closest?.('.ov-skillset-cell')
            // Nothing under the pointer: KEEP what is lit rather than clearing
            // it. The cells do not tile the grid -- there are column gaps
            // between them and the rows are only as tall as their own text --
            // so sweeping across turned the effect on and off several times on
            // the way to anywhere, which read as it being broken rather than
            // as it being precise. Only leaving the grid puts it out.
            if (cell) paint('c:' + cells.indexOf(cell))
        }
        this._onSkillLeave = () => paint('')

        grid.addEventListener('pointermove', this._onSkillMove, { passive: true })
        grid.addEventListener('pointerleave', this._onSkillLeave, { passive: true })
        this._skillGrid = grid
    }

    // ═══ Reveal / scroll ══════════════════════════════════════════════════
    _observeReveals() {
        this._io?.disconnect()
        this._io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (!e.isIntersecting) continue
                e.target.classList.add('is-in')
                this._io.unobserve(e.target)
            }
            // Viewport root (`root: null`), NOT .ov-root. This used to name the
            // element because the element WAS the scroller; now that the page
            // scrolls, .ov-root's box spans the whole document and never moves,
            // so the root rectangle never moves either. Everything above the
            // bottom margin counted as visible the instant it was observed —
            // the whole page revealed at once instead of as you scrolled — and
            // the -12% cut off the last ~1080px of a 9000px phone layout, which
            // is exactly where the closing section lives: it could never
            // intersect, so it sat at opacity 0 for good.
        }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 })

        // Every revealable gets its place in the cascade from its position in
        // the section, rather than from an index written by hand at the call
        // site. Hand-written ones drift the moment anything is inserted above
        // them, and half the sections had none at all -- which is why About,
        // Projects and Contact used to arrive as one block while Path and
        // Skills came in staged.
        //
        // Capped, because the delay is a queue: twelve skill tiles at the full
        // step would still be arriving most of a second after the section did.
        for (const section of this.main.querySelectorAll('.ov-section')) {
            let i = 0
            for (const n of section.querySelectorAll('.ov-reveal, .ov-rise')) {
                if (n.style.getPropertyValue('--i')) { i++; continue }
                n.style.setProperty('--i', Math.min(i++, 6))
            }
        }

        this.main.querySelectorAll('.ov-section, .ov-reveal, .ov-rise').forEach((n) => {
            if (!n.classList.contains('is-in')) this._io.observe(n)
        })
    }

    _onScroll() {
        if (this._frameQueued) return
        this._frameQueued = true
        requestAnimationFrame(() => {
            this._frameQueued = false
            this._updateScrollState()
        })
    }

    /** A node's top in DOCUMENT space — independent of which ancestor is
     *  positioned, so it cannot drift if the layout is restructured again. */
    _docTop(node) {
        return node.getBoundingClientRect().top + window.scrollY
    }

    _updateScrollState() {
        const top = window.scrollY
        const max = document.documentElement.scrollHeight - window.innerHeight
        this.progress.style.setProperty('--p', max > 0 ? (top / max).toFixed(4) : 0)

        // Current section = the last one whose top has crossed a line set about
        // a third down the viewport. Sitting it right under the bar switches too
        // late: a heading can be well on screen and still read as the previous
        // section.
        const line = top + this.bar.offsetHeight + window.innerHeight * 0.3
        let current = this.sections[0]
        for (const s of this.sections) {
            if (this._docTop(s) <= line) current = s
        }
        if (current && current.id !== this._currentId) {
            this._currentId = current.id
            for (const b of this._navButtons) {
                b.setAttribute('aria-current', String(b.dataset.target === current.id))
            }
            this._movePill()
            this._markSheet()
        }

        /*
         * The bar gets out of the way on the way down.
         *
         * On a desktop the header floats over a wide margin and never meets
         * anything. On a phone there is no margin: the bar sits directly on the
         * text column, it has no surface of its own by design, and a section
         * headline passing under the language pill was flatly unreadable.
         *
         * Rather than hand the bar back the panel it was deliberately stripped
         * of, it leaves while you are reading and returns the moment you ask
         * for it -- and on a phone the gesture for "give me the controls" is
         * already a flick upward. Above the breakpoint the class is inert (see
         * the CSS), so the desktop bar never moves.
         *
         * The 4px deadband is not a nicety. Without it, momentum scrolling on
         * iOS delivers alternating one-pixel deltas at the end of a fling and
         * the bar flickers in and out for as long as that lasts.
         */
        if (this._lastTop === undefined) this._lastTop = top
        const past = top > this.bar.offsetHeight * 2
        // At the very top the bar has the hero behind it and nothing to fight,
        // so it stays as transparent as it was designed to be. The scrim only
        // fades in once real content is passing underneath.
        this.bar.classList.toggle('is-past', past)

        const dy = top - this._lastTop
        if (Math.abs(dy) > 4) {
            this._lastTop = top
            this.bar.classList.toggle('is-tucked', dy > 0 && past && !this._menuOpen)
        }

        // The portrait only animates while it is actually on screen.
        if (this.viewport?.ready) {
            const visible = top < (this.portal?.offsetTop ?? 0) + (this.portal?.offsetHeight ?? 0)
            if (visible && this.isOpen) this.viewport.start()
            else this.viewport.stop()
        }
    }

    /** Slide the single nav pill under the active item. */
    /**
     * The pill travels to whatever is being pointed at.
     *
     * It used to sit on the current section and answer nothing: hovering a nav
     * item changed the colour of its label and that was the entire response,
     * on a bar whose one interesting object was parked a few items away. Now
     * the same pill leaves its post, goes to the cursor, grows a little under
     * it, and slides back when the cursor leaves. One object, one journey.
     *
     * The white label moves with it rather than living on [aria-current]: with
     * the pill away, a white label on the pale tray would be unreadable. So the
     * lit item is wherever the pill IS, which is what `is-lit` marks.
     *
     * @param {HTMLElement} [hover] the item under the cursor, if any
     */
    _movePill(hover) {
        const current = this._navButtons.find((b) => b.getAttribute('aria-current') === 'true')
            || this._navButtons[0]
        const lit = hover || current
        if (!lit) return
        this.navPill.style.setProperty('--x', `${lit.offsetLeft}px`)
        this.navPill.style.setProperty('--w', `${lit.offsetWidth}px`)
        // Only grows while it is visiting; parked on the current section it
        // sits at its own size, or the bar would look permanently inflated.
        this.navPill.style.setProperty('--s', hover ? '1.09' : '1')
        this.navPill.classList.add('is-on')
        for (const b of this._navButtons) {
            b.classList.toggle('is-lit', b === lit)
            b.classList.toggle('is-hot', b === hover)
        }
    }

    _goTo(id) {
        const target = this.main.querySelector(`#${id}`)
        if (!target) return
        const top = this._docTop(target) - this.bar.offsetHeight - 12

        // Through Lenis when Lenis is driving, and NOT through the native
        // smooth scroll. Two animators on the same scroll position fight each
        // frame: the browser eases toward its own target while Lenis writes a
        // different one, and the result is the stutter that makes people
        // blame the library.
        if (this._lenis) { this._lenis.scrollTo(top) ; return }

        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' })
    }

    /**
     * Lenis, and only while this page is the thing on screen.
     *
     * It animates the NATIVE scroll position every frame rather than
     * transforming the document, which is why the scrollbar, `position:
     * sticky`, IntersectionObserver and keyboard scrolling all still work —
     * the reveals, the sticky bar and the nav spy on this page are built on
     * exactly those and would have to be rewritten under a transform-based
     * library.
     *
     * It is created on open() and destroyed on close(), which matters more
     * here than on an ordinary site: behind this page there is a 3D world with
     * its own wheel, pointer-lock and physics input. A smooth-scroll library
     * still listening for wheel events in there would fight the camera and
     * make the whole world feel like it is floating. Nothing survives the
     * close.
     *
     * The import is inside this module on purpose: the overview code-splits
     * out of the main bundle, so a visitor who goes straight to the world
     * never downloads it.
     */
    _startLenis() {
        if (this._lenis) return
        try {
            /*
             * The one input Lenis cannot see: a drag of the native scrollbar.
             *
             * Lenis resyncs itself from native scroll events, but only while
             * it is idle (see onNativeScroll: the guard is `isScrolling ===
             * false || 'native'`). Grab the bar during or just after a wheel,
             * while it is still easing toward its own target, and the two
             * disagree about where the page is: Lenis keeps animating from the
             * position it believes in, the drag keeps writing another, and
             * what you see is the page stuttering for the first moment of the
             * drag and then snapping.
             *
             * So for as long as the drag lasts, Lenis is pinned to the real
             * scroll position on every scroll event. reset() is exactly that
             * and nothing else: animatedScroll and targetScroll both become
             * actualScroll and the easing stops.
             *
             * NOT lenis.stop(), which was the first thing tried here and was
             * worse than the bug. stop() puts `lenis-stopped` on <html>, and
             * lenis.css answers that with `overflow: clip` -- so the scrollbar
             * you had just grabbed disappeared from under the cursor and took
             * the drag with it.
             *
             * Detected by where the press landed: a pointerdown past the
             * document's own client width is, by definition, on the scrollbar
             * gutter and not on the page.
             */
            this._onBarPress = (e) => {
                if (e.pointerType === 'touch' || e.button !== 0) return
                const doc = document.documentElement
                if (e.clientX <= doc.clientWidth && e.clientY <= doc.clientHeight) return
                const pin = () => this._lenis?.reset()
                pin()
                window.addEventListener('scroll', pin, { passive: true })
                const release = () => {
                    window.removeEventListener('scroll', pin)
                    window.removeEventListener('pointerup', release)
                    window.removeEventListener('pointercancel', release)
                    this._lenis?.reset()
                }
                window.addEventListener('pointerup', release)
                window.addEventListener('pointercancel', release)
            }
            window.addEventListener('pointerdown', this._onBarPress, true)

            this._lenis = new Lenis({
                autoRaf: true,
                // lerp alone. duration/easing are the other way of driving
                // this and setting both is how you get a scroll that ignores
                // one of the two; 0.09 is buttery without feeling detached.
                lerp: 0.09,
                // The skip link is an in-page anchor and should behave like
                // the nav does.
                anchors: true,
                // Native scroll on touch. A phone's scroll is already smooth,
                // momentum is the platform's job, and hijacking it is what
                // breaks pull-to-refresh and the address-bar collapse this
                // page went out of its way to keep.
                syncTouch: false,
                touchMultiplier: 1.2
                // respectReducedMotion defaults to true: with the OS setting
                // on, lerp becomes 1 and this is plain native scrolling.
            })
        } catch (err) {
            // A failure here must never cost the page its scroll.
            console.warn('Overview: smooth scroll unavailable, using native', err)
            this._lenis = null
        }
    }

    _stopLenis() {
        if (this._onBarPress) {
            window.removeEventListener('pointerdown', this._onBarPress, true)
            this._onBarPress = null
        }
        this._lenis?.destroy()
        this._lenis = null
    }

    /**
     * The bar is see-through at the top and the hero runs up behind it, which
     * only lines up while both agree on how tall the bar is. It changes with
     * the breakpoints, so it is measured rather than guessed.
     */
    _syncBarHeight() {
        const h = this.bar?.offsetHeight
        if (h) this.el.style.setProperty('--ov-bar-h', h + 'px')
    }

    _onResize() {
        this._magnetic?.refresh()
        // Where a line ends is a result of the width, so it is wrong the
        // instant the width changes.
        this._splitDisplays()
        this._movePill()
        this._syncBarHeight()
        this._updateScrollState()
        // Lenis caches the document height; a resize that changes it leaves
        // the scroll unable to reach the bottom until something tells it.
        this._lenis?.resize()
        this.viewport?.resize()
        this.dogPortrait?.resize()
    }

    // ═══ Open / close ═════════════════════════════════════════════════════
    open() {
        if (this.isOpen) return
        this.isOpen = true

        this._prevFocus = document.activeElement
        // Let the DOCUMENT scroll while this is open — that is the only thing
        // mobile Safari will collapse its toolbars for (see overview.css).
        document.documentElement.classList.add('ov-page')
        document.body.classList.add('ov-page')

        this.el.hidden = false
        window.scrollTo(0, 0)
        // Flush layout so the transition has a start value to run from. Doing
        // this with a double rAF instead would stall for seconds whenever the
        // tab is throttled, and the page would sit invisible.
        void this.el.offsetHeight
        // Layout is settled here, so the rings can be measured for real -- at
        // build time the root is still [hidden] and every perimeter is 0.
        this._fitDashRings()
        this.el.classList.add('is-open')

        document.addEventListener('keydown', this._onKeyDown)
        window.addEventListener('resize', this._onResize)
        window.addEventListener('pointermove', this._onPointerMove)
        this._syncBarHeight()
        this._updateScrollState()
        // After the layout flush above, so it measures a document that is
        // actually laid out, and only now: see _startLenis for why it must
        // not exist while the world is the thing on screen.
        this._startLenis()
        this.viewport?.resize()
        this.viewport?.start()
        this._syncDog()
        // The page's own controls get the same lean the start screen's do.
        // Built here rather than at construction because it measures, and
        // until now this root was [hidden] and every box in it was zero.
        this._magnetic = new Magnetic(this.el, '.ov-btn, .ov-back')
        // Both of these measure, so both wait for the layout flush above.
        this._splitDisplays()
        // Listeners only, but on cells that _render built, so not before it.
        this._wireSkillLinks()
        // The picture, and only the picture. The closing card had this too and
        // it had to come out: the dog on it is a live WebGL render, and no
        // arrangement of a 3D transform over a canvas that repaints every
        // frame was cheap enough to keep. See the note in Tilt.js.
        const view = this.el.querySelector('.ov-work-view')
        this._tilt = new Tilt(view, view?.closest('.ov-work'))
        // The DIALOG takes focus, not the back button.
        //
        // Focusing a control programmatically is what put a green ring round
        // the back button every single time this page opened, mouse or not:
        // Chrome treats a scripted focus as keyboard-ish and matches
        // :focus-visible. Parking focus on the container instead is both the
        // standard dialog pattern and the thing that does not draw: an element
        // with tabindex="-1" focused by script does not match :focus-visible.
        this.el.focus({ preventScroll: true })
    }

    close({ silent = false } = {}) {
        if (!this.isOpen) return
        this.isOpen = false

        this.menu?.hidePopover?.()
        // Before the scroll reset below, and before the world gets the input
        // back: see _startLenis.
        this._stopLenis()
        this.viewport?.stop()
        this.dogPortrait?.stop()
        this._magnetic?.destroy()
        this._magnetic = null
        this._tilt?.destroy()
        this._tilt = null
        this._skillGrid?.removeEventListener('pointermove', this._onSkillMove)
        this._skillGrid?.removeEventListener('pointerleave', this._onSkillLeave)
        this._skillGrid = null
        this.el.classList.remove('is-open')
        document.removeEventListener('keydown', this._onKeyDown)
        window.removeEventListener('resize', this._onResize)
        window.removeEventListener('pointermove', this._onPointerMove)
        document.documentElement.classList.remove('ov-page')
        document.body.classList.remove('ov-page')
        window.scrollTo(0, 0)

        const hide = () => { this.el.hidden = true }
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) hide()
        else setTimeout(hide, 450)

        if (!silent) {
            this._prevFocus?.focus?.({ preventScroll: true })
            this.onClose?.()
        }
    }

    _onKeyDown(e) {
        if (e.key === 'Escape') {
            // The sheet is a popover and closes itself; don't take the page down
            // with it.
            if (this.menu?.matches?.(':popover-open')) return
            e.preventDefault()
            this.close()
            return
        }
        if (e.key !== 'Tab') return
        // The sheet manages its own focus while it is in the top layer.
        if (this.menu?.matches?.(':popover-open')) return

        // Focus trap — this is a modal surface over the loading screen.
        const focusables = [...this.el.querySelectorAll(
            'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )].filter((n) => n.offsetParent !== null || n === document.activeElement)
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
        }
    }

    destroy() {
        this._stopLenis()
        this._io?.disconnect()
        this._dogIo?.disconnect()
        this._dashRo?.disconnect()
        this._workIo?.disconnect()
        this._frame?.dispose()
        this._frame = null
        clearTimeout(this._detailTimer)
        this.viewport?.dispose()
        this.dogPortrait?.dispose()
        if (this._onSourceLoaded) this.resources?.off('sourceLoaded', this._onSourceLoaded)
        document.removeEventListener('keydown', this._onKeyDown)
        window.removeEventListener('resize', this._onResize)
        window.removeEventListener('pointermove', this._onPointerMove)
        this.el?.remove()
    }
}
