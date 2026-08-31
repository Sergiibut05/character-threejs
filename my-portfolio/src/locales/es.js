/**
 * Spanish catalog.
 *
 * Prose lives here; structured facts (dates, orgs, stacks, URLs) stay in the
 * data modules under Experience/World/ui/, which remain the single source of
 * truth for both this page and the 3D world.
 *
 * When the in-world UI moves onto i18n, add a `game` branch alongside `overview`.
 */
export default {
    overview: {
        a11y: {
            skip: 'Saltar al contenido',
            close: 'Volver a la pantalla de inicio',
            langSwitch: 'Cambiar idioma',
            openMenu: 'Abrir el menú',
            closeMenu: 'Cerrar el menú',
            menuTitle: 'Ir a',
            portrait: 'Personaje del mundo 3D. Púlsalo para entrar.'
        },

        nav: {
            about: 'Sobre mí',
            projects: 'Proyectos',
            path: 'Trayectoria',
            skills: 'Habilidades',
            contact: 'Contacto'
        },

        hero: {
            role: 'Desarrollador web y móvil · Málaga',
            lede: 'Titulado en Desarrollo de Aplicaciones Multiplataforma, con dos ' +
                'estancias en empresa desarrollando web y móvil. Trabajo con ' +
                'Angular, TypeScript y Kotlin, y busco mi primer puesto a ' +
                'jornada completa.',
            enter: 'Entrar al mundo',
            enterLoading: 'Preparando el mundo',
            cv: 'Descargar CV',
            portraitHint: 'Pulsa para entrar'
        },

        about: {
            title: 'Sobre mí',
            story: [
                'Terminé el grado superior de Desarrollo de Aplicaciones ' +
                'Multiplataforma en el Parque Tecnológico de Málaga. La parte ' +
                'dual la hice en Aliqindoi, donde trabajé en proyectos reales de ' +
                'la empresa durante dos estancias.',

                'Me manejo tanto en frontend como en backend, y me gusta rematar ' +
                'las cosas: que se desplieguen, que funcionen y que se puedan ' +
                'usar. Fuera del trabajo suelo estar aprendiendo algo nuevo, casi ' +
                'siempre relacionado con gráficos o desarrollo de videojuegos.'
            ],
            langsLabel: 'Idiomas',
            langsValue: 'Español y ucraniano nativos · Inglés C1 (Cambridge)',
            madeTitle: 'Este sitio, por dentro'
        },

        projects: {
            title: 'Proyectos',
            blurb: 'Lo que he construido y está funcionando de verdad.',
            stack: 'Tecnologías',
            tfgBadge: 'Proyecto de fin de curso',
            upcomingTitle: 'Próximamente',
            upcomingBody: 'Estoy con un proyecto nuevo. Vuelve pronto.',
            items: {
                bookmatch: {
                    tagline: 'Marketplace de libros: compra, venta e intercambio · web + Android'
                }
            }
        },

        path: {
            title: 'Trayectoria',
            blurb: 'Dónde he trabajado y dónde me he formado.',
            experience: 'Experiencia',
            education: 'Formación',
            certsTitle: 'Formación acreditada',
            certsMore: 'y algunos más',
            certsLess: 'ocultar',
            viewCredential: 'Ver credencial'
        },

        skills: {
            title: 'Habilidades',
            blurb: 'Con lo que trabajo a diario.',
            softTitle: 'Soft skills',
            soft: [
                'Trabajo en equipo',
                'Comunicación',
                'Resolución de problemas',
                'Aprendizaje rápido',
                'Atención al detalle'
            ]
        },

        contact: {
            title: 'Hablemos',
            blurb: 'Busco mi primer puesto como desarrollador. Si encaja algo de ' +
                'lo que has visto, escríbeme y te respondo.',
            emailLabel: 'Correo',
            elsewhere: 'En otros sitios',
            outroTitle: '¿Prefieres verlo jugando?',
            outroBody: 'Todo lo de esta página está repartido por un mundo que ' +
                'puedes recorrer, con minijuegos incluidos.'
        }
    },

    /* ── The 3D world ───────────────────────────────────────────────────
       Everything the player reads while playing. Split by surface rather than
       by minigame, so a string that two games share is written once.

       Control names are parameters, not baked sentences: the tutorial has to
       say "A and D" on a keyboard, "the stick" on a pad and "the joystick" on
       a phone, and the sentence around them is the same either way. */
    game: {
        landing: { explore: 'Explorar' },

        common: {
            play: '¡Jugar!',
            next: 'Siguiente',
            playAgain: 'Jugar otra vez',
            back: 'Atrás',
            exit: 'Salir',
            accept: 'Aceptar',
            done: 'Hecho',
            send: 'Enviar',
            ranking: 'Ranking',
            seeRanking: 'Ver ranking',
            saveRecord: 'Guardar récord',
            howToPlay: 'Cómo jugar',
            leaveGame: 'Salir del minijuego',
            competitive: 'Competitivo',
            free: 'Libre'
        },

        controls: {
            moveKeyboard: 'A y D',
            movePad: 'el stick',
            moveTouch: 'el joystick',
            pressKeyboard: 'Pulsa Enter',
            pressPad: 'Pulsa A',
            pressTouch: 'toca el botón'
        },

        hint: { touchTo: 'Toca para {verb}' },

        frisbee: {
            title: 'Frisbee',
            chooseMode: 'Elige cómo quieres jugar',
            competitiveDesc: '10 rondas · puntúa al máximo',
            freeDesc: 'Práctica · tiradas infinitas',
            round: 'Ronda {n}',
            roundOf: 'Ronda {n} / {total}',
            lastRound: '¡Última ronda!',
            shot: 'Tirada {n}',
            freeShot: 'Libre · Tirada {n}',
            points: 'Puntos',
            resultsTitle: '¡Partida terminada!',
            finalScore: 'Puntuación final',
            ofPossible: 'de {max} posibles',
            top10Badge: '🏆 ¡Has entrado en el Top 10!',
            lbSubtitle: 'Top 10 · Frisbee',
            boardFooter: 'Top 5 · Frisbee',
            tutorial: {
                aimTitle: 'Apuntar',
                aimBody: 'Mueve con {move} para apuntar al objetivo. {press} para ' +
                    'fijar la puntería.',
                curveTitle: 'Curva',
                curveBody: 'Después inclina el disco con {move} para curvar el ' +
                    'lanzamiento: rodea y revienta el globo de camino a la diana.',
                powerTitle: 'Fuerza',
                powerBody: 'Una barra oscila sola. {press} en el momento justo para ' +
                    'fijar la fuerza y lanzar. ¡Más fuerza, más lejos!'
            }
        },

        beach: {
            title: 'Voleibol de playa',
            chooseMode: 'Encadena toques sin que la pelota toque la arena',
            competitiveDesc: 'Un fallo y se acaba · entra en el ranking',
            freeDesc: 'Práctica · el peloteo se reinicia solo',
            resultsTitle: '¡Se acabó el peloteo!',
            touches: 'Toques encadenados',
            best: 'tu mejor marca: {n}',
            top10Badge: '¡Has entrado en el Top 10!',
            lbSubtitle: 'Top 10 · Voleibol de playa',
            boardFooter: 'Top 5 · Voleibol de playa',
            go: '¡A jugar!',
            perfect: '¡Perfecto!',
            record: 'récord {n}',
            widerCourt: 'Pista más ancha',
            narrowerCourt: 'Pista más estrecha',
            ballBeach: 'Pelota de playa',
            ballFootball: 'Balón de fútbol',
            ballCoconut: 'Coco'
        },

        leaderboard: {
            heading: 'RANKING',
            empty: 'Aún no hay puntuaciones. ¡Sé el primero!',
            boardEmpty: 'Sin puntuaciones aún',
            boardBeFirst: '¡Sé el primero!',
            yourPosition: 'Tú · #{rank} · {score} pts'
        },

        nameEntry: {
            title: '¡Estás en el Top 10!',
            subtitle: 'Pon tus iniciales'
        },

        map: {
            title: 'Mapa',
            goTo: 'Ir a {place}',
            subtitle: 'Elige a dónde ir',
            house: 'Casa',
            frisbee: 'Frisbee',
            fire: 'La hoguera',
            bridge: 'El puente',
            social: 'Zona social',
            beach: 'La playa'
        },

        settings: {
            title: 'Ajustes',
            connConnecting: 'Conectando…',
            connDisabled: 'No configurado',
            groupWorld: 'Mundo',
            groupFrisbee: 'Frisbee',
            ctrlMove: 'Mover',
            ctrlSprint: 'Correr',
            ctrlInteract: 'Interactuar',
            ctrlAim: 'Apuntar',
            ctrlTilt: 'Curva',
            ctrlThrow: 'Fuerza / Lanzar',
            ctrlBack: 'Salir',
            deviceKeyboard: 'Teclado',
            devicePad: 'Mando',
            deviceTouch: 'Táctil',
            tabGeneral: 'General',
            tabSfx: 'Efectos',
            tabControls: 'Controles',
            quality: 'Calidad',
            qualityHigh: 'Alta',
            qualityHighDesc: 'Máxima calidad visual',
            qualityLight: 'Ligera',
            qualityLightDesc: 'Mejor rendimiento',
            sound: 'Sonido',
            noMusic: 'Sin música',
            prevTrack: 'Canción anterior',
            nextTrack: 'Siguiente canción',
            mute: 'Silenciar',
            muteSfx: 'Silenciar efectos',
            sfx: 'Efectos de sonido',
            sfxDesc: 'Ambiente, fuego y agua según te mueves por el mundo.',
            language: 'Idioma',
            languageDesc: 'Se detecta de tu navegador; aquí lo cambias a mano.',
            connection: 'Conexión',
            connOnline: 'En línea',
            connOffline: 'Sin conexión',
            connOnlineHint: 'Ranking online activo: tus récords se guardan en el servidor.',
            connOfflineHint: 'Sin servidor ahora mismo — las puntuaciones se guardan en ' +
                'este dispositivo y se subirán al reconectar.',
            connConnectingHint: 'Comprobando conexión con el servidor…',
            connUnsetHint: 'Ranking online no configurado — las puntuaciones se guardan ' +
                'en este dispositivo.'
        },

        contact: {
            title: 'Contacto',
            nameLabel: 'Nombre',
            emailLabel: 'Tu email',
            messageLabel: 'Mensaje',
            emptyMessage: 'Escribe un mensaje antes de enviar.',
            thanks: 'Gracias por escribir. Te responderé pronto.',
            visitor: 'Visitante del portfolio',
            subtitle: '¿Trabajamos juntos? Cuéntame tu idea y te respondo pronto.',
            namePlaceholder: 'Tu nombre',
            emailPlaceholder: 'tucorreo@ejemplo.com',
            messagePlaceholder: 'Cuéntame…',
            badEmail: 'Revisa tu email, no parece válido.',
            sendFailed: 'No se pudo enviar. Inténtalo de nuevo.',
            offline: 'Sin conexión. Inténtalo de nuevo en un momento.',
            noName: '(sin nombre)',
            subject: 'Portfolio — {name}',
            subjectFallback: 'Nuevo mensaje'
        },

        computer: {
            about: 'Sobre mí',
            experience: 'Experiencia',
            behindScenes: 'Behind the scenes',
            education: 'Educación'
        },

        trophy: { title: 'Certificados' }
    }
}
