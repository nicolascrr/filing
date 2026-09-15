# Fil'ing Broderies — User Stories Backlog

> Status legend: ⬜ Pending | 🔄 In Progress | ✅ Done | ⏸ Blocked

---

## Phase 0 — Project Foundation

### US-01 · Tooling & dependencies install ✅

**As a dev**, I want all required packages installed and configured, so that subsequent work has a stable base.

**Acceptance criteria:**

- `tailwindcss@4` + `@tailwindcss/vite` installed and integrated in `astro.config.mjs`
- `gsap` installed
- `@fontsource/poppins` + `@fontsource/noto-sans` installed
- ESLint + Prettier configured (astro eslint plugin, typescript parser)
- `astro check` (typecheck) configured and passing
- `npm run build` passes
- Default `Welcome.astro` removed
- Scripts added: `lint`, `lint:fix`, `format`, `typecheck`

**Dependencies:** none
**Agent:** Coder | **Complexity:** S | **Priority:** Critical

---

### US-02 · Design tokens & global stylesheet ✅

**As a dev**, I want a token system and base styles, so that luxury neutral palette + typography are consistent.

**Acceptance criteria:**

- `src/styles/tokens.css` defines: colors (white body bg, RGB(50,50,50) footer, neutral placeholder palette, muted gold accent), type scale, spacing rhythm, `--content-max` width var, border-radius, shadows
- `src/styles/global.css` imports tokens + Tailwind + sets body font Noto Sans, headings Poppins
- Semantic base resets (a, img, button)
- `prefers-reduced-motion` media query baseline

**Dependencies:** US-01
**Agent:** Coder | **Complexity:** S | **Priority:** Critical

---

### US-03 · i18n infrastructure (cookie-based) ✅

**As a dev**, I want a cookie-based i18n system, so that all visible text comes from translation files and persists across navigation.

**Acceptance criteria:**

- `src/i18n/config.ts` — default `fr`, supported `[fr, en, it]`
- `src/i18n/getLocale.ts` — reads `locale` cookie server-side via `Astro.cookies`, falls back to `fr`
- `src/i18n/t.ts` — typed translator factory returning `t(key)` with nested key support
- `src/i18n/locales/fr.json`, `en.json`, `it.json` seeded with all Accueil keys (others added per phase)
- Missing key falls back to FR value, then to key string
- `BaseLayout` reads locale and exposes `t` + `locale` to slots via props/Astro.locals
- `<link rel="alternate" hreflang>` tags emitted for SEO

**Dependencies:** US-01
**Agent:** Coder | **Complexity:** M | **Priority:** Critical

---

### US-04 · BaseLayout + head + fonts ✅

**As a user**, I want a consistent document shell, so that every page has correct meta, fonts, and chrome.

**Acceptance criteria:**

- `src/layouts/BaseLayout.astro` renders `<html lang>`, head (title/description from i18n), preloads Poppins/Noto Sans
- Astro `ClientRouter` enabled for view transitions (Barba.js dropped per D2)
- Includes Menu + Footer + `<slot/>`
- Content wrapper uses `--content-max` (except full-width sections)
- `astro:page-load` / `astro:before-swap` event hooks documented for GSAP re-init
- Passes typecheck + lint

**Dependencies:** US-02, US-03
**Agent:** Coder | **Complexity:** M | **Priority:** Critical

---

### US-05 · Placeholder asset pipeline ✅

**As a dev**, I want neutral placeholder assets, so that layout is real before final assets arrive.

**Acceptance criteria:**

- `src/assets/placeholders/` contains SVG/gradient placeholders for: hero video poster, page heroes (Création, Production, Galerie), gallery images (multiple aspect ratios: 1:1, 4:3, 3:2, 16:9, 2:3), logo, embroidery icons (menu trigger, contact, location, social)
- Documented naming convention in `src/assets/README.md`
- Easy swap path documented (replace file, keep import path)
- Timeline placeholder images (10 milestones)
- Value block placeholder logos

