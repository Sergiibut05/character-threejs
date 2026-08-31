import './profile.css'
import Modal from './Modal.js'
import { t } from '../../Utils/gameText.js'
import { CERTIFICATES } from './profileData.js'
import { iconBadge } from './icons.js'

/**
 * TrophyModal — opened by interacting with the trophy in the house interior.
 * Clean certificate list (content lives in profileData.js).
 */
export default class TrophyModal {
    constructor() {
        this.modal = new Modal({
            variant: 'paper',
            size: 'lg',
            title: t('trophy.title')
        })

        const scroll = document.createElement('div')
        scroll.className = 'fz-profile-scroll'
        const list = document.createElement('div')
        list.className = 'fz-certs'

        for (const c of CERTIFICATES) {
            // Each row is a link to the credential itself.
            const item = document.createElement(c.url ? 'a' : 'div')
            item.className = 'fz-cert'
            if (c.url) {
                item.href = c.url
                item.target = '_blank'
                item.rel = 'noopener noreferrer'
                item.setAttribute('aria-label', `Ver certificado: ${c.title}`)
            }

            const icon = document.createElement('div')
            icon.className = 'fz-cert-icon'
            icon.innerHTML = iconBadge

            const body = document.createElement('div')
            body.className = 'fz-cert-body'
            const title = document.createElement('div')
            title.className = 'fz-cert-title'
            title.textContent = c.title
            const meta = document.createElement('div')
            meta.className = 'fz-cert-meta'
            meta.innerHTML = `<strong></strong> · <span></span>`
            meta.querySelector('strong').textContent = c.issuer
            meta.querySelector('span').textContent = c.date

            body.appendChild(title)
            body.appendChild(meta)
            item.appendChild(icon)
            item.appendChild(body)
            list.appendChild(item)
        }

        scroll.appendChild(list)
        this.modal.append(scroll)
    }

    open() { this.modal.open() }
    close() { this.modal.close() }
    isOpen() { return this.modal.isOpen() }
    onClose(cb) { this.modal.onClose(cb) }
    destroy() { this.modal.destroy() }
}
