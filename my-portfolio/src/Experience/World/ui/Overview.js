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
import i18n, { LOCALES } from '../../Utils/i18n.js'
import { getContent, richText } from './overviewContent.js'
import { SOCIALS } from './socialData.js'

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
    seed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21v-7"/><path d="M12 14c0-4 3-7 8-7 0 5-3 8-8 8Z"/><path d="M12 16c0-3-2.5-5.5-6-5.5 0 3.6 2.4 6 6 6Z"/></svg>`,
    cap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9l10-5 10 5-10 5Z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/></svg>`
}

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
        await i18n.setLocale(i18n.detect())
        this._build()
        this._watchCharacter()
        return this
    }

    // ═══ Build ════════════════════════════════════════════════════════════
    _build() {
        this.el = el('div', 'ov-root')
        this.el.setAttribute('role', 'dialog')
        this.el.setAttribute('aria-modal', 'true')
        this.el.setAttribute('aria-label', 'Portfolio')
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
        this.menu.popover = 'auto'

        this.langWrap = el('div', 'ov-lang')
        this.langWrap.setAttribute('role', 'group')

        this.bar.append(this.backBtn, this.nav, this.langWrap, this.menuBtn, this.progress)

        this.main = el('main', 'ov-main')
        this.main.id = 'ov-main'

        // Created ONCE and re-parented on every render. A language switch
        // rebuilds the hero, and a fresh <canvas> would leave the renderer bound
        // to the detached one — the character would simply vanish.
        this.portalCanvas = el('canvas', 'ov-portal-canvas')
        this.portalCanvas.setAttribute('aria-hidden', 'true')

        // Head tracking listens on the whole page, not on the character's own
        // box: he is standing in the open now, and a gaze that only woke up
        // inside an invisible rectangle read as broken.
        this._onPointerMove = (e) => {
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

        this.el.append(this.skip, this.bar, this.menu, this.main)
        document.body.appendChild(this.el)

        this._renderLangToggle()
        this._render()

        this.el.addEventListener('scroll', this._onScroll, { passive: true })
    }

    _renderLangToggle() {
        this.langWrap.innerHTML = ''
        for (const code of LOCALES) {
            const b = txt('button', 'ov-lang-btn', code.toUpperCase())
            b.type = 'button'
            b.setAttribute('aria-pressed', String(code === i18n.locale))
            b.addEventListener('click', () => this.setLang(code))
            this.langWrap.appendChild(b)
        }
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
        this._syncExploreButtons()
        this._mountPortrait()

        // The nav buttons are new objects with no aria-current, so the cached id
        // has to go too — otherwise the spy short-circuits and the active item
        // stays unmarked (and loses its white text) until the next scroll.
        this._currentId = null
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
            this.nav.appendChild(b)
            this._navButtons.push(b)
        }
    }

    _renderSheet(c) {
        this.menu.innerHTML = ''
        const head = el('div', 'ov-sheet-head')
        head.appendChild(txt('span', 'ov-sheet-title', c.a11y.menuTitle))
        const closeBtn = el('button', 'ov-sheet-close', SVG.close)
        closeBtn.type = 'button'
        closeBtn.setAttribute('aria-label', c.a11y.closeMenu)
        closeBtn.setAttribute('popovertarget', 'ov-menu')
        closeBtn.setAttribute('popovertargetaction', 'hide')
        head.appendChild(closeBtn)

        const list = el('nav', 'ov-sheet-list')
        for (const key of NAV_ITEMS) {
            const b = el('button', 'ov-sheet-link',
                `<span>${c.nav[key]}</span>${SVG.arrow}`)
            b.type = 'button'
            b.addEventListener('click', () => {
                this.menu.hidePopover()
                this._goTo(`ov-${key}`)
            })
            list.appendChild(b)
        }
        this.menu.append(head, list)
    }

    // ═══ Sections ═════════════════════════════════════════════════════════
    _section(id, title, blurb) {
        const s = el('section', 'ov-section')
        s.id = id
        const head = el('div', 'ov-section-head ov-reveal')
        head.appendChild(txt('h2', 'ov-h2', title))
        if (blurb) head.appendChild(txt('p', 'ov-blurb', blurb))
        s.appendChild(head)
        return s
    }

    _hero(c) {
        const hero = el('header', 'ov-hero')
        const inner = el('div', 'ov-hero-inner')

        const text = el('div', 'ov-hero-text')

        const name = txt('h1', 'ov-name ov-reveal', c.name)
        const role = txt('p', 'ov-role ov-reveal', c.hero.role)
        role.style.setProperty('--i', 1)
        const lede = txt('p', 'ov-lede ov-reveal', c.hero.lede)
        lede.style.setProperty('--i', 2)

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

        text.append(name, role, lede, ctas)

        // ── The window: the character from the world, and the door into it ──
        const portal = el('button', 'ov-portal ov-reveal')
        portal.type = 'button'
        portal.setAttribute('aria-label', c.a11y.portrait)
        portal.style.setProperty('--i', 2)
        portal.addEventListener('click', () => this._explore())

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

    _about(c) {
        const s = this._section('ov-about', c.about.title)
        const grid = el('div', 'ov-about ov-reveal')
        grid.style.setProperty('--i', 1)

        const prose = el('div', 'ov-prose')
        for (const p of c.about.story) prose.appendChild(txt('p', null, p))

        const langs = el('p', 'ov-langs')
        langs.append(
            txt('span', 'ov-langs-label', c.about.langsLabel),
            txt('span', 'ov-langs-value', c.about.langsValue)
        )
        prose.appendChild(langs)

        // Evidence beside the claim: the story says "built by hand", this lists
        // what by. Same source the in-world computer reads.
        const made = el('aside', 'ov-made')
        made.appendChild(txt('h3', 'ov-made-title', c.about.madeTitle))
        const ul = el('ul', 'ov-made-list')
        for (const item of c.about.made) {
            const li = el('li', 'ov-made-item')
            li.appendChild(el('span', 'ov-made-icon', item.icon))

            // "Gráficos: Three.js y TSL" → a muted label plus the tech set in a
            // mono face. Six identical icon+sentence rows read as one grey block;
            // splitting the two halves gives the eye something to scan, and the
            // mono says "these are the actual tools" without adding a word.
            const cut = item.title.indexOf(':')
            const body = el('span', 'ov-made-body')
            if (cut > 0) {
                body.appendChild(txt('span', 'ov-made-label', item.title.slice(0, cut)))
                body.appendChild(txt('span', 'ov-made-tech', item.title.slice(cut + 1).trim()))
            } else {
                body.appendChild(txt('span', 'ov-made-tech', item.title))
            }
            li.appendChild(body)
            ul.appendChild(li)
        }
        made.appendChild(ul)

        grid.append(prose, made)
        s.appendChild(grid)
        return s
    }

    _projects(c) {
        const s = this._section('ov-projects', c.projects.title, c.projects.blurb)
        const list = el('div', 'ov-projects')

        c.projects.items.forEach((p, i) => {
            const art = el('article', 'ov-project ov-reveal')
            art.style.setProperty('--i', i + 1)

            if (p.upcoming) {
                art.classList.add('ov-project--upcoming')
                const inner = el('div', 'ov-upcoming-inner')
                inner.appendChild(el('span', 'ov-upcoming-icon', SVG.seed))
                const body = el('div')
                body.appendChild(txt('h3', 'ov-upcoming-title', p.title))
                body.appendChild(txt('p', 'ov-upcoming-body', p.tagline))
                inner.appendChild(body)
                art.appendChild(inner)
                list.appendChild(art)
                return
            }

            const media = el('div', 'ov-project-media')
            if (p.image) {
                const img = new Image()
                img.src = p.image
                img.alt = p.title
                img.loading = 'lazy'
                img.decoding = 'async'
                media.appendChild(img)
            }

            const body = el('div', 'ov-project-body')

            const head = el('div', 'ov-project-head')
            head.appendChild(txt('h3', 'ov-project-title', p.title))
            if (p.finalProject) {
                head.appendChild(el('span', 'ov-badge',
                    `${SVG.cap}<span>${c.projects.finalProjectBadge}</span>`))
            }
            body.appendChild(head)
            body.appendChild(txt('p', 'ov-project-tagline', p.tagline))

            if (p.highlights?.length) {
                const ul = el('ul', 'ov-highlights')
                for (const h of p.highlights) {
                    const li = el('li', 'ov-highlight')
                    li.appendChild(el('span', 'ov-highlight-tick', SVG.check))
                    li.appendChild(el('span', 'ov-highlight-text', richText(h)))
                    ul.appendChild(li)
                }
                body.appendChild(ul)
            }

            if (p.stack?.length) {
                const chips = el('div', 'ov-chips')
                chips.setAttribute('aria-label', c.projects.stackLabel)
                for (const t of p.stack) chips.appendChild(txt('span', 'ov-chip', t))
                body.appendChild(chips)
            }

            if (p.links?.length) {
                const links = el('div', 'ov-project-links')
                for (const l of p.links) {
                    const a = el('a', 'ov-link', `<span>${l.label}</span>${SVG.external}`)
                    a.href = l.url
                    a.target = '_blank'
                    a.rel = 'noopener noreferrer'
                    links.appendChild(a)
                }
                body.appendChild(links)
            }

            art.append(media, body)
            list.appendChild(art)
        })

        s.appendChild(list)
        return s
    }

    _timeline(title, entries, mapper) {
        const wrap = el('div', 'ov-reveal')
        wrap.appendChild(txt('h3', 'ov-h3', title))
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
     * Certificates are deliberately quiet: the two that carry weight are listed,
     * the rest sit behind a disclosure. They are available to anyone who looks
     * for them without the page reading as a trophy cabinet.
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
            const main = el('span', 'ov-cert-main')
            main.appendChild(txt('span', 'ov-cert-title', cert.title))
            main.appendChild(txt('span', 'ov-cert-meta', `${cert.issuer} · ${cert.date}`))
            a.appendChild(main)
            // Always drawn, not revealed on hover: on a touch screen there is no
            // hover, and without it the row does not read as something you tap.
            a.appendChild(el('span', 'ov-cert-go', SVG.external))
            return a
        }

        const listed = el('div', 'ov-cert-list')
        for (const cert of c.path.certificatesFeatured) listed.appendChild(row(cert))
        block.appendChild(listed)

        const rest = c.path.certificatesRest
        if (!rest.length) return block

        const more = el('div', 'ov-cert-list ov-cert-rest')
        more.id = 'ov-cert-rest'
        more.hidden = true
        for (const cert of rest) more.appendChild(row(cert))

        const toggle = el('button', 'ov-cert-toggle',
            `<span class="ov-cert-toggle-text">${c.path.certsMore}</span>${SVG.chevron}`)
        toggle.type = 'button'
        toggle.setAttribute('aria-expanded', 'false')
        toggle.setAttribute('aria-controls', 'ov-cert-rest')
        toggle.addEventListener('click', () => {
            const open = toggle.getAttribute('aria-expanded') === 'true'
            toggle.setAttribute('aria-expanded', String(!open))
            more.hidden = open
            toggle.querySelector('.ov-cert-toggle-text').textContent =
                open ? c.path.certsMore : c.path.certsLess
        })

        block.append(toggle, more)
        return block
    }

    _skills(c) {
        const s = this._section('ov-skills', c.skills.title, c.skills.blurb)
        // An editorial spec sheet, not a row of identical boxes: the label sits
        // in its own column so the eye can run down it and stop at the group it
        // came for.
        const table = el('div', 'ov-skills')
        c.skills.groups.forEach((g, i) => {
            const row = el('div', 'ov-skill-row ov-reveal')
            row.style.setProperty('--i', i + 1)
            row.appendChild(txt('h3', 'ov-skill-label', g.group))
            const chips = el('div', 'ov-chips')
            for (const item of g.items) chips.appendChild(txt('span', 'ov-chip', item))
            row.appendChild(chips)
            table.appendChild(row)
        })

        if (c.skills.soft.length) {
            const row = el('div', 'ov-skill-row ov-reveal')
            row.style.setProperty('--i', c.skills.groups.length + 1)
            row.appendChild(txt('h3', 'ov-skill-label', c.skills.softTitle))
            const chips = el('div', 'ov-chips')
            for (const item of c.skills.soft) chips.appendChild(txt('span', 'ov-chip', item))
            row.appendChild(chips)
            table.appendChild(row)
        }

        s.appendChild(table)
        return s
    }

    _contact(c) {
        const s = this._section('ov-contact', c.contact.title, c.contact.blurb)

        const grid = el('div', 'ov-contact-grid ov-reveal')
        grid.style.setProperty('--i', 1)

        const mailCard = el('div', 'ov-card ov-contact-card')
        mailCard.appendChild(txt('div', 'ov-fact-label', c.contact.emailLabel))
        const mail = el('a', 'ov-contact-mail')
        mail.href = `mailto:${c.links.email}`
        mail.textContent = c.links.email
        mailCard.appendChild(mail)

        const socialCard = el('div', 'ov-card ov-contact-card')
        socialCard.appendChild(txt('div', 'ov-fact-label', c.contact.elsewhere))
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
        socialCard.appendChild(socials)

        grid.append(mailCard, socialCard)

        const outro = el('div', 'ov-outro ov-reveal')
        outro.style.setProperty('--i', 2)
        outro.appendChild(txt('h3', 'ov-outro-title', c.contact.outroTitle))
        outro.appendChild(txt('p', 'ov-outro-body', c.contact.outroBody))
        this.outroExplore = el('button', 'ov-btn ov-btn--primary')
        this.outroExplore.type = 'button'
        this.outroExplore.addEventListener('click', () => this._explore())
        outro.appendChild(this.outroExplore)

        s.append(grid, outro)
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
    _watchCharacter() {
        if (!this.resources) return
        const items = this.resources.items
        if (items?.humanModel) { this._mountPortrait(); return }

        this._onSourceLoaded = (name) => {
            if (name !== 'humanModel') return
            this.resources.off('sourceLoaded', this._onSourceLoaded)
            this._onSourceLoaded = null
            this._mountPortrait()
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
        this.portal?.classList.toggle('is-armed', this.worldReady)
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
        const y = this.el.scrollTop

        if (!reduce) {
            this.main.style.transition = 'opacity 0.2s ease'
            this.main.style.opacity = '0'
            await new Promise((r) => setTimeout(r, 200))
        }
        await i18n.setLocale(locale)
        this._renderLangToggle()
        this._render()
        this.el.scrollTop = y
        this.main.style.opacity = '1'
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
        }, { root: this.el, rootMargin: '0px 0px -12% 0px', threshold: 0.08 })

        this.main.querySelectorAll('.ov-section, .ov-reveal').forEach((n) => {
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

    _updateScrollState() {
        const top = this.el.scrollTop
        const max = this.el.scrollHeight - this.el.clientHeight
        this.progress.style.setProperty('--p', max > 0 ? (top / max).toFixed(4) : 0)
        this.el.classList.toggle('is-scrolled', top > 8)

        // Current section = the last one whose top has crossed a line set about
        // a third down the viewport. Sitting it right under the bar switches too
        // late: a heading can be well on screen and still read as the previous
        // section.
        const line = top + this.bar.offsetHeight + this.el.clientHeight * 0.3
        let current = this.sections[0]
        for (const s of this.sections) {
            if (s.offsetTop <= line) current = s
        }
        if (current && current.id !== this._currentId) {
            this._currentId = current.id
            for (const b of this._navButtons) {
                b.setAttribute('aria-current', String(b.dataset.target === current.id))
            }
            this._movePill()
        }

        // The portrait only animates while it is actually on screen.
        if (this.viewport?.ready) {
            const visible = top < (this.portal?.offsetTop ?? 0) + (this.portal?.offsetHeight ?? 0)
            if (visible && this.isOpen) this.viewport.start()
            else this.viewport.stop()
        }
    }

    /** Slide the single nav pill under the active item. */
    _movePill() {
        const active = this._navButtons.find((b) => b.getAttribute('aria-current') === 'true')
            || this._navButtons[0]
        if (!active) return
        this.navPill.style.setProperty('--x', `${active.offsetLeft}px`)
        this.navPill.style.setProperty('--w', `${active.offsetWidth}px`)
        this.navPill.classList.add('is-on')
    }

    _goTo(id) {
        const target = this.main.querySelector(`#${id}`)
        if (!target) return
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
        this.el.scrollTo({
            top: target.offsetTop - this.bar.offsetHeight - 12,
            behavior: reduce ? 'auto' : 'smooth'
        })
    }

    _onResize() {
        this._movePill()
        this._updateScrollState()
        this.viewport?.resize()
    }

    // ═══ Open / close ═════════════════════════════════════════════════════
    open() {
        if (this.isOpen) return
        this.isOpen = true

        this._prevFocus = document.activeElement
        this._prevBodyOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        this.el.hidden = false
        this.el.scrollTop = 0
        // Flush layout so the transition has a start value to run from. Doing
        // this with a double rAF instead would stall for seconds whenever the
        // tab is throttled, and the page would sit invisible.
        void this.el.offsetHeight
        this.el.classList.add('is-open')

        document.addEventListener('keydown', this._onKeyDown)
        window.addEventListener('resize', this._onResize)
        window.addEventListener('pointermove', this._onPointerMove)
        this._updateScrollState()
        this.viewport?.resize()
        this.viewport?.start()
        this.backBtn.focus({ preventScroll: true })
    }

    close({ silent = false } = {}) {
        if (!this.isOpen) return
        this.isOpen = false

        this.menu?.hidePopover?.()
        this.viewport?.stop()
        this.el.classList.remove('is-open')
        document.removeEventListener('keydown', this._onKeyDown)
        window.removeEventListener('resize', this._onResize)
        window.removeEventListener('pointermove', this._onPointerMove)
        document.body.style.overflow = this._prevBodyOverflow || ''

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
        this._io?.disconnect()
        this.viewport?.dispose()
        if (this._onSourceLoaded) this.resources?.off('sourceLoaded', this._onSourceLoaded)
        document.removeEventListener('keydown', this._onKeyDown)
        window.removeEventListener('resize', this._onResize)
        window.removeEventListener('pointermove', this._onPointerMove)
        this.el?.remove()
    }
}
