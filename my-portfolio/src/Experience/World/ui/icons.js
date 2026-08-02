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

// Beach ball — the beach volley activity mark (world emblem + HUD).
export const iconBeachBall = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <circle cx="24" cy="24" r="19" fill="#fdfdfb" stroke="#3f7f66" stroke-width="2.6"/>
  <path d="M24 5a19 19 0 0 1 0 38Z" fill="#ff8a6b"/>
  <path d="M24 5a19 19 0 0 0-16.2 9.1c6 2.4 11.4 3.6 16.2 3.6s10.2-1.2 16.2-3.6A19 19 0 0 0 24 5Z" fill="#5ec7f0"/>
  <path d="M24 43a19 19 0 0 0 16.2-9.1c-6-2.4-11.4-3.6-16.2-3.6s-10.2 1.2-16.2 3.6A19 19 0 0 0 24 43Z" fill="#ffd84d"/>
  <path d="M24 5c-5.5 5.7-8.3 12-8.3 19S18.5 37.3 24 43M24 5c5.5 5.7 8.3 12 8.3 19S29.5 37.3 24 43" stroke="#3f7f66" stroke-width="2.2" fill="none"/>
  <circle cx="24" cy="24" r="19" stroke="#3f7f66" stroke-width="2.6" fill="none"/>
</svg>`

// Medal — competitive mode (distinct from the frisbee's trophy).
export const iconMedal = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M15 5 22 20M33 5 26 20" stroke="#5a8af5" stroke-width="3" stroke-linecap="round"/>
  <circle cx="24" cy="31" r="12.5" fill="#ffd84d" stroke="#e8a200" stroke-width="2.6"/>
  <path d="m24 24 2.1 4.4 4.7.7-3.4 3.4.8 4.8-4.2-2.3-4.2 2.3.8-4.8-3.4-3.4 4.7-.7L24 24Z" fill="#fff3bf"/>
</svg>`

// Infinity — endless free play.
export const iconInfinity = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <path d="M24 24c3.5-5.2 6.4-7.8 10.2-7.8a7.8 7.8 0 0 1 0 15.6C30.4 31.8 27.5 29.2 24 24Zm0 0c-3.5 5.2-6.4 7.8-10.2 7.8a7.8 7.8 0 0 1 0-15.6C17.6 16.2 20.5 18.8 24 24Z"
        fill="#c2ecd6" stroke="#41a06e" stroke-width="2.8" stroke-linejoin="round"/>
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
  <circle cx="31.5" cy="27.5" r="5" fill="#9be4ca" stroke="#41a06e" stroke-width="2.6"/>
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

// ─── Profile / house-interior icons ─────────────────────────────────────

// Award ribbon — certificates (gold, matches the trophy).
export const iconBadge = `
<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
  <circle cx="24" cy="19" r="11.5" fill="#ffd84d" stroke="#e8a200" stroke-width="2.6"/>
  <circle cx="24" cy="19" r="5.4" fill="#fff3bf" stroke="#e8a200" stroke-width="1.8"/>
  <path d="M18 28.5 14.5 41l9.5-5 9.5 5L30 28.5" fill="#5a8af5" stroke="#3f6ad0" stroke-width="2.4" stroke-linejoin="round"/>
</svg>`

// GitHub mark (simplified, currentColor).
export const iconGithub = `
<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
  <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/>
</svg>`

// LinkedIn mark (simplified, currentColor).
export const iconLinkedin = `
<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
  <path d="M4.98 3.5a2.5 2.5 0 1 1-.02 5 2.5 2.5 0 0 1 .02-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.5c0-1.31-.03-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9V21h-4V9Z"/>
</svg>`

// Envelope — email (currentColor).
export const iconMail = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke="currentColor" stroke-width="2"/>
  <path d="m4.5 8 7.5 5.5L19.5 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

// Isometric cube — 3D / rendering (currentColor).
export const iconCube = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <path d="M12 2.8 21 7.6v8.8L12 21.2 3 16.4V7.6l9-4.8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <path d="M3.4 7.8 12 12.4l8.6-4.6M12 12.4v8.4" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
</svg>`

// Bouncing ball with motion arc — physics (currentColor).
export const iconPhysics = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <circle cx="15.5" cy="15.5" r="4.5" stroke="currentColor" stroke-width="2"/>
  <path d="M3 13.5C3.5 8 6.5 4.5 11 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 3.6"/>
  <path d="M4.5 19.5h15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`

// Database cylinder — Firebase / storage (currentColor).
export const iconDatabase = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <ellipse cx="12" cy="5.5" rx="7.5" ry="3" stroke="currentColor" stroke-width="2"/>
  <path d="M4.5 5.5v13c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-13" stroke="currentColor" stroke-width="2"/>
  <path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" stroke="currentColor" stroke-width="2"/>
</svg>`

// Paint palette — art / models (currentColor).
export const iconPalette = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2.2-.9 2.2-2 0-.6-.3-1-.6-1.4-.3-.4-.6-.8-.6-1.4 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 21 9.6C20.4 5.8 16.6 3 12 3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="8" cy="9" r="1.35" fill="currentColor"/>
  <circle cx="12.5" cy="7" r="1.35" fill="currentColor"/>
  <circle cx="7.5" cy="14" r="1.35" fill="currentColor"/>
</svg>`

// Heart — credits / thanks (currentColor).
export const iconHeart = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <path d="M12 20.5S4 15.4 4 9.9C4 7.2 6.1 5 8.7 5c1.5 0 2.8.8 3.3 1.9C12.5 5.8 13.8 5 15.3 5 17.9 5 20 7.2 20 9.9c0 5.5-8 10.6-8 10.6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
</svg>`
