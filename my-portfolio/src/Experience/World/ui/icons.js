/*
 * Inline SVG icon set for the game UI. Hand-drawn, rounded, pastel — matches
 * the Animal Crossing / Wii Sports look. Each export is an SVG string meant to
 * be dropped into a `.fz-card-icon` / `.fz-icon` container via innerHTML.
 *
 * No emojis: these render identically across platforms and read as real icons.
 */

// Trophy — competitive mode.
export const iconTrophy = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M15 12H9.5a5.5 5.5 0 0 0 6 9.5" stroke="#e8a200" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  <path d="M33 12h5.5a5.5 5.5 0 0 1-6 9.5" stroke="#e8a200" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  <path d="M13.5 7h21v8.5a10.5 10.5 0 0 1-21 0V7Z" fill="#ffd84d" stroke="#e8a200" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M24 26v6.5" stroke="#e8a200" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M16.5 40h15l-2.2-6.5H18.7L16.5 40Z" fill="#ffd84d" stroke="#e8a200" stroke-width="2.6" stroke-linejoin="round"/>
  <circle cx="24" cy="13" r="2.6" fill="#fff3bf"/>
</svg>`

// Bullseye target — free/practice mode (mirrors the in-game ring colours).
export const iconTarget = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <circle cx="24" cy="24" r="20" fill="#dfe9ff" stroke="#5a8af5" stroke-width="2.6"/>
  <circle cx="24" cy="24" r="13" fill="#c2ecd6" stroke="#41a06e" stroke-width="2.4"/>
  <circle cx="24" cy="24" r="6.6" fill="#ffd84d" stroke="#e8a200" stroke-width="2.4"/>
  <circle cx="24" cy="24" r="2.4" fill="#ff6b4a"/>
</svg>`

// Frisbee disc — HUD round header.
export const iconDisc = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <ellipse cx="24" cy="27" rx="17" ry="7.5" fill="#9be4ca" stroke="#41a06e" stroke-width="2.4"/>
  <ellipse cx="24" cy="23.5" rx="17" ry="7.5" fill="#e7faf1" stroke="#41a06e" stroke-width="2.4"/>
  <ellipse cx="24" cy="23.5" rx="7" ry="3" fill="#bfeeda" stroke="#41a06e" stroke-width="1.6"/>
</svg>`

// Exit door with arrow — leave the minigame. Uses currentColor so it follows
// the button's text colour (e.g. turns red on hover).
export const iconExit = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M27 8H13a2.5 2.5 0 0 0-2.5 2.5v27A2.5 2.5 0 0 0 13 40h14" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M21 24h17" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <path d="M31 17l7 7-7 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

// Question mark — help / reopen tutorial (Phase 3).
export const iconHelp = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M18.5 19a5.5 5.5 0 0 1 10.8 1.5c0 3.5-4.8 4-4.8 7.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" fill="none"/>
  <circle cx="24" cy="34.5" r="2.3" fill="currentColor"/>
</svg>`

// Scenery (picture) — high visual quality.
export const iconScenery = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <circle cx="34" cy="14" r="5" fill="#ffd84d"/>
  <path d="M5 39 L18 19 L27 31 L33 22 L43 39 Z" fill="#5fc594" stroke="#3f9e6b" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M14.5 25 L18 19 L21.5 25" stroke="#ffffff" stroke-width="2" opacity="0.6" fill="none" stroke-linecap="round"/>
</svg>`

// Device icons (use currentColor so they adapt to the tab state).
export const iconKeyboard = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <rect x="5" y="14" width="38" height="21" rx="4" stroke="currentColor" stroke-width="2.4"/>
  <g fill="currentColor">
    <rect x="10" y="19" width="4" height="3.4" rx="1"/><rect x="17" y="19" width="4" height="3.4" rx="1"/>
    <rect x="24" y="19" width="4" height="3.4" rx="1"/><rect x="31" y="19" width="4" height="3.4" rx="1"/>
    <rect x="10" y="26" width="4" height="3.4" rx="1"/><rect x="17" y="26" width="14" height="3.4" rx="1"/>
    <rect x="34" y="26" width="4" height="3.4" rx="1"/>
  </g>
</svg>`

