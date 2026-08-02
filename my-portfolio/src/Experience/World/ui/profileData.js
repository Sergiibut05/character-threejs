/**
 * profileData — all the personal/portfolio content shown by the in-house
 * interactives (trophy → certificates, computer → about/experience/BTS).
 * Kept as plain data so texts can be edited without touching UI code.
 * Sources: LinkedIn profile + CV (July 2026).
 */
import {
    iconCube, iconPhysics, iconVolume, iconMusic, iconDatabase, iconPalette, iconHeart
} from './icons.js'

export const LINKS = {
    github: 'https://github.com/Sergiibut05',
    linkedin: 'https://www.linkedin.com/in/sergii-butrii-4b0729346/',
    email: 'sergiibutrii5@gmail.com',
    sunoPlaylist: 'https://suno.com/playlist/e06c4d53-ae99-4c2b-a133-19147e03e5de',
    isaLousberg: 'https://www.isalousberg.com/',
    brunoSimon: 'https://bruno-simon.com/',
    threejsJourney: 'https://threejs-journey.com/'
}

// ─── Trophy: certificates (newest first, each links to its credential) ───
// `featured` marks the two the Quick Overview shows up front; the rest sit
// behind a disclosure there. The trophy in-world still lists all of them.
export const CERTIFICATES = [
    {
        title: 'JavaScript Moderno: Guía para dominar el lenguaje',
        issuer: 'DevTalles',
        date: 'Septiembre 2025',
        url: 'https://cursos.devtalles.com/certificates/wmgnjkevgb',
        featured: true
    },
    {
        title: 'Cambridge Certificate — Level C1 (CAE)',
        issuer: 'Cambridge English',
        date: 'Julio 2025',
        url: 'https://drive.google.com/file/d/10qBGizvk6unCi1oGSCg89ivFIFfbLfCh/view?usp=sharing',
        featured: true
    },
    {
        title: 'Curso de Firebase y Angular',
        issuer: 'OpenWebinars',
        date: 'Mayo 2025',
        url: 'https://openwebinars.net/certificacion/Ds898uJq?type=png'
    },
    {
        title: 'WooCommerce: Instalación y configuración',
        issuer: 'OpenWebinars',
        date: 'Abril 2025',
        url: 'https://openwebinars.net/certificacion/PZ1GdeoN?type=png'
    },
    {
        title: 'Curso de Angular: Ampliando conceptos',
        issuer: 'OpenWebinars',
        date: 'Marzo 2025',
        url: 'https://openwebinars.net/cert/pt4I'
    },
    {
        title: 'Fundamentos de Angular',
        issuer: 'OpenWebinars',
        date: 'Marzo 2025',
        url: 'https://openwebinars.net/cert/ck7Y'
    },
    {
        title: 'Especialización en JavaScript: Asincronía, Prototipos y Clases',
        issuer: 'OpenWebinars',
        date: 'Marzo 2025',
        url: 'https://openwebinars.net/cert/NUrF'
    },
    {
        title: 'Dominando Bootstrap 5: Sitios Web Responsive',
        issuer: 'OpenWebinars',
        date: 'Marzo 2025',
        url: 'https://openwebinars.net/cert/Fegl'
    },
    {
        title: 'Curso de Git',
        issuer: 'OpenWebinars',
        date: 'Marzo 2025',
        url: 'https://openwebinars.net/cert/KpoR'
    },
    {
        title: 'Fundamentos de JavaScript',
        issuer: 'OpenWebinars',
        date: 'Marzo 2025',
        url: 'https://openwebinars.net/cert/D2cE'
    }
]

// ─── Computer: about ─────────────────────────────────────────────────────
export const ABOUT = {
    quickBio:
        'Titulado en Desarrollo de Aplicaciones Multiplataforma (DAM) por el Parque ' +
        'Tecnológico de Málaga. Programo aplicaciones web y móviles, y me apasiona crear ' +
        'experiencias interactivas — como este mundo 3D que estás explorando.',
    fullBio: [
        'Me he formado en las tecnologías clave del desarrollo web y móvil: Java, ' +
        'JavaScript, TypeScript y Kotlin como lenguajes, con Angular, Ionic y Android Studio ' +
        'como entornos de trabajo, y experiencia en bases de datos relacionales (MySQL) y ' +
        'no relacionales (Firebase). La parte de FP Dual la hice en Aliqindoi, trabajando ' +
        'en proyectos reales desde el primer día.',
        'Tengo el C1 de inglés certificado por Cambridge (CAE, 190 puntos), hablo ucraniano ' +
        'a nivel nativo y español como lengua materna. Me considero una persona curiosa, ' +
        'trabajadora y en aprendizaje constante: me motiva enfrentarme a retos nuevos, ' +
        'colaborar en equipo y construir cosas que la gente disfrute usando.'
    ]
}

