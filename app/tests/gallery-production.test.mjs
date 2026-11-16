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
const siteMediaChecks = JSON.parse(
  await readFile(path.join(appRoot, 'tests/fixtures/site-media-sha256.json'), 'utf8'),
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
  const match = html.match(
    new RegExp(`<script type="application/json" ${escaped}>([\\s\\S]*?)</script>`),
  );
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
      if (route === '/') {
        const video = text.match(/<video\b[\s\S]*?<\/video>/)?.[0] ?? '';
        assert.match(
          video,
          /<video\b(?=[^>]*\bmuted)(?=[^>]*\bloop)(?=[^>]*\bplaysinline)(?=[^>]*\bpreload="metadata")[^>]*>/,
        );
        assert.match(video, /hero-video-mobile\.[^/]+\.mp4/);
        assert.match(video, /hero-video\.[^/]+\.mp4/);
      }
    }
  }
});

test('real prepared-media manifest covers the canonical physical catalogue without missing or extra files', async () => {
  assert.equal(mediaManifest.count, mediaManifest.entries.length);
  const rootFiles = mediaManifest.entries.filter(({ source }) => source.split('/').length === 2);
  const groups = new Set(
    mediaManifest.entries.map(({ source }) => {
      const [folder, ...parts] = source.split('/');
      return `${folder}/${parts.length === 1 ? 'file' : 'folder'}:${parts[0]}`;
    }),
  );
  assert.equal(rootFiles.length, mediaManifest.rootCount);
  assert.equal(groups.size, mediaManifest.typeCount);
  const paths = new Set(mediaManifest.entries.map(({ destination }) => destination));
  assert.equal(paths.size, mediaManifest.entries.length);
  assert.ok([...paths].every((destination) => !destination.startsWith('catalogue/')));
  const root = path.join(appRoot, 'src/assets/gallery');
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
  assert.equal(files.length, mediaManifest.entries.length);
  assert.ok(files.every((file) => file.endsWith('.webp')));
  assert.deepEqual(new Set(files), paths);
  const bytes = (
    await Promise.all(files.map(async (file) => (await stat(path.join(root, file))).size))
  ).reduce((sum, size) => sum + size, 0);
  assert.equal(bytes, mediaManifest.destinationBytes);
  const sourceRoot = path.resolve(appRoot, '../medias/Médias/Showroom/Catalogue broderie');
  for (const entry of mediaManifest.entries) {
    assert.equal(
      entry.sourceSha256After,
      entry.sourceSha256,
      `source snapshot disagrees: ${entry.source}`,
    );
    assert.equal(
      await sha256(path.join(sourceRoot, ...entry.source.split('/'))),
      entry.sourceSha256,
      `original source changed: ${entry.source}`,
    );
    assert.equal(
      entry.destination,
      `${entry.source}.webp`,
      `logical ID preserved: ${entry.source}`,
    );
    assert.equal(
      await sha256(path.join(root, ...entry.destination.split('/'))),
      entry.destinationSha256,
      `prepared web asset changed: ${entry.destination}`,
    );
  }
});

test('moved/copied site media retains its expected bytes and untouched content originals', async () => {
  assert.equal(siteMediaChecks.length, 15);
  for (const item of siteMediaChecks) {
    const destination = path.join(appRoot, ...item.destination.split('/'));
    assert.equal(await sha256(destination), item.sha256, `asset changed: ${item.destination}`);
    if (item.original) {
      const original = path.join(appRoot, ...item.original.split('/'));
      assert.equal(
        await sha256(original),
        item.sha256,
        `protected original changed: ${item.original}`,
      );
    }
  }
  const epvMark = await readFile(path.join(appRoot, 'src/assets/icons/EPV_logo.svg'), 'utf8');
  assert.match(epvMark, /fill:\s*#c10b25/i, 'EPV asset retains its supplied red mark');
  await stat(path.join(appRoot, 'src/assets/icons/made_in_france.svg'));
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
  assert.deepEqual(
    manifest.cards.map(({ type, image }) => [type, image]),
    sameSeed.cards.map(({ type, image }) => [type, image]),
  );
  // The seed shuffles groups, not their members: every cover is image 1 of that group.
  for (const card of manifest.cards) {
    const [, type] = card.type.split('/');
    const categoryManifest = (await gallery(`category=${encodeURIComponent(card.category)}`))
      .manifest;
    const group = categoryManifest.types.find(({ id }) => id === card.type);
    assert.ok(group, `overview group exists in category: ${card.type}`);
    const fullGroup = (
      await gallery(
        `category=${encodeURIComponent(card.category)}&type=${encodeURIComponent(card.type)}`,
      )
    ).manifest;
    assert.equal(card.image, fullGroup.images[0].id, `cover is first image: ${type}`);
  }
  assert.notEqual((await gallery()).manifest.seed, '17');
  t.diagnostic(
    `overview JSON=${overviewBytes} B; cards=${manifest.cards.length}; distinctTypes=${new Set(manifest.cards.map(({ type }) => type)).size}`,
  );
});

test('filtered category renders every group including singleton root files', async () => {
  const overview = (await gallery('seed=17')).manifest;
  const allGroups = overview.categories.reduce((sum, category) => sum + category.typeCount, 0);
  const sourceGroups = new Set(
    mediaManifest.entries.map(({ source }) => {
      const [folder, ...parts] = source.split('/');
      return `${folder}/${parts.length === 1 ? 'file' : 'folder'}:${parts[0]}`;
    }),
  );
  assert.equal(allGroups, sourceGroups.size);
  assert.equal(
    overview.categories.length,
    new Set(mediaManifest.entries.map(({ source }) => source.split('/')[0])).size,
  );
  for (const category of overview.categories.filter(({ typeCount }) => typeCount > 0)) {
    const { manifest, html } = await gallery(`category=${encodeURIComponent(category.key)}`);
    assert.equal(manifest.cards.length, category.typeCount, `${category.key} includes every group`);
    assert.equal(new Set(manifest.cards.map(({ type }) => type)).size, category.typeCount);
    assert.ok(manifest.cards.every(({ category: key }) => key === category.key));
    assert.ok(manifest.cards.every(({ image }) => image));
    assert.doesNotMatch(html, /data-gallery-count|data-image-count/);
  }
  const singletonCards = [];
  for (const category of overview.categories.filter(({ typeCount }) => typeCount > 0)) {
    const { manifest } = await gallery(`category=${encodeURIComponent(category.key)}`);
    singletonCards.push(...manifest.cards.filter(({ type }) => type.includes('/file:')));
  }
  assert.equal(singletonCards.length, mediaManifest.rootCount);
  assert.ok(singletonCards.every(({ type }) => type.includes('/file:')));
});

test('filtered Macramé group controls have distinct localized accessible names in SSR', async () => {
  for (const locale of ['fr', 'en', 'it']) {
    const { text } = await get('/galerie?category=macrame', { cookie: `locale=${locale}` });
    const labels = [...text.matchAll(/class="catalogue-card"[^>]*aria-label="([^"]+)"/g)].map(
      ([, label]) => label,
    );
    assert.equal(labels.length, 2, `${locale} SSR retains both Macramé groups`);
    assert.equal(new Set(labels).size, labels.length, `${locale} SSR names groups distinctly`);
  }
});

test('gallery UI exposes title-only categories, permanent masonry, and a minimal scoped viewer', async () => {
  const { html, manifest } = await gallery('seed=29');
  assert.equal((html.match(/data-gallery-category=/g) ?? []).length, manifest.categories.length);
  assert.match(html, /data-gallery-masonry/);
  assert.match(html, /class="catalogue-masonry"/);
  assert.doesNotMatch(
    html,
    /data-gallery-count|data-image-count|data-viewer-thumbnails|data-viewer-zoom|data-viewer-counter/,
  );
  const template = html.match(/<template data-gallery-viewer-template>([\s\S]*?)<\/template>/)?.[1];
  assert.ok(template, 'viewer template exists');
  assert.equal((template.match(/data-viewer-close/g) ?? []).length, 1);
  assert.equal((template.match(/data-viewer-prev/g) ?? []).length, 1);
  assert.equal((template.match(/data-viewer-next/g) ?? []).length, 1);
  assert.doesNotMatch(
    template,
    /data-viewer-thumbnails|data-viewer-zoom|data-viewer-counter|<select|<option/,
  );
});

