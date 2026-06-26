import * as THREE from 'three'
import { texture, uv } from 'three/tsl'
import Experience from '../Experience.js'
import Leaderboard from '../Utils/Leaderboard.js'

/**
 * ScoreboardScreen — a live ranking rendered onto a CanvasTexture, ready to drop
 * onto your own imported object. It refreshes every `REFRESH_MS` (and instantly
 * when a new score is saved) reading from the same Leaderboard store.
 *
 * ── HOW TO USE (when you import your object) ───────────────────────────────
 * Name the screen mesh in your GLB exactly `TARGET_NODE` (default "scoreboard").
 * That's it — this class polls the scene and auto-applies the live texture to
 * that mesh's material. No extra wiring.
 *
 * Prefer to attach by hand instead? Call from anywhere:
 *   experience.world.scoreboardScreen.attachTo(mesh)
 *   experience.world.scoreboardScreen.attachToNode(gltf.scene, 'myScreen')
 *
 * Tweakables: change CANVAS size / ROWS / REFRESH_MS / TARGET_NODE below. If the
 * texture shows upside-down or mirrored on your UVs, flip `this.texture.flipY`.
 */
const TARGET_NODE = 'scoreboard'
const CANVAS_W = 512
const CANVAS_H = 512
const ROWS = 5
const REFRESH_MS = 30000

export default class ScoreboardScreen {
    constructor({ targetName = TARGET_NODE, width = CANVAS_W, height = CANVAS_H, rows = ROWS, refreshMs = REFRESH_MS } = {}) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.leaderboard = new Leaderboard()

        this.targetName = targetName
        this.rows = rows
        this.refreshMs = refreshMs
        this.attached = false

        this.canvas = document.createElement('canvas')
        this.canvas.width = width
        this.canvas.height = height
        this.ctx = this.canvas.getContext('2d')

        this.texture = new THREE.CanvasTexture(this.canvas)
        this.texture.colorSpace = THREE.SRGBColorSpace
        this.texture.anisotropy = 4

        this.material = null
        this.target = null
        this._lastAt = 0

        this.render() // draw once up-front (works even before it's attached)
    }

    // ─── Attaching ───────────────────────────────────────────────────────
    /** Replace a mesh's material with one that shows the live ranking texture. */
    attachTo(mesh) {
        if (!mesh?.isMesh) return false
        const mat = new THREE.MeshStandardNodeMaterial()
        mat.roughness = 0.6
        mat.metalness = 0.0
        mat.colorNode = texture(this.texture, uv())
        // Self-lit a touch so the screen reads in shade like a display.
        mat.emissiveNode = texture(this.texture, uv()).mul(0.25)
        mesh.material?.dispose?.()
        mesh.material = mat
        this.material = mat
        this.target = mesh
        this.attached = true
        return true
    }

    /** Find `name` under `root` and attach to its first mesh. */
    attachToNode(root, name = this.targetName) {
        const node = root?.getObjectByName?.(name)
        if (!node) return false
        let mesh = node.isMesh ? node : null
        if (!mesh) node.traverse((c) => { if (!mesh && c.isMesh) mesh = c })
        return mesh ? this.attachTo(mesh) : false
    }

    // ─── Live updates ────────────────────────────────────────────────────
    /** Redraw now (called on the timer and after a score is saved). */
    async render() {
        let top = []
        try { top = await this.leaderboard.getTop10() } catch { /* ephemeral */ }
        this._draw(top.slice(0, this.rows))
        this.texture.needsUpdate = true
        this._lastAt = performance.now()
    }

    update() {
        // Auto-attach as soon as the named mesh exists in the scene.
        if (!this.attached) {
            const node = this.scene?.getObjectByName?.(this.targetName)
            if (node) this.attachToNode(node.parent || node, this.targetName) || this.attachToNode(node)
        }
        if (performance.now() - this._lastAt >= this.refreshMs) this.render()
    }

    // ─── Drawing ─────────────────────────────────────────────────────────
    _draw(entries) {
        const ctx = this.ctx
        const w = this.canvas.width
        const h = this.canvas.height

        ctx.clearRect(0, 0, w, h)

        // Panel
        ctx.fillStyle = '#f4ecd6'
        roundRect(ctx, 0, 0, w, h, 36)
        ctx.fill()

        // Header bar
        const headH = Math.round(h * 0.17)
        ctx.fillStyle = '#41a06e'
        roundRect(ctx, 0, 0, w, headH + 24, 36)
        ctx.fill()
        ctx.fillStyle = '#41a06e'
        ctx.fillRect(0, headH - 12, w, 24)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${Math.round(headH * 0.46)}px sans-serif`
        ctx.fillText('🏆 RANKING', w / 2, headH * 0.52)

        const rowsY = headH + 22
        const footerH = 60
        const rowH = (h - rowsY - footerH) / this.rows

        if (!entries.length) {
            ctx.fillStyle = '#7a9b8c'
            ctx.font = `${Math.round(rowH * 0.34)}px sans-serif`
            ctx.fillText('Sin puntuaciones aún', w / 2, headH + (h - headH) / 2 - 20)
            ctx.font = `${Math.round(rowH * 0.28)}px sans-serif`
            ctx.fillText('¡Sé el primero!', w / 2, headH + (h - headH) / 2 + 24)
        } else {
            for (let i = 0; i < this.rows; i++) {
                const y = rowsY + i * rowH + rowH / 2
                if (i % 2 === 0) {
                    ctx.fillStyle = 'rgba(65,160,110,0.08)'
                    roundRect(ctx, 22, y - rowH / 2 + 6, w - 44, rowH - 12, 14)
                    ctx.fill()
                }
                const e = entries[i]
                const rank = i + 1
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`
                const fs = Math.round(rowH * 0.42)

                ctx.textAlign = 'left'
                ctx.fillStyle = '#2a5a4c'
                ctx.font = `bold ${fs}px sans-serif`
                ctx.fillText(medal, 44, y)

                ctx.fillStyle = '#2a5a4c'
                ctx.font = `bold ${fs}px sans-serif`
                ctx.fillText(e ? e.name : '— — —', 140, y)

                ctx.textAlign = 'right'
                ctx.fillStyle = e ? '#41a06e' : '#bcae8f'
                ctx.font = `bold ${fs}px sans-serif`
                ctx.fillText(e ? String(e.score) : '0', w - 44, y)
            }
        }

        // Footer
        ctx.textAlign = 'center'
        ctx.fillStyle = '#9a8a66'
        ctx.font = `${Math.round(h * 0.045)}px sans-serif`
        ctx.fillText('Top 5 · Frisbee con el perro', w / 2, h - 26)
    }

    destroy() {
        this.material?.dispose?.()
        this.texture?.dispose?.()
    }
}

function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
}