export const iconGamepad = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M16 17h16c4.5 0 7.6 3.2 8.6 8.4l1 5.4c.7 3.8-3 6.3-6 4.4l-4.2-2.6H20.6L16.4 35.2c-3 1.9-6.7-.6-6-4.4l1-5.4C12.4 20.2 15.5 17 16 17Z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M14.5 25.5h6M17.5 22.5v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="30" cy="24.5" r="1.9" fill="currentColor"/>
  <circle cx="34.5" cy="28.5" r="1.9" fill="currentColor"/>
</svg>`

export const iconMobile = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <rect x="16" y="7" width="16" height="30" rx="4" stroke="currentColor" stroke-width="2.4"/>
  <line x1="22" y1="11" x2="26" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <circle cx="24" cy="32.5" r="1.7" fill="currentColor"/>
</svg>`

// Bolt — light/performance.
export const iconBolt = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M27 5 12 27h9l-3 16 18-23H26l5-15Z" fill="#ffd84d" stroke="#e8a200" stroke-width="2.6" stroke-linejoin="round"/>
</svg>`

// ─── Tutorial step icons ─────────────────────────────────────────────────

// Aim — crosshair.
export const iconAim = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <circle cx="24" cy="24" r="12" fill="#eaf6ef" stroke="#41a06e" stroke-width="3"/>
  <circle cx="24" cy="24" r="3" fill="#41a06e"/>
  <path d="M24 6v6M24 36v6M6 24h6M36 24h6" stroke="#41a06e" stroke-width="3" stroke-linecap="round"/>
  <path d="M13 13l3 3M35 13l-3 3M13 35l3-3M35 35l-3-3" stroke="#9be4ca" stroke-width="2.6" stroke-linecap="round"/>
</svg>`

// Curve — a banking arrow.
export const iconCurve = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M10 36C10 19 19 11 34 11" stroke="#5a8af5" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M25 9l10 2-2.5 9.5" stroke="#5a8af5" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`

// Power — a charge bar with a sweet-spot marker.
export const iconPower = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <rect x="6" y="19" width="36" height="10" rx="5" fill="#fff6da" stroke="#e8a200" stroke-width="2.4"/>
  <rect x="8.5" y="21.5" width="17" height="5" rx="2.5" fill="#ffd84d"/>
  <path d="M28 13.5v21" stroke="#ff6b4a" stroke-width="3.2" stroke-linecap="round"/>
</svg>`

// ─── Audio icons ─────────────────────────────────────────────────────────

// Music note — soundtrack / now playing.
export const iconMusic = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M20 30V11l16-3.5V26" stroke="#41a06e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="15.5" cy="31.5" r="5" fill="#9be4ca" stroke="#41a06e" stroke-width="2.6"/>
  <circle cx="31.5" cy="27.5" r="5" fill="#ffd84d" stroke="#e8a200" stroke-width="2.6"/>
</svg>`

// Speaker with sound waves — audio on. currentColor so it follows state.
export const iconVolume = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M9 19h6l8-6v22l-8-6H9V19Z" fill="currentColor" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M30 18a8 8 0 0 1 0 12M34.5 13.5a14 14 0 0 1 0 21" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/>
</svg>`

// Speaker muted (with an X). currentColor.
export const iconMute = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M9 19h6l8-6v22l-8-6H9V19Z" fill="currentColor" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M30 19l10 10M40 19 30 29" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>
</svg>`

// Previous track — skip back.
export const iconPrev = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M14 12v24" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M36 13 19 24l17 11V13Z" fill="currentColor" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
</svg>`

// Next track — skip forward.
export const iconNext = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M34 12v24" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M12 13l17 11-17 11V13Z" fill="currentColor" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
</svg>`