**Dependencies:** US-01
**Agent:** Coder | **Complexity:** S | **Priority:** High

---

## Phase 1 — Shared Components

### US-06 · LanguageSwitcher ✅

**As a visitor**, I want to switch FR/EN/IT, so that the site persists my choice.

**Acceptance criteria:**

- Positioned top-left on hero (absolute over hero)
- Renders 3 language options (FR default selected state)
- Click writes `locale` cookie (1 year expiry) and reloads page in chosen locale
- Accessible: button group, `aria-label`, keyboard navigable
- No visible hardcoded text — labels from i18n config
- Elegant minimalist styling matching luxury positioning

**Dependencies:** US-03, US-04
**Agent:** Coder | **Complexity:** S | **Priority:** Critical

---

### US-07 · Footer ✅

**As a visitor**, I want a footer with contact + sitemap, so that I can reach key info.

**Acceptance criteria:**

- Background RGB(50,50,50)
- Logo at top
- "CONTACT" section with embroidery-thread-style SVG lines around label
- 4 icons (mail, adresse, instagram, linkedin) with labels; social links open in new tab (`target="_blank" rel="noopener"`)
- "TRAJET DEPUIS" section with thread-style SVG lines
- 2 items with icon + label: "Gare TGV Lyon Part-Dieu", "Aéroport et Gare TGV Lyon Saint-Exupéry"
- Sitemap listing 4 pages
- Copyright "2026 Fil'ing Broderies. © Tous droits réservés. Fait par Nicolas et Emilie." positioned just before end of screen
- All text from i18n
- Responsive: adapts to mobile while preserving readability

**Dependencies:** US-04, US-05
**Agent:** Coder | **Complexity:** M | **Priority:** High

---

### US-08 · Menu (structure + static) ✅

**As a visitor**, I want a menu, so that I can navigate the 4 pages.

**Acceptance criteria:**

- Trigger = embroidery SVG icon, positioned top-right
- Rotates 90° on hover (CSS transition)
- On click: reveals floating minimalist menu listing Accueil/Création/Production/Galerie (from `src/data/nav.ts`)
- Accessible: button + `aria-expanded`, keyboard navigable, Esc closes, focus trap
- Links respect current locale
- Animation polish (thread spool unwind) deferred to US-21
- Elegant, minimalist floating visual style

**Dependencies:** US-04, US-05
**Agent:** Coder | **Complexity:** M | **Priority:** High

---

### US-09 · ImageCard ✅

**As a visitor**, I want borderless rounded image cards with title, so that I can navigate to Création/Production.

**Acceptance criteria:**

- Props: `title: string`, `image: ImageMetadata`, `href: string`
- Borderless, rounded corners
- Title displayed white at bottom-left corner
- Hover animation: subtle scale + overlay (luxury-appropriate, not excessive)
- Accessible: wrapped in `<a>` with `aria-label`
- Responsive: stacks vertically on mobile

**Dependencies:** US-02, US-05
**Agent:** Coder | **Complexity:** S | **Priority:** High

---

### US-10 · Teaser ✅

**As a visitor**, I want a full-width clickable image with centered text, so that I see a call-to-action.

**Acceptance criteria:**

- Full-width (breaks `--content-max`)
- Props: `title: string`, `url: string`, `image: ImageMetadata`
- Centered text overlay
- Clickable (entire component is a link)
- Accessible: `aria-label`, keyboard focusable
- Subtle hover effect

**Dependencies:** US-02, US-05
**Agent:** Coder | **Complexity:** S | **Priority:** High

---

### US-11 · ValueBlock (logo+title+description) ✅

**As a dev**, I want a reusable block, so that I can compose the values/facts sections.

**Acceptance criteria:**

- Props: `logo: ImageMetadata`, `title: string`, `description: string`, `layout?: 'row' | 'grid-2x2'`
- Horizontal layout by default; `grid-2x2` variant for Production page
- Title supports bold segments (parsed from translation markup)
- Responsive: stacks on mobile
- Text from i18n
- Elegant spacing and typography

