/**
 * projectsData — content shown by the project carts (west play area).
 * One entry per cart plane (cart1 / cart2 / cart3). Recruiter-friendly:
 * short, large, scannable text — no walls of prose.
 */

export const PROJECTS = [
    {
        id: 'bookmatch',
        title: 'BookMatch',
        // Started as the end-of-course project (TFG) and was taken all the way
        // to a deployed product — worth saying, so the overview badges it.
        finalProject: true,
        tagline: 'Marketplace de libros: compra, venta e intercambio · web + Android',
        image: '/models/carts/page1.webp',
        image2: '/models/carts/page1b.webp',
        highlights: [
            'Plataforma **full-stack real y desplegada**: catálogo de ~1000 libros, carrito, **pagos con Stripe** y módulo de intercambio entre usuarios.',
            'Frontend **Angular** + backend **Express/Prisma** sobre PostgreSQL, con auth de Firebase y **app Android nativa en Kotlin**.',
            'Foros con comentarios y votos, **recomendaciones con IA** (n8n), analítica GA4 y despliegue con **CI/CD**.'
        ],
        stack: ['Angular', 'TypeScript', 'Tailwind', 'Express', 'Prisma', 'PostgreSQL', 'Firebase', 'Stripe', 'Kotlin', 'Docker'],
        links: [
            { label: 'Ver la web', url: 'https://bookmatch.club' },
            { label: 'Código en GitHub', url: 'https://github.com/Sergiibut05/BookMatch-Proyecto-Intermodular' }
        ]
    },
    {
        id: 'volumine',
        title: 'Volumine',
        // Leads the overview (see overviewOrder). NOT reordered in the array:
        // the 3D stands are index-matched to it.
        spotlight: true,
        tagline: 'Gráficas 3D que se incrustan en cualquier sitio con un link',
        image: '/models/carts/page2.webp',
        image2: '/models/carts/page2b.webp',
        // Wider crop, reads better as the overview's single hero image.
        overviewImage: '/models/carts/page2b.webp',
        highlights: [
            'Seis tipos de gráfica en **three.js con geometría propia** —canto biselado, sombra real y luz de estudio—, sin ninguna librería de gráficas 3D.',
            '**La configuración entera viaja dentro de la URL** comprimida, así que una gráfica compartida no necesita base de datos: el plan gratuito y la API para desarrolladores salen de la misma decisión.',
            'La ruta del embed es **sagrada**: cero cookies, cero peticiones a terceros y un presupuesto de 149 KB de JS que **rompe el build** si se pasa.'
        ],
        stack: ['Next.js', 'React', 'TypeScript', 'Three.js', 'Supabase', 'PostgreSQL', 'Stripe', 'Tailwind', 'Playwright'],
        links: [
            { label: 'Ver la web', url: 'https://volumine.app' }
        ]
    },
    {
        id: 'proximamente-3',
        title: 'Próximamente',
        tagline: 'Nuevo proyecto en construcción',
        image: '/models/carts/page3.webp',
        highlights: [
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.',
            'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
        ],
        stack: ['Lorem', 'Ipsum', 'Dolor'],
        links: []
    }
]
