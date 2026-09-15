# AGENTS.md — General Instructions for All Agents

> This file provides shared conventions, standards, and constraints for every agent (Coder, Tester, Reviewer, Simplifier) working on the Fil'ing Broderies website.

---

## Project Identity

**Fil'ing Broderies** — Luxury French embroidery manufacturer showcase website.
The design must convey: **luxury, craftsmanship, industrial precision**.
Visual direction: **elegant, minimalist, timeless**. Animations: **premium, smooth, and clearly visible to the user** — slower and more present than v1, but never gaudy. The user must SEE the transitions and feel the craftsmanship.

---

## Tech Stack (Locked)

| Layer            | Technology                                                        | Version                                                                         |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Framework        | Astro                                                             | ^7.1.3 (latest)                                                                 |
| Styling          | Tailwind CSS                                                      | v4 (`@tailwindcss/vite`)                                                        |
| Animations       | GSAP                                                              | latest (core + ScrollTrigger, SplitText, Flip, Observer, CustomEase — all free) |
| Page transitions | Astro `ClientRouter` (View Transitions)                           | Barba.js is **DROPPED**                                                         |
| Fonts            | `@fontsource/poppins` (headings) + `@fontsource/noto-sans` (body) | self-hosted                                                                     |
| i18n             | Manual cookie-based (no URL prefixes)                             | `locale` cookie, default `fr`                                                   |
| Type checking    | `astro check` + TypeScript strict                                 |                                                                                 |
| Linting          | ESLint + Prettier                                                 |                                                                                 |
| Node             | >=22.12.0 (runtime: v24.12)                                       |                                                                                 |

---

## Locked Decisions

| ID  | Decision          | Choice                                                                           |
| --- | ----------------- | -------------------------------------------------------------------------------- |
| D1  | i18n routing      | Cookie-based, no URL prefix                                                      |
| D2  | Page transitions  | Astro `ClientRouter` + GSAP (Barba.js dropped)                                   |
| D3  | Tailwind version  | v4 (Vite plugin)                                                                 |
| D4  | Masonry approach  | CSS Grid + data-driven spans + custom lightbox (no library)                      |
| D5  | Real assets       | Real assets in `src/content/` (videos, photos, pictos) — replace placeholders    |
| D6  | Fonts delivery    | `@fontsource` self-hosted                                                        |
| D7  | BigCarousel usage | Used in Galerie page (category-selected image display)                           |
| D8  | Brand colors      | Neutral palette placeholder (warm white, charcoal, muted gold accent) via tokens |

---

## Architecture

```
src/
├── content/                    # REAL CLIENT ASSETS (read-only source)
│   ├── Médias/
│   │   ├── Showroom/Broderie/  # real photos by category (Traditionnelle, Macramé, ...)
│   │   └── Vidéos/             # hero videos (Vidéo Fil'ing V1-V4.mp4) + Resources/
│   ├── Pictos/                 # real icons (bobine_fils, mail, instagram, gare, ...)
│   └── Textes/                 # text ideas (Idées textes.docx)
├── assets/
│   ├── hero/                   # hero video + poster (copied/optimized from content/)
│   ├── gallery/                # gallery images (by category, from content/)
│   ├── icons/                  # embroidery icons (from content/Pictos/)
│   └── placeholders/           # neutral placeholders (kept as fallback)
├── components/
│   ├── ui/                     # presentational, reusable
│   │   ├── ImageCard.astro
│   │   ├── Teaser.astro
│   │   ├── ValueBlock.astro
│   │   ├── GridGallery.astro
│   │   ├── Timeline.astro
│   │   ├── BigCarousel.astro
│   │   └── SmallCarousel.astro
│   ├── chrome/                 # site chrome
│   │   ├── Menu.astro
│   │   ├── LanguageSwitcher.astro
│   │   └── Footer.astro
│   └── sections/               # page-specific section compositions
│       ├── accueil/Hero.astro
│       └── PageHero.astro      # shared page hero (Création/Production/Galerie)
├── layouts/
│   └── BaseLayout.astro
├── pages/
│   ├── index.astro             # Accueil
│   ├── creation.astro
│   ├── production.astro
│   └── galerie.astro
├── i18n/
│   ├── locales/{fr,en,it}.json
│   ├── config.ts
│   ├── getLocale.ts
│   └── t.ts
├── data/
│   ├── timeline.ts
│   ├── galleryCategories.ts
│   └── nav.ts
├── styles/
│   ├── global.css
│   └── tokens.css
├── scripts/
│   ├── gsap.ts                 # gsap registration + plugin imports (shared)
│   ├── reveals.ts              # scroll-reveal system (data-reveal)
│   ├── splittext.ts            # SplitText heading reveals (data-split)
│   └── main.ts                 # global client entry (loads in BaseLayout)
└── middleware.ts               # i18n locale resolution (sets Astro.locals before render)
```