**Dependencies:** US-02
**Agent:** Coder | **Complexity:** S | **Priority:** High

---

## Phase 2 — Page Accueil (static structure)

### US-12 · Accueil hero (video) ✅

**As a visitor**, I want a fullscreen looping video hero, so that I land on an immersive luxury intro.

**Acceptance criteria:**

- Headerless (no global header), fullscreen
- Looping muted `playsinline` background video with `poster` image, `preload="metadata"`
- `<source>` for webm + mp4
- Logo top-center
- LanguageSwitcher top-left
- Menu trigger top-right
- Bottom text "BRODERIE DE LUXE DEPUIS 1997" from i18n
- Full-width (no content-max constraint)
- Accessible: video not focusable trap, text in DOM, `aria-hidden` on decorative video

**Dependencies:** US-04, US-05, US-06, US-08
**Agent:** Coder | **Complexity:** M | **Priority:** High

---

### US-13 · Accueil body sections (static) ✅

**As a visitor**, I want intro, services, expertise, timeline, values, teaser, so that I understand the house.

**Acceptance criteria:**

- 2 centered intro paragraphs (with bold segments parsed from i18n)
- 2 ImageCards horizontally: Création → `/creation`, Production → `/production`
- Expertise paragraph (with bold segments)
- Timeline component placeholder (static 10 milestones from `src/data/timeline.ts`, no animation yet)
- 3 ValueBlocks horizontally: Fabrication Française, Entreprise du Patrimoine Vivant, Nos Valeurs
- Teaser component
- Footer
- All text from i18n
- `--content-max` respected except Teaser (full-width)
- Balanced whitespace rhythm between sections

**Dependencies:** US-07, US-09, US-10, US-11
**Agent:** Coder | **Complexity:** M | **Priority:** High

---

## Phase 3 — Page Création

### US-14 · Création page ✅

**As a visitor**, I want the Création page, so that I see the creation expertise.

**Acceptance criteria:**

- Headerless image hero with centered uppercase page name (from i18n)
- 3 intro paragraphs (exact provided content, bold segments parsed)
- GridGallery component (static, `animation="fade"` default)
- 2 ValueBlocks horizontally: "5 Postes de Développements" / "+ de 2000 Références de Couleurs de Fils"
- Footer
- `--content-max` respected except hero
- All text from i18n

**Dependencies:** US-07, US-11, US-15
**Agent:** Coder | **Complexity:** M | **Priority:** Medium

---

## Phase 4 — Page Production

### US-15 · GridGallery (static + lightbox) ✅

**As a visitor**, I want an irregular masonry gallery, so that I can browse images and enlarge one.

**Acceptance criteria:**

- Irregular masonry via CSS Grid + data-driven `row-span`/`col-span` per image
- Prop `animation: 'fade' | 'zoom' | 'slide'` controls reveal animation style
- Click an image enlarges ONLY that image (custom lightbox, no carousel)
- Body scroll locked while lightbox open (`overflow: hidden`)
- Esc closes lightbox, focus trap, `role="dialog"`, `aria-modal`
- Accessible: keyboard navigable, alt text on all images
- Responsive: reflows on mobile
- No external masonry library (CSS Grid approach per D4)

**Dependencies:** US-02, US-05
**Agent:** Coder | **Complexity:** L | **Priority:** High

---

### US-16 · Production page ✅

**As a visitor**, I want the Production page, so that I see the production capacity.

**Acceptance criteria:**

- Headerless image hero with centered uppercase page name
- 2 intro paragraphs (exact provided content, bold segments parsed)
- GridGallery
- 4 ValueBlocks in 2x2 grid: 3200m² / Préparation et Finition / 99 Têtes de Broderie / 3 Machines de Découpe
- SmallCarousel component
- 2 finishing paragraphs (exact provided content, bold segments parsed)
- Footer
- `--content-max` respected except hero
- All text from i18n

