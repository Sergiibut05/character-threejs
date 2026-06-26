/**
 * Selectable card (mode select / choices). Returns a focusable <button>.
 * `icon` is an inline SVG string (see ui/icons.js). `onSelect` fires on click /
 * Enter / Space (native button behaviour).
 */
export function createModeCard({ icon = '', title = '', desc = '', onSelect } = {}) {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'fz-card'

    if (icon) {
        const i = document.createElement('span')
        i.className = 'fz-card-icon'
        i.innerHTML = icon // trusted inline SVG from ui/icons.js
        card.appendChild(i)
    }

    const t = document.createElement('span')
    t.className = 'fz-card-title'
    t.textContent = title
    card.appendChild(t)

    if (desc) {
        const d = document.createElement('span')
        d.className = 'fz-card-desc'
        d.textContent = desc
        card.appendChild(d)
    }

    if (onSelect) card.addEventListener('click', onSelect)
    return card
}

/** Container for a row/grid of mode cards. (Arrow-key nav is handled by Modal.) */
export function createCardGrid(cards = []) {
    const grid = document.createElement('div')
    grid.className = 'fz-cards'
    for (const c of cards) grid.appendChild(c)
    return grid
}