> **Note:** The `src/scripts/` files listed in v1 (transitions.ts, menu.ts, timeline.ts, gallery.ts, carousels.ts) were NOT created — component logic is inline in each `.astro` `<script>` tag. Page transitions use CSS `::view-transition` keyframes in `global.css`. This is the actual structure; update if it changes.

---

## Coding Standards

### General

- **TypeScript strict** everywhere. No `any` without justification.
- **Semantic HTML** first: `<header>`, `<nav>`, `<main>`, `<footer>`, `<article>`, `<section>`, `<figure>`.
- **No hardcoded visible text** in components. All visible strings come from i18n translation files (`fr.json`, `en.json`, `it.json`).
- **Bold segments** in text are encoded in translation JSON using a markup convention (e.g., `"**bold** text"`) and parsed by a helper that renders `<strong>` tags.
- **Content width**: use `--content-max` CSS variable for constrained sections, but content (text + components) should feel **generously spread** — increase `--content-max` and reduce horizontal padding on large screens so the layout breathes. Only hero and Teaser are full-width. All page heroes (Création/Production/Galerie) must be **fullscreen** like the Accueil hero.
- **Spacing**: balanced, consistent whitespace rhythm. Use design tokens, not magic numbers.
- **Extensibility**: when info is missing, use the simplest elegant implementation and keep the architecture extensible.
- **Responsive**: every component MUST be mobile-first and fully responsive. See the "Responsive Design" section — it is non-negotiable.

### Astro

- Use `.astro` components for all presentational and static work.
- Use `client:load` for interactive islands that need GSAP. Avoid `client:visible` for animated sections (DOM must be present).
- Centralize GSAP init in a single island per page; re-init via `astro:page-load`, cleanup via `context.revert()` on `astro:before-swap`.
- Use Astro `<Image>` / `<Picture>` for image optimization. Import from `src/assets`.
- Use `ClientRouter` from `astro:transitions` in `BaseLayout` for view transitions.

### Tailwind CSS v4

- Import via `@tailwindcss/vite` plugin in `astro.config.mjs`.
- Use `@import "tailwindcss"` in `global.css`.
- Design tokens defined as CSS custom properties in `tokens.css`, consumed via Tailwind `@theme` or direct `var()`.
- Prefer utility classes; extract repeated patterns into `.astro` components, not `@apply` soup.

### GSAP

- Register all plugins once in `src/scripts/gsap.ts`.
- All GSAP animations must respect `prefers-reduced-motion` (check `gsap.matchMedia` or `window.matchMedia`).
- Use `opacity` + `transform` for animations — never animate `width`, `height`, `top`, `left` (causes layout thrash). Exception: Flip plugin handles layout animations internally.
- Use `gsap.context()` for scoping and cleanup. Call `context.revert()` on `astro:before-swap`.
- Animations must be **smooth, slower, and clearly visible** — durations 0.8–1.6s for reveals/transitions (longer than v1), gentle eases (`power2.out`, `power3.out`, `expo.out`), generous distances (40–120px). The user must SEE the motion and feel the craftsmanship. Never gaudy, but never invisible. Page transitions between routes must be smooth and noticeable.