**Dependencies:** US-07, US-11, US-15, US-17
**Agent:** Coder | **Complexity:** M | **Priority:** Medium

---

### US-17 · SmallCarousel ✅

**As a visitor**, I want a mouse-wheel-scrollable gallery, so that I can browse production images.

**Acceptance criteria:**

- Mouse wheel scrolls gallery horizontally until last image
- Click image opens enlarged version (lightbox, single image)
- Background page does NOT scroll while fullscreen image open (body scroll lock)
- No autoplay
- Responsive: fallback to swipe on touch devices
- Accessible: keyboard navigable, arrows as fallback
- Smooth animation

**Dependencies:** US-02, US-05
**Agent:** Coder | **Complexity:** M | **Priority:** Medium

---

## Phase 5 — Page Galerie

### US-18 · Galerie page (freeform categories + BigCarousel filtering) ✅

**As a visitor**, I want a freeform layout of 17 category titles, so that I can explore techniques.

**Acceptance criteria:**

- Headerless image hero with centered uppercase page name
- 17 category titles (Traditionnelle, 3D, Cornely, Macramé, Coiling, Perles, Multi-techniques, Sequins, Tuffetage, Smock, Matelassé, Applications, Patchs, All-over, Patchwork, Découpe, Gros fil) in creative freeform layout
- All 17 titles visible without scrolling (within a reasonable area)
- On click: titles animate to top area, BigCarousel appears with that category's images
- Categories are internal state (no URL change, no routes)
- Selecting another category swaps BigCarousel content
- BigCarousel: side arrows navigate, bottom thumbnail preview (others greyed, current color), smooth animation, infinite loop, no autoplay
- Footer
- Accessible: keyboard selectable, `aria-current` on active category
- All text from i18n

**Dependencies:** US-07, US-20
**Agent:** Coder | **Complexity:** XL | **Priority:** Medium

---

## Phase 6 — Advanced Components & Animations

### US-19 · Timeline interactive carousel ✅

**As a visitor**, I want an interactive horizontal timeline, so that I can explore milestones.

**Acceptance criteria:**

- Vertical rounded cards side by side, varying widths
- Active card expands large: year heading + descriptive text + color imagery
- Inactive cards: narrow, grayscale imagery
- Click a card to activate it
- Smooth expand/shrink animation (GSAP Flip)
- Horizontal scroll navigation (Observer/ScrollTrigger)
- No autoplay
- Multiple subtle animations for premium UX
- Responsive: vertical scroll in page flow on mobile
- Accessible: keyboard navigable, `aria-selected` on active

**Dependencies:** US-13
**Agent:** Coder | **Complexity:** XL | **Priority:** Medium

---

### US-29 · Timeline validated interaction rework ✅

**As a visitor**, I want a deterministic, accessible milestone timeline, so that I can explore its visual history with mouse, keyboard, touch, or scroll.

**Acceptance criteria:**

- Nine reusable, translated milestones use the approved years and real local preview images.
- Desktop uses hover/focus ownership outside a pinned, scroll-driven accordion range; all inputs share one active-state controller.
- Touch and smaller screens use native scroll-snap without pinning, while reduced motion keeps every description readable.
- Semantic list items are keyboard focusable, have meaningful image alternatives, and retain content in the DOM.
- Timeline resources are cleaned up across ClientRouter swaps and retain the Home thread anchors.

**Dependencies:** US-13, US-19, US-22, US-24
**Agent:** Coder | **Complexity:** XL | **Priority:** High

---

### US-30 · Timeline desktop selection synchronization ✅

**As a desktop visitor**, I want clicking a milestone to continue the pinned timeline from that point, so that click, keyboard focus, and vertical scroll stay synchronized.

**Acceptance criteria:**

- The desktop row is larger and uses almost all available content width without body overflow.
- Hover does not select milestones; desktop click, focus, and pinned scroll do.
- Clicking synchronizes the physical ScrollTrigger scroll position to the selected index.
- Discrete scroll index changes visibly animate and remain stable during rapid or reverse scrolling.

