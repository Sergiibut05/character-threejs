import restart from 'vite-plugin-restart'
import wasm from 'vite-plugin-wasm'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default {
    root: 'src/', // Sources files (typically where index.html is)
    publicDir: '../static/', // Path from "root" to static assets (files that are served as they are)
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
        sourcemap: true // Add sourcemap
    },
    plugins:
        [
            basicSsl(), // Enable HTTPS with compatible self-signed certificate
            wasm(), // Enable WASM support for Rapier.js
            restart({ restart: ['../static/**',] }) // Restart server on static file change
        ],
}