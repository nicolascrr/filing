# Fil'ing Broderies — User Stories Backlog V2 (Feedback Round 1)

> Status legend: ⬜ Pending | 🔄 In Progress | ✅ Done | ⏸ Blocked
> These US are based on user feedback after V1 review. They refine/replace behavior of existing components.

---

## Phase V2-A — Real Assets Integration

### V2-01 · Integrate real assets from src/content/ ⬜
**As a visitor**, I want real photos/videos/icons, so that the site shows actual Fil'ing Broderies work.

**Acceptance criteria:**
- Hero video: copy one of `src/content/Médias/Vidéos/Vidéo Fil'ing V*.mp4` to `public/hero-video.mp4` (+ convert/provide `.webm` if possible, else mp4 only is OK).
- Gallery photos: for the 10 categories that have real photos in `src/content/Médias/Showroom/Broderie/` (Traditionnelle, Macramé, Matelassé, Multi-techniques, Patchs, Patchwork, Perles, Sequins, Smock, Tuffetage), import a sensible selection (6–12 per category) into `src/data/galleryCategories.ts`. Categories without real photos keep placeholders.
- Icons: replace placeholder icons with real pictos from `src/content/Pictos/` (bobine_fils for menu, mail, adresse, instagram, linkedin, gare, aeroport, made_in_france, valeurs, developpement, superficie, finition, tete_machine, decoupe). Use `italy.png` + `united-kingdom.png` for language switcher flags.
- ValueBlock logos: use `made_in_france.png`, `valeurs.png`, and a patrimoine-appropriate picto.
- Astro `<Image>` optimization handles the large JPGs (resize/compress at build).
- Build + typecheck + lint pass.

**Dependencies:** none
**Agent:** Coder | **Complexity:** M | **Priority:** High

---

## Phase V2-B — Animation & Transition Overhaul

### V2-02 · Slower, smoother, more visible animations (global) ⬜
**As a visitor**, I want to clearly SEE the animations, so that the craftsmanship feel is tangible.

**Acceptance criteria:**
- All GSAP reveal durations increased to 0.8–1.6s (from current 0.6–0.8s).
- Reveal distances increased to 40–120px (from 20–50px).
- Eases use `power2.out`, `power3.out`, `expo.out` for premium feel.
- Page transitions (view transitions) are smooth and noticeable (longer duration, elegant choreography).
- `prefers-reduced-motion` still respected.
- No gaudy effects — elegant and slow.

**Dependencies:** none
**Agent:** Coder | **Complexity:** M | **Priority:** High

---

### V2-03 · Smooth page transitions between routes ⬜
**As a visitor**, I want smooth page transitions, so that navigation feels seamless and premium.

**Acceptance criteria:**
- View transitions between routes are clearly visible (not a quick fade).
- Elegant choreography (e.g., overlay sweep or content slide + fade), 0.6–1.0s.
- Works with Astro ClientRouter.
- Locale cookie preserved.
- Islands re-init correctly.
- `prefers-reduced-motion` respected.

**Dependencies:** V2-02
**Agent:** Coder | **Complexity:** M | **Priority:** High

---

## Phase V2-C — Component Reworks

### V2-04 · SmallCarousel rework ⬜
**As a visitor**, I want a smooth auto-scrolling wide carousel with a working lightbox.