**Dependencies:** US-29, US-22, US-24
**Agent:** Coder | **Complexity:** L | **Priority:** High

---

### US-20 · BigCarousel ✅

**As a dev**, I want a full carousel, so that I can use it in the Galerie page.

**Acceptance criteria:**

- Side arrows navigate between images
- Bottom thumbnail preview: other thumbnails greyed, current in color
- Smooth animation between images (GSAP)
- Infinite loop
- No autoplay
- Accessible: keyboard navigable (arrows), `aria-roledescription="carousel"`
- Responsive: adapts to mobile
- Props: `images: ImageMetadata[]`, `alt: string[]`

**Dependencies:** US-02
**Agent:** Coder | **Complexity:** L | **Priority:** High (needed for US-18)

---

### US-21 · Menu animation (thread spool) ✅

**As a visitor**, I want the menu to unwind like a thread spool, so that the interaction feels crafted.

**Acceptance criteria:**

- On click: thread-spool SVG unwinds (GSAP animation) and reveals floating minimalist menu
- Reverse animation on close
- Subtle, elegant, luxury-appropriate
- Respects US-08 accessibility (focus trap, Esc, aria)
- Respects `prefers-reduced-motion`

**Dependencies:** US-08
**Agent:** Coder | **Complexity:** L | **Priority:** Medium

---

## Phase 7 — Animations & Page Transitions

### US-22 · GSAP scroll reveals (global) ✅

**As a visitor**, I want subtle scroll-reveal animations, so that the site feels refined.

**Acceptance criteria:**

- Shared `src/scripts/gsap.ts` registers plugins once (ScrollTrigger, SplitText, Flip, Observer, CustomEase)
- Reusable reveal mechanism for sections (fade/translate, subtle, luxury-appropriate)
- Respects `prefers-reduced-motion`
- No layout shift (use `opacity` + `transform`)
- Works after page swap (re-init via `astro:page-load` hook)
- Cleanup via `context.revert()` on `astro:before-swap`

**Dependencies:** US-04
**Agent:** Coder | **Complexity:** M | **Priority:** Medium

---

### US-23 · SplitText headings ✅

**As a visitor**, I want elegant heading reveals, so that typography feels crafted.

**Acceptance criteria:**

- SplitText applied to hero/section headings (char/line reveal, subtle)
- Respects `prefers-reduced-motion`
- Re-runs on page transition (`astro:page-load`)
- Cleanup on `astro:before-swap`

**Dependencies:** US-22
**Agent:** Coder | **Complexity:** M | **Priority:** Low

---

### US-24 · Page transitions ✅

**As a visitor**, I want smooth page transitions, so that navigation feels seamless.

**Acceptance criteria:**

- Astro `ClientRouter` view transitions + GSAP choreography (Barba.js dropped per D2)
- Transition covers content swap elegantly (fade/slide, luxury-appropriate)
- Locale cookie preserved across swap
- Scroll restored appropriately
- Islands re-init correctly
- No FOUC (flash of unstyled content)
- Respects `prefers-reduced-motion`

**Dependencies:** US-04, US-22
**Agent:** Coder | **Complexity:** L | **Priority:** Medium

---

## Phase 8 — Polish, Accessibility, Performance, Responsive QA

### US-25 · Accessibility audit ✅

**As a user with assistive tech**, I want the site accessible, so that I can use it fully.

**Acceptance criteria:**

- Semantic HTML (header/nav/main/footer/article)
- Keyboard reachable for all interactions
- Alt text on all images
- Focus visible
- Dialog focus traps (lightbox, menu)
- Color contrast AA
- `prefers-reduced-motion` respected
- `lang` attribute correct per locale
- axe 0 critical issues

**Dependencies:** all
**Agent:** Tester + Reviewer | **Complexity:** M | **Priority:** High

---

### US-26 · Performance audit ✅

**As a visitor**, I want fast loads, so that luxury feel isn't broken by lag.

**Acceptance criteria:**

