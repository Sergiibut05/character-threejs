/**
 * Pill button. `variant`: 'primary' (filled green) or 'ghost' (outline).
 */
export function createButton({ label = '', variant = 'primary', onClick } = {}) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `fz-btn fz-btn--${variant}`
    btn.textContent = label
    if (onClick) btn.addEventListener('click', onClick)
    return btn
}
