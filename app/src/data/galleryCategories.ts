/**
 * Gallery categories — US-18 / V2-01
 *
 * Single source of truth for the 17 Galerie categories. Each entry maps a
 * stable category key to:
 *   - `labelKey`: the i18n key resolving to the visible label
 *     (under `galerie.categories.*`).
 *   - `images`: ordered assets with translation metadata resolved by the page
 *     the BigCarousel when that category is selected.
 *
 * V2-01 — Real assets integration:
 *   10 of the 17 categories now use real photos from
 *   `src/content/Médias/Showroom/Broderie/<category>/` (Traditionnelle,
 *   Macramé, Matelassé, Multi-techniques, Patchs, Patchwork, Perles,
 *   Sequins, Smock, Tuffetage). A curated selection of 8 photos per
 *   category is imported (Astro `<Image>` optimizes/resizes them at build).
 *   The 7 categories without real photos (3D, Cornely, Coiling,
 *   Applications, All-over, Découpe, Gros fil) keep the neutral placeholder
 *   SVGs.
 *
 * Alt text and visible captions are resolved from locale keys at render time.
 */

import type { ImageMetadata } from 'astro';

// ---- Placeholder gallery assets (used by the 7 categories without photos) ----
import gallery11 from '../assets/placeholders/gallery/gallery-1-1.svg';
import gallery169 from '../assets/placeholders/gallery/gallery-16-9.svg';
import gallery23 from '../assets/placeholders/gallery/gallery-2-3.svg';
import gallery32 from '../assets/placeholders/gallery/gallery-3-2.svg';
import gallery34 from '../assets/placeholders/gallery/gallery-3-4.svg';
import gallery43 from '../assets/placeholders/gallery/gallery-4-3.svg';

// ---- Real photos: Traditionnelle ----
import trad1 from '../content/Médias/Showroom/Broderie/Traditionnelle/P1000416.JPG';
import trad2 from '../content/Médias/Showroom/Broderie/Traditionnelle/P1000417.JPG';
import trad3 from '../content/Médias/Showroom/Broderie/Traditionnelle/P1000419.JPG';
import trad4 from '../content/Médias/Showroom/Broderie/Traditionnelle/P1000420.JPG';
import trad5 from '../content/Médias/Showroom/Broderie/Traditionnelle/P1000425.JPG';
import trad6 from '../content/Médias/Showroom/Broderie/Traditionnelle/P1000427.JPG';
import trad7 from '../content/Médias/Showroom/Broderie/Traditionnelle/P1000486.JPG';
import trad8 from '../content/Médias/Showroom/Broderie/Traditionnelle/P1000487.JPG';

// ---- Real photos: Macramé ----
import macr1 from '../content/Médias/Showroom/Broderie/Macramé/P1000672.JPG';
import macr2 from '../content/Médias/Showroom/Broderie/Macramé/P1000673.JPG';
import macr3 from '../content/Médias/Showroom/Broderie/Macramé/P1000674.JPG';
import macr4 from '../content/Médias/Showroom/Broderie/Macramé/P1000675.JPG';
import macr5 from '../content/Médias/Showroom/Broderie/Macramé/P1000676.JPG';
import macr6 from '../content/Médias/Showroom/Broderie/Macramé/P1000677.JPG';
import macr7 from '../content/Médias/Showroom/Broderie/Macramé/P1000678.JPG';
import macr8 from '../content/Médias/Showroom/Broderie/Macramé/P1000679.JPG';

// ---- Real photos: Matelassé ----
import mat1 from '../content/Médias/Showroom/Broderie/Matelassé/DSC_0278.JPG';
import mat2 from '../content/Médias/Showroom/Broderie/Matelassé/DSC_0283.JPG';
import mat3 from '../content/Médias/Showroom/Broderie/Matelassé/DSC_0349.JPG';
import mat4 from '../content/Médias/Showroom/Broderie/Matelassé/DSC_0350.JPG';
import mat5 from '../content/Médias/Showroom/Broderie/Matelassé/IMG_8744.JPG';
import mat6 from '../content/Médias/Showroom/Broderie/Matelassé/P1000872.JPG';
import mat7 from '../content/Médias/Showroom/Broderie/Matelassé/P1000873.JPG';
import mat8 from '../content/Médias/Showroom/Broderie/Matelassé/P1000874.JPG';

