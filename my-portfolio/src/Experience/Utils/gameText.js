/**
 * gameText — the in-world half of i18n, in one import.
 *
 * Everything the player reads while playing lives under the `game.*` branch of
 * the catalogs, so this is just `i18n.t` with that prefix bound plus the two
 * things every game surface needs: a way to re-render when the language
 * changes, and the control names for the device actually in use.
 *
 * IMPORTANT: call these at RENDER time, never at module scope. A catalog is
 * loaded asynchronously at boot, so a string captured in a module-level
 * constant would be resolved before there is anything to resolve it against —
 * and would then never update when the language is switched.
 */
import i18n from './i18n.js'

/** Translate a `game.*` key. `t('frisbee.title')` → "Frisbee". */
export const t = (key, params) => i18n.t(`game.${key}`, params)

/**
 * Re-render on language change. Returns an unsubscribe, so components can drop
 * it in destroy() and not leak a listener per open/close cycle.
 */
export function onLocaleChange(fn) {
    i18n.on('change', fn)
    return () => i18n.off('change', fn)
}

/**
 * Control names for the device in use, as PARAMETERS rather than baked
 * sentences: the tutorial has to say "A and D" on a keyboard, "the stick" on a
 * pad and "the joystick" on a phone, and the sentence around them is identical
 * in each case. Baking them in would mean three copies of every sentence in
 * every language.
 */
export function controls(device) {
    const suffix = device === 'gamepad' ? 'Pad' : device === 'touch' ? 'Touch' : 'Keyboard'
    return { move: t(`controls.move${suffix}`), press: t(`controls.press${suffix}`) }
}

export default { t, onLocaleChange, controls }