- Astro image optimization enabled
- Lazy-load below-fold media
- Video poster + `preload="metadata"`
- Fonts preloaded/subset
- LCP < 2.5s on hero (placeholder)
- No render-blocking scripts
- Lighthouse perf ≥ 90 desktop

**Dependencies:** all
**Agent:** Tester + Reviewer | **Complexity:** M | **Priority:** High

---

### US-27 · Responsive QA ✅

**As a mobile visitor**, I want a usable site, so that I can browse on phone.

**Acceptance criteria:**

- Accueil hero scales correctly
- Création/Production cards stack vertically
- Timeline vertical scroll in flow
- Footer adapts
- Galerie freeform reflows
- All breakpoints verified: 375 / 768 / 1024 / 1440

**Dependencies:** all
**Agent:** Tester | **Complexity:** M | **Priority:** High

---

### US-28 · i18n completeness QA ✅

**As a non-FR visitor**, I want full translations, so that no FR text leaks in EN/IT.

**Acceptance criteria:**

- All 3 JSON files have identical key sets
- No hardcoded visible text in components
- Switch locale on each page and verify
- Missing keys flagged

**Dependencies:** all
**Agent:** Tester + Reviewer | **Complexity:** S | **Priority:** High

---

## Dependency Graph

```
US-01 ─┬─> US-02 ─┐
       ├─> US-03 ─┼─> US-04 ─┬─> US-06
       └─> US-05 ─┘          ├─> US-07 ─┐
                             └─> US-08 ──┤
US-02 ─> US-09 ───────────────────────── ┤
US-02 ─> US-10 ───────────────────────── ─┤
US-02 ─> US-11 ───────────────────────── ─┤
                                          └─> US-12 ─┐
US-07,09,10,11 ─> US-13 ───────────────────────────── ┤
US-02,05 ─> US-15 ─┬─> US-14 (Création)               ┤
                   ├─> US-16 (Production) <+ US-17     ┤
                   └─> US-18 (Galerie) <+ US-20        ┤
US-13 ─> US-19 (Timeline)                              ┤
US-02 ─> US-20 (BigCarousel) ─> US-18                  ┤
US-08 ─> US-21 (Menu anim)                             ┤
US-04 ─> US-22 ─┬─> US-23                              ┤
                └─> US-24                              ┤
                                                       └─> US-25,26,27,28 (parallel QA)
```

---

## Progress Tracking

| Phase        | US    | Status |
| ------------ | ----- | ------ |
| 0 Foundation | US-01 | ✅     |
| 0 Foundation | US-02 | ✅     |
| 0 Foundation | US-03 | ✅     |
| 0 Foundation | US-04 | ✅     |
| 0 Foundation | US-05 | ✅     |
| 1 Shared     | US-06 | ✅     |
| 1 Shared     | US-07 | ✅     |
| 1 Shared     | US-08 | ✅     |
| 1 Shared     | US-09 | ✅     |
| 1 Shared     | US-10 | ✅     |
| 1 Shared     | US-11 | ✅     |
| 2 Accueil    | US-12 | ✅     |
| 2 Accueil    | US-13 | ✅     |
| 3 Création   | US-14 | ✅     |
| 4 Production | US-15 | ✅     |
| 4 Production | US-16 | ✅     |
| 4 Production | US-17 | ✅     |
| 5 Galerie    | US-18 | ✅     |
| 6 Advanced   | US-19 | ✅     |
| 6 Advanced   | US-29 | ✅     |
| 6 Advanced   | US-30 | ✅     |
| 6 Advanced   | US-20 | ✅     |
| 6 Advanced   | US-21 | ✅     |
| 7 Animations | US-22 | ✅     |
| 7 Animations | US-23 | ✅     |
| 7 Animations | US-24 | ✅     |
| 8 QA         | US-25 | ✅     |
| 8 QA         | US-26 | ✅     |
| 8 QA         | US-27 | ✅     |
| 8 QA         | US-28 | ✅     |
