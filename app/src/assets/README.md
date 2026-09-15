# `src/assets/` — Asset pipeline

This folder holds **all static assets** for the Fil'ing Broderies website.
Until the client delivers final media, every slot is filled by an elegant
neutral **placeholder** (SVG) so the layout, image optimization, and import
graph are real and verifiable today.

> Brand palette (inlined in every SVG): charcoal `#2b2b2b`, warm white
> `#f8f6f3`, gold `#b8a069`, gold-light `#d4c4a0`, muted `#6b6b6b`,
> border `#e5e3e0`. See `src/styles/tokens.css`.

---

## Folder layout

```
src/assets/
├── hero/            # real hero video + poster (client-supplied later)
├── gallery/         # real gallery photos, organized by technique category
├── icons/           # real embroidery / brand icons (client-supplied later)
├── timeline/        # real milestone photos (client-supplied later)
└── placeholders/    # neutral SVG placeholders (this pipeline, US-05)
    ├── hero-poster.svg
    ├── page-hero-creation.svg
    ├── page-hero-production.svg
    ├── page-hero-galerie.svg
    ├── teaser.svg
    ├── image-card-creation.svg
    ├── image-card-production.svg
    ├── logo.svg
    ├── gallery/
    │   ├── gallery-1-1.svg
    │   ├── gallery-4-3.svg
    │   ├── gallery-3-2.svg
    │   ├── gallery-16-9.svg
    │   ├── gallery-2-3.svg
    │   └── gallery-3-4.svg
    ├── icons/
    │   ├── menu-icon.svg
    │   ├── mail.svg
    │   ├── adresse.svg
    │   ├── instagram.svg
    │   ├── linkedin.svg
    │   ├── gare.svg
    │   ├── aeroport.svg
    │   ├── fabrication.svg
    │   ├── patrimoine.svg
    │   ├── valeurs.svg
    │   ├── creation-fact.svg
    │   ├── couleurs-fact.svg
    │   ├── surface.svg
    │   ├── preparation.svg
    │   ├── tetes.svg
    │   └── decoupe.svg
    └── timeline/
        ├── timeline-1.svg   …  timeline-10.svg
```

---

## Naming convention

| Pattern                       | Meaning                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `hero-poster.svg`             | Hero background video poster (1920×1080).                                                                                 |
| `page-hero-<page>.svg`        | Page hero banner for a given page (1920×600).                                                                             |
| `gallery/gallery-<ratio>.svg` | Gallery image placeholder at a given aspect ratio. Ratio uses `W:H` notation (`1-1`, `4-3`, `3-2`, `16-9`, `2-3`, `3-4`). |
| `image-card-<page>.svg`       | ImageCard placeholder for a page (800×600).                                                                               |
| `teaser.svg`                  | Full-width Teaser placeholder (1920×600).                                                                                 |
| `logo.svg`                    | Brand wordmark placeholder.                                                                                               |
| `icons/<name>.svg`            | UI / chrome icon. 24×24 viewBox for chrome icons; 48×48 for value/fact emblems.                                           |
| `timeline/timeline-<n>.svg`   | Timeline milestone placeholder, portrait 600×800, `n` = 1..10 in chronological order.                                     |

Rules:

- All filenames are **kebab-case**, lowercase, no spaces.
- Aspect-ratio placeholders encode the ratio in the filename so the correct
  variant can be selected by data, not by guessing dimensions.
- Timeline files are numbered in chronological order; the displayed year is
  rendered inside the SVG (1997, 1999, 2002, 2005, 2008, 2012, 2016, 2019,
  2022, 2024).

---

## How to swap a placeholder for a real asset

There are two supported strategies. Pick one and stay consistent.

### Strategy A — Drop-in replacement (preferred)

1. Place the real asset at the **same path and filename** the code already
   imports. For raster photos use `.webp` / `.jpg` / `.png`; for the logo and
   icons keep `.svg`.
   - Example: replace `src/assets/placeholders/gallery/gallery-4-3.svg` with
     a real `src/assets/gallery/creation-traditionnelle-01.webp` **and** update
     the import in the consuming component/data file.
2. Because Astro `<Image>` / `<Picture>` and direct imports resolve from the
   import path, updating the import is enough — no other code changes needed.
3. Delete the now-unused placeholder (or keep it as a fallback).

### Strategy B — Update the import only

1. Drop the real file into the appropriate "real" folder
   (`src/assets/hero/`, `src/assets/gallery/`, `src/assets/icons/`,
   `src/assets/timeline/`).
2. In the component or `src/data/*.ts` file, change the import from the
   placeholder path to the real path.
3. Run `npm run typecheck && npm run build` to confirm the new asset is
   picked up (Astro returns `ImageMetadata` for raster + SVG alike).

> **Tip:** keep placeholders in the repo until every slot is replaced, then
> remove the `placeholders/` folder in a single cleanup commit.

---

## Real assets the client must eventually provide

| Slot                      | Path                                                 | Format             | Notes                                                                                                                                            |
| ------------------------- | ---------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hero background video     | `src/assets/hero/hero-video.mp4` + `hero-video.webm` | MP4 (H.264) + WebM | Looping, muted, `playsinline`, ~10–20s, luxury craftsmanship footage.                                                                            |
| Hero video poster         | `src/assets/hero/hero-poster.jpg` (or `.webp`)       | raster             | First-frame still; replaces `placeholders/hero-poster.svg`.                                                                                      |
| Page hero — Création      | `src/assets/hero/page-hero-creation.jpg`             | raster             | 1920×600 (or larger, 16:5).                                                                                                                      |
| Page hero — Production    | `src/assets/hero/page-hero-production.jpg`           | raster             | 1920×600.                                                                                                                                        |
| Page hero — Galerie       | `src/assets/hero/page-hero-galerie.jpg`              | raster             | 1920×600.                                                                                                                                        |
| Gallery photos            | `src/assets/gallery/<category>/<n>.webp`             | WebP/JPG           | Organized by technique category (Traditionnelle, 3D, Cornely, …). Provide the aspect ratios used by the masonry (1:1, 4:3, 3:2, 16:9, 2:3, 3:4). |
| Logo                      | `src/assets/logo.svg` (or `logo.png`)                | SVG preferred      | Final wordmark; keep proportions close to 400×80.                                                                                                |
| Embroidery / UI icons     | `src/assets/icons/*.svg`                             | SVG                | Replace `menu-icon`, `mail`, `adresse`, `instagram`, `linkedin`, `gare`, `aeroport` with brand-consistent line art (24×24 viewBox).              |
| Value / fact emblems      | `src/assets/icons/*.svg`                             | SVG                | 48×48 emblems: `fabrication`, `patrimoine`, `valeurs`, `creation-fact`, `couleurs-fact`, `surface`, `preparation`, `tetes`, `decoupe`.           |
| Timeline milestone photos | `src/assets/timeline/timeline-<n>.jpg`               | raster             | 10 portraits, 600×800 (or larger portrait), one per milestone year.                                                                              |
| Teaser image              | `src/assets/teaser.jpg`                              | raster             | 1920×600 full-width.                                                                                                                             |
| ImageCard — Création      | `src/assets/image-card-creation.jpg`                 | raster             | 800×600 (4:3).                                                                                                                                   |
| ImageCard — Production    | `src/assets/image-card-production.jpg`               | raster             | 800×600 (4:3).                                                                                                                                   |

> Until these arrive, the placeholders in `src/assets/placeholders/` are the
> single source of truth for layout and image-optimization testing.
