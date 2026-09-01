import './games.css'
import Modal from './Modal.js'
import { t } from '../../Utils/gameText.js'

/**
 * GamesModal — opened by interacting with the Nintendo Switch in the house.
 *
 * Three covers: the two favourites on the outside, the one currently being
 * played in the middle and raised. Only the LAYOUT lives here; every string
 * comes from the catalogs so it follows the language switch.
 *
 * The art is the real box art, re-encoded to WebP at 276×368 — roughly 22 KB
 * each against ~120 KB for the JPEGs Wikipedia serves. Nothing is requested
 * until the panel is first opened, because _render() is what puts the <img>
 * elements in the document at all; `loading="lazy"` then covers the two the
 * viewport may not reach on a phone.
 */

/**
 * id → cover + the colour the card shows underneath it.
 *
 * `tint` is each cover's own dominant colour, so the card is already the right
 * shade for the split second before the image paints instead of flashing the
 * paper background. The rest of every entry is i18n (`game.games.items.<id>`).
 */
const SHELF = [
    { id: 'zelda', src: '/games/zelda.webp', tint: '#f8e8d8' },
    { id: 'persona', src: '/games/persona.webp', tint: '#08b8f8', now: true },
    { id: 'rdr2', src: '/games/rdr2.webp', tint: '#080808' }
]

export default class GamesModal {
    constructor() {
        // A title MUST be passed here: Modal only appends its title element
        // when the constructor gets one, so an empty string would leave
        // _render's setTitle() writing into a node that is not in the panel.
        this.modal = new Modal({ variant: 'paper', size: 'lg', title: t('games.title') })
        this.shelf = document.createElement('div')
        this.shelf.className = 'fz-games'
        this.modal.append(this.shelf)
    }

    /**
     * Built on open rather than in the constructor, so switching language and
     * then opening the panel shows the new language. Three cards of static
     * markup cost less to rebuild than a locale subscription costs to keep
     * alive for something opened once a session.
     */
    _render() {
        this.modal.setTitle(t('games.title'))
        this.shelf.replaceChildren()

        for (const entry of SHELF) {
            const key = `games.items.${entry.id}`
            const name = t(`${key}.title`)

            const card = document.createElement('div')
            card.className = `fz-game${entry.now ? ' fz-game--now' : ''}`

            const cover = document.createElement('div')
            cover.className = 'fz-game-cover'
            cover.style.setProperty('--fz-game-tint', entry.tint)

            const img = document.createElement('img')
            img.src = entry.src
            // Intrinsic size, so the grid never reflows when a cover lands.
            img.width = 276
            img.height = 368
            img.loading = 'lazy'
            img.decoding = 'async'
            img.draggable = false
            img.alt = t('games.coverAlt', { title: name })
            cover.appendChild(img)

            if (entry.now) {
                const badge = document.createElement('div')
                badge.className = 'fz-game-badge'
                badge.textContent = t('games.now')
                cover.appendChild(badge)
            }

            const title = document.createElement('div')
            title.className = 'fz-game-title'
            title.textContent = name

            const meta = document.createElement('div')
            meta.className = 'fz-game-meta'
            meta.textContent = t(`${key}.note`)

            card.append(cover, title, meta)
            this.shelf.appendChild(card)
        }
    }

    open() { this._render(); this.modal.open() }
    close() { this.modal.close() }
    isOpen() { return this.modal.isOpen() }
    onClose(cb) { this.modal.onClose(cb) }
    destroy() { this.modal.destroy() }
}
