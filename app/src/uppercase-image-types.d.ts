/**
 * Uppercase image extension module declarations (V2-01).
 *
 * Astro's `client.d.ts` only declares lowercase image modules (`*.jpg`,
 * `*.png`, …). The real client photos in `src/content/` use uppercase
 * extensions (`.JPG`). Vite/Astro handle these fine at build time, but
 * TypeScript module resolution for the wildcard is case-sensitive, so we
 * mirror the lowercase declarations here for the uppercase variants.
 *
 * `src/content/` is a read-only source asset tree, so renaming the files
 * is not an option. This file is a global script (no top-level imports /
 * exports) so the `declare module` statements are globally ambient.
 */
/// <reference types="astro/client" />

declare module '*.JPG' {
  const metadata: import('astro').ImageMetadata;
  export default metadata;
}
declare module '*.JPEG' {
  const metadata: import('astro').ImageMetadata;
  export default metadata;
}
declare module '*.PNG' {
  const metadata: import('astro').ImageMetadata;
  export default metadata;
}
declare module '*.WEBP' {
  const metadata: import('astro').ImageMetadata;
  export default metadata;
}
declare module '*.AVIF' {
  const metadata: import('astro').ImageMetadata;
  export default metadata;
}
declare module '*.GIF' {
  const metadata: import('astro').ImageMetadata;
  export default metadata;
}
declare module '*.TIFF' {
  const metadata: import('astro').ImageMetadata;
  export default metadata;
}