// ---- Real photos: Multi-techniques ----
import multi1 from '../content/Médias/Showroom/Broderie/Multi-techniques/DSC_0076.JPG';
import multi2 from '../content/Médias/Showroom/Broderie/Multi-techniques/DSC_0108.JPG';
import multi3 from '../content/Médias/Showroom/Broderie/Multi-techniques/DSC_0422.JPG';
import multi4 from '../content/Médias/Showroom/Broderie/Multi-techniques/DSC_0654.JPG';
import multi5 from '../content/Médias/Showroom/Broderie/Multi-techniques/DSC_0658.JPG';
import multi6 from '../content/Médias/Showroom/Broderie/Multi-techniques/IMG_7009.JPG';
import multi7 from '../content/Médias/Showroom/Broderie/Multi-techniques/P1000062.JPG';
import multi8 from '../content/Médias/Showroom/Broderie/Multi-techniques/P1000063.JPG';

// ---- Real photos: Patchs ----
import patchs1 from '../content/Médias/Showroom/Broderie/Patchs/DSC_0032.JPG';
import patchs2 from '../content/Médias/Showroom/Broderie/Patchs/DSC_0247.JPG';
import patchs3 from '../content/Médias/Showroom/Broderie/Patchs/P1001224.JPG';
import patchs4 from '../content/Médias/Showroom/Broderie/Patchs/P1001225.JPG';
import patchs5 from '../content/Médias/Showroom/Broderie/Patchs/P1001226.JPG';
import patchs6 from '../content/Médias/Showroom/Broderie/Patchs/P1001227.JPG';
import patchs7 from '../content/Médias/Showroom/Broderie/Patchs/P1001228.JPG';
import patchs8 from '../content/Médias/Showroom/Broderie/Patchs/P1001229.JPG';

// ---- Real photos: Patchwork ----
import patchw1 from '../content/Médias/Showroom/Broderie/Patchwork/P1000686.JPG';
import patchw2 from '../content/Médias/Showroom/Broderie/Patchwork/P1000687.JPG';
import patchw3 from '../content/Médias/Showroom/Broderie/Patchwork/P1000688.JPG';
import patchw4 from '../content/Médias/Showroom/Broderie/Patchwork/P1000689.JPG';
import patchw5 from '../content/Médias/Showroom/Broderie/Patchwork/P1000690.JPG';
import patchw6 from '../content/Médias/Showroom/Broderie/Patchwork/P1000691.JPG';
import patchw7 from '../content/Médias/Showroom/Broderie/Patchwork/P1000692.JPG';
import patchw8 from '../content/Médias/Showroom/Broderie/Patchwork/P1000693.JPG';

// ---- Real photos: Perles ----
import perles1 from '../content/Médias/Showroom/Broderie/Perles/DSC_0024.JPG';
import perles2 from '../content/Médias/Showroom/Broderie/Perles/DSC_0040.JPG';
import perles3 from '../content/Médias/Showroom/Broderie/Perles/DSC_0067.JPG';
import perles4 from '../content/Médias/Showroom/Broderie/Perles/DSC_0068.JPG';
import perles5 from '../content/Médias/Showroom/Broderie/Perles/DSC_0091.JPG';
import perles6 from '../content/Médias/Showroom/Broderie/Perles/DSC_0093.JPG';
import perles7 from '../content/Médias/Showroom/Broderie/Perles/DSC_0262.JPG';
import perles8 from '../content/Médias/Showroom/Broderie/Perles/P1000817.JPG';

