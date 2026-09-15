/**
 * Middleware — Fil'ing Broderies
 *
 * Runs before EVERY request/render. Resolves the active locale from the
 * `locale` cookie and exposes `locale` + `t` on `Astro.locals` so that ALL
 * pages, layouts, and components can read them (regardless of render order).
 *
 * This is the single source of truth for cookie-based i18n (per decision D1).
 * Setting locals here (instead of in BaseLayout) guarantees they are populated
 * before any page/component frontmatter executes — which is required because
 * nested components read `Astro.locals.t` during their own frontmatter.
 */

import { defineMiddleware } from 'astro:middleware';
import { getLocale } from './i18n/getLocale';
import { makeT } from './i18n/t';

export const onRequest = defineMiddleware((context, next) => {
  const locale = getLocale(context);
  context.locals.locale = locale;
  context.locals.t = makeT(locale);
  return next();
});
