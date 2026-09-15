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
        // Dos lineas, y solo dos. La tarjeta del escenario es un objeto de
        // altura fija: lo que no quepa aqui vive en el desplegable de debajo,
        // no dentro de la tarjeta. Lo que aporta es lo que el tagline NO dice.
        short: 'Catalogo de ~1000 libros con carrito, pagos, foros y recomendaciones ' +
            'por IA. Angular y Express en la web, Kotlin nativo en Android.',
        // Tres, no diez. La lista completa sigue estando en `stack`, debajo.
        pills: ['Angular', 'Express', 'Kotlin'],
        image: '/models/carts/page1.webp',
        image2: '/models/carts/page1b.webp',
        highlights: [
            'Plataforma **full-stack real y desplegada**: catálogo de ~1000 libros, carrito, **pagos con Stripe** y módulo de intercambio entre usuarios.',
            'Frontend **Angular** + backend **Express/Prisma** sobre PostgreSQL, con auth de Firebase y **app Android nativa en Kotlin**.',
            'Foros con comentarios y votos, **recomendaciones con IA** (n8n), analítica GA4 y despliegue con **CI/CD**.'
        ],
        // Tres cifras sueltas en lugar de tres párrafos. Salen todas del
        // propio texto de highlights: estaban escritas, solo estaban enterradas.
        figures: [
            { value: '~1000', label: 'libros en catálogo' },
            { value: '2', label: 'plataformas, web y Android' }
        ],
        stack: ['Angular', 'TypeScript', 'Tailwind', 'Express', 'Prisma', 'PostgreSQL', 'Firebase', 'Stripe', 'Kotlin', 'Docker'],
        // El spread del overview: la imagen a sangre y, encima, el producto
        // funcionando. `image`/`image2` siguen siendo las de los carros 3D, que
        // están recortadas para un plano distinto.
        //
        // El vídeo va a 1200x800 y 24 fps, no a 1440x960 y 30 como los otros
        // dos, y es a proposito: este recorre un catálogo de portadas de libros
        // haciendo scroll, que es mucho detalle espacial en movimiento y el
        // peor caso posible para un códec. A los ajustes de los otros pesaba
        // 1,3 MB. Bajarlo aqui es lo que lo devuelve a la familia.
        spread: {
            image: '/models/carts/bookmatch.webp',
            imageSm: '/models/carts/bookmatch-sm.webp',
            video: { webm: '/models/carts/bookmatch.webm', mp4: '/models/carts/bookmatch.mp4' }
        },
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
        short: 'Seis tipos de gráfica con geometría propia en three.js. La configuración ' +
            'entera viaja comprimida dentro del enlace, así que no hay base de datos ' +
            'que mantener.',
        pills: ['Three.js', 'Next.js', 'React'],
        image: '/models/carts/page2.webp',
        image2: '/models/carts/page2b.webp',
        // Wider crop, reads better as the overview's single hero image.
        overviewImage: '/models/carts/page2b.webp',
        highlights: [
            'Seis tipos de gráfica en **three.js con geometría propia**: canto biselado, sombra real y luz de estudio, sin ninguna librería de gráficas 3D.',
            '**La configuración entera viaja dentro de la URL** comprimida, así que una gráfica compartida no necesita base de datos: el plan gratuito y la API para desarrolladores salen de la misma decisión.',
            'La ruta del embed es **sagrada**: cero cookies, cero peticiones a terceros y un presupuesto de 149 KB de JS que **rompe el build** si se pasa.'
        ],
        // El spread del overview: la imagen a sangre y, encima, el producto
        // funcionando. `image`/`image2` siguen siendo las de los carros 3D, que
        // están recortadas para un plano distinto.
        spread: {
            image: '/models/carts/volumine.webp',
            imageSm: '/models/carts/volumine-sm.webp',
            video: { webm: '/models/carts/volumine.webm', mp4: '/models/carts/volumine.mp4' }
        },
        figures: [
            { value: '6', label: 'tipos de gráfica' },
            { value: '149 KB', label: 'presupuesto de JS' },
            { value: '0', label: 'cookies y terceros' }
        ],
        stack: ['Next.js', 'React', 'TypeScript', 'Three.js', 'Supabase', 'PostgreSQL', 'Stripe', 'Tailwind', 'Playwright'],
        links: [
            { label: 'Ver la web', url: 'https://volumine.app' }
        ]
    },
    {
        id: 'sql3d',
        title: 'SQL → 3D ER',
        tagline: 'Escribe una consulta SQL y se convierte en un diagrama entidad-relación en 3D',
        short: 'Se dibuja mientras escribes: cada tabla es un nodo y cada JOIN un cable. ' +
            'Dos parsers, uno en el navegador y otro en Python para los dialectos raros.',
        pills: ['Three.js', 'GLSL', 'FastAPI'],
        image: '/models/carts/page3.webp',
        image2: '/models/carts/page3b.webp',
        // Solo para escritorio. Ahí la tarjeta va a dos columnas y el hueco de
        // la imagen es alto; por debajo de 900px se convierte en una banda
        // ancha y baja, que es la forma para la que está recortada `image`.
        overviewImageWide: '/models/carts/page3-wide.webp',
        highlights: [
            'La consulta se lee y se dibuja **mientras la escribes**: cada tabla es un nodo y cada JOIN un cable enrutado en ángulos rectos entre ellos.',
            '**Dos parsers, no uno**: node-sql-parser resuelve en el navegador y, cuando un dialecto se le atraganta, cae a un servicio Python con sqlglot. Así el caso común no paga una ida y vuelta al servidor.',
            'Modo demo guiado que **hace crecer una consulta de e-commerce paso a paso**, de una sola tabla a seis JOINs y subconsultas, para que se vea el diagrama reaccionar.',
            'Cables iluminados por particulas, bloom y viñeteado con **shaders GLSL propios** sobre three.js.'
        ],
        spread: {
            image: '/models/carts/sql3d.webp',
            imageSm: '/models/carts/sql3d-sm.webp',
            video: { webm: '/models/carts/sql3d.webm', mp4: '/models/carts/sql3d.mp4' }
        },
        figures: [
            { value: '2', label: 'motores de parseo' },
            { value: '6', label: 'JOINs en la demo guiada' },
            { value: '0', label: 'esperas al servidor' }
        ],
        stack: ['Angular', 'TypeScript', 'Three.js', 'GLSL', 'd3-force-3d', 'FastAPI', 'Python', 'Vercel'],
        links: [
            { label: 'Ver la web', url: 'https://sql-prototype.vercel.app' },
            { label: 'Código en GitHub', url: 'https://github.com/Sergiibut05/sql-prototype' }
        ]
    }
]
