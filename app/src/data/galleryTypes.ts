/** Only serializable delivery data may cross the server/client boundary. */
export interface GalleryPhoto {
  id: string;
  src: string;
  srcset: string;
  sizes: string;
  width: number;
  height: number;
  alt: string;
}
export interface GalleryType {
  id: string;
  label: string;
  imageCount: number;
}
export interface GalleryCard {
  category: string;
  type: string;
  image: string;
  label: string;
  categoryLabel: string;
  imageCount: number;
  photo: GalleryPhoto;
}
export interface GalleryManifest {
  version: string;
  locale: string;
  seed: string;
  mode: 'overview' | 'category' | 'type' | 'image';
  categories: { key: string; label: string; typeCount: number; imageCount: number }[];
  cards: GalleryCard[];
  category?: string;
  type?: string;
  types?: GalleryType[];
  images?: { id: string; alt: string }[];
  active?: GalleryPhoto;
  thumbnails?: GalleryPhoto[];
}
