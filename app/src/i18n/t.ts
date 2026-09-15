/**
 * Translation utilities — Fil'ing Broderies
 *
 * - `makeT(locale)` returns a `t(key)` function supporting nested dot-notation.
 * - Missing keys fall back to the FR value, then to the key string itself.
 * - `parseBold(text)` converts `**bold**` markup into `<strong>` HTML.
 */

import { defaultLocale, type Locale } from './config';
import fr from './locales/fr.json';
import en from './locales/en.json';
import it from './locales/it.json';

/** Dictionary of all locale translation tables. */
const dictionaries: Record<Locale, Record<string, unknown>> = {
  fr: fr as Record<string, unknown>,
  en: en as Record<string, unknown>,
  it: it as Record<string, unknown>,
};

/**
 * Resolve a nested dot-notation key within an object.
 * Returns `undefined` if any segment is missing.
 */
function resolvePath(obj: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, segment) => {
    if (acc !== null && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

/**
 * Create a translator function bound to a specific locale.
 *
 * Lookup order:
 *   1. Active locale dictionary
 *   2. FR fallback dictionary
 *   3. The key string itself
 */
export function makeT(locale: Locale) {
  const primary = dictionaries[locale];
  const fallback = dictionaries[defaultLocale];

  return function t(key: string): string {
    const primaryValue = resolvePath(primary, key);
    if (typeof primaryValue === 'string') {
      return primaryValue;
    }

    const fallbackValue = resolvePath(fallback, key);
    if (typeof fallbackValue === 'string') {
      return fallbackValue;
    }

    // Last resort: return the key itself so missing keys are visible.
    return key;
  };
}

/** Convenience type for the translator function returned by `makeT`. */
export type Translator = ReturnType<typeof makeT>;

/**
 * Parse `**bold**` markup into HTML `<strong>` tags.
 *
 * Used with `set:html` in Astro templates to render bold segments
 * encoded in translation JSON (per AGENTS.md convention).
 *
 * Escapes `<`, `>`, `&` to prevent injection, then converts `**...**`
 * segments to `<strong>...</strong>`. Preserves `\n` as `<br>`.
 *
 * @returns A string of HTML safe to use with `set:html`.
 */
export function parseBold(text: string): string {
  // Escape HTML-sensitive characters first to avoid injection.
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert `**bold**` segments to <strong> tags.
  const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Preserve explicit newlines from the translation files.
  return withBold.replace(/\n/g, '<br />');
}