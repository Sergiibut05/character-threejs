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
            // Una línea, y ya. El párrafo que había debajo era una entrada de
            // CV ("titulado en...", "con estancia de prácticas en...") y el
            // diploma ya se cuenta en Sobre mí, donde toca.
            //
            // El titulo real, no una lista de disciplinas: es lo que dice el
            // grado y es lo que buscaria alguien filtrando candidatos. Malaga
            // sale en el rail de datos de Sobre mi, asi que no hace falta
            // arrastrarla tambien aqui.
            role: 'Desarrollador de apps multiplataforma',
            enter: 'Entrar al mundo',
            enterLoading: 'Preparando el mundo',
            cv: 'Descargar CV',
            portraitHint: 'Pulsa para entrar'
        },

        about: {
            title: 'Sobre mí',
            // La linea grande de la seccion.
            //
            // Dos versiones anteriores fallaron por el mismo sitio. "Hago web,
            // movil y 3D, y me gusta rematarlo" era la forma exacta de un
            // titular de LinkedIn: una lista de disciplinas y una virtud.
            // "Prefiero terminar una cosa a dejar cinco a medias" ya era una
            // postura, pero hablaba de lo que NO hace.
            //
            // Esta dice por que existe todo lo demas. Ocho palabras, dos
            // frases, y justifica el mundo 3D sin nombrarlo ni venderlo: quien
            // la lee y despues pulsa "Entrar al mundo" ya sabe para que esta
            // ahi. Es tambien la unica que cose About con el resto del sitio.
            //
            // Sin palabras con guion: se parten por ahi y a 44px parece una
            // errata. CSS no tiene forma de prohibir ese corte, asi que la
            // defensa esta en el texto.
            statement: 'Aprendo construyendo. Esta página es una de esas cosas.',
            // UN parrafo, y sin el nombre de la empresa: las practicas salen
            // dos veces en Trayectoria, con fechas y puesto. Repetirlo aqui
            // gasta la atencion del lector en algo que esta a punto de leer
            // bien contado.
            story: [
                'Grado superior en **Desarrollo de Aplicaciones ' +
                'Multiplataforma**, en el Parque Tecnológico de Málaga. ' +
                '**Frontend y backend**, y fuera del trabajo casi siempre ' +
                'acabo con gráficos.'
            ],
            basedLabel: 'Dónde',
            basedValue: 'Málaga, España',
            focusLabel: 'A qué me dedico',
            focusValue: 'Web · Móvil · 3D',
            langsLabel: 'Idiomas',
            langsValue: 'Español y ucraniano nativos · Inglés C1',
            madeTitle: 'Este sitio, por dentro'
        },

        projects: {
            title: 'Proyectos',
            blurb: 'Lo que he construido y está funcionando de verdad.',
            stack: 'Tecnologías',
            stageLabel: 'Proyectos, uno a uno',
            slideLabel: 'Proyecto {n} de {total}',
            hint: 'Arrastra, o usa las flechas',
            prev: 'Proyecto anterior',
            next: 'Proyecto siguiente',
            tfgBadge: 'Proyecto de fin de curso',
            more: 'Ver detalle',
            less: 'Ocultar detalle',
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
            blurb: 'Trabajo y estudios.',
            experience: 'Experiencia',
            education: 'Formación',
            certsTitle: 'Formación acreditada',
            certsMore: '+{n} más',
            certsLess: 'Ver menos',
            viewCredential: 'Ver credencial'
        },

        skills: {
            title: 'Habilidades',
            // A proposito NO con la forma de las otras dos ("Lo que he
            // construido...", "Donde he trabajado..."): tres secciones
            // abriendo con la misma construccion es un tic. Esta enuncia la
            // regla sobre la que esta montada, que ademas es lo unico
            // interesante que tiene: cada nombre de abajo entra en un
            // proyecto.
            blurb: 'Nada aquí sin un proyecto detrás.',
            // La linea de debajo de cada nombre. Los proyectos salen de
            // projectsData; esto es lo unico que hay que traducir.
            thisSite: 'este sitio',
            // La coletilla bajo las fichas. Los nombres viven en
            // overviewContent porque son nombres propios y no se traducen.
            alsoCv: 'Lista completa en el CV',
            goTo: 'Ver {name} en proyectos',

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
            // El rótulo pequeño dice de qué sección se trata, igual que en
            // todas las demás; la línea grande es lo que se dice.
            title: 'Contacto',
            blurb: 'Hablemos.',
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
            action: 'Acción',
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

        hint: { touchTo: 'Toca para {verb}', move: 'WASD o flechas para moverte' },
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
            zoneBull: '¡PERFECTO!',
            zoneGreat: '¡GENIAL!',
            zoneGood: '¡BIEN!',
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
            hudTouches: 'toques',
            wind: 'Viento',
            // Los signos de apertura son parte de la frase, no del código: en
            // inglés no existen, y envolver una etiqueta traducida entre '¡' y
            // '!' desde JavaScript deja "¡Beach ball!" en la versión inglesa.
            touchesFlash: '{n} toques',
            ballFlash: '¡{name}!',
            milestone: '¡{n}!',
            widerCourt: 'Pista más ancha',
            tutorial: {
                title: 'Ponte debajo de la pelota',
                body: 'No hay que pulsar nada: la devuelves con estar debajo. ' +
                    'Muévete con {move} para seguirla y tócala centrada: eso es ' +
                    'un ¡Perfecto!'
            },
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
            you: 'Estás aquí',
            subtitle: 'Elige a dónde ir',
            house: 'Casa',
            frisbee: 'Frisbee',
            fire: 'La hoguera',
            bridge: 'El puente',
            social: 'Zona social',
            beach: 'La playa'
        },

        music: {
            nowPlaying: 'Ahora suena'
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
            tabSound: 'Sonido',
            tabControls: 'Controles',
            quality: 'Calidad',
            qualityHigh: 'Alta',
            qualityHighDesc: 'Máxima calidad visual',
            qualityLight: 'Ligera',
            qualityLightDesc: 'Mejor rendimiento',
            music: 'Música',
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
            quickBio: 'Bio rápida',
            fullBio: 'Bio completa',
            technicalSkills: 'Habilidades técnicas',
            about: 'Sobre mí',
            experience: 'Experiencia',
            behindScenes: 'Behind the scenes',
            education: 'Educación'
        },

        modal: {
            select: 'Seleccionar',
            close: 'Cerrar'
        },

        project: {
            close: 'Cerrar',
            badge: 'Proyecto',
            screenshot: 'Captura {n}',
            highlights: 'Lo destacado',
            stack: 'Stack'
        },

        games: {
            title: 'Mis favoritos',
            now: 'Jugando ahora',
            coverAlt: 'Carátula de {title}',
            items: {
                zelda: { title: 'The Legend of Zelda: Breath of the Wild' },
                persona: { title: 'Persona 3 Reload' },
                rdr2: { title: 'Red Dead Redemption 2' }
            }
        },
        trophy: {
            title: 'Certificados',
            viewCredential: 'Ver certificado: {title}'
        }
    }
}
