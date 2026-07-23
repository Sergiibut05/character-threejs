/**
 * socialData — the four social statues of the social area.
 * `node` must match the object name inside social-area.glb.
 * Icons are inline SVG (currentColor) — no emojis, per UI style rules.
 */

const ICON_GITHUB = `
<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
</svg>`

const ICON_LINKEDIN = `
<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
  <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.72V1.72C24 .77 23.2 0 22.23 0z"/>
</svg>`

const ICON_X = `
<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z"/>
</svg>`

// itch.io's real logomark doesn't reduce well to a tiny glyph — a clean
// gamepad reads better at 20px and still says "games".
const ICON_ITCHIO = `
<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M7 7h10a5 5 0 0 1 5 5.5 4 4 0 0 1-4 4.5c-1.3 0-2.5-.6-3.2-1.7l-.6-.8H9.8l-.6.8A4 4 0 0 1 6 17a4 4 0 0 1-4-4.5A5 5 0 0 1 7 7z"/>
  <path d="M8 10.5v4M6 12.5h4M15.5 11.5h.01M18 13.5h.01"/>
</svg>`

export const SOCIALS = [
    { node: 'github',   name: 'GitHub',   url: 'https://github.com/Sergiibut05',                          icon: ICON_GITHUB },
    { node: 'linkedIn', name: 'LinkedIn', url: 'https://www.linkedin.com/in/sergii-butrii-4b0729346/',    icon: ICON_LINKEDIN },
    { node: 'x',        name: 'X',        url: 'https://x.com/sergiidev5',                                icon: ICON_X },
    { node: 'itchio',   name: 'itch.io',  url: 'https://sergii-but05.itch.io/',                           icon: ICON_ITCHIO }
]
