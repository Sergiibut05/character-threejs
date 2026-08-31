import './profile.css'
import Modal from './Modal.js'
import {
    ABOUT, EXPERIENCE, EDUCATION, SKILLS,
    BTS_INTRO, BEHIND_THE_SCENES, BTS_CREDITS, LINKS
} from './profileData.js'
import { iconGithub, iconLinkedin, iconMail } from './icons.js'
import { t } from '../../Utils/gameText.js'

// Keys, resolved when the tabs are built — see the note in gameText.js.
const TABS = [
    { id: 'about', labelKey: 'computer.about' },
    { id: 'experience', labelKey: 'computer.experience' },
    { id: 'bts', labelKey: 'computer.behindScenes' }
]

/**
 * ComputerModal — opened by interacting with the computer in the house.
 * Three tabs (same tab styles as the settings modal):
 *   - Sobre mí:     quick bio + full bio + social links
 *   - Experiencia:  experience, education, technical skills
 *   - Behind the scenes: how this portfolio is built (fluid editorial layout)
 * All content lives in profileData.js.
 */
export default class ComputerModal {
    constructor() {
        this.modal = new Modal({
            variant: 'clean',
            size: 'lg',
            title: 'Sergii Butrii'
        })

        this.nav = _el('div', 'fz-settings-nav')
        this.content = _el('div', 'fz-profile-scroll')
        this.modal.append(this.nav)
        this.modal.append(this.content)

        this._tabs = []
        TABS.forEach((tab, i) => {
            const b = _el('button', 'fz-settings-tab')
            b.type = 'button'
            b.textContent = t(tab.labelKey)
            b.addEventListener('click', () => this._select(i))
            this.nav.appendChild(b)
            this._tabs.push(b)
        })
        this._select(0)
    }

    _select(i) {
        this._tabs.forEach((t, k) => t.classList.toggle('is-active', k === i))
        this.content.innerHTML = ''
        this.content.scrollTop = 0
        const id = TABS[i].id
        if (id === 'about') this._buildAbout()
        else if (id === 'experience') this._buildExperience()
        else this._buildBts()
    }

    // ─── Sobre mí ────────────────────────────────────────────────────────
    _buildAbout() {
        this._heading('Quick bio')
        this._paragraph(ABOUT.quickBio)

        this._heading('Full bio')
        for (const p of ABOUT.fullBio) this._paragraph(p)

        const links = _el('div', 'fz-profile-links')
        links.appendChild(_link(iconGithub, 'GitHub', LINKS.github))
        links.appendChild(_link(iconLinkedin, 'LinkedIn', LINKS.linkedin))
        links.appendChild(_link(iconMail, 'Email', `mailto:${LINKS.email}`))
        this.content.appendChild(links)
    }

    // ─── Experiencia ─────────────────────────────────────────────────────
    _buildExperience() {
        this._heading('Experiencia')
        for (const e of EXPERIENCE) {
            this.content.appendChild(_xpEntry(e.role, e.org, e.period, e.detail))
        }

        this._heading(t('computer.education'))
        for (const e of EDUCATION) {
            this.content.appendChild(_xpEntry(e.title, e.org, e.period, e.detail))
        }

        this._heading('Technical skills')
        for (const g of SKILLS) {
            const group = _el('div', 'fz-skill-group')
            const label = _el('div', 'fz-skill-label')
            label.textContent = g.group
            const chips = _el('div', 'fz-chips')
            for (const s of g.items) {
                const chip = _el('span', 'fz-chip')
                chip.textContent = s
                chips.appendChild(chip)
            }
            group.appendChild(label)
            group.appendChild(chips)
            this.content.appendChild(group)
        }
    }

    // ─── Behind the scenes (fluid editorial flow) ────────────────────────
    _buildBts() {
        const intro = _el('p', 'fz-bts-intro')
        intro.textContent = BTS_INTRO
        this.content.appendChild(intro)

        for (const item of BEHIND_THE_SCENES) {
            this.content.appendChild(_btsSection(item))
        }

        // Credits — closing note
        const credits = _el('div', 'fz-bts-credits')
        const head = _el('div', 'fz-bts-head')
        head.innerHTML = BTS_CREDITS.icon
        head.appendChild(document.createTextNode(BTS_CREDITS.title))
        const body = _el('div', 'fz-bts-body')
        body.textContent = BTS_CREDITS.body
        const links = _el('div', 'fz-bts-credit-links')
        for (const l of BTS_CREDITS.links) {
            const a = _el('a', 'fz-bts-link')
            a.href = l.url
            a.target = '_blank'
            a.rel = 'noopener noreferrer'
            a.textContent = l.label
            links.appendChild(a)
        }
        credits.appendChild(head)
        credits.appendChild(body)
        credits.appendChild(links)
        this.content.appendChild(credits)
    }

    // ─── Helpers ─────────────────────────────────────────────────────────
    _heading(text) {
        const h = _el('div', 'fz-profile-heading')
        h.textContent = text
        this.content.appendChild(h)
    }

    _paragraph(text) {
        const p = _el('p', 'fz-profile-text')
        p.textContent = text
        this.content.appendChild(p)
    }

    open() { this.modal.open() }
    close() { this.modal.close() }
    isOpen() { return this.modal.isOpen() }
    onClose(cb) { this.modal.onClose(cb) }
    destroy() { this.modal.destroy() }
}

function _btsSection(item) {
    const section = _el('div', 'fz-bts-section')
    const head = _el('div', 'fz-bts-head')
    head.innerHTML = item.icon
    head.appendChild(document.createTextNode(item.title))
    const body = _el('div', 'fz-bts-body')
    body.textContent = item.body
    section.appendChild(head)
    section.appendChild(body)
    if (item.link) {
        const a = _el('a', 'fz-bts-link')
        a.href = item.link.url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.textContent = item.link.label
        section.appendChild(a)
    }
    return section
}

function _xpEntry(role, org, period, detail) {
    const entry = _el('div', 'fz-xp')
    const r = _el('div', 'fz-xp-role')
    r.textContent = role
    const o = _el('div', 'fz-xp-org')
    o.textContent = org
    const p = _el('div', 'fz-xp-period')
    p.textContent = period
    entry.appendChild(r)
    entry.appendChild(o)
    entry.appendChild(p)
    if (detail) {
        const d = _el('div', 'fz-xp-detail')
        d.textContent = detail
        entry.appendChild(d)
    }
    return entry
}

function _link(icon, label, url) {
    const a = _el('a', 'fz-profile-link')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.innerHTML = icon
    a.appendChild(document.createTextNode(label))
    return a
}

function _el(tag, className) {
    const node = document.createElement(tag)
    if (className) node.className = className
    return node
}