// ---- Real photos: Sequins ----
import seq1 from '../content/Médias/Showroom/Broderie/Sequins/DSC_0150.JPG';
import seq2 from '../content/Médias/Showroom/Broderie/Sequins/DSC_0407.JPG';
import seq3 from '../content/Médias/Showroom/Broderie/Sequins/DSC_0409.JPG';
import seq4 from '../content/Médias/Showroom/Broderie/Sequins/DSC_0547.JPG';
import seq5 from '../content/Médias/Showroom/Broderie/Sequins/P1000776.JPG';
import seq6 from '../content/Médias/Showroom/Broderie/Sequins/P1000777.JPG';
import seq7 from '../content/Médias/Showroom/Broderie/Sequins/P1000778.JPG';
import seq8 from '../content/Médias/Showroom/Broderie/Sequins/P1000779.JPG';

// ---- Real photos: Smock ----
import smock1 from '../content/Médias/Showroom/Broderie/Smock/DSC_0102.JPG';
import smock2 from '../content/Médias/Showroom/Broderie/Smock/DSC_0108.JPG';
import smock3 from '../content/Médias/Showroom/Broderie/Smock/DSC_0126.JPG';
import smock4 from '../content/Médias/Showroom/Broderie/Smock/DSC_0172.JPG';
import smock5 from '../content/Médias/Showroom/Broderie/Smock/DSC_0179.JPG';
import smock6 from '../content/Médias/Showroom/Broderie/Smock/P1000639.JPG';
import smock7 from '../content/Médias/Showroom/Broderie/Smock/P1000640.JPG';
import smock8 from '../content/Médias/Showroom/Broderie/Smock/P1000641.JPG';

// ---- Real photos: Tuffetage ----
import tuff1 from '../content/Médias/Showroom/Broderie/Tuffetage/DSC_0049.JPG';
import tuff2 from '../content/Médias/Showroom/Broderie/Tuffetage/DSC_0063.JPG';
import tuff3 from '../content/Médias/Showroom/Broderie/Tuffetage/DSC_0390.JPG';
import tuff4 from '../content/Médias/Showroom/Broderie/Tuffetage/DSC_0393.JPG';
import tuff5 from '../content/Médias/Showroom/Broderie/Tuffetage/DSC_0445.JPG';
import tuff6 from '../content/Médias/Showroom/Broderie/Tuffetage/P1001033.JPG';
import tuff7 from '../content/Médias/Showroom/Broderie/Tuffetage/P1001035.JPG';
import tuff8 from '../content/Médias/Showroom/Broderie/Tuffetage/P1001036.JPG';

export interface GalleryImage {
  /** Image asset (Astro `ImageMetadata`). */
  src: ImageMetadata;
  /** i18n template for both the image alternative and carousel caption. */
  altKey: 'galerie.images.placeholder' | 'galerie.images.sample';
  /** One-based image number interpolated into the translated template. */
  number: number;
}

export interface GalleryCategory {
  /** Stable category key (matches `galerie.categories.*` i18n keys). */
  key: string;
  /** i18n key resolving to the visible label. */
  labelKey: string;
  /** Images shown in the BigCarousel for this category. */
  images: GalleryImage[];
}

/** The 6 placeholder gallery assets, keyed by aspect ratio for easy reuse. */
const placeholders: Record<string, ImageMetadata> = {
  '1-1': gallery11,
  '16-9': gallery169,
  '2-3': gallery23,
  '3-2': gallery32,
  '3-4': gallery34,
  '4-3': gallery43,
};

/** Ordered list of placeholder keys — used to build varied subsets. */
const orderedKeys = ['1-1', '16-9', '2-3', '3-2', '3-4', '4-3'] as const;

/**
 * Build a varied placeholder image set for a category without real photos.
 * Rotates the placeholder order by `offset` and takes `count` images, so
 * each category shows a slightly different subset/order. Alts are prefixed
 * with the category label.
 */
