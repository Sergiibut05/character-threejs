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
    },

    /* ── Profile prose, English side only ──────────────────────────────────
       There is no `profile` branch in es.js and there should not be: Spanish is
       the source language and profileData.js already holds it, so these are
       read with opt() and simply fall through when the locale is Spanish. A
       second Spanish copy could only drift from the first.

       Only what the in-world computer shows lives here. Experience, education,
       skill group names and the behind-the-scenes headings are already under
       overview.* and are shared, not duplicated. */
    profile: {
        quickBio:
            'Qualified in Multiplatform App Development (DAM) at Málaga TechPark. ' +
            'I build web and mobile applications, and I love making interactive ' +
            'experiences — like this 3D world you are walking around.',
        fullBio: [
            'I trained in the core technologies of web and mobile development: Java, ' +
            'JavaScript, TypeScript and Kotlin as languages, with Angular, Ionic and ' +
            'Android Studio as working environments, plus experience in relational ' +
            '(MySQL) and non-relational (Firebase) databases. I did the dual-track ' +
            'half at Aliqindoi, working on real projects from day one.',
            'I hold a Cambridge-certified C1 in English (CAE, 190 points), speak ' +
            'Ukrainian natively and Spanish as my mother tongue. I would describe ' +
            'myself as curious, hard-working and always learning: I am driven by new ' +
            'challenges, by working in a team, and by building things people enjoy ' +
            'using.'
        ],

        spokenGroup: 'Spoken languages',
        spokenItems: ['Spanish (native)', 'Ukrainian (native)', 'English (C1)'],

        btsIntro:
            'This world uses no game engine: it is built piece by piece to run ' +
            'straight in your browser. Here is what is under the hood.',
        btsBodies: [
            'Everything you see is drawn with Three.js, a library that talks directly ' +
            'to your graphics card. The effects — the water, the fire, the swaying ' +
            'grass — are made with TSL, a modern way of writing them in JavaScript ' +
            'instead of the specialised code it used to take.',
            'A physics engine is what lets the character walk, climb steps and not ' +
            'wander through walls.',
            'The music rotates between tracks with soft crossfades, and the sound ' +
            'reacts to where you are: the river and the campfire come up as you ' +
            'get closer.',
            'The background tracks are made with Suno, an AI that generates music.',
            'Your score in the frisbee minigame is saved online and shows up live on ' +
            'the board beside the pitch.',
            'The models are low-poly: some made by hand in Blender, others the work ' +
            'of the artist Isa Lousberg. Everything is compressed so the world loads ' +
            'in seconds.'
        ],
        btsLinkLabel: 'Listen to the full playlist',

        creditsTitle: 'Thanks',
        creditsBody:
            'To Bruno Simon, for Three.js Journey — where I learnt much of what makes ' +
            'this world work — and for his portfolio, the great inspiration behind ' +
            'this one. And to Isa Lousberg, for her beautiful low-poly models.'
    },

    /* ── The 3D world ───────────────────────────────────────────────────
       Mirrors game.* in es.js key for key. */
    game: {
        landing: { explore: 'Explore' },

        common: {
            play: 'Play!',
            next: 'Next',
            playAgain: 'Play again',
            back: 'Back',
            exit: 'Leave',
            accept: 'OK',
            done: 'Done',
            send: 'Send',
            ranking: 'Leaderboard',
            seeRanking: 'See leaderboard',
            saveRecord: 'Save score',
            howToPlay: 'How to play',
            leaveGame: 'Leave the minigame',
            competitive: 'Ranked',
            free: 'Practice'
        },

        controls: {
            moveKeyboard: 'A and D',
            movePad: 'the stick',
            moveTouch: 'the joystick',
            pressKeyboard: 'Press Enter',
            pressPad: 'Press A',
            pressTouch: 'tap the button'
        },

        hint: { touchTo: 'Tap to {verb}' },

        frisbee: {
            title: 'Frisbee',
            chooseMode: 'Pick how you want to play',
            competitiveDesc: '10 rounds · score as high as you can',
            freeDesc: 'Practice · unlimited throws',
            round: 'Round {n}',
            roundOf: 'Round {n} / {total}',
            lastRound: 'Last round!',
            shot: 'Throw {n}',
            freeShot: 'Practice · Throw {n}',
            points: 'Points',
            resultsTitle: 'That is a wrap!',
            finalScore: 'Final score',
            ofPossible: 'out of {max}',
            top10Badge: '🏆 You made the Top 10!',
            lbSubtitle: 'Top 10 · Frisbee',
            boardFooter: 'Top 5 · Frisbee',
            tutorial: {
                aimTitle: 'Aim',
                aimBody: 'Move with {move} to line up the target. {press} to lock ' +
                    'your aim.',
                curveTitle: 'Curve',
                curveBody: 'Then tilt the disc with {move} to bend the throw: swing ' +
                    'around and pop the balloon on the way to the target.',
                powerTitle: 'Power',
                powerBody: 'A bar swings on its own. {press} at the right moment to ' +
                    'lock the power and throw. More power, more distance!'
            }
        },

        beach: {
            title: 'Beach volleyball',
            chooseMode: 'Keep the rally going without letting the ball hit the sand',
            competitiveDesc: 'One miss and it is over · counts for the leaderboard',
            freeDesc: 'Practice · the rally restarts on its own',
            resultsTitle: 'Rally over!',
            touches: 'Touches in a row',
            best: 'your best: {n}',
            top10Badge: 'You made the Top 10!',
            lbSubtitle: 'Top 10 · Beach volleyball',
            boardFooter: 'Top 5 · Beach volleyball',
            go: 'Go!',
            perfect: 'Perfect!',
            record: 'best {n}',
            widerCourt: 'Wider court',
            narrowerCourt: 'Narrower court',
            ballBeach: 'Beach ball',
            ballFootball: 'Football',
            ballCoconut: 'Coconut'
        },

        leaderboard: {
            heading: 'LEADERBOARD',
            empty: 'No scores yet. Be the first!',
            boardEmpty: 'No scores yet',
            boardBeFirst: 'Be the first!',
            yourPosition: 'You · #{rank} · {score} pts'
        },

        nameEntry: {
            title: 'You are in the Top 10!',
            subtitle: 'Enter your initials'
        },

        map: {
            title: 'Map',
            goTo: 'Go to {place}',
            subtitle: 'Pick where to go',
            house: 'The house',
            frisbee: 'Frisbee',
            fire: 'The campfire',
            bridge: 'The bridge',
            social: 'Social corner',
            beach: 'The beach'
        },

        settings: {
            title: 'Settings',
            connConnecting: 'Connecting…',
            connDisabled: 'Not configured',
            groupWorld: 'World',
            groupFrisbee: 'Frisbee',
            ctrlMove: 'Move',
            ctrlSprint: 'Run',
            ctrlInteract: 'Interact',
            ctrlAim: 'Aim',
            ctrlTilt: 'Curve',
            ctrlThrow: 'Power / Throw',
            ctrlBack: 'Leave',
            deviceKeyboard: 'Keyboard',
            devicePad: 'Gamepad',
            deviceTouch: 'Touch',
            tabGeneral: 'General',
            tabSfx: 'Effects',
            tabControls: 'Controls',
            quality: 'Quality',
            qualityHigh: 'High',
            qualityHighDesc: 'Best it looks',
            qualityLight: 'Light',
            qualityLightDesc: 'Best it runs',
            sound: 'Sound',
            noMusic: 'No music',
            prevTrack: 'Previous track',
            nextTrack: 'Next track',
            mute: 'Mute',
            muteSfx: 'Mute effects',
            sfx: 'Sound effects',
            sfxDesc: 'Ambience, fire and water as you move around the world.',
            language: 'Language',
            languageDesc: 'Detected from your browser; change it by hand here.',
            connection: 'Connection',
            connOnline: 'Online',
            connOffline: 'Offline',
            connOnlineHint: 'Online leaderboard is live: your scores are saved on the server.',
            connOfflineHint: 'No server right now — scores are kept on this device and ' +
                'uploaded when the connection is back.',
            connConnectingHint: 'Checking the connection to the server…',
            connUnsetHint: 'Online leaderboard is not configured — scores are kept on ' +
                'this device.'
        },

        contact: {
            title: 'Contact',
            nameLabel: 'Name',
            emailLabel: 'Your email',
            messageLabel: 'Message',
            emptyMessage: 'Write a message before sending.',
            thanks: 'Thanks for writing. I will get back to you soon.',
            visitor: 'Portfolio visitor',
            subtitle: 'Fancy working together? Tell me your idea and I will get back to you.',
            namePlaceholder: 'Your name',
            emailPlaceholder: 'you@example.com',
            messagePlaceholder: 'Tell me…',
            badEmail: 'Check your email address, it does not look valid.',
            sendFailed: 'Could not send. Please try again.',
            offline: 'No connection. Try again in a moment.',
            noName: '(no name)',
            subject: 'Portfolio — {name}',
            subjectFallback: 'New message'
        },

        computer: {
            quickBio: 'Quick bio',
            fullBio: 'Full bio',
            technicalSkills: 'Technical skills',
            about: 'About me',
            experience: 'Experience',
            behindScenes: 'Behind the scenes',
            education: 'Education'
        },

        project: {
            close: 'Close',
            badge: 'Project',
            screenshot: 'Screenshot {n}',
            highlights: 'Highlights',
            stack: 'Stack'
        },

        trophy: {
            title: 'Certificates',
            viewCredential: 'View credential: {title}'
        }
    }
}
