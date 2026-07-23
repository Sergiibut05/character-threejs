import './project.css'
import { PROJECTS } from './projectsData.js'

/** Escape HTML, then allow ONLY the **bold** marker → <strong>. */
function _richText(str) {
    const safe = String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

const SVG_CHECK = `
<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M5 13l5 5L19 7"/>
</svg>`

const SVG_EXTERNAL = `
<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M14 5h5v5"/><path d="M19 5l-8.5 8.5"/><path d="M9 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>
</svg>`

/**
 * ProjectModal — the project panel opened from the carts.
 *   - Desktop: side drawer docked to the RIGHT (slides in), Esc / ✕ / backdrop.
 *   - Touch:   bottom sheet with the classic grab-handle bar — drag it down
 *              to dismiss (follows the finger, springs back if not far enough).
 * Content comes from projectsData.js. Movement is locked while open.
 */
export default class ProjectModal {
    constructor() {
        this.experience = window.experience
        this.isTouch = this._detectTouch()
        this._isOpen = false
        this._closeCb = null

        // Backdrop. NOTE the ghost-click guard: on touch, the tap that OPENS
        // the panel fires a synthetic `click` ~300ms later at the same spot —
        // which would land on this backdrop and instantly close it (the
        // "flashes for a millisecond" bug). Ignore clicks right after opening.
        this.backdrop = _el('div', 'fz-proj-backdrop')
        this.backdrop.addEventListener('click', () => {
            if (performance.now() - (this._openedAt || 0) < 500) return
            this.close()
        })

        // Panel (drawer on desktop / sheet on touch)
        this.panel = _el('div', `fz-proj ${this.isTouch ? 'fz-proj--sheet' : 'fz-proj--drawer'}`)
        this.panel.setAttribute('role', 'dialog')
        this.panel.setAttribute('aria-modal', 'true')

        if (this.isTouch) {
            // Grab handle (drag down to close)
            this.handle = _el('div', 'fz-proj-handle')
            this.handle.innerHTML = '<span class="fz-proj-handle-bar"></span>'
            this.panel.appendChild(this.handle)
            this._setupDrag()
        } else {
            this.closeBtn = _el('button', 'fz-modal-close')
            this.closeBtn.type = 'button'
            this.closeBtn.setAttribute('aria-label', 'Cerrar')
            this.closeBtn.textContent = '✕'
            this.closeBtn.addEventListener('click', () => this.close())
            this.panel.appendChild(this.closeBtn)
        }

        this.content = _el('div', 'fz-proj-content')
        this.panel.appendChild(this.content)

        // Fixed footer: the CTAs stay visible without scrolling.
        this.footer = _el('div', 'fz-proj-footer')
        this.panel.appendChild(this.footer)

        document.body.appendChild(this.backdrop)
        document.body.appendChild(this.panel)

        this._onKeyDown = (e) => {
            if (e.key === 'Escape' && this._isOpen) {
                e.stopPropagation()
                this.close()
            }
        }
    }

    _detectTouch() {
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
        const isSmallScreen = window.innerWidth < 768 || window.innerHeight < 768
        return hasTouch && isSmallScreen
    }

    // ─── Sheet drag-to-close (touch) ─────────────────────────────────────
    _setupDrag() {
        let startY = 0
        let delta = 0
        let dragging = false

        const onStart = (e) => {
            if (!this._isOpen) return
            dragging = true
            delta = 0
            startY = e.touches ? e.touches[0].clientY : e.clientY
            this.panel.classList.add('is-dragging')
        }
        const onMove = (e) => {
            if (!dragging) return
            const y = e.touches ? e.touches[0].clientY : e.clientY
            delta = Math.max(0, y - startY)
            this.panel.style.transform = `translateY(${delta}px)`
        }
        const onEnd = () => {
            if (!dragging) return
            dragging = false
            this.panel.classList.remove('is-dragging')
            this.panel.style.transform = ''
            if (delta > 110) this.close()
        }

        this.handle.addEventListener('touchstart', onStart, { passive: true })
        window.addEventListener('touchmove', onMove, { passive: true })
        window.addEventListener('touchend', onEnd)
        this._dragCleanup = () => {
            window.removeEventListener('touchmove', onMove)
            window.removeEventListener('touchend', onEnd)
        }
    }

    // ─── Content ─────────────────────────────────────────────────────────
    _render(project) {
        this.content.innerHTML = ''
        this.footer.innerHTML = ''
        this.content.scrollTop = 0

        // Hero: framed screenshot with the "Proyecto" flag overlaid on it.
        const hero = _el('div', 'fz-proj-hero')
        const img = _el('img', 'fz-proj-img')
        img.src = project.image
        img.alt = project.title
        img.draggable = false
        img.loading = 'lazy'
        hero.appendChild(img)
        const flag = _el('span', 'fz-proj-flag')
        flag.textContent = 'Proyecto'
        hero.appendChild(flag)
        this.content.appendChild(hero)

        // Gallery: when there's a second capture it becomes a thumbnail strip
        // that swaps the hero (a lone image dangling at the bottom read badly).
        if (project.image2) {
            const thumbs = _el('div', 'fz-proj-thumbs')
            const sources = [project.image, project.image2]
            const buttons = sources.map((src, i) => {
                const b = _el('button', `fz-proj-thumb${i === 0 ? ' is-active' : ''}`)
                b.type = 'button'
                b.setAttribute('aria-label', `Captura ${i + 1}`)
                const t = _el('img')
                t.src = src
                t.alt = ''
                t.draggable = false
                t.loading = 'lazy'
                b.appendChild(t)
                b.addEventListener('click', () => {
                    if (img.getAttribute('src') === src) return
                    img.style.opacity = '0'
                    setTimeout(() => { img.src = src; img.style.opacity = '1' }, 140)
                    buttons.forEach((x) => x.classList.remove('is-active'))
                    b.classList.add('is-active')
                })
                thumbs.appendChild(b)
                return b
            })
            this.content.appendChild(thumbs)
        }

        const title = _el('h2', 'fz-proj-title')
        title.textContent = project.title
        this.content.appendChild(title)

        const tagline = _el('p', 'fz-proj-tagline')
        tagline.textContent = project.tagline
        this.content.appendChild(tagline)

        // Highlights — check icons scan far better than plain dots.
        const hlLabel = _el('div', 'fz-proj-kicker fz-proj-kicker--section')
        hlLabel.textContent = 'Lo destacado'
        this.content.appendChild(hlLabel)

        for (const h of project.highlights) {
            const row = _el('div', 'fz-proj-point')
            const ic = _el('span', 'fz-proj-check')
            ic.innerHTML = SVG_CHECK
            const txt = _el('p', 'fz-proj-point-text')
            txt.innerHTML = _richText(h)
            row.appendChild(ic)
            row.appendChild(txt)
            this.content.appendChild(row)
        }

        if (project.stack?.length) {
            const label = _el('div', 'fz-proj-kicker fz-proj-kicker--section')
            label.textContent = 'Stack'
            this.content.appendChild(label)
            const chips = _el('div', 'fz-chips fz-proj-chips')
            for (const s of project.stack) {
                const chip = _el('span', 'fz-chip')
                chip.textContent = s
                chips.appendChild(chip)
            }
            this.content.appendChild(chips)
        }

        // CTAs live in the fixed footer — always visible, no scrolling needed.
        if (project.links?.length) {
            project.links.forEach((l, i) => {
                const a = _el('a', `fz-proj-link${i === 0 ? ' fz-proj-link--primary' : ''}`)
                a.href = l.url
                a.target = '_blank'
                a.rel = 'noopener noreferrer'
                a.innerHTML = `<span>${l.label}</span>${SVG_EXTERNAL}`
                this.footer.appendChild(a)
            })
            this.footer.style.display = ''
        } else {
            this.footer.style.display = 'none'
        }
    }

    // ─── Open / close ────────────────────────────────────────────────────
    open(index) {
        if (this._isOpen) return // duplicated trigger — don't re-capture the lock
        const project = PROJECTS[index]
        if (!project) return
        this._render(project)

        const character = this.experience?.world?.character
        if (character && this._prevLocked === undefined) {
            this._prevLocked = character.movementLocked
            character.movementLocked = true
        }

        this._isOpen = true
        this._openedAt = performance.now()
        window.addEventListener('keydown', this._onKeyDown, true)
        // Clean any leftover state from a previous (drag-)close so reopening
        // always animates from the hidden position.
        document.body.style.cursor = ''
        this.panel.style.transform = ''
        this.panel.classList.remove('is-dragging', 'is-open')
        this.backdrop.classList.remove('is-open')
        void this.panel.offsetWidth // reflow → restart the CSS transition
        requestAnimationFrame(() => {
            this.backdrop.classList.add('is-open')
            this.panel.classList.add('is-open')
        })
    }

    close() {
        if (!this._isOpen) return
        this._isOpen = false
        window.removeEventListener('keydown', this._onKeyDown, true)
        this.backdrop.classList.remove('is-open')
        this.panel.classList.remove('is-open')

        const character = this.experience?.world?.character
        if (character && this._prevLocked !== undefined) {
            character.movementLocked = this._prevLocked
            this._prevLocked = undefined
        }
        this._closeCb?.()
    }

    isOpen() { return this._isOpen }
    onClose(cb) { this._closeCb = cb }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown, true)
        this._dragCleanup?.()
        this.backdrop.remove()
        this.panel.remove()
    }
}

function _el(tag, className) {
    const node = document.createElement(tag)
    if (className) node.className = className
    return node
}
