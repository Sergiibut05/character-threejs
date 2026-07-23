/**
 * DeviceCaps — capability flags resolved once at boot.
 *
 * REAL_SHADOWS_SUPPORTED:
 *   three's WebGPUBackend disables the TEXTURE_COMPARE capability whenever the
 *   user agent contains "Android" (a workaround for broken comparison-sampler
 *   drivers). Shadow sampling then falls back to a manual step() comparison —
 *   and that fallback path fails to build with this project's materials
 *   (custom `receivedShadowNode` hooks, forced receive-shadow floor): floor,
 *   props and character simply don't render on Android (real devices AND
 *   DevTools emulation, since the flag is UA-driven).
 *
 *   Fix: on Android we never let the shadow-map pipeline exist at all —
 *   renderer.shadowMap off, sun castShadow off, no custom shadow hooks — so
 *   the broken path is never compiled. The FakeShadow blob system (already
 *   used on low quality) covers grounding shadows there.
 */
export const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

export const REAL_SHADOWS_SUPPORTED = !IS_ANDROID
