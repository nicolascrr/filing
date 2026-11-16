/**
 * i18n configuration — Fil'ing Broderies
 *
 * Cookie-based locale selection (no URL prefixes).
 * Default locale: French. Supported: French, English, Italian.
 */

export const defaultLocale = 'fr' as const;

export const locales = ['fr', 'en', 'it'] as const;

export type Locale = (typeof locales)[number];

/**
 * Validate that a candidate string is a supported locale.
 * Returns the locale if valid, otherwise null.
 */
export function isLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && (locales as readonly string[]).includes(value);
}
