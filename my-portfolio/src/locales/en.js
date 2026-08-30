/**
 * English catalog. Mirrors the key structure of es.js exactly — any key present
 * there should exist here, or the lookup silently falls back to Spanish.
 */
export default {
    overview: {
        a11y: {
            skip: 'Skip to content',
            close: 'Back to the start screen',
            langSwitch: 'Change language',
            openMenu: 'Open the menu',
            closeMenu: 'Close the menu',
            menuTitle: 'Jump to',
            portrait: 'Character from the 3D world. Press to go in.'
        },

        nav: {
            about: 'About',
            projects: 'Projects',
            path: 'Path',
            skills: 'Skills',
            contact: 'Contact'
        },

        hero: {
            role: 'Web & mobile developer · Málaga, Spain',
            lede: 'Qualified in Multiplatform App Development, with two company ' +
                'placements building web and mobile. I work with Angular, ' +
                'TypeScript and Kotlin, and I am looking for my first full-time ' +
                'role.',
            enter: 'Enter the world',
            enterLoading: 'Getting the world ready',
            cv: 'Download CV',
            portraitHint: 'Press to go in'
        },

        about: {
            title: 'About me',
            story: [
                'I finished my higher diploma in Multiplatform App Development at ' +
                'Málaga TechPark. I did the dual-track half at Aliqindoi, working ' +
                'on the company\'s real projects across two placements.',

                'I am comfortable on both the frontend and the backend, and I like ' +
                'finishing things properly: deployed, working and actually usable. ' +
                'Outside work I am usually learning something new, generally around ' +
                'graphics or game development.'
            ],
            langsLabel: 'Languages',
            langsValue: 'Native Spanish and Ukrainian · English C1 (Cambridge)',
            madeTitle: 'This site, under the hood',
            // Overrides BEHIND_THE_SCENES titles, in the same order as the data.
            made: [
                'Graphics: Three.js and TSL',
                'Physics: Rapier',
                'Sound: Howler.js',
                'Music: Suno AI',
                'Leaderboard: Firebase',
                'Art: Blender'
            ]
        },

        projects: {
            title: 'Projects',
            blurb: 'What I have built and actually shipped.',
            stack: 'Stack',
            tfgBadge: 'Final course project',
            upcomingTitle: 'Coming soon',
            upcomingBody: 'A new project is in the works. Check back shortly.',
            // Overrides over projectsData.js, which stays the Spanish source of
            // truth. Only keys present here replace the original.
            items: {
                bookmatch: {
                    tagline: 'Book marketplace: buy, sell and swap · web + Android',
                    highlights: [
                        'A **real, deployed full-stack platform**: a catalogue of ~1000 ' +
                        'books, cart, **Stripe payments** and a user-to-user swap module.',
                        '**Angular** frontend and an **Express/Prisma** backend over ' +
                        'PostgreSQL, with Firebase auth and a **native Android app in Kotlin**.',
                        'Forums with comments and votes, **AI recommendations** (n8n), ' +
                        'GA4 analytics and **CI/CD** deployment.'
                    ],
                    links: ['Visit the site', 'Code on GitHub']
                },
                volumine: {
                    tagline: '3D charts you embed anywhere with a link',
                    highlights: [
                        'Six chart types in **three.js with hand-built geometry** — bevelled ' +
                        'edges, real shadows and studio lighting — and no 3D charting ' +
                        'library anywhere.',
                        '**The whole config travels inside the URL**, compressed, so a shared ' +
                        'chart needs no database at all: the free tier and the developer API ' +
                        'fall out of the same decision.',
                        'The embed route is **sacred**: zero cookies, zero third-party ' +
                        'requests, and a 149 KB JS budget that **fails the build** if it slips.'
                    ],
                    links: ['Visit the site']
                }
            }
        },

        path: {
            title: 'Path',
            blurb: 'Where I have worked and where I studied.',
            experience: 'Experience',
            education: 'Education',
            certsTitle: 'Accredited training',
            certsMore: 'and a few more',
            certsLess: 'hide',
            viewCredential: 'View credential',
            // Override EXPERIENCE / EDUCATION, same order as the data modules.
            // Orgs, dates and credential names are proper nouns — never translated.
            experienceItems: [
                {
                    role: 'Software Developer',
                    detail: 'Second placement of the dual vocational programme: web ' +
                        'and mobile development on the company\'s real projects.'
                },
                {
                    role: 'Software Developer',
                    detail: 'First company placement: hands-on experience contributing ' +
                        'to the development team\'s day-to-day work.'
                }
            ],
            educationItems: [
                {
                    title: 'Higher VET Diploma — Multiplatform Application Development',
                    detail: 'Dual track: study at the college combined with work at a company.'
                },
                {
                    title: 'Upper Secondary — Science & Technology track',
                    detail: ''
                }
            ]
        },

        skills: {
            title: 'Skills',
            blurb: 'What I work with day to day.',
            // Keyed by the Spanish group name in SKILLS, not by position, so
            // reordering the data cannot silently mislabel a row.
            groupNames: {
                'Lenguajes': 'Languages',
                'Frameworks y plataformas': 'Frameworks & platforms',
                'Bases de datos': 'Databases',
                'Diseño y 3D': 'Design & 3D'
            },
            softTitle: 'Soft skills',
            soft: [
                'Teamwork',
                'Communication',
                'Problem solving',
                'Fast learner',
                'Attention to detail'
            ]
        },

        contact: {
            title: 'Get in touch',
            blurb: 'I am looking for my first role as a developer. If anything ' +
                'here fits, drop me a line and I will get back to you.',
            emailLabel: 'Email',
            elsewhere: 'Elsewhere',
            outroTitle: 'Rather see it by playing?',
            outroBody: 'Everything on this page is scattered across a world you ' +
                'can walk through, minigames included.'
        }
    }
}