test('viewer manifest is scoped to exactly the selected group, including last-image selection', async () => {
  const all = (await gallery('seed=31')).manifest;
  let card;
  let group;
  for (const candidate of all.cards) {
    const params = `category=${encodeURIComponent(candidate.category)}&type=${encodeURIComponent(candidate.type)}`;
    const candidateGroup = (await gallery(params)).manifest;
    if (candidateGroup.images.length > 1) {
      card = candidate;
      group = candidateGroup;
      break;
    }
  }
  assert.ok(card && group, 'overview fixture includes a multi-image sample');
  const params = `category=${encodeURIComponent(card.category)}&type=${encodeURIComponent(card.type)}`;
  const last = group.images.at(-1);
  const selected = (await gallery(`${params}&image=${encodeURIComponent(last.id)}`)).manifest;
  assert.equal(selected.active.id, last.id);
  assert.deepEqual(
    selected.images.map(({ id }) => id),
    group.images.map(({ id }) => id),
  );
  assert.equal(selected.type, card.type);
});

test('removed Coiling category is absent from localized UI and unknown-filter fallback stays safe', async (t) => {
  const all = (await gallery('seed=17')).manifest;
  assert.ok(all.categories.length > 0);
  assert.ok(all.categories.every(({ key, label }) => key !== 'coiling' && !/coiling/i.test(label)));
  for (const locale of ['fr', 'en', 'it']) {
    const { text } = await get('/galerie', { cookie: `locale=${locale}` });
    const categoryButtons = [
      ...text.matchAll(/data-gallery-category="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g),
    ];
    assert.ok(categoryButtons.length > 0, `${locale} has category controls`);
    assert.ok(
      categoryButtons.every(([, key, label]) => key !== 'coiling' && !/coiling/i.test(label)),
    );
    assert.doesNotMatch(text, /Aperçu de nos broderies|Samples:|Images:/i);
  }
  const unknown = (await gallery('category=coiling')).manifest;
  assert.equal(unknown.mode, 'overview');
  assert.ok(unknown.categories.every(({ key }) => key !== 'coiling'));
  const largest = all.categories.reduce((left, right) =>
    right.typeCount > left.typeCount ? right : left,
  );
  const largestManifest = (await gallery(`category=${encodeURIComponent(largest.key)}`)).manifest;
  assert.equal(largestManifest.types.length, largest.typeCount);
  const largestBytes = Buffer.byteLength(JSON.stringify(largestManifest));
  assert.ok(largestBytes <= 50_000);
  t.diagnostic(
    `removed category falls back to overview; largest (${largest.key}, ${largest.typeCount} types) JSON=${largestBytes} B`,
  );
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
  assert.deepEqual(
    typeParts.map(({ kind }) => kind),
    [...typeParts.map(({ kind }) => kind)].sort((a, b) => (a === b ? 0 : a === 'folder' ? -1 : 1)),
  );
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
  const type = (
    await gallery(
      `category=${encodeURIComponent(category.key)}&type=${encodeURIComponent(rootType.id)}`,
    )
  ).manifest;
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
  t.diagnostic(
    `type JSON=${typeBytes} B (${type.images.length} image refs); explicit zoom JSON=${zoomBytes} B`,
  );
});

test('invalid query selections fall back safely without exposing source paths', async () => {
  const { html, manifest } = await gallery(
    'category=not-a-category&type=../../secret&image=%3C%2Fscript%3E',
  );
  assert.equal(manifest.mode, 'overview');
  const availableGroups = manifest.categories.reduce(
    (count, category) => count + category.typeCount,
    0,
  );
  assert.equal(manifest.cards.length, Math.min(18, availableGroups));
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

test('footer contact and directions links render exact destinations with a mailto fallback in every locale', async () => {
  const expected = [
    'mailto:contact@filing.fr',
    'https://maps.app.goo.gl/Lv3RT9JYYH2KcvF9A',
    'https://www.instagram.com/filing_broderies/',
    'https://www.linkedin.com/company/filing-broderies/',
    'https://www.google.com/maps/dir/?api=1&origin=Gare%20Lyon%20Part-Dieu%2C%20France&destination=45.903903%2C4.8771092',
    'https://www.google.com/maps/dir/?api=1&origin=A%C3%A9roport%20Lyon-Saint-Exup%C3%A9ry%2C%20France&destination=45.903903%2C4.8771092',
  ];
  const expectedLabels = {
    fr: {
      copy: "Copier l'adresse email contact@filing.fr",
      send: 'Envoyer un mail',
      dialog: "Contacter Fil'ing par email",
      address: 'Adresse email',
      success: 'Adresse copiée.',
      manual:
        "La copie automatique est indisponible. Sélectionnez l'adresse et copiez-la manuellement.",
    },
    en: {
      copy: 'Copy email address contact@filing.fr',
      send: 'Send an email',
      dialog: "Contact Fil'ing by email",
      address: 'Email address',
      success: 'Email address copied.',
      manual: 'Automatic copying is unavailable. Select the address and copy it manually.',
    },
    it: {
      copy: 'Copia l’indirizzo e-mail contact@filing.fr',
      send: 'Invia un’e-mail',
      dialog: "Contatta Fil'ing via email",
      address: 'Indirizzo email',
      success: 'Indirizzo email copiato.',
      manual: "La copia automatica non è disponibile. Seleziona l'indirizzo e copialo manualmente.",
    },
  };

  for (const locale of ['fr', 'en', 'it']) {
    for (const route of ['/', '/creation', '/production', '/galerie']) {
      const { text } = await get(route, { cookie: `locale=${locale}` });
      assert.match(text, new RegExp(`<html[^>]+lang="${locale}"`));
      const html = text.replaceAll('&amp;', '&');
      for (const href of expected) {
        assert.ok(html.includes(`href="${href}"`), `${locale} ${route} keeps exact href ${href}`);
      }
      assert.match(
        html,
        /<a\b(?=[^>]*data-footer-email-trigger)(?=[^>]*href="mailto:contact@filing\.fr")[^>]*>/,
        `${locale} ${route} retains a navigable no-JS mailto anchor`,
      );
      const labels = expectedLabels[locale];
      const copyButton = html.match(
        /<button\b(?=[^>]*data-email-copy\b)([^>]*)>([\s\S]*?)<\/button>/,
      );
      assert.ok(copyButton, `${locale} ${route} has the copy action`);
      assert.ok(copyButton[1].includes(`aria-label="${labels.copy}"`));
      assert.ok(copyButton[1].includes(`title="${labels.copy}"`));
      assert.equal(copyButton[2].replace(/<[^>]+>/g, '').trim(), 'contact@filing.fr');
      const sendLink = html.match(/<a\b(?=[^>]*footer__email-send\b)[^>]*>([\s\S]*?)<\/a>/);
      assert.ok(sendLink, `${locale} ${route} has the send action`);
      assert.equal(sendLink[1].replace(/<[^>]+>/g, '').trim(), labels.send);
      const popover = html.match(/<div\b(?=[^>]*id="footer-email-popover")[^>]*>/)?.[0];
      assert.ok(popover, `${locale} ${route} renders the email popover`);
      assert.ok(popover.includes(`aria-label="${labels.dialog}"`));
      assert.ok(popover.includes(`data-copy-success="${labels.success}"`));
      assert.ok(popover.includes(`data-copy-manual="${labels.manual}"`));
      assert.doesNotMatch(html, /common\.footer\.email\./);
      const addressLabel = html.match(
        /<label\b(?=[^>]*for="footer-email-address")[^>]*>([\s\S]*?)<\/label>/,
      );
      assert.ok(addressLabel);
      assert.equal(addressLabel[1].trim(), labels.address);
    }
  }
});
