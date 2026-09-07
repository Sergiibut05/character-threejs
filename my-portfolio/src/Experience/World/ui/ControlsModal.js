import './ui.css'
import Modal from './Modal.js'
import { inputGlyph } from './InputGlyph.js'
import { t, onLocaleChange } from '../../Utils/gameText.js'

/**
 * ControlsModal — what the buttons do, for the device in your hands.
 *
 * Not a picture of a keyboard. The panel asks InputGlyph for each action and
 * gets back whatever the active device actually uses, so a pad player is shown
 * A and X and a phone player is shown the stick and the touch target. Reading
 * about keys you do not have is worse than no help at all.
 *
 * It re-renders on both a device change and a language change, because the
 * panel stays open while someone reads it and either can move underneath: pick
 * up a pad mid-read and the letters change under your eyes, which is a nicer
 * way of learning the mapping than any label would be.
 *
 * `back` is deliberately absent on touch. There is no B button on the phone
 * layout -- you leave things by tapping their close button -- so listing it
 * would be describing a control that is not there.
 */

/** Semantic action → catalog key. Order is the order they are shown. */
const ROWS = [
    ['move', 'controlsPanel.move'],
    ['sprint', 'controlsPanel.sprint'],
    ['interact', 'controlsPanel.interact'],
    ['back', 'controlsPanel.back']
]

export default class ControlsModal {
    constructor() {
        this.modal = new Modal({
            variant: 'paper',
            align: 'center',
            title: t('controlsPanel.title'),
            closable: true
        })

        this.list = document.createElement('div')
        this.list.className = 'fz-controls-list'
        this.modal.append(this.list)

        this.note = document.createElement('p')
        this.note.className = 'fz-controls-note'
        this.modal.append(this.note)

        this._render()
        // Both, and for the same reason: the panel outlives the moment it was
        // opened in. See the class note.
        this._unsubDevice = window.experience?.input?.onChange?.(() => this._render()) || null
        this._unsubLocale = onLocaleChange(() => this._render())
    }

    _render() {
        const device = window.experience?.input?.device || 'keyboard'
        this.modal.titleEl.textContent = t('controlsPanel.title')
        this.list.innerHTML = ''

        for (const [action, key] of ROWS) {
            // Nothing to press for this on a phone -- see the class note.
            if (action === 'back' && device === 'touch') continue

            const row = document.createElement('div')
            row.className = 'fz-controls-row'
            row.appendChild(inputGlyph(action, device))

            const label = document.createElement('span')
            label.className = 'fz-controls-label'
            label.textContent = t(key)
            row.appendChild(label)

            this.list.appendChild(row)
        }

        this.note.textContent = t(`controlsPanel.note.${device}`)
    }

    open() { this.modal.open() }
    close() { this.modal.close() }
    isOpen() { return this.modal.isOpen() }

    destroy() {
        this._unsubDevice?.()
        this._unsubLocale?.()
        this.modal.destroy()
    }
}
