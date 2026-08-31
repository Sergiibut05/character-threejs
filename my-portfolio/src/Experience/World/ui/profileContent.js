/**
 * profileContent — resolves profileData.js for the active locale, for the
 * surfaces INSIDE the world: the computer in the house and the trophy shelf.
 *
 * The twin of overviewContent.js, and it deliberately shares that file's rules:
 *
 *   - Spanish is the source. profileData.js IS the Spanish copy, so nothing is
 *     duplicated into es.js — every lookup here is an `opt()` that falls
 *     through to the data module when the catalog has no override. That is
 *     what stops the same paragraph existing in two places and drifting.
 *
 *   - Structured facts are never translated: orgs, stacks and URLs stay as
 *     they are, and dates are only reformatted. Course TITLES are the one
 *     exception, and a deliberate one — see `certificates` below.
 *
 * Overrides that the Quick Overview already carries (experience, education,
 * skill group names, the behind-the-scenes headings) are read straight from
 * `overview.*` rather than copied into a second branch — the two surfaces show
 * the same facts, so a second copy could only ever go out of sync. What lives
 * under `profile.*` is the prose ONLY the computer shows: the bios, the
 * behind-the-scenes bodies and the credits.
 */
import i18n from '../../Utils/i18n.js'
import { period } from './overviewContent.js'
import {
    ABOUT, EXPERIENCE, EDUCATION, SKILLS,
    BTS_INTRO, BEHIND_THE_SCENES, BTS_CREDITS, CERTIFICATES
} from './profileData.js'

const opt = (key) => i18n.opt(key)

/** Spoken languages are a person's, not a tool in a list next to Kotlin. */
const isSpokenLanguages = (group) => /^idiomas$/i.test(group)

export function getProfile() {
    return {
        about: {
            quickBio: opt('profile.quickBio') || ABOUT.quickBio,
            fullBio: opt('profile.fullBio') || ABOUT.fullBio
        },

        // Shared with the Quick Overview — see the note at the top.
        experience: EXPERIENCE.map((e, i) => ({
            ...e,
            period: period(e.period),
            role: opt('overview.path.experienceItems')?.[i]?.role || e.role,
            detail: opt('overview.path.experienceItems')?.[i]?.detail ?? e.detail
        })),

        education: EDUCATION.map((e, i) => ({
            ...e,
            period: period(e.period),
            title: opt('overview.path.educationItems')?.[i]?.title || e.title,
            detail: opt('overview.path.educationItems')?.[i]?.detail ?? e.detail
        })),

        // The computer shows the spoken-languages group the overview drops, so
        // its name and its items need an override the overview never needed.
        skills: SKILLS.map((g) => {
            if (isSpokenLanguages(g.group)) {
                return {
                    group: opt('profile.spokenGroup') || g.group,
                    items: opt('profile.spokenItems') || g.items
                }
            }
            return {
                ...g,
                group: opt('overview.skills.groupNames')?.[g.group] || g.group
            }
        }),

        bts: {
            intro: opt('profile.btsIntro') || BTS_INTRO,
            sections: BEHIND_THE_SCENES.map((b, i) => ({
                ...b,
                title: opt('overview.about.made')?.[i] || b.title,
                body: opt('profile.btsBodies')?.[i] || b.body,
                link: b.link
                    ? { ...b.link, label: opt('profile.btsLinkLabel') || b.link.label }
                    : undefined
            })),
            credits: {
                ...BTS_CREDITS,
                title: opt('profile.creditsTitle') || BTS_CREDITS.title,
                body: opt('profile.creditsBody') || BTS_CREDITS.body
            }
        },

        // A course NAME is translated; everything else about the credential is
        // not. The issuer, the URL and the date it was awarded are the record;
        // the title is what the course is called, and a reader who cannot read
        // Spanish learns nothing from it left as it is. Anything with no entry
        // in the map (the Cambridge certificate) is already the name it was
        // issued under and passes straight through.
        certificates: CERTIFICATES.map((c) => ({
            ...c,
            title: opt('profile.certificateTitles')?.[c.title] || c.title,
            date: period(c.date)
        }))
    }
}

export default getProfile
