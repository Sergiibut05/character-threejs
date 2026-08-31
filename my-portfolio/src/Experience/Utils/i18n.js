/**
 * i18n — one translation layer for the whole project.
 *
 * Built for the Quick Overview first, but deliberately generic so the in-world
 * UI (HUD, modals, minigames) can move onto it without changing anything here:
 * add a `game.*` branch to the catalogs and call `t()` from those components.
 *
 * Catalogs are lazy per locale, so a visitor only ever downloads the language
 * they read. `t()` is synchronous once a locale is loaded, which is what makes
 * it usable from render paths and from a game loop.
 *
 * Keys are dot paths into the catalog: t('overview.hero.lede').
 * Values may contain {placeholders} filled from the params object.
 */
import EventEmitter from './EventEmitter.js'

const LOADERS = {
    es: () => import('../../locales/es.js'),
    en: () => import('../../locales/en.js')
}

export const LOCALES = Object.keys(LOADERS)

/**
 * These are two DIFFERENT jobs that used to share one constant.
 *
 * BASE is the translation floor: the catalog every missing key resolves
 * against. It has to stay Spanish, because Spanish is this project's source
 * language — the data modules (profileData, projectsData) are written in it and
 * the English catalog exists as a layer of overrides on top.
 *
 * DEFAULT is what a visitor gets when nothing else says otherwise. That is
 * English: this is a portfolio aimed at anyone, and only a browser that asks
 * for Spanish should get Spanish.
 */
export const BASE = 'es'
export const DEFAULT = 'en'

const STORAGE_KEY = 'portfolio-locale'

class I18n extends EventEmitter {
    constructor() {
        super()
        this.locale = DEFAULT
        this._catalogs = {}
        this._loading = {}
    }

    /**
     * Remembered choice → browser language → fallback. Read once at startup;
     * it never overrides a locale the visitor has actively chosen.
     */
    detect() {
        let stored = null
        try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* private mode */ }
        if (LOCALES.includes(stored)) return stored

        for (const tag of navigator.languages || [navigator.language || '']) {
            const base = String(tag).toLowerCase().split('-')[0]
            if (LOCALES.includes(base)) return base
        }
        return DEFAULT
    }

    /**
     * Resolve the starting locale and load its catalog. Call once, as early as
     * possible: everything that renders text has to be able to call t()
     * synchronously afterwards.
     *
     * Idempotent, because both the world boot and the Quick Overview want to be
     * sure it has happened and neither knows which of them runs first.
     */
    async init() {
        if (!this._initPromise) this._initPromise = this.setLocale(this.detect(), { persist: false })
        return this._initPromise
    }

    /** Fetch a catalog without switching to it (used to warm the other language). */
    async load(locale) {
        if (!LOADERS[locale]) return null
        if (this._catalogs[locale]) return this._catalogs[locale]
        if (!this._loading[locale]) {
            this._loading[locale] = LOADERS[locale]()
                .then((m) => { this._catalogs[locale] = m.default; return m.default })
                .catch((err) => {
                    console.error(`i18n: could not load "${locale}"`, err)
                    this._loading[locale] = null
                    return null
                })
        }
        return this._loading[locale]
    }

    /**
     * Switch language. Resolves once the catalog is in memory.
     *
     * `persist` is what separates a CHOICE from a DETECTION. Storing the
     * detected locale would freeze it: detect() reads storage first, so a
     * visitor who later switches their browser to another language would keep
     * getting the one guessed on their first visit, for ever, having never
     * asked for it. Only an explicit pick is remembered.
     */
    async setLocale(locale, { persist = true } = {}) {
        if (!LOADERS[locale]) return this.locale
        await this.load(locale)
        // The base catalog backs every lookup, so it has to be resident.
        if (locale !== BASE) await this.load(BASE)

        if (this.locale !== locale) {
            this.locale = locale
            if (persist) {
                try { localStorage.setItem(STORAGE_KEY, locale) } catch { /* private mode */ }
            }
            document.documentElement.lang = locale
            this.trigger('change', [locale])
        }
        return this.locale
    }

    /** The other language — the only thing a two-language toggle needs. */
    other() {
        return LOCALES.find((l) => l !== this.locale) || DEFAULT
    }

    _lookup(catalog, key) {
        let node = catalog
        for (const part of key.split('.')) {
            if (node == null || typeof node !== 'object') return undefined
            node = node[part]
        }
        return node
    }

    /**
     * Translate. Missing keys fall back to the base locale and then to the key
     * itself — a visible key in the UI is a far better bug report than an empty
     * space where a sentence should be.
     */
    t(key, params) {
        let value = this._lookup(this._catalogs[this.locale], key)
        if (value === undefined) value = this._lookup(this._catalogs[BASE], key)
        if (value === undefined) {
            console.warn(`i18n: missing key "${key}" (${this.locale})`)
            return key
        }
        if (typeof value === 'function') return value(params)
        if (typeof value !== 'string') return value
        if (!params) return value
        return value.replace(/\{(\w+)\}/g, (m, name) => (
            params[name] !== undefined ? String(params[name]) : m
        ))
    }

    /**
     * Like t(), but returns undefined for a missing key instead of warning.
     * Used where a catalog entry is an OVERRIDE over data that already lives in
     * a data module — the base language has no entry there on purpose.
     */
    opt(key, params) {
        const value = this._lookup(this._catalogs[this.locale], key)
        if (value === undefined) return undefined
        return this.t(key, params)
    }

    /** Arrays of strings (paragraphs, bullet lists) — always returns an array. */
    list(key) {
        const value = this.t(key)
        return Array.isArray(value) ? value : []
    }
}

export default new I18n()
