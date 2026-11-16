# Canonical gallery inventory

Run explicitly from `app/` (never automatically during SSR):

```powershell
node scripts/prepare-gallery-media.mjs --inspect
node scripts/prepare-gallery-media.mjs --prepare
```

The only media authority is `src/assets/gallery/<category>/…`. Category directory
names, case, accents, internal paths and file bytes must be preserved. No command
reads `src/content/`, `medias/`, or former originals to restore missing media.

`--inspect` reads all canonical prepared WebPs, dimensions, byte counts and SHA-256
hashes, and prints a full inventory without writing anything. Unsupported files,
symlinks, empty categories and logical identity collisions fail explicitly.
Counts, groups and samples are calculated from the actual disk inventory, never
from fixed totals. A group is a category subdirectory or an isolated category file.

`--prepare` performs the same checks and atomically replaces only
`src/data/galleryMediaManifest.json`. It never encodes, copies, deletes or changes
media. Missing files disappear from the index, not from disk; newly supplied
prepared files are indexed without fabricating original metadata. Existing media
must match their recorded hash, bytes and dimensions; changed files require an
explicit provenance review rather than silently inheriting old source metadata.
The obsolete destructive `--remove-raw` option is rejected.

Manifest `destination` paths are relative to `src/assets/gallery/`. `source` is a
stable logical identity used by server group/image IDs, **not** a filesystem input.
Existing identities retain their original filename without the derived `.webp`
suffix. Newly indexed `*.JPG.webp` / `*.PNG.webp` follow that same convention;
native WebP names retain their extension. The former `web/` destination prefix is
accepted only when matching existing entries during migration. Historical
`source*` fields and encoding `settings` describe the earlier preparation; they
are retained for verified derivatives, not presented as fresh original-file checks.
Source summary fields are omitted if any new entry has no historical metadata.

The server imports `gallery/**/*.webp`; its category mapping and translated labels
must match the populated physical directories. Update `galleryCategories.ts` and
locale labels deliberately when categories change. Unmapped/empty categories or
incomplete import coverage fail at server initialization. IDs, API DTOs, optimized
responsive images and zoom-on-intent remain unchanged. The version fingerprint
includes logical IDs, destination paths, hashes and ordered category definitions.