### i18n

- `getLocale.ts` reads `locale` cookie server-side via `Astro.cookies.get('locale')`.
- Default locale: `fr`. Supported: `fr`, `en`, `it`.
- `t(key)` supports nested dot-notation keys (e.g., `t('accueil.hero.title')`).
- Missing key: fall back to FR value, then to the key string itself.
- LanguageSwitcher writes cookie with 1-year expiry, then reloads page.
- Emit `<link rel="alternate" hreflang>` tags for SEO.

### Accessibility (Non-negotiable)

- Semantic HTML preferred.
- All interactive elements keyboard accessible.
- All images have `alt` text (empty `alt=""` for decorative).
- Focus visible at all times.
- Dialogs (lightbox, menu): focus trap, Esc to close, `role="dialog"`, `aria-modal="true"`.
- Color contrast AA minimum.
- `prefers-reduced-motion` respected for all animations.
- `lang` attribute on `<html>` reflects current locale.

### Performance

- Astro image optimization enabled (`<Image>`, `<Picture>`).
- Lazy-load below-fold media (`loading="lazy"`).
- Video: `poster` image, `preload="metadata"`, `muted`, `playsinline`, `loop`.
- Fonts: preloaded, self-hosted via `@fontsource`.
- No render-blocking scripts.
- LCP target: < 2.5s.

---

## Responsive Design (Critical — Non-Negotiable)

**Every component, every section, every page MUST be fully responsive and mobile-adapted.** This is a top priority, equal to luxury positioning and accessibility. A website that is not perfect on mobile is a failed deliverable.

### Mobile-First Approach

- Write styles **mobile-first**: base styles target mobile, then enhance with `sm:`, `md:`, `lg:`, `xl:` breakpoints.
- Never write desktop-only styles and "patch" for mobile afterward.
- Test every component at every breakpoint during development, not as an afterthought.

### Breakpoints (Tailwind defaults, enforced)

| Name  | Width    | Target                          |
| ----- | -------- | ------------------------------- |
| base  | < 640px  | Mobile phones (375px reference) |
| `sm`  | ≥ 640px  | Large phones / small tablets    |
| `md`  | ≥ 768px  | Tablets                         |
| `lg`  | ≥ 1024px | Small desktops                  |
| `xl`  | ≥ 1280px | Large desktops                  |
| `2xl` | ≥ 1536px | Extra-large screens             |

**Reference widths for QA:** 375px, 768px, 1024px, 1440px.

### Responsive Rules Per Component Type

#### Layout & Spacing

- Use `--content-padding: clamp(1.5rem, 5vw, 4rem)` for horizontal padding so it scales fluidly.
- Use `--content-max: 1280px` for constrained content; on mobile this is 100% minus padding.
- Section spacing uses `--space-section: clamp(4rem, 8vw, 8rem)` — scales down on mobile.
- Never use fixed pixel widths on containers. Use `max-width` + `width: 100%` or Tailwind `w-full max-w-*`.
- Grid layouts: use `grid-cols-1` on mobile, expand with `md:grid-cols-2`, `lg:grid-cols-3`, etc.

#### Typography

- All font sizes use `clamp()` fluid values from tokens (e.g., `--text-3xl: clamp(1.875rem, 4vw, 3rem)`).
- Headings must never overflow or break awkwardly on mobile. Use `text-wrap: balance` on headings where appropriate.
- Body text line-height and font-size must remain readable at 375px (minimum 16px body, no zoom on input focus).

#### Hero Sections

- Fullscreen hero on Accueil must work on mobile: video scales with `object-fit: cover`, text remains readable, logo scales down.
- Page heroes (Création, Production, Galerie) must scale height appropriately on mobile (e.g., `h-[50vh] md:h-[60vh] lg:h-[70vh]`).
- Centered title must scale with fluid typography.

