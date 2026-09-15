/**
 * overviewContent — resolves the Quick Overview's content tree for the active
 * locale.
 *
 * Split of responsibility:
 *   - prose and UI chrome  → src/locales/*.js (via i18n)
 *   - structured facts     → profileData.js / projectsData.js
 *
 * Structured facts are language-neutral or proper nouns (dates, orgs, stacks,
 * URLs, credential titles), so they are never translated — only reformatted.
 * That keeps profileData as the single source of truth shared with the 3D world.
 */
import i18n from '../../Utils/i18n.js'
import {
    LINKS, CERTIFICATES, EXPERIENCE, EDUCATION, SKILLS, BEHIND_THE_SCENES
} from './profileData.js'
import { PROJECTS } from './projectsData.js'

/** Escape, then apply the same `**bold**` convention the project carts use. */
export function richText(str) {
    const safe = String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

const MONTHS = {
    Enero: 'January', Febrero: 'February', Marzo: 'March', Abril: 'April',
    Mayo: 'May', Junio: 'June', Julio: 'July', Agosto: 'August',
    Septiembre: 'September', Octubre: 'October', Noviembre: 'November',
    Diciembre: 'December'
}

const MONTH_RE = new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\b`, 'g')

/**
  * Dates are stored Spanish; English readers get English month names.
  * Exported because the in-world computer and trophy shelf show the SAME dates
  * and must reformat them identically — see profileContent.js.
  */
export function period(text) {
    if (i18n.locale !== 'en') return text
    // "Actualidad" is not a month, so MONTH_RE never saw it and the ongoing
    // course read "2026 — Actualidad" in the English build.
    return String(text)
        .replace(MONTH_RE, (m) => MONTHS[m])
        .replace(/Actualidad/g, 'Present')
}

/**
 * A project's PROSE in the active locale, with everything else left alone.
 *
 * Exported because the 3D carts show the same three projects as this page and
 * were reading projectsData.js raw — which is the Spanish source, so a cart
 * stayed in Spanish however the rest of the site was set. Images are untouched
 * on purpose: the overview swaps in a wider crop, the cart wants the pair it
 * was authored with.
 */
export function translateProject(p) {
    const key = `overview.projects.items.${p.id}`
    const linkLabels = i18n.opt(`${key}.links`) || []
    return {
        ...p,
        tagline: i18n.opt(`${key}.tagline`) || p.tagline,
        short: i18n.opt(`${key}.short`) || p.short,
        figures: (p.figures || []).map((f, i) => ({
            value: f.value,
            label: i18n.opt(`${key}.figures`)?.[i] || f.label
        })),
        highlights: i18n.opt(`${key}.highlights`) || p.highlights,
        links: (p.links || []).map((l, i) => ({ ...l, label: linkLabels[i] || l.label }))
    }
}

/**
 * A credential as an English reader should see it: the course NAME translated,
 * the date reformatted, and the issuer and URL left exactly as awarded.
 */
function certificate(c) {
    return {
        ...c,
        title: i18n.opt('profile.certificateTitles')?.[c.title] || c.title,
        date: period(c.date)
    }
}

/** Spoken languages belong with the person, not in a list next to Kotlin. */
const isSpokenLanguages = (group) => /^idiomas$/i.test(group)

/**
 * What this page says I build with, and WHERE.
 *
 * The overview used to print all five groups of SKILLS: thirty entries, HTML
 * and CSS and Git and "attention to detail" among them. That is a CV taxonomy,
 * and on a page trying to read as considered work it does the opposite of what
 * it looks like it is doing. Nobody was ever hired on "Teamwork", and listing
 * it beside TSL makes the TSL cheaper.
 *
 * The rule that replaced it is simple and it does the selecting on its own:
 * A NAME ONLY GOES ON THIS PAGE IF IT CAN SAY WHERE IT WAS USED. There is no
 * curated list of "important" technologies here, because there does not need
 * to be one: HTML, Git and Teamwork cannot name a project, so they are not
 * here, and every entry that IS here carries its own evidence underneath it.
 *
 * `match` is what to look for in a project's `stack`, so the evidence comes
 * out of projectsData and cannot drift from it. `site` means this island is
 * built with it, which for three of these is the only place it appears — and
 * saying so is the quietest way to tell a reader that the thing they are
 * currently looking at IS the portfolio piece.
 *
 * Ordered the way a stack is read: interface, then the things behind it, then
 * the graphics.
 */
const CORE_SKILLS = [
    { name: 'TypeScript', match: ['TypeScript'] },
    { name: 'Angular', match: ['Angular'] },
    { name: 'Next.js', match: ['Next.js'] },
    { name: 'Kotlin', match: ['Kotlin'] },
    { name: 'Express', match: ['Express'] },
    // The tile says Python; the match still looks for FastAPI too, because
    // that is the name in the project's stack and the evidence has to
    // resolve either way.
    { name: 'Python', match: ['Python', 'FastAPI'] },
    { name: 'PostgreSQL', match: ['PostgreSQL'] },
    { name: 'Firebase', match: ['Firebase'], site: true },
    { name: 'Stripe', match: ['Stripe'] },
    { name: 'Three.js', match: ['Three.js'], site: true },
    { name: 'TSL · WebGPU', site: true },
    { name: 'Blender', site: true }
]

/**
 * One tile: the name, and the list of places it was used.
 *
 * Each project entry carries the INDEX it sits at in the stage, so the label
 * can be a control that brings that card to the front. "This site" carries no
 * index: there is nowhere on this page to send anyone, the page is the thing.
 */
function skillEvidence(skill, ordered, siteLabel) {
    const usedIn = []
    ordered.forEach((p, i) => {
        if (p.upcoming || !skill.match) return
        if ((p.stack || []).some((tech) => skill.match.includes(tech))) {
            usedIn.push({ label: p.title, index: i })
        }
    })
    if (skill.site) usedIn.push({ label: siteLabel, index: null })
    return { name: skill.name, usedIn }
}


/** A project whose content is still placeholder copy, not something to show off. */
const isUpcoming = (project) => /^proximamente/.test(project.id)

/**
 * Several placeholders in a row become one card. Two identical "coming soon"
 * tiles stacked read as a rendering bug rather than as intent.
 */
/**
 * Order for the overview only.
 *
 * PROJECTS is indexed by the 3D world: cart N shows PAGE_SOURCES[N] and opens
 * PROJECTS[N], so reordering the array would leave a stand showing one
 * project's screenshot and opening another's panel. The overview has no such
 * constraint and wants the strongest work first, so `spotlight` reorders here
 * and here only. Stable, so everything else keeps its authored order.
 */
function overviewOrder(list) {
    return [
        ...list.filter((p) => p.spotlight === true),
        ...list.filter((p) => p.spotlight !== true)
    ]
}

function collapseUpcoming(list) {
    const out = []
    for (const p of list) {
        if (isUpcoming(p) && out.length && isUpcoming(out[out.length - 1])) continue
        out.push(p)
    }
    return out
}

export function getContent() {
    const t = (key, params) => i18n.t(`overview.${key}`, params)
    const opt = (key) => i18n.opt(`overview.${key}`)
    const list = (key) => i18n.list(`overview.${key}`)

    const featured = CERTIFICATES.filter((c) => c.featured)
    const rest = CERTIFICATES.filter((c) => !c.featured)

    // Hoisted: the stage's order is also the order the skill tiles point into,
    // and an index that disagreed between the two would send a reader to the
    // wrong project.
    const ordered = overviewOrder(collapseUpcoming(PROJECTS))

    return {
        name: 'Sergii Butrii',
        links: LINKS,

        a11y: {
            skip: t('a11y.skip'),
            close: t('a11y.close'),
            langSwitch: t('a11y.langSwitch'),
            openMenu: t('a11y.openMenu'),
            closeMenu: t('a11y.closeMenu'),
            menuTitle: t('a11y.menuTitle'),
            portrait: t('a11y.portrait')
        },

        nav: {
            about: t('nav.about'),
            projects: t('nav.projects'),
            path: t('nav.path'),
            skills: t('nav.skills'),
            contact: t('nav.contact')
        },

        hero: {
            role: t('hero.role'),
            enter: t('hero.enter'),
            enterLoading: t('hero.enterLoading'),
            cv: t('hero.cv'),
            portraitHint: t('hero.portraitHint')
        },

        about: {
            title: t('about.title'),
            statement: t('about.statement'),
            story: list('about.story'),
            basedLabel: t('about.basedLabel'),
            basedValue: t('about.basedValue'),
            focusLabel: t('about.focusLabel'),
            focusValue: t('about.focusValue'),
            langsLabel: t('about.langsLabel'),
            langsValue: t('about.langsValue'),
            madeTitle: t('about.madeTitle'),
            // The "how it is built" panel is evidence for the story next to it,
            // so it reuses the same source the in-world computer reads.
            made: BEHIND_THE_SCENES.map((b, i) => ({
                icon: b.icon,
                title: opt('about.made')?.[i] || b.title
            }))
        },

        projects: {
            title: t('projects.title'),
            blurb: t('projects.blurb'),
            stackLabel: t('projects.stack'),
            stageLabel: t('projects.stageLabel'),
            slideLabel: t('projects.slideLabel'),
            hint: t('projects.hint'),
            prevLabel: t('projects.prev'),
            nextLabel: t('projects.next'),
            finalProjectBadge: t('projects.tfgBadge'),
            moreLabel: t('projects.more'),
            lessLabel: t('projects.less'),
            items: ordered.map((p) => {
                if (isUpcoming(p)) {
                    return {
                        id: p.id,
                        upcoming: true,
                        title: t('projects.upcomingTitle'),
                        tagline: t('projects.upcomingBody')
                    }
                }
                const tp = translateProject(p)
                return {
                    id: p.id,
                    upcoming: false,
                    // The data has always marked the strongest project; until
                    // now it only reordered the list and the card looked like
                    // every other one. The layout reads it too.
                    spotlight: p.spotlight === true,
                    title: p.title,
                    finalProject: p.finalProject === true,
                    tagline: tp.tagline,
                    // Two lines for the card. The long version did not get
                    // shorter, it moved: the highlights are in the disclosure
                    // under the stage, where a reader who wants them can open
                    // them without the card having to carry them.
                    short: tp.short,
                    pills: p.pills || (p.stack || []).slice(0, 3),
                    // The card is one wide image, so a project can name a
                    // better-cropped shot than the one baked onto its 3D stand.
                    image: p.overviewImage || p.image,
                    // The spread's own art: a 3:2 still at two sizes plus the
                    // product actually running. Superseded overviewImageWide,
                    // which was a crop for the old tall media well.
                    spread: p.spread || null,
                    highlights: tp.highlights,
                    figures: tp.figures,
                    stack: p.stack,
                    links: tp.links
                }
            })
        },

        path: {
            title: t('path.title'),
            blurb: t('path.blurb'),
            experienceTitle: t('path.experience'),
            educationTitle: t('path.education'),
            certsTitle: t('path.certsTitle'),
            certsMore: t('path.certsMore'),
            certsLess: t('path.certsLess'),
            viewCredential: t('path.viewCredential'),
            experience: EXPERIENCE.map((e, i) => ({
                ...e,
                period: period(e.period),
                role: opt('path.experienceItems')?.[i]?.role || e.role,
                detail: opt('path.experienceItems')?.[i]?.detail ?? e.detail
            })),
            education: EDUCATION.map((e, i) => ({
                ...e,
                period: period(e.period),
                title: opt('path.educationItems')?.[i]?.title || e.title,
                detail: opt('path.educationItems')?.[i]?.detail ?? e.detail
            })),
            // Same map the in-world trophy shelf uses, so one credential cannot
            // read one way here and another way in the house.
            certificatesFeatured: featured.map(certificate),
            certificatesRest: rest.map(certificate)
        },

        skills: {
            title: t('skills.title'),
            blurb: t('skills.blurb'),
            goTo: t('skills.goTo'),
            alsoCv: t('skills.alsoCv'),
            core: CORE_SKILLS.map((sk) =>
                skillEvidence(sk, ordered, t('skills.thisSite')))
        },

        contact: {
            title: t('contact.title'),
            blurb: t('contact.blurb'),
            emailLabel: t('contact.emailLabel'),
            elsewhere: t('contact.elsewhere'),
            outroTitle: t('contact.outroTitle'),
            outroBody: t('contact.outroBody')
        }
    }
}