// ─── Computer: experience / education / skills ───────────────────────────
export const EXPERIENCE = [
    {
        role: 'Desarrollador de software',
        org: 'Aliqindoi · Málaga',
        period: 'Enero 2026 — Mayo 2026',
        detail: 'Segunda estancia del programa de FP Dual: desarrollo web y móvil en proyectos reales de la empresa.'
    },
    {
        role: 'Desarrollador de software',
        org: 'Aliqindoi · Málaga',
        period: 'Marzo 2025 — Junio 2025',
        detail: 'Primera estancia en empresa: experiencia práctica contribuyendo al día a día del equipo de desarrollo.'
    }
]

export const EDUCATION = [
    {
        title: 'CFGS Desarrollo de Aplicaciones Multiplataforma (DAM)',
        org: 'CPIFP Alan Turing · Málaga TechPark',
        period: '2024 — 2026',
        detail: 'Modalidad dual: formación en el centro y en empresa.'
    },
    {
        title: 'Bachillerato de Ciencias Tecnológicas',
        org: 'IES Capellanía · Alhaurín de la Torre',
        period: '2022 — 2024',
        detail: ''
    }
]

export const SKILLS = [
    { group: 'Lenguajes', items: ['Java', 'JavaScript', 'TypeScript', 'Kotlin', 'HTML', 'CSS'] },
    { group: 'Frameworks y plataformas', items: ['Angular', 'Ionic', 'Android Studio', 'Git', 'Vite'] },
    { group: 'Bases de datos', items: ['MySQL', 'PostgreSQL', 'Firebase'] },
    { group: 'Diseño y 3D', items: ['Blender', 'Figma', 'Three.js', 'TSL · WebGPU'] },
    { group: 'Idiomas', items: ['Español (nativo)', 'Ucraniano (nativo)', 'Inglés (C1)'] }
]

// ─── Computer: behind the scenes (fluid editorial layout) ────────────────
export const BTS_INTRO =
    'Este mundo no usa ningún motor de videojuegos: está construido pieza a pieza ' +
    'para funcionar directamente en tu navegador. Así es por dentro.'

export const BEHIND_THE_SCENES = [
    {
        icon: iconCube,
        title: 'Gráficos: Three.js y TSL',
        body: 'Todo lo que ves se dibuja con Three.js, una librería que habla directamente con ' +
            'tu tarjeta gráfica. Los efectos — el agua, el fuego, la hierba meciéndose — están ' +
            'hechos con TSL, una forma moderna de programar esos efectos escribiendo JavaScript ' +
            'en lugar del código especializado de siempre.'
    },
    {
        icon: iconPhysics,
        title: 'Física: Rapier',
        body: 'Un motor de física se encarga de que el personaje camine, suba escalones y ' +
            'no atraviese las paredes.'
    },
    {
        icon: iconVolume,
        title: 'Sonido: Howler.js',
        body: 'La música rota entre canciones con fundidos suaves, y el sonido reacciona a dónde ' +
            'estás: el río y la hoguera se oyen al acercarte.'
    },
    {
        icon: iconMusic,
        title: 'Música: Suno AI',
        body: 'Las canciones de fondo están creadas con Suno, una inteligencia artificial que ' +
            'genera música.',
        link: { label: 'Escuchar la playlist completa', url: LINKS.sunoPlaylist }
    },
    {
        icon: iconDatabase,
        title: 'Ranking: Firebase',
        body: 'La puntuación del minijuego del frisbee se guarda online y aparece en directo ' +
            'en el marcador del campo.'
    },
    {
        icon: iconPalette,
        title: 'Arte: Blender',
        body: 'Los modelos son low-poly: unos hechos a mano en Blender y otros obra de la ' +
            'artista Isa Lousberg. Todo va comprimido para que el mundo cargue en segundos.'
    }
]

export const BTS_CREDITS = {
    icon: iconHeart,
    title: 'Agradecimientos',
    body: 'A Bruno Simon, por Three.js Journey — donde aprendí gran parte de lo que hace ' +
        'funcionar este mundo — y por su portfolio, la gran inspiración detrás de este. ' +
        'Y a Isa Lousberg, por sus preciosos modelos low-poly.',
    links: [
        { label: 'Three.js Journey', url: LINKS.threejsJourney },
        { label: 'bruno-simon.com', url: LINKS.brunoSimon },
        { label: 'isalousberg.com', url: LINKS.isaLousberg }
    ]
}