#### ImageCard

- **Mobile:** stack vertically (full width, one per row).
- **Tablet+:** two cards side by side horizontally.
- Images use `aspect-ratio` to maintain proportions across breakpoints.

#### Timeline

- **Mobile:** timeline cards scroll vertically within the page flow (no horizontal scroll trap).
- **Desktop:** horizontal interactive carousel as specified.
- Active card expansion must not cause layout jumps on mobile — use a stacked or accordion-style expand on small screens if the horizontal Flip animation is not viable.

#### GridGallery

- **Mobile:** single column or 2-column simple grid (masonry simplification acceptable on small screens).
- **Tablet:** 2–3 column masonry.
- **Desktop:** full irregular masonry with data-driven spans.
- Lightbox must be fullscreen on mobile with touch-friendly close button (large tap target, min 44x44px).

#### BigCarousel

- **Mobile:** thumbnails may be hidden or replaced with dot indicators to save space. Arrows must be large enough for touch (min 44x44px).
- **Desktop:** full thumbnail preview row.
- Swipe gesture support on touch devices.

#### SmallCarousel

- **Mobile:** touch swipe replaces mouse wheel. Scroll snap for each image.
- **Desktop:** mouse wheel scrolls horizontally.
- Lightbox body scroll lock must work on mobile (prevent background scroll on touch).

#### Menu

- **Mobile:** floating menu must be fullscreen or near-fullscreen overlay for easy touch targets.
- Menu trigger button: min 44x44px tap target.
- All menu links: min 44x44px tap target.

#### Footer

- **Mobile:** all sections stack vertically, centered or left-aligned. Icons and labels remain readable.
- **Desktop:** multi-column layout.
- Copyright line remains legible at 375px (may wrap to 2 lines).

#### LanguageSwitcher

- Must be reachable and tappable on mobile (min 44x44px per option).
- Position: top-left of hero, must not overlap with logo or menu trigger on small screens.

### Touch & Interaction

- All interactive elements (buttons, links, carousel arrows, category titles, timeline cards) must have a **minimum touch target of 44x44px**.
- Hover effects must have a touch equivalent (e.g., `:active` state) or be non-essential.
- No interaction should rely solely on hover (hover is enhancement, not requirement).
- Lightboxes and overlays must be dismissible by tapping outside AND by a visible close button AND by Esc key.

### Media

- All images use Astro `<Image>` / `<Picture>` with `srcset` and `sizes` for responsive delivery.
- Gallery and hero images: provide appropriate `sizes` attribute (e.g., `sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 800px"`).
- Video: `object-fit: cover`, `width: 100%`, `height: 100%` within its container.
- Lazy-load all below-fold images (`loading="lazy"`).

### Testing Checklist (mandatory for every component)

Before marking any US as ✅, verify at 375px, 768px, 1024px, and 1440px:

- [ ] No horizontal overflow / scroll
- [ ] Text is readable (no truncation, no overflow, no tiny fonts)
- [ ] Touch targets ≥ 44x44px
- [ ] Images scale correctly (no distortion, no overflow)
- [ ] Layout adapts (stacking, grid changes, spacing scales)
- [ ] Interactive elements work on touch
- [ ] Lightboxes/overlays are usable on mobile
- [ ] No content is inaccessible or hidden on mobile

---

## Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run preview    # Preview production build
npm run lint       # Run ESLint
npm run lint:fix   # Run ESLint with --fix
npm run format     # Run Prettier
npm run typecheck  # Run astro check (TypeScript)
```

---

## Workflow for Agents

1. **Read `UserStories.md`** to find your assigned US and its acceptance criteria.
2. **Check dependencies** — never start a US whose prerequisites are incomplete.
3. **Implement** following the coding standards above.
4. **Self-verify** against acceptance criteria before marking done.
5. **Run** `npm run lint && npm run typecheck && npm run build` — all must pass.
6. **Update `UserStories.md`** — change the US status from ⬜ to ✅ when complete.
7. **Report** what was done, what was verified, and any blockers.

---

## Component Prop Conventions

- Props are typed via TypeScript interfaces in the component frontmatter.
- Required props have no default; optional props have explicit defaults.
- Image props use `ImageMetadata` type (Astro asset import).
- All components accept an optional `class?: string` prop for layout overrides.
- No component renders hardcoded visible text — all strings via `t()` or props.

---

## Translation Key Convention

Keys are nested by page then section:

```json
{
  "accueil": {
    "hero": { "tagline": "BRODERIE DE LUXE DEPUIS 1997" },
    "intro": { "p1": "Forte d'une expérience...", "p2": "Notre mission ?..." }
  },
  "creation": { ... },
  "production": { ... },
  "galerie": { ... },
  "common": { "footer": { ... }, "menu": { ... } }
}
```

Bold segments encoded with `**`:

```json
{
  "p1": "Forte d'une expérience de plus de 30 ans dans la programmation textile, **Fil'ing Broderies**, créée en 1997..."
}
```

Parsed by `parseBold()` helper into `<strong>` tags.

---

## V2 Requirements (User Feedback — Binding)

### Animations (global)

- More animations, smoother and slower. The user must SEE them. Durations 0.8–1.6s, generous distances.
- Smooth, noticeable page transitions between routes.

### SmallCarousel

- No scrollbar visible.
- Auto-scroll on a regular, smooth rhythm. Pause on hover; user can slide manually (works on mobile via touch).
- Wider — almost full screen width.
- Click opens photo in bigger plan (currently broken/ugly — must be fixed, elegant lightbox).
- Lightbox must NOT fix the screen — it centers the picture, and prevents background scroll, but doesn't lock the viewport position.

### BigCarousel

- More original design.
- Mobile: scrollable carousel (swipe).
- Mobile only: click photo to enlarge.
- Better GSAP transitions.
- Arrows must be pretty and working.

### Timeline

- No scrollbar under the component.
- No "zoomed event" mode — everything stays in bar mode (no expand card).
- When the component reaches the middle of the screen, mouse scroll advances one event at a time, each becoming bigger (bigger title + description + larger photo). Clearly larger. All events held on the page (pinned scroll).

### Galleries

- Wider on screen (more width). Detailed feedback after real-photo testing.

### Footer

- Sections "Contact", "Trajet depuis", "Plan du site" displayed VERTICALLY (not horizontally).
- Copyright at the very bottom of the website — reduce space under it.

### All pages

- Content more spread in width (texts + components).

### Home (Accueil)

- "Découvrez notre galerie" teaser: no blank space under it — footer right under.
- GSAP aesthetic: when user scrolls past the hero, an SVG sewing thread is drawn and travels around the sections. At the Timeline section, scissors cut it. After the timeline, a needle restarts the thread until end of page. Thread must NOT overlay images or text. Create the SVGs (thread, scissors, needles).

### Création & Production

- Heroes must be FULLSCREEN (like the home page hero).

### Galerie

- Wider.
- On category click: smooth, LONGER animation to reorder categories to top. Starts slow, accelerates (ease-in). Elegant and aesthetic.

### Menu

- Spool of thread top-right: on click, an unraveling animation displays the menu as a list just under the icon. Smooth, elegant, well-animated.
- Language icons (FR/EN/IT) displayed INSIDE the spool.

### Real assets

- `src/content/` contains real assets (videos, photos, pictos). Replace placeholders with the most sensible real assets. User will refine afterwards.

---

## Non-Negotiables

- Preserve the luxury and craftsmanship positioning.
- Do not create a corporate-looking website.
- Keep animations elegant and subtle.
- Use the provided page structure.
- Use the supplied timeline design.
- Do not invent additional pages.
- Keep all content hardcoded and translation-driven.
- When information is missing, use the simplest elegant implementation and keep the architecture extensible.
- **Every component, section, and page MUST be perfectly responsive and mobile-adapted.** No exceptions.
