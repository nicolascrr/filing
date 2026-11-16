import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import { galleryCategories } from '../data/galleryCategories';
import mediaManifest from '../data/galleryMediaManifest.json';
import type { GalleryCard, GalleryManifest, GalleryPhoto } from '../data/galleryTypes';

// Literal glob is resolved by Astro/Vite at build time, never by request paths.
const assets = import.meta.glob<{ default: ImageMetadata }>('../assets/gallery/**/*.webp');
const prefix = '../assets/gallery/';
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'variant' });
interface Media {
  id: string;
  path: string;
}
interface Sample {
  id: string;
  name: string;
  root: boolean;
  images: Media[];
}
export const catalogue = galleryCategories.map((category) => {
  const groups = new Map<string, Sample>();
  for (const entry of [...mediaManifest.entries].sort((a, b) =>
    natural.compare(a.source, b.source),
  )) {
    const path = `${prefix}${entry.destination}`;
    if (!assets[path]) throw new Error(`Missing prepared gallery asset: ${entry.destination}`);
    const relative = entry.source;
    const [folder, ...parts] = relative.split('/');
    if (folder !== category.folder) continue;
    const root = parts.length === 1;
    const name = parts[0];
    const id = `${category.key}/${root ? 'file' : 'folder'}:${name}`;
    let sample = groups.get(id);
    if (!sample) {
      sample = { id, name, root, images: [] };
      groups.set(id, sample);
    }
    sample.images.push({ id: `${category.key}/${parts.join('/')}`, path });
  }
  const types = [...groups.values()].sort(
    (a, b) => Number(a.root) - Number(b.root) || natural.compare(a.name, b.name),
  );
  if (!types.length) throw new Error(`Empty gallery category: ${category.folder}`);
  return { ...category, types };
});
const indexedImages = catalogue.reduce(
  (count, category) =>
    count + category.types.reduce((sum, sample) => sum + sample.images.length, 0),
  0,
);
if (indexedImages !== mediaManifest.count || Object.keys(assets).length !== mediaManifest.count) {
  throw new Error('Prepared gallery mapping/import coverage mismatch');
}
// Physical paths and category membership/order also invalidate client caches.
let hash = 2166136261;
for (const value of [
  ...galleryCategories.map((category) => `${category.key}:${category.folder}:${category.labelKey}`),
  ...mediaManifest.entries.map(
    (entry) => `${entry.source}:${entry.destination}:${entry.destinationSha256}`,
  ),
]) {
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
}
export const catalogueVersion = `catalogue-v3-${(hash >>> 0).toString(36)}`;
type Translate = (key: string) => string;
const sizes = '(max-width: 639px) 90vw, (max-width: 1023px) 45vw, 30vw';

async function photo(
  media: Media,
  alt: string,
  variant: 'cover' | 'active' | 'zoom' | 'thumb',
): Promise<GalleryPhoto> {
  const source = (await assets[media.path]()).default;
  const limit =
    variant === 'thumb' ? 160 : variant === 'cover' ? 800 : variant === 'active' ? 1600 : 4096;
  const width = Math.min(source.width, limit);
  const widths =
    variant === 'zoom'
      ? [width]
      : [...new Set([Math.min(width, 400), Math.min(width, 800), width])];
  const optimized = await getImage({
    src: source,
    width,
    widths,
    sizes: variant === 'thumb' ? '64px' : variant === 'cover' ? sizes : '90vw',
    format: 'webp',
    quality: variant === 'zoom' || variant === 'active' ? 90 : 80,
  });
  return {
    id: media.id,
    src: optimized.src,
    srcset: optimized.srcSet.attribute,
    sizes: variant === 'thumb' ? '64px' : variant === 'cover' ? sizes : '90vw',
    width,
    height: Math.round((source.height * width) / source.width),
    alt,
  };
}

export async function galleryManifest(
  params: URLSearchParams,
  locale: string,
  t: Translate,
): Promise<GalleryManifest> {
  const rawSeed = params.get('seed');
  const seed =
    rawSeed && /^\d{1,10}$/.test(rawSeed) && Number(rawSeed) <= 4294967295
      ? rawSeed
      : String(Math.floor(Math.random() * 4294967296));
  const categories = catalogue.map((c) => ({
    key: c.key,
    label: t(c.labelKey),
    typeCount: c.types.length,
    imageCount: c.types.reduce((n, s) => n + s.images.length, 0),
  }));
  const result: GalleryManifest = {
    version: catalogueVersion,
    locale,
    seed,
    mode: 'overview',
    categories,
    cards: [],
  };
  const category = catalogue.find((c) => c.key === params.get('category'));
  const label = (c: (typeof catalogue)[number], s: Sample) =>
    `${t(s.root ? 'ui.gallery.sample' : 'ui.gallery.type')} ${s.root ? c.types.indexOf(s) + 1 : s.name}`;
  const alt = (c: (typeof catalogue)[number], s: Sample, m: Media) =>
    t('galerie.images.sample')
      .replace('{category}', t(c.labelKey))
      .replace('{number}', String(s.images.indexOf(m) + 1));
  const card = async (
    c: (typeof catalogue)[number],
    s: Sample,
    m: Media,
  ): Promise<GalleryCard> => ({
    category: c.key,
    type: s.id,
    image: m.id,
    label: label(c, s),
    categoryLabel: t(c.labelKey),
    imageCount: s.images.length,
    photo: await photo(m, alt(c, s, m), 'cover'),
  });
  if (category) {
    result.mode = 'category';
    result.category = category.key;
    result.types = category.types.map((s) => ({
      id: s.id,
      label: label(category, s),
      imageCount: s.images.length,
    }));
    const sample = category.types.find((s) => s.id === params.get('type'));
    if (sample) {
      result.mode = 'type';
      result.type = sample.id;
      result.images = sample.images.map((m) => ({ id: m.id, alt: alt(category, sample, m) }));
      const selected = sample.images.find((m) => m.id === params.get('image'));
      const media = selected ?? sample.images[0];
      if (selected) result.mode = 'image';
      result.active = await photo(
        media,
        alt(category, sample, media),
        selected && params.get('zoom') === '1' ? 'zoom' : 'active',
      );
      if (params.get('zoom') !== '1') {
        const index = sample.images.indexOf(media);
        const start = Math.max(0, Math.min(index - 2, sample.images.length - 5));
        result.thumbnails = await Promise.all(
          sample.images
            .slice(start, start + 5)
            .map((m) => photo(m, alt(category, sample, m), 'thumb')),
        );
      }
    } else {
      result.cards = await Promise.all(category.types.map((s) => card(category, s, s.images[0])));
    }
  } else {
    // Shuffle groups, never their images: the first image is always the cover.
    let state = Number(seed) >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const eligible = catalogue.flatMap((c) => c.types.map((s) => ({ c, s })));
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    result.cards = await Promise.all(
      eligible.slice(0, 18).map(({ c, s }) => card(c, s, s.images[0])),
    );
  }
  return result;
}
