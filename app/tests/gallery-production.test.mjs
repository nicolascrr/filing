import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.FILING_QA_BASE_URL ?? 'http://127.0.0.1:4330';
const mediaManifest = JSON.parse(
  await readFile(path.join(appRoot, 'src/data/galleryMediaManifest.json'), 'utf8'),
);

async function get(pathname, headers = {}) {
  const response = await fetch(new URL(pathname, baseUrl), {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, `${pathname} returned ${response.status}`);
  return { response, text: await response.text() };
}

function galleryData(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<script type="application/json" ${escaped}>([\\s\\S]*?)</script>`));
  assert.ok(match, `missing JSON script ${selector}`);
  return JSON.parse(match[1]);
}

async function gallery(params = '') {
  const { response, text } = await get(`/galerie${params ? `?${params}` : ''}`);
  return { response, html: text, manifest: galleryData(text, 'data-gallery-manifest') };
}

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

test('production SSR serves every public page in all supported locales', async () => {
  for (const route of ['/', '/creation', '/production', '/galerie']) {
    for (const locale of ['fr', 'en', 'it']) {
      const { text } = await get(route, { cookie: `locale=${locale}` });
      assert.match(text, new RegExp(`<html[^>]+lang="${locale}"`));
    }
  }
});

test('real prepared-media manifest covers the physical catalogue without missing or extra files', async () => {
  assert.equal(mediaManifest.count, 741);
  assert.equal(mediaManifest.typeCount, 137);
  assert.equal(mediaManifest.rootCount, 41);
  assert.equal(mediaManifest.entries.length, 741);
  const rootFiles = mediaManifest.entries.filter(({ source }) => source.split('/').length === 2);
  const groups = new Set(mediaManifest.entries.map(({ source }) => {
    const [folder, ...parts] = source.split('/');
    return `${folder}/${parts.length === 1 ? 'file' : 'folder'}:${parts[0]}`;
  }));
  assert.equal(rootFiles.length, mediaManifest.rootCount);
  assert.equal(groups.size, mediaManifest.typeCount);
  const paths = new Set(mediaManifest.entries.map(({ destination }) => destination));
  assert.equal(paths.size, 741);
  const root = path.join(appRoot, 'src/assets/gallery/catalogue/web');
  async function walk(dir) {
    const results = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...(await walk(fullPath)));
      else results.push(path.relative(root, fullPath).replaceAll(path.sep, '/'));
    }
    return results;
  }
  const files = await walk(root);
  assert.equal(files.length, 741);
  assert.deepEqual(
    new Set(files),
    new Set([...paths].map((file) => file.replace(/^web\//, ''))),
  );
  const bytes = (await Promise.all(files.map(async (file) => (await stat(path.join(root, file))).size)))
    .reduce((sum, size) => sum + size, 0);
  assert.equal(bytes, mediaManifest.destinationBytes);
  const sourceRoot = path.resolve(appRoot, '../medias/Médias/Showroom/Catalogue broderie');
  for (const entry of mediaManifest.entries) {
    assert.equal(entry.sourceSha256After, entry.sourceSha256, `source snapshot disagrees: ${entry.source}`);
    assert.equal(
      await sha256(path.join(sourceRoot, ...entry.source.split('/'))),
      entry.sourceSha256,
      `original source changed: ${entry.source}`,
    );
    assert.equal(
      await sha256(path.join(root, ...entry.destination.replace(/^web\//, '').split('/'))),
      entry.destinationSha256,
      `prepared web asset changed: ${entry.destination}`,
    );
  }
});

test('overview uses production optimized images, limits cards and stays within its payload budget', async (t) => {
  const { html, manifest } = await gallery('seed=17');
  assert.equal(manifest.mode, 'overview');
  assert.equal(manifest.seed, '17');
  assert.equal(manifest.cards.length, 18);
  assert.equal(new Set(manifest.cards.map((card) => card.type)).size, 18);
  const overviewBytes = Buffer.byteLength(JSON.stringify(manifest));
  assert.ok(overviewBytes <= 30_000);
  assert.equal((html.match(/<template data-gallery-viewer-template>/g) ?? []).length, 1);
  assert.equal((html.match(/\sdata-gallery-viewer\s/g) ?? []).length, 1);
  assert.doesNotMatch(html, /src\/assets\/gallery\/catalogue|gallery\/catalogue\/web/);
  for (const card of manifest.cards) {
    assert.match(card.photo.src, /^\/_image\?/);
    assert.match(card.photo.src, /(?:^|&)f=webp(?:&|$)/);
    assert.ok(card.photo.width <= 800);
    assert.ok(card.photo.srcset);
  }
  const sameSeed = (await gallery('seed=17')).manifest;
  assert.deepEqual(manifest.cards.map(({ type, image }) => [type, image]), sameSeed.cards.map(({ type, image }) => [type, image]));
  assert.notEqual((await gallery()).manifest.seed, '17');
  t.diagnostic(`overview JSON=${overviewBytes} B; cards=${manifest.cards.length}; distinctTypes=18`);
});

test('category SSR excludes the empty category from cards and fits the category payload budget', async (t) => {
  const all = (await gallery('seed=17')).manifest;
  assert.equal(all.categories.length, 17);
  assert.equal(all.categories.reduce((count, category) => count + category.typeCount, 0), 137);
  const empty = all.categories.find((category) => category.key === 'coiling');
  assert.ok(empty);
  assert.equal(empty.typeCount, 0);
  const { manifest } = await gallery('category=coiling');
  assert.equal(manifest.mode, 'category');
  assert.equal(manifest.types.length, 0);
  assert.equal(manifest.cards.length, 0);
  const emptyBytes = Buffer.byteLength(JSON.stringify(manifest));
  assert.ok(emptyBytes <= 50_000);
  assert.match((await gallery('category=coiling')).html, /data-gallery-status[^>]*role="status"/);
  const largest = all.categories.reduce((left, right) =>
    right.typeCount > left.typeCount ? right : left,
  );
  const largestManifest = (await gallery(`category=${encodeURIComponent(largest.key)}`)).manifest;
  assert.equal(largestManifest.types.length, largest.typeCount);
  const largestBytes = Buffer.byteLength(JSON.stringify(largestManifest));
  assert.ok(largestBytes <= 50_000);
  t.diagnostic(`empty category JSON=${emptyBytes} B; largest (${largest.key}, ${largest.typeCount} types) JSON=${largestBytes} B`);
});

test('SSR handles naturally sorted types and all files in a root-file one-image type', async () => {
  const overview = (await gallery('seed=1')).manifest;
  const category = overview.categories.find((item) => item.typeCount > 0);
  assert.ok(category);
  const listed = (await gallery(`category=${encodeURIComponent(category.key)}`)).manifest;
  assert.equal(listed.mode, 'category');
  assert.equal(listed.types.length, category.typeCount);
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'variant' });
  const typeParts = listed.types.map((item) => {
    const match = item.id.match(/\/(folder|file):(.+)$/);
    assert.ok(match, `unexpected type id ${item.id}`);
    return { kind: match[1], name: match[2] };
  });
  assert.deepEqual(typeParts.map(({ kind }) => kind), [...typeParts.map(({ kind }) => kind)].sort((a, b) => a === b ? 0 : a === 'folder' ? -1 : 1));
  const folders = typeParts.filter(({ kind }) => kind === 'folder').map(({ name }) => name);
  const roots = typeParts.filter(({ kind }) => kind === 'file').map(({ name }) => name);
  assert.deepEqual(folders, [...folders].sort(collator.compare));
  assert.deepEqual(roots, [...roots].sort(collator.compare));
  if (folders.includes('9') && folders.includes('10'))
    assert.ok(folders.indexOf('9') < folders.indexOf('10'));
  for (let index = 1; index < listed.types.length; index++) {
    assert.notEqual(listed.types[index - 1].id, listed.types[index].id);
  }
  const rootType = listed.types.find((item) => item.id.includes('/file:'));
  assert.ok(rootType, 'the production dataset includes a root-file single-image sample');
  assert.equal(rootType.imageCount, 1);
  const type = (await gallery(`category=${encodeURIComponent(category.key)}&type=${encodeURIComponent(rootType.id)}`)).manifest;
  assert.equal(type.mode, 'type');
  assert.equal(type.images.length, 1);
  assert.equal(type.active.id, type.images[0].id);
  assert.equal(type.thumbnails.length, 1);
});

test('type, selected image and explicit zoom deliver only the required real optimized media', async (t) => {
  const base = (await gallery('seed=4')).manifest;
  const category = base.categories.find((item) => item.typeCount > 0);
  const categoryData = (await gallery(`category=${encodeURIComponent(category.key)}`)).manifest;
  const typeInfo = categoryData.types.find((item) => item.imageCount > 1);
  assert.ok(typeInfo, 'fixture must include a multi-image type');
  const params = `category=${encodeURIComponent(category.key)}&type=${encodeURIComponent(typeInfo.id)}`;
  const type = (await gallery(params)).manifest;
  assert.equal(type.mode, 'type');
  assert.equal(type.images.length, typeInfo.imageCount);
  assert.equal(type.thumbnails.length, Math.min(5, type.images.length));
  assert.ok(type.active.width <= 1600);
  const chosen = type.images.at(-1);
  const image = (await gallery(`${params}&image=${encodeURIComponent(chosen.id)}`)).manifest;
  assert.equal(image.mode, 'image');
  assert.equal(image.active.id, chosen.id);
  const zoom = (await gallery(`${params}&image=${encodeURIComponent(chosen.id)}&zoom=1`)).manifest;
  assert.equal(zoom.active.id, chosen.id);
  assert.ok(zoom.active.width <= 4096);
  assert.equal(zoom.thumbnails, undefined);
  const typeBytes = Buffer.byteLength(JSON.stringify(type));
  const zoomBytes = Buffer.byteLength(JSON.stringify(zoom));
  assert.ok(zoomBytes <= 10_000);
  t.diagnostic(`type JSON=${typeBytes} B (${type.images.length} image refs); explicit zoom JSON=${zoomBytes} B`);
});

test('invalid query selections fall back safely without exposing source paths', async () => {
  const { html, manifest } = await gallery('category=not-a-category&type=../../secret&image=%3C%2Fscript%3E');
  assert.equal(manifest.mode, 'overview');
  assert.equal(manifest.cards.length, 18);
  assert.doesNotMatch(JSON.stringify(manifest), /src\/assets|gallery\/catalogue\/web/);
  assert.equal(galleryData(html, 'data-gallery-manifest').mode, 'overview');
});

test('embedded manifest JSON is escaped against script termination and request HTML remains bounded', async () => {
  const { html } = await gallery('category=3d&type=3d%2Ffolder%3A1');
  assert.ok(Buffer.byteLength(html) < 300_000);
  assert.equal((html.match(/data-gallery-manifest/g) ?? []).length, 1);
  assert.equal((html.match(/data-gallery-strings/g) ?? []).length, 1);
  assert.doesNotMatch(galleryData(html, 'data-gallery-manifest').seed, /<|>/);
});
