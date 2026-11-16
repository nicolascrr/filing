/** Offline inventory/reindex only. Canonical prepared media are never rewritten. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const app = fileURLToPath(new URL('../', import.meta.url));
const galleryRoot = path.join(app, 'src/assets/gallery');
const manifestPath = path.join(app, 'src/data/galleryMediaManifest.json');
const args = process.argv.slice(2);
if (args.length !== 1 || !['--inspect', '--prepare'].includes(args[0])) {
  throw new Error('Use --inspect OR --prepare; media conversion/removal is not supported');
}
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'variant' });
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
async function walk(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(absolute)));
    else if (entry.isFile() && /\.webp$/i.test(entry.name)) result.push(absolute);
    else throw new Error(`Unsupported canonical entry (not ignored): ${absolute}`);
  }
  return result;
}
const dimensions = (entries, prefix) => ({
  minWidth: Math.min(...entries.map((entry) => entry[`${prefix}Width`])),
  maxWidth: Math.max(...entries.map((entry) => entry[`${prefix}Width`])),
  minHeight: Math.min(...entries.map((entry) => entry[`${prefix}Height`])),
  maxHeight: Math.max(...entries.map((entry) => entry[`${prefix}Height`])),
});
const previousText = await fs.readFile(manifestPath, 'utf8');
const previous = JSON.parse(previousText);
const previousEntries = new Map();
for (const entry of previous.entries) {
  // Accept the former prefix only to preserve identity during the one-time move.
  const destination = entry.destination.replace(/^web\//, '');
  if (previousEntries.has(destination)) throw new Error(`Duplicate destination: ${destination}`);
  previousEntries.set(destination, entry);
}
const categories = (await fs.readdir(galleryRoot, { withFileTypes: true })).map((entry) => {
  if (!entry.isDirectory() || entry.name === 'catalogue') {
    throw new Error(`Expected canonical category directory: ${entry.name}`);
  }
  return entry.name;
});
const files = (await walk(galleryRoot)).sort(natural.compare);
if (!files.length) throw new Error('Canonical gallery is empty; manifest was not changed');
const entries = [];
const identities = new Set();
for (const file of files) {
  const destination = path.relative(galleryRoot, file).split(path.sep).join('/');
  const buffer = await fs.readFile(file);
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height || meta.format !== 'webp') {
    throw new Error(`Invalid prepared WebP: ${destination}`);
  }
  const destinationSha256 = hash(buffer);
  const old = previousEntries.get(destination);
  if (
    old &&
    (old.destinationSha256 !== destinationSha256 ||
      old.destinationBytes !== buffer.length ||
      old.destinationWidth !== meta.width ||
      old.destinationHeight !== meta.height)
  ) {
    throw new Error(
      `Canonical media changed; review its provenance before reindexing: ${destination}`,
    );
  }
  // "source" is a logical ID, not a path to read. Keep existing IDs byte-for-byte.
  const source = old?.source ?? destination.replace(/(\.(?:jpe?g|png))\.webp$/i, '$1');
  if (identities.has(source)) throw new Error(`Logical identity collision: ${source}`);
  if (source.split('/')[0] !== destination.split('/')[0]) {
    throw new Error(`Category/identity mismatch: ${destination}`);
  }
  identities.add(source);
  entries.push({
    ...old,
    source,
    destination,
    destinationSha256,
    destinationBytes: buffer.length,
    destinationWidth: meta.width,
    destinationHeight: meta.height,
  });
}
entries.sort((a, b) => natural.compare(a.source, b.source));
const groups = new Set(
  entries.map(({ source }) => {
    const [folder, ...parts] = source.split('/');
    return `${folder}/${parts.length === 1 ? 'file' : 'folder'}:${parts[0]}`;
  }),
);
const populated = new Set(entries.map(({ destination }) => destination.split('/')[0]));
for (const category of categories) {
  if (!populated.has(category)) throw new Error(`Empty category: ${category}`);
}
const sampleCount = Math.min(12, entries.length);
const samples = Array.from(
  { length: sampleCount },
  (_, index) =>
    entries[Math.floor((index * (entries.length - 1)) / Math.max(1, sampleCount - 1))].source,
);
// Historical source metadata is retained only for hash-verified existing entries.
// New prepared files have no invented original dimensions, bytes or hashes.
const hasSourceMetadata = entries.every(
  (entry) => entry.sourceBytes && entry.sourceWidth && entry.sourceHeight,
);
const manifest = {
  settings: previous.settings,
  count: entries.length,
  typeCount: groups.size,
  rootCount: entries.filter(({ source }) => source.split('/').length === 2).length,
  ...(hasSourceMetadata
    ? {
        sourceBytes: entries.reduce((sum, entry) => sum + entry.sourceBytes, 0),
        sourceDimensions: dimensions(entries, 'source'),
      }
    : {}),
  destinationBytes: entries.reduce((sum, entry) => sum + entry.destinationBytes, 0),
  destinationDimensions: dimensions(entries, 'destination'),
  samples,
  entries,
};
if (args[0] === '--prepare') {
  // Detect concurrent edits before replacing only the index, never the media.
  if ((await fs.readFile(manifestPath, 'utf8')) !== previousText) {
    throw new Error('Manifest changed during inventory; retry after review');
  }
  const temporary = `${manifestPath}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  await fs.rename(temporary, manifestPath);
}
console.log(JSON.stringify({ ...manifest, categories, entries }, null, 2));
