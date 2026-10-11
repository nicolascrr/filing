# Catalogue web derivatives

Run explicitly from `app/` (never automatically during SSR):

```powershell
node scripts/prepare-gallery-media.mjs --inspect
node scripts/prepare-gallery-media.mjs --prepare
```

`--inspect` reads dimensions, hashes and twelve representative paths without
writing media. `--prepare` stages and verifies 741 WebP derivatives, then writes
`src/data/galleryMediaManifest.json`. The manifest records original relative
paths, before/after source SHA-256, derived SHA-256, dimensions and byte counts.
Server IDs and grouping use original paths, not the new `.webp` filenames.

Settings: 4096 px maximum edge, no enlargement, EXIF auto-orientation, WebP quality
90 / effort 5. Metadata including EXIF/GPS is stripped from derivatives only.
Processing is sequential with one libvips thread and bounded cache. Preparation
requires free disk space of twice the source bytes plus 2 GB for staging/build.
These are lossy web versions; the original high-resolution files remain intact.

Re-running uses the same settings and existing manifest ownership checks. Changed
or unowned derivative destinations abort rather than overwrite user data. A source
census differing from 741 images / 137 types / 41 direct files requires review.

Optional one-time cleanup of the raw copies created by LOT C:

```powershell
node scripts/prepare-gallery-media.mjs --prepare --remove-raw
```

This removes only `src/assets/gallery/catalogue/<original-relative-path>` copies
whose SHA-256 equals the source, **after** all derivatives and the persisted
mapping have been verified. It never removes originals, old curated gallery
assets, or directories. All raw candidates are validated before any deletion.

Only `catalogue/web/**/*.webp` is imported by the server catalogue. The mapping
and imported `ImageMetadata` remain server-only; clients receive bounded DTOs
with optimized URLs from Astro `getImage()`.
