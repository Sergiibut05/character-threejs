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
    return String(text).replace(MONTH_RE, (m) => MONTHS[m])
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
            lede: t('hero.lede'),
            enter: t('hero.enter'),
            enterLoading: t('hero.enterLoading'),
            cv: t('hero.cv'),
            portraitHint: t('hero.portraitHint')
        },

        about: {
            title: t('about.title'),
            story: list('about.story'),
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
            finalProjectBadge: t('projects.tfgBadge'),
            items: overviewOrder(collapseUpcoming(PROJECTS)).map((p) => {
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
                    title: p.title,
                    finalProject: p.finalProject === true,
                    tagline: tp.tagline,
                    // The card is one wide image, so a project can name a
                    // better-cropped shot than the one baked onto its 3D stand.
                    image: p.overviewImage || p.image,
                    highlights: tp.highlights,
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
            groups: SKILLS
                .filter((g) => !isSpokenLanguages(g.group))
                .map((g) => ({ ...g, group: opt('skills.groupNames')?.[g.group] || g.group })),
            softTitle: t('skills.softTitle'),
            soft: list('skills.soft')
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
