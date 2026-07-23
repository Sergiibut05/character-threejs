import './ui.css'
import Modal from './Modal.js'
import { createButton } from './Button.js'

// Web3Forms — sends the message to the owner's inbox (no backend). The access
// key is public by design (it only allows submitting TO the owner's address).
const ACCESS_KEY = '6bd6005b-3796-4460-ab2c-3edcb3c4fd86'
const ENDPOINT = 'https://api.web3forms.com/submit'

/**
 * ContactModal — a little contact form opened from the mailbox. Sends the
 * message through Web3Forms and shows a real confirmation. Freezes the
 * character while typing.
 */
export default class ContactModal {
    constructor() {
        this.experience = window.experience
        this.modal = new Modal({
            variant: 'paper',
            size: 'lg',
            align: 'center',
            title: 'Contacto',
            subtitle: '¿Trabajamos juntos? Cuéntame tu idea y te respondo pronto.'
        })

        // ─── Form view ───────────────────────────────────────────────────
        this.form = _el('div', 'fz-contact')
        this.form.innerHTML = `
            <label class="fz-field">
                <span class="fz-field-label">Nombre</span>
                <input class="fz-input" type="text" placeholder="Tu nombre" autocomplete="name" />
            </label>
            <label class="fz-field">
                <span class="fz-field-label">Tu email</span>
                <input class="fz-input" type="email" placeholder="tucorreo@ejemplo.com" autocomplete="email" />
            </label>
            <label class="fz-field">
                <span class="fz-field-label">Mensaje</span>
                <textarea class="fz-input fz-textarea" rows="4" placeholder="Cuéntame…"></textarea>
            </label>
            <p class="fz-form-error" role="alert"></p>
        `
        const inputs = this.form.querySelectorAll('.fz-input')
        this.nameEl = inputs[0]
        this.emailEl = inputs[1]
        this.msgEl = inputs[2]
        this.errorEl = this.form.querySelector('.fz-form-error')
        this.modal.append(this.form)

        this.row = _el('div', 'fz-btn-row')
        this.sendBtn = createButton({ label: 'Enviar', variant: 'primary', onClick: () => this._send() })
        this.row.appendChild(this.sendBtn)
        this.modal.append(this.row)

        // ─── Sent view (hidden until a message is sent) ──────────────────
        this.sentView = _el('div', 'fz-contact-sent')
        this.sentView.innerHTML = `
            <span class="fz-sent-check" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="24" r="21" fill="#e6f7ec" stroke="#41a06e" stroke-width="2.6"/>
                    <path d="M15 24.5l6.2 6.2L33.5 18.4" stroke="#41a06e" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </span>
            <span class="fz-sent-title">¡Mensaje enviado!</span>
            <span class="fz-sent-text">Gracias por escribir. Te responderé pronto.</span>
        `
        this.sentView.style.display = 'none'
        this.modal.append(this.sentView)

        this.sentRow = _el('div', 'fz-btn-row')
        this.sentRow.appendChild(createButton({ label: 'Hecho', variant: 'primary', onClick: () => this.modal.close() }))
        this.sentRow.style.display = 'none'
        this.modal.append(this.sentRow)

        this.modal.onClose(() => this._onClosed())
    }

    async _send() {
        if (this._sending) return
        const name = (this.nameEl.value || '').trim()
        const email = (this.emailEl.value || '').trim()
        const msg = (this.msgEl.value || '').trim()

        if (!msg) { this._setError('Escribe un mensaje antes de enviar.'); this.msgEl.focus(); return }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this._setError('Revisa tu email, no parece válido.'); this.emailEl.focus(); return
        }
        this._setError('')
        this._setSending(true)

        try {
            const res = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({
                    access_key: ACCESS_KEY,
                    subject: `Portfolio — ${name || 'Nuevo mensaje'}`,
                    from_name: name || 'Visitante del portfolio',
                    name: name || '(sin nombre)',
                    email: email || 'sin-email@portfolio',
                    message: msg
                })
            })
            const data = await res.json()
            if (data.success) this._showSent()
            else this._setError(data.message || 'No se pudo enviar. Inténtalo de nuevo.')
        } catch {
            this._setError('Sin conexión. Inténtalo de nuevo en un momento.')
        } finally {
            this._setSending(false)
        }
    }

    _setSending(on) {
        this._sending = on
        this.sendBtn.disabled = on
        this.sendBtn.textContent = on ? 'Enviando…' : 'Enviar'
    }

    _setError(text) {
        this.errorEl.textContent = text
        this.errorEl.classList.toggle('is-visible', !!text)
    }

    _showSent() {
        this.form.style.display = 'none'
        this.row.style.display = 'none'
        this.sentView.style.display = ''
        this.sentRow.style.display = ''
    }

    _reset() {
        this.form.style.display = ''
        this.row.style.display = ''
        this.sentView.style.display = 'none'
        this.sentRow.style.display = 'none'
        this._setError('')
        this._setSending(false)
    }

    open() {
        if (this.modal.isOpen()) return // duplicated trigger — don't re-capture the lock
        this._reset()
        const c = this.experience?.world?.character
        if (c && this._prevLocked === undefined) {
            this._prevLocked = c.movementLocked
            c.movementLocked = true
        }
        this.modal.open()
    }

    close() { this.modal.close() }
    isOpen() { return this.modal.isOpen() }

    _onClosed() {
        const c = this.experience?.world?.character
        if (c && this._prevLocked !== undefined) {
            c.movementLocked = this._prevLocked
            this._prevLocked = undefined
        }
    }

    destroy() { this.modal.destroy() }
}

function _el(tag, className) {
    const node = document.createElement(tag)
    if (className) node.className = className
    return node
}
