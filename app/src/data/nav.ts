/**
 * Navigation items — Fil'ing Broderies
 *
 * Single source of truth for the 4 top-level pages, shared by the Menu
 * (US-08) and the Footer sitemap (US-07). Labels are resolved at render
 * time via the i18n `t()` helper using `labelKey`, so no visible text is
 * hardcoded here (per AGENTS.md "no hardcoded visible text" rule).
 */

export interface NavItem {
  /** i18n key resolving to the visible label (under `common.menu.*`). */
  labelKey: string;
  /** Link target (cookie-based i18n: same URL for every locale). */
  href: string;
}

/** The 4 site pages, in display order. */
export const navItems: NavItem[] = [
  { labelKey: 'common.menu.accueil', href: '/' },
  { labelKey: 'common.menu.creation', href: '/creation' },
  { labelKey: 'common.menu.production', href: '/production' },
  { labelKey: 'common.menu.galerie', href: '/galerie' },
];