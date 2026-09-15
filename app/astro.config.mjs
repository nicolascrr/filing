// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  // Cookie-based i18n (D1) requires server-rendered pages so that
  // `Astro.cookies.get('locale')` is available on every request.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  vite: {
    plugins: [tailwindcss()],
    // V2-01: the real client photos in `src/content/` use uppercase file
    // extensions (`.JPG`). Vite/rolldown's default asset detection is
    // case-sensitive, so we explicitly include uppercase image extensions
    // here. Astro's own image plugin already uses a case-insensitive regex
    // (`assetRegex` with the `"i"` flag), so once Vite recognises the file
    // as an asset, Astro's `<Image>` optimisation pipeline takes over.
    assetsInclude: [
      '**/*.JPG',
      '**/*.JPEG',
      '**/*.PNG',
      '**/*.WEBP',
      '**/*.AVIF',
      '**/*.GIF',
      '**/*.TIFF',
    ],
  },
});
