/** Explicit offline preparation, never run by SSR.
 * node scripts/prepare-gallery-media.mjs --inspect
 * node scripts/prepare-gallery-media.mjs --prepare [--remove-raw]
 * Requires the sharp version already installed by Astro. Originals are read-only.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const app = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = path.resolve(app, '../medias/Médias/Showroom/Catalogue broderie');
const catalogueRoot = path.join(app, 'src/assets/gallery/catalogue');
const manifestPath = path.join(app, 'src/data/galleryMediaManifest.json');
const settings = {
  longEdge: 4096,
  quality: 90,
  effort: 5,
  format: 'webp',
  algorithm: 'gallery-web-v1',
};
const args = new Set(process.argv.slice(2));
if (
  ![...args].every((arg) => ['--inspect', '--prepare', '--remove-raw'].includes(arg)) ||
  args.has('--inspect') === args.has('--prepare') ||
  (args.has('--remove-raw') && !args.has('--prepare'))
) {
  throw new Error('Use --inspect OR --prepare [--remove-raw]');
}
sharp.concurrency(1);
sharp.cache({ memory: 64, files: 0, items: 20 });
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'variant' });
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(absolute)));
    else if (/\.(jpe?g|png)$/i.test(entry.name)) result.push(absolute);
  }
  return result;
}
const files = (await walk(sourceRoot)).sort(natural.compare);
const sources = [];
for (const file of files) {
  const buffer = await fs.readFile(file);
  const metadata = await sharp(buffer).metadata();
  const source = path.relative(sourceRoot, file).split(path.sep).join('/');
  if (!metadata.width || !metadata.height) throw new Error(`Missing dimensions: ${source}`);
  sources.push({
    source,
    sourceSha256: hash(buffer),
    sourceBytes: buffer.length,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    sourceOrientation: metadata.orientation ?? 1,
    alpha: metadata.hasAlpha,
  });
}
const groups = new Set(
  sources.map(({ source }) => {
    const [folder, ...parts] = source.split('/');
    return `${folder}/${parts.length === 1 ? 'file' : 'folder'}:${parts[0]}`;
  }),
);
const roots = sources.filter(({ source }) => source.split('/').length === 2).length;
if (sources.length !== 741 || groups.size !== 137 || roots !== 41)
  throw new Error('Source census changed; review classification before preparing');
const sampleIndices = Array.from({ length: 12 }, (_, i) =>
  Math.floor((i * (sources.length - 1)) / 11),
);
const dimensions = (entries, prefix) => ({
  minWidth: Math.min(...entries.map((e) => e[`${prefix}Width`])),
  maxWidth: Math.max(...entries.map((e) => e[`${prefix}Width`])),
  minHeight: Math.min(...entries.map((e) => e[`${prefix}Height`])),
  maxHeight: Math.max(...entries.map((e) => e[`${prefix}Height`])),
});
const sourceBytes = sources.reduce((sum, e) => sum + e.sourceBytes, 0);
console.log(
  JSON.stringify(
    {
      count: sources.length,
      types: groups.size,
      roots,
      sourceBytes,
      dimensions: dimensions(sources, 'source'),
      samples: sampleIndices.map((i) => sources[i]),
      settings,
    },
    null,
    2,
  ),
);
if (args.has('--prepare')) {
  // Whole preparation is staged. Only verified, manifest-owned outputs can be replaced.
  const free = await fs.statfs(app);
  if (Number(free.bavail) * Number(free.bsize) < sourceBytes * 2 + 2_000_000_000)
    throw new Error('Insufficient preparation/build disk headroom');
  let previous;
  try {
    previous = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const previousEntries = new Map(
    (previous?.entries ?? []).map((entry) => [entry.destination, entry]),
  );
  for (const entry of sources) {
    const destination = `web/${entry.source}.webp`;
    try {
      const current = await fs.readFile(path.join(catalogueRoot, destination));
      if (hash(current) !== previousEntries.get(destination)?.destinationSha256)
        throw new Error(`Unowned/changed derivative: ${destination}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const stage = await fs.mkdtemp(path.join(catalogueRoot, '.prepare-'));
  const entries = [];
  try {
    // Sequential images + one libvips thread bound peak memory even for large sources.
    for (const entry of sources) {
      const destination = `web/${entry.source}.webp`;
      const output = path.join(stage, destination);
      await fs.mkdir(path.dirname(output), { recursive: true });
      const source = path.join(sourceRoot, entry.source);
      await sharp(source)
        .autoOrient()
        .resize(settings.longEdge, settings.longEdge, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: settings.quality, effort: settings.effort })
        .toFile(output); // sharp strips metadata by default; never call keepMetadata/withMetadata.
      const buffer = await fs.readFile(output);
      const meta = await sharp(buffer).metadata();
      if (
        meta.exif ||
        meta.xmp ||
        meta.iptc ||
        meta.icc ||
        meta.orientation ||
        meta.format !== 'webp' ||
        Math.max(meta.width, meta.height) > settings.longEdge ||
        meta.width * meta.height > entry.sourceWidth * entry.sourceHeight
      )
        throw new Error(`Invalid derivative: ${entry.source}`);
      const sourceSha256After = hash(await fs.readFile(source));
      if (sourceSha256After !== entry.sourceSha256)
        throw new Error(`Original changed: ${entry.source}`);
      entries.push({
        ...entry,
        sourceSha256After,
        destination,
        destinationSha256: hash(buffer),
        destinationBytes: buffer.length,
        destinationWidth: meta.width,
        destinationHeight: meta.height,
      });
      if (entries.length % 25 === 0) console.log(`Prepared ${entries.length}/${sources.length}`);
    }
    const manifest = {
      settings,
      count: entries.length,
      typeCount: groups.size,
      rootCount: roots,
      sourceBytes,
      destinationBytes: entries.reduce((sum, e) => sum + e.destinationBytes, 0),
      sourceDimensions: dimensions(entries, 'source'),
      destinationDimensions: dimensions(entries, 'destination'),
      samples: sampleIndices.map((i) => entries[i].source),
      entries,
    };
    for (const entry of entries) {
      const destination = path.join(catalogueRoot, entry.destination);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(path.join(stage, entry.destination), destination);
      if (hash(await fs.readFile(destination)) !== entry.destinationSha256)
        throw new Error(`Copy verification failed: ${entry.destination}`);
    }
    await fs.writeFile(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
    await fs.rename(`${manifestPath}.tmp`, manifestPath);
    if (args.has('--remove-raw')) {
      // Validate ALL former LOT-C raw copies before deleting ANY; never touch other assets.
      const owned = [];
      for (const entry of entries) {
        const raw = path.join(catalogueRoot, entry.source);
        try {
          if (hash(await fs.readFile(raw)) !== entry.sourceSha256)
            throw new Error(`Changed raw copy: ${entry.source}`);
          owned.push(raw);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      for (const file of owned) await fs.unlink(file);
      console.log(`Removed ${owned.length} verified LOT-C raw copies`);
    }
    console.log(JSON.stringify({ ...manifest, entries: undefined }, null, 2));
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}
