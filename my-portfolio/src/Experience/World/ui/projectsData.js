/**
 * projectsData — content shown by the project carts (west play area).
 * One entry per cart plane (cart1 / cart2 / cart3). Recruiter-friendly:
 * short, large, scannable text — no walls of prose.
 */

export const PROJECTS = [
    {
        id: 'bookmatch',
        title: 'BookMatch',
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
        id: 'proximamente-2',
        title: 'Próximamente',
        tagline: 'Nuevo proyecto en construcción',
        image: '/models/carts/page2.webp',
        highlights: [
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.',
            'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.'
        ],
        stack: ['Lorem', 'Ipsum', 'Dolor'],
        links: []
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
