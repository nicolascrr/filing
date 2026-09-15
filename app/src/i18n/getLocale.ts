/**
 * Server-side locale resolution — Fil'ing Broderies
 *
 * Reads the `locale` cookie via Astro.cookies. Falls back to the default
 * locale (fr) when the cookie is absent or invalid.
 *
 * Per decision D1, locale is cookie-based (no URL prefixes).
 */

import { defaultLocale, isLocale, type Locale } from './config';

/** Minimal shape needed to read the locale cookie (Astro global or middleware context). */
interface CookieReader {
  cookies: {
    get(name: string): { value: string } | undefined;
  };
}

/**
 * Resolve the active locale from the request's `locale` cookie.
 *
 * @param astro - The Astro global or middleware context (provides `cookies`).
 * @returns The resolved Locale (validated), defaulting to `defaultLocale`.
 */
export function getLocale(astro: CookieReader): Locale {
  const cookieValue = astro.cookies.get('locale')?.value ?? null;
  return isLocale(cookieValue) ? cookieValue : defaultLocale;
}