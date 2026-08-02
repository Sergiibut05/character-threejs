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
    }
}
