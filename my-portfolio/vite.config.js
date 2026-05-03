import restart from 'vite-plugin-restart'
import wasm from 'vite-plugin-wasm'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default {
    root: 'src/', // Sources files (typically where index.html is)
    publicDir: '../static/', // Path from "root" to static assets
    envDir: '../', // Load .env from project root (not from src/)
    resolve:
    {
        alias:
            [
                // IMPORTANT: 'three/tsl' and 'three/addons/' must come BEFORE 'three'
                // so they are not caught by the 'three' → 'three/webgpu' alias
                {
                    find: 'three/tsl',
                    replacement: resolve(__dirname, 'node_modules/three/build/three.tsl.js')
                },
                {
                    find: /^three\/addons\//,
                    replacement: resolve(__dirname, 'node_modules/three/examples/jsm/')
                },
                {
                    // Only match bare 'three' import, not 'three/xxx' subpaths
                    find: /^three$/,
                    replacement: resolve(__dirname, 'node_modules/three/build/three.webgpu.js')
                },
            ]
    },
    server:
    {
        host: true, // Open to local network and display URL
        open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env) // Open if it's not a CodeSandbox
    },
    build:
    {
        outDir: '../dist', // Output in the dist/ folder
        emptyOutDir: true, // Empty the folder first
        sourcemap: false,
        target: 'esnext',
        // Split three.js into its own chunk so the browser caches it across
        // visits. Subsequent loads only re-download the (small) app code.
        rollupOptions: {
            output: {
                manualChunks(id) {
                    // Loaders and TSL effects come from three/examples/jsm/* and
                    // import nothing else outside three — safe to split.
                    if (id.includes('node_modules/three/examples/jsm/loaders')) return 'three-loaders'
                    if (id.includes('node_modules/three/examples/jsm/tsl')) return 'three-tsl-fx'
                    // Bundle the core library (three.webgpu + three.tsl + everything
                    // it transitively imports from three/) into ONE chunk to avoid
                    // the circular-chunk warning. ~600 kB (170 kB gzip), cacheable.
                    if (id.includes('node_modules/three/')) return 'three'
                    if (id.includes('@dimforge/rapier3d')) return 'rapier'
                }
            }
        },
        chunkSizeWarningLimit: 800
    },
    plugins:
        [
            basicSsl(), // Enable HTTPS with compatible self-signed certificate
            wasm(), // Enable WASM support for Rapier.js
            restart({ restart: ['../static/**',] }) // Restart server on static file change
        ],
}