function buildPlaceholderImages(offset: number, count: number): GalleryImage[] {
  const result: GalleryImage[] = [];
  for (let i = 0; i < count; i++) {
    const key = orderedKeys[(offset + i) % orderedKeys.length];
    result.push({
      src: placeholders[key],
      altKey: 'galerie.images.placeholder',
      number: i + 1,
    });
  }
  return result;
}

/**
 * Build a real-photo image set from an array of imported assets. Alts remain
 * concise while describing each textile sample in French.
 */
function buildRealImages(assets: ImageMetadata[]): GalleryImage[] {
  return assets.map((src, i) => ({
    src,
    altKey: 'galerie.images.sample',
    number: i + 1,
  }));
}

/** The 17 Galerie categories, in display order. */
export const galleryCategories: GalleryCategory[] = [
  {
    key: 'traditionnelle',
    labelKey: 'galerie.categories.traditionnelle',
    images: buildRealImages([
      trad1, trad2, trad3, trad4, trad5, trad6, trad7, trad8,
    ]),
  },
  {
    key: '3d',
    labelKey: 'galerie.categories.3d',
    images: buildPlaceholderImages(1, 5),
  },
  {
    key: 'cornely',
    labelKey: 'galerie.categories.cornely',
    images: buildPlaceholderImages(2, 6),
  },
  {
    key: 'macrame',
    labelKey: 'galerie.categories.macrame',
    images: buildRealImages([
      macr1, macr2, macr3, macr4, macr5, macr6, macr7, macr8,
    ]),
  },
  {
    key: 'coiling',
    labelKey: 'galerie.categories.coiling',
    images: buildPlaceholderImages(4, 5),
  },
  {
    key: 'perles',
    labelKey: 'galerie.categories.perles',
    images: buildRealImages([
      perles1, perles2, perles3, perles4, perles5, perles6, perles7, perles8,
    ]),
  },
  {
    key: 'multi-techniques',
    labelKey: 'galerie.categories.multi-techniques',
    images: buildRealImages([
      multi1, multi2, multi3, multi4, multi5, multi6, multi7, multi8,
    ]),
  },
  {
    key: 'sequins',
    labelKey: 'galerie.categories.sequins',
    images: buildRealImages([
      seq1, seq2, seq3, seq4, seq5, seq6, seq7, seq8,
    ]),
  },
  {
    key: 'tuffetage',
    labelKey: 'galerie.categories.tuffetage',
    images: buildRealImages([
      tuff1, tuff2, tuff3, tuff4, tuff5, tuff6, tuff7, tuff8,
    ]),
  },
  {
    key: 'smock',
    labelKey: 'galerie.categories.smock',
    images: buildRealImages([
      smock1, smock2, smock3, smock4, smock5, smock6, smock7, smock8,
    ]),
  },
  {
    key: 'matelasse',
    labelKey: 'galerie.categories.matelasse',
    images: buildRealImages([
      mat1, mat2, mat3, mat4, mat5, mat6, mat7, mat8,
    ]),
  },
  {
    key: 'applications',
    labelKey: 'galerie.categories.applications',
    images: buildPlaceholderImages(5, 4),
  },
  {
    key: 'patchs',
    labelKey: 'galerie.categories.patchs',
    images: buildRealImages([
      patchs1, patchs2, patchs3, patchs4, patchs5, patchs6, patchs7, patchs8,
    ]),
  },
  {
    key: 'all-over',
    labelKey: 'galerie.categories.all-over',
    images: buildPlaceholderImages(1, 6),
  },
  {
    key: 'patchwork',
    labelKey: 'galerie.categories.patchwork',
    images: buildRealImages([
      patchw1, patchw2, patchw3, patchw4, patchw5, patchw6, patchw7, patchw8,
    ]),
  },
  {
    key: 'decoupe',
    labelKey: 'galerie.categories.decoupe',
    images: buildPlaceholderImages(3, 4),
  },
  {
    key: 'gros-fil',
    labelKey: 'galerie.categories.gros-fil',
    images: buildPlaceholderImages(4, 6),
  },
];