**Acceptance criteria:**
- No scrollbar visible (hide scrollbar CSS).
- Auto-scroll on a regular, smooth rhythm (GSAP-driven, continuous). Pause on hover; user can slide manually (touch/drag works on mobile).
- Wider — almost full screen width (break `--content-max`).
- Click opens photo in a bigger plan: elegant lightbox, centered, NOT fixing the screen position (no `position: fixed` viewport lock — center the picture, prevent background scroll, but don't lock viewport).
- Lightbox is beautiful (not the current ugly version).
- Responsive + accessible.

**Dependencies:** V2-01 (real photos)
**Agent:** Coder | **Complexity:** L | **Priority:** High

---

### V2-05 · BigCarousel rework ⬜
**As a visitor**, I want a more original, smooth carousel with working arrows and mobile enlarge.

**Acceptance criteria:**
- More original design (not a generic carousel — refined visual treatment).
- Mobile: scrollable carousel via swipe.
- Mobile only: click photo to enlarge (lightbox).
- Better GSAP transitions between images (smooth, slower).
- Arrows are pretty and working (elegant custom arrow design, functional).
- Desktop: arrows + thumbnail strip as before but refined.

**Dependencies:** V2-01
**Agent:** Coder | **Complexity:** L | **Priority:** High

---

### V2-06 · Timeline rework (pinned scroll, bar mode) ⬜
**As a visitor**, I want a pinned-scroll timeline where mouse scroll advances one event at a time, each growing larger.

**Acceptance criteria:**
- No scrollbar under the component.
- No "zoomed event" / expand-card mode — everything stays in bar mode.
- When the component reaches the middle of the screen, the section PINS (ScrollTrigger pin). Mouse scroll then advances one event at a time.
- Each advancing event becomes clearly larger (bigger title + description + larger photo). Clearly larger — visible size difference.
- All events held on the page (pinned scroll, no horizontal scroll trap).
- Smooth GSAP transitions between events.
- Responsive: on mobile, a sensible fallback (vertical scroll with growing active card).
- `prefers-reduced-motion` respected.

**Dependencies:** V2-02
**Agent:** Coder | **Complexity:** XL | **Priority:** High

---

### V2-07 · GridGallery wider ⬜
**As a visitor**, I want the galleries wider on screen.

**Acceptance criteria:**
- GridGallery breaks `--content-max` or uses a much wider max (almost full width).
- Masonry still irregular and elegant.
- Responsive.
- (Detailed feedback after real-photo testing — this is the first pass.)

**Dependencies:** V2-01
**Agent:** Coder | **Complexity:** S | **Priority:** Medium

---

## Phase V2-D — Layout & Page Adjustments

### V2-08 · Content width more spread (all pages) ⬜
**As a visitor**, I want content more spread in width (texts + components).

**Acceptance criteria:**
- Increase `--content-max` (e.g., 1400–1600px) and reduce horizontal padding on large screens.
- Text blocks and components feel generously spread, not cramped.
- Responsive — mobile padding stays comfortable.

**Dependencies:** none
**Agent:** Coder | **Complexity:** S | **Priority:** High

---

### V2-09 · Footer sections vertical + copyright at bottom ⬜
**As a visitor**, I want footer sections stacked vertically and copyright at the very bottom.

**Acceptance criteria:**
- "Contact", "Trajet depuis", "Plan du site" sections displayed VERTICALLY (stacked, not horizontal columns).
- Copyright "2026 Fil'ing Broderies..." at the very bottom of the website.
- Reduce space under the copyright (minimal bottom padding).
- Responsive.

**Dependencies:** none
**Agent:** Coder | **Complexity:** S | **Priority:** Medium

---

### V2-10 · Home teaser no blank space + footer right under ⬜
**As a visitor**, I want no blank space under the "Découvrez notre galerie" teaser — footer right under.

**Acceptance criteria:**
- Remove any extra spacing/margin between the Teaser and the Footer on the Accueil page.
- Footer sits immediately under the teaser.

**Dependencies:** V2-09
**Agent:** Coder | **Complexity:** S | **Priority:** Medium

---

### V2-11 · Création & Production heroes fullscreen ✅
**As a visitor**, I want the Création and Production page heroes to be fullscreen like the home page.

**Acceptance criteria:**
- PageHero component height changes from `h-[50vh] md:h-[60vh] lg:h-[70vh]` to fullscreen (`100svh`/`100vh`).
- Applies to Création, Production, and Galerie heroes.
- Title centered, responsive.
- Menu trigger + scroll cue visible.

**Dependencies:** none
**Agent:** Coder | **Complexity:** S | **Priority:** High

---

### V2-12 · Galerie wider + category reorder animation ⬜
**As a visitor**, I want the Galerie wider, with a smooth, longer, ease-in animation when reordering categories to top.

**Acceptance criteria:**
- Galerie content area wider (break `--content-max` or wider max).
- On category click: smooth, LONGER animation to reorder categories to top.
- Animation starts slow, accelerates over time (ease-in / `power2.in` or `expo.in`).
- Elegant and aesthetic.
- Responsive.

**Dependencies:** V2-08
**Agent:** Coder | **Complexity:** M | **Priority:** Medium

---

## Phase V2-E — Menu & Language Switcher

### V2-13 · Menu unraveling animation + list under icon ✅
**As a visitor**, I want the menu to unravel from the spool and display as a list just under the icon.

**Acceptance criteria:**
- On click: thread-spool unraveling animation (GSAP).
- Menu displays as an elegant list just under the icon (not a centered floating panel).
- Smooth, elegant, well-animated.
- Accessibility preserved (focus trap, Esc, aria).
- `prefers-reduced-motion` respected.

**Dependencies:** none
**Agent:** Coder | **Complexity:** M | **Priority:** High

---

### V2-14 · Language icons inside the spool ⬜
**As a visitor**, I want the FR/EN/IT language icons displayed inside the menu spool.

**Acceptance criteria:**
- Language switcher (FR/EN/IT) is displayed INSIDE the menu spool/panel (not as a separate top-left control on the hero).
- Uses real flag icons from `src/content/Pictos/` (`italy.png`, `united-kingdom.png`, + a FR indicator).
- Accessible, tappable, elegant.
- Remove the standalone LanguageSwitcher from the hero (it moves into the menu).

**Dependencies:** V2-13, V2-01
**Agent:** Coder | **Complexity:** M | **Priority:** High

---

## Phase V2-F — Home Sewing Thread Animation

### V2-15 · SVG sewing thread animation (Home) ⬜
**As a visitor**, I want an SVG sewing thread that draws and travels around sections as I scroll, with scissors cutting it at the Timeline and a needle restarting it after.

**Acceptance criteria:**
- Create SVG assets: sewing thread (a curvy path), scissors, needle.
- When user scrolls past the hero, the thread begins to draw (GSAP DrawSVG-like via `stroke-dashoffset`) and travels around the sections.
- At the Timeline section, scissors animate (close) and "cut" the thread.
- After the timeline, a needle appears and restarts the thread until the end of the page.
- Thread must NOT overlay images or text — it travels in the whitespace/margins.
- Smooth, elegant, luxury-appropriate.
- `prefers-reduced-motion` respected (thread static or absent).
- Responsive (thread path adapts or hides on mobile if too complex).

**Dependencies:** V2-02
**Agent:** Coder | **Complexity:** XL | **Priority:** Medium

---

## Phase V2-G — QA

### V2-16 · V2 responsive + animation QA ⬜
**Verify all V2 changes at 375/768/1024/1440 + animation smoothness.**

**Acceptance criteria:**
- All components responsive.
- Animations smooth and visible.
- Build/typecheck/lint pass.
- Runtime smoke test all routes.

**Dependencies:** all V2 US
**Agent:** Tester + Reviewer | **Complexity:** M | **Priority:** High

---

## Dependency Graph

```
V2-01 (assets) ─┬─> V2-04 (SmallCarousel)
                ├─> V2-05 (BigCarousel)
                ├─> V2-07 (gallery wider)
                └─> V2-14 (lang icons)
V2-02 (anim) ─┬─> V2-03 (page transitions)
              ├─> V2-06 (Timeline)
              └─> V2-15 (sewing thread)
V2-08 (width) ─> V2-12 (Galerie wider)
V2-09 (footer) ─> V2-10 (teaser spacing)
V2-13 (menu) ─> V2-14 (lang icons)
V2-11 (heroes fullscreen) — independent
```

---

## Progress Tracking

| US | Status |
|----|--------|
| V2-01 | ⬜ |
| V2-02 | ⬜ |
| V2-03 | ⬜ |
| V2-04 | ⬜ |
| V2-05 | ⬜ |
| V2-06 | ⬜ |
| V2-07 | ⬜ |
| V2-08 | ⬜ |
| V2-09 | ⬜ |
| V2-10 | ⬜ |
| V2-11 | ✅ |
| V2-12 | ⬜ |
| V2-13 | ✅ |
| V2-14 | ⬜ |
| V2-15 | ⬜ |
| V2-16 | ⬜ |