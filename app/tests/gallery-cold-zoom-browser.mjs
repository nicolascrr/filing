import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const root = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  ...(process.env.LOCALAPPDATA ? ['Temp', 'opencode'] : []),
);
const mode = process.argv[2] ?? 'before';
const server = process.env.QA_URL ?? 'http://127.0.0.1:4397';
const profile = await mkdtemp(path.join(root, 'gallery-cold-zoom-chrome-'));
const socket = net.createServer();
await new Promise((r) => socket.listen(0, '127.0.0.1', r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const chrome = spawn(
  process.env.CHROME_PATH ??
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : 'google-chrome'),
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
let ws;
const log = [];
let id = 0;
const pending = new Map();
const closePoint = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const closePaintedRect = (a, b, tolerance) =>
  a.length === 4 &&
  b.length === 4 &&
  a.every((value, index) => Math.abs(value - b[index]) < tolerance);
assert.equal(
  closePaintedRect([-0.2, -0.3, 2.5, 2.5], [-0.2, -0.3, 2.53, 2.5], 0.01),
  false,
  'painted-rect comparison detects a width-only change',
);
assert.equal(
  closePaintedRect([-0.2, -0.3, 2.5, 2.5], [-0.2, -0.3, 2.5, 2.53], 0.01),
  false,
  'painted-rect comparison detects a height-only change',
);
const paintedRect = (sample) => [
  (sample.image.x - sample.stage.x) / sample.stage.w,
  (sample.image.y - sample.stage.y) / sample.stage.h,
  sample.image.w / sample.stage.w,
  sample.image.h / sample.stage.h,
];
let session;
let hd = false;
let failHD = false;
let slowManifest = true;
let slowBase = false;
const wait = async (f) => {
  for (let n = 0; n < 300; n++) {
    try {
      const v = await f();
      if (v) return v;
    } catch {}
    await delay(100);
  }
  throw Error('timeout');
};
try {
  const version = await wait(async () => {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`);
    return r.json();
  });
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const send = (method, params = {}, sid = session) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params, ...(sid ? { sessionId: sid } : {}) }));
    });
  ws.addEventListener('message', async ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
      return;
    }
    if (m.method === 'Fetch.requestPaused') {
      const p = m.params,
        u = new URL(p.request.url);
      let pause = 0,
        fail = false;
      if (u.pathname === '/galerie' && u.searchParams.has('type')) {
        hd = u.searchParams.has('zoom');
        pause = slowManifest ? 1400 : 0;
        log.push({ kind: 'manifest', hd, url: u.href, t: Date.now() });
      }
      if (p.resourceType === 'Image') {
        const high = Number(u.searchParams.get('w')) > 1600 || hd;
        pause = high ? 1500 : slowBase ? 1400 : 0;
        fail = high && failHD;
        log.push({ kind: 'image-request', hd: high, fail, url: u.href, t: Date.now() });
      }
      if (pause) await delay(pause);
      try {
        await send(fail ? 'Fetch.failRequest' : 'Fetch.continueRequest', {
          requestId: p.requestId,
          ...(fail ? { errorReason: 'Failed' } : {}),
        });
      } catch {}
    }
  });
  const target = await send('Target.createTarget', { url: 'about:blank' }, undefined);
  session = (
    await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, undefined)
  ).sessionId;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__qaPageLoads=0;document.addEventListener('astro:page-load',()=>window.__qaPageLoads++);`,
  });
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result
      .value;
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__qa=[];window.snap=(kind)=>{const i=document.querySelector('[data-viewer-photo]'),s=document.querySelector('[data-viewer-stage]');if(!i)return;const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};const r=i.getBoundingClientRect();__qa.push({kind,t:performance.now(),src:i.src,currentSrc:i.currentSrc,srcset:i.srcset,natural:[i.naturalWidth,i.naturalHeight],layout:[i.offsetWidth,i.offsetHeight],image:rect(i),stage:rect(s),matrix:getComputedStyle(i).transform,inline:i.style.transform,busy:document.querySelector('[data-gallery-viewer]').hasAttribute('aria-busy'),anchor:[(window.ax-r.x)/r.width,(window.ay-r.y)/r.height]});};for(const ev of ['pointerdown','pointerup','load','error'])document.addEventListener(ev,e=>{if(e.target.matches?.('[data-viewer-photo],[data-viewer-stage]')){snap(ev);if(ev==='load')e.target.decode().then(()=>snap('decoded'));}},true);`,
  });
  const snap = async (label) => {
    await evaluate(`snap(${JSON.stringify(label)})`);
  };
  const click = async () => {
    const p = await evaluate(
      `(()=>{const r=document.querySelector('[data-viewer-stage]').getBoundingClientRect();window.ax=r.x+r.width*.6;window.ay=r.y+r.height*.5;return {x:ax,y:ay}})()`,
    );
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...p,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...p,
      button: 'left',
      clickCount: 1,
    });
  };
  const open = async (index = 0) => {
    await evaluate(`document.querySelectorAll('[data-gallery-card]')[${index}].click()`);
    await wait(() => evaluate(`!!document.querySelector('[data-viewer-stage]')`));
  };
  await send('Page.navigate', { url: server + '/galerie?category=macrame' });
  await wait(() => evaluate(`window.__qaPageLoads>0&&!!document.querySelector('[data-gallery-card]')`));
  await delay(1500);
  await open();
  await click();
  await snap('early-accepted');
  const initialManifest = log.find((x) => x.kind === 'manifest' && !x.hd);
  assert.ok(
    initialManifest && Date.now() - initialManifest.t < 1400,
    'initial manifest is still gated at first click',
  );
  const pan = async () => {
    const p = await evaluate('({x:ax,y:ay})');
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...p,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: p.x + 35,
      y: p.y + 20,
      button: 'left',
      buttons: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: p.x + 35,
      y: p.y + 20,
      button: 'left',
      clickCount: 1,
    });
  };
  await pan();
  await snap('early-pan');
  assert.ok(Date.now() - initialManifest.t < 1400, 'initial manifest remains gated through pan');
  await delay(6500);
  await snap('early-after-data');
  slowManifest = false;
  await evaluate(`document.querySelector('[data-viewer-close]').click()`);
  await delay(400);
  hd = false;
  await open();
  await wait(() =>
    evaluate(
      `document.querySelector('[data-viewer-photo]').naturalWidth>0&&!document.querySelector('[data-gallery-viewer]').hasAttribute('aria-busy')`,
    ),
  );
  await delay(800);
  await snap('warm-base');
  const warmBaseSource = await evaluate(`document.querySelector('[data-viewer-photo]').currentSrc`);
  await click();
  await snap('warm-click');
  await pan();
  await snap('warm-pan');
  // The controller predecodes HD before publishing its source to the visible photo.
  // Await selection, not a fixed delay shorter than the injected image latency.
  await wait(() => evaluate(`(()=>{const src=document.querySelector('[data-viewer-photo]').currentSrc;return src&&src!==${JSON.stringify(warmBaseSource)}&&Number(new URL(src).searchParams.get('w'))===4096})()`));
  await snap('HD-during');
  await delay(5500);
  await snap('HD-after');
  await click();
  await snap('toggle-after-HD');
  // Fresh navigation: independently delayed base image, then failed HD and explicit retry.
  log.push({ kind: 'first-opening', samples: await evaluate('__qa') });
  hd = false;
  slowBase = true;
  await send('Page.navigate', { url: server + '/galerie?category=macrame&seed=123' });
  await wait(() => evaluate(`location.search.includes('seed=123')&&window.__qaPageLoads>0&&!!document.querySelector('[data-gallery-card]')`));
  await delay(1800);
  await open();
  await wait(() =>
    evaluate(
      `document.querySelector('[data-viewer-photo]').src!==''&&!document.querySelector('[data-gallery-viewer]').hasAttribute('aria-busy')`,
    ),
  );
  await click();
  await snap('base-pending-click');
  await delay(3300);
  await snap('base-after-load');
  await evaluate(`document.querySelector('[data-viewer-close]').click()`);
  await delay(400);
  hd = false;
  slowBase = false;
  await open(1);
  await wait(() =>
    evaluate(
      `document.querySelector('[data-viewer-photo]').naturalWidth>0&&!document.querySelector('[data-gallery-viewer]').hasAttribute('aria-busy')`,
    ),
  );
  await delay(800);
  failHD = true;
  await click();
  await delay(2400);
  await snap('HD-failed-base');
  const failedHDState = await evaluate(
    `(()=>{const i=document.querySelector('[data-viewer-photo]'),v=document.querySelector('[data-gallery-viewer]');return {src:i.currentSrc,naturalWidth:i.naturalWidth,transform:i.style.transform,busy:v.hasAttribute('aria-busy')}})()`,
  );
  assert.ok(
    failedHDState.naturalWidth > 0 &&
      Number(new URL(failedHDState.src).searchParams.get('w')) <= 1600,
    'HD failure retains the decoded base image',
  );
  assert.match(failedHDState.transform, /scale\(2\.5\)/);
  assert.equal(failedHDState.busy, false, 'HD failure does not leave the viewer busy');
  assert.ok(
    log.some((x) => x.kind === 'image-request' && x.fail),
    'the HD failure was injected',
  );
  failHD = false;
  await evaluate(`document.querySelector('[data-viewer-retry]').click()`);
  await delay(6500);
  await snap('HD-retry');
  const retriedHD = await evaluate(
    `(()=>{const i=document.querySelector('[data-viewer-photo]');return {src:i.currentSrc,naturalWidth:i.naturalWidth,transform:i.style.transform}})()`,
  );
  assert.ok(
    retriedHD.naturalWidth > 0 && Number(new URL(retriedHD.src).searchParams.get('w')) === 4096,
    'retry decodes the new HD source',
  );
  assert.match(retriedHD.transform, /scale\(2\.5\)/);
  log.push({ kind: 'viewer', samples: await evaluate('__qa') });
  const firstOpening = log.find((x) => x.kind === 'first-opening').samples;
  const sample = (kind) => firstOpening.find((x) => x.kind === kind);
  const accepted = sample('early-accepted'),
    panned = sample('early-pan'),
    settled = sample('early-after-data');
  assert.match(
    accepted.inline,
    /scale\(2\.5\)/,
    'first click is accepted before the initial manifest resolves',
  );
  assert.match(
    panned.inline,
    /translate\((?!0px, 0px)[^)]+\) scale\(2\.5\)/,
    'pan is applied while the initial manifest is pending',
  );
  assert.match(settled.inline, /scale\(2\.5\)/, 'manifest release does not reset accepted zoom');
  assert.equal(settled.inline, panned.inline, 'manifest release preserves the pan translation');
  assert.ok(
    closePaintedRect(paintedRect(panned), paintedRect(settled), 0.01),
    `painted image rect remains stable across manifest release: ${paintedRect(panned)} -> ${paintedRect(settled)}`,
  );
  const initialHD = firstOpening.find(
    (x) =>
      x.kind === 'decoded' &&
      x.currentSrc &&
      Number(new URL(x.currentSrc).searchParams.get('w')) === 4096,
  );
  assert.ok(initialHD, 'the newly selected HD source completed image.decode()');
  assert.ok(
    initialHD.currentSrc && initialHD.currentSrc !== accepted.currentSrc,
    'decoded HD currentSrc is a new nonempty source',
  );
  assert.ok(
    log.some((x) => x.kind === 'manifest' && x.hd),
    'the zoom-specific manifest request was observed',
  );
  assert.ok(
    log.some(
      (x) =>
        x.kind === 'image-request' && x.hd && Number(new URL(x.url).searchParams.get('w')) === 4096,
    ),
    '4096px HD image bytes were actually requested',
  );
  assert.ok(
    closePoint(panned.anchor, settled.anchor) < 0.02,
    `normalized painted anchor remains stable across decode: ${panned.anchor} -> ${settled.anchor}`,
  );
  const warm = (kind) => firstOpening.find((x) => x.kind === kind);
  const base = warm('warm-base'),
    zoomPan = warm('warm-pan'),
    hdPending = warm('HD-during'),
    hdDecoded = warm('HD-after');
  assert.ok(base.natural[0] > 0, 'the base currentSrc is actually decoded before zoom');
  assert.ok(zoomPan.anchor[0] > 0.55, 'the tracked photo anchor is non-central');
  assert.notEqual(
    base.currentSrc,
    hdPending.currentSrc,
    'a new HD currentSrc is selected while loading',
  );
  assert.equal(Number(new URL(hdPending.currentSrc).searchParams.get('w')), 4096);
  assert.equal(
    hdPending.natural[0],
    base.natural[0],
    'pending HD still paints the prior decoded base',
  );
  assert.notEqual(
    base.currentSrc,
    hdDecoded.currentSrc,
    'HD replacement changes the genuinely loaded base currentSrc',
  );
  assert.equal(Number(new URL(hdDecoded.currentSrc).searchParams.get('w')), 4096);
  assert.ok(hdDecoded.natural[0] > 0, 'new HD currentSrc has decoded natural dimensions');
  assert.ok(
    firstOpening.some((x) => x.kind === 'decoded' && x.currentSrc === hdDecoded.currentSrc),
    'decode() completed for the replacement HD currentSrc, not only the previous source',
  );
  assert.equal(hdDecoded.inline, zoomPan.inline, 'HD replacement preserves zoom and pan');
  assert.ok(
    closePaintedRect(paintedRect(zoomPan), paintedRect(hdDecoded), 0.01),
    `painted rect remains stable through HD replacement: ${paintedRect(zoomPan)} -> ${paintedRect(hdDecoded)}`,
  );
  assert.ok(
    closePoint(zoomPan.anchor, hdDecoded.anchor) < 0.02,
    `normalized painted anchor survives HD replacement: ${zoomPan.anchor} -> ${hdDecoded.anchor}`,
  );
  if (mode === 'navigation' || mode === 'production') {
    await evaluate(`document.querySelector('[data-viewer-next]').click()`);
    await wait(() =>
      evaluate(
        `document.querySelector('[data-viewer-photo]').naturalWidth>0&&!document.querySelector('[data-gallery-viewer]').hasAttribute('aria-busy')`,
      ),
    );
    await delay(700);
    await click();
    await delay(200);
    await evaluate(`document.querySelector('[data-viewer-next]').click()`);
    await wait(() =>
      evaluate(
        `document.querySelector('[data-viewer-photo]').naturalWidth>0&&!document.querySelector('[data-gallery-viewer]').hasAttribute('aria-busy')`,
      ),
    );
    const navigationSource = await evaluate(`document.querySelector('[data-viewer-photo]').src`);
    await delay(4500);
    assert.equal(
      await evaluate(`document.querySelector('[data-viewer-photo]').src`),
      navigationSource,
    );
    assert.match(
      await evaluate(`document.querySelector('[data-viewer-photo]').style.transform`),
      /scale\(1\)/,
    );
    await click();
    await delay(150);
    await evaluate(`document.querySelector('[data-viewer-close]').click()`);
    await delay(3500);
    assert.equal(await evaluate(`!!document.querySelector('[data-gallery-viewer]')`), false);
    assert.equal(await evaluate(`document.querySelector('main').inert`), false);
    log.push({ kind: 'navigation-close', pass: true });
    await open();
    await wait(() =>
      evaluate(
        `document.querySelector('[data-viewer-photo]').naturalWidth>0&&!document.querySelector('[data-gallery-viewer]').hasAttribute('aria-busy')`,
      ),
    );
  }
  await evaluate(`document.querySelector('[data-viewer-close]').click()`);
  const typo = [];
  if (mode === 'production')
    for (const locale of ['fr', 'en', 'it']) {
      await send('Network.setCookie', { name: 'locale', value: locale, url: server });
      for (const width of [375, 768, 1024, 1440]) {
        await send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: width === 375,
        });
        await send('Page.navigate', { url: server + '/' });
        await wait(() =>
          evaluate(
            `document.documentElement.lang===${JSON.stringify(locale)}&&!!document.querySelector('.teaser__title')`,
          ),
        );
        await evaluate('document.fonts.ready');
        typo.push(
          await evaluate(
            `(()=>{const e=document.querySelector('.teaser__title'),s=getComputedStyle(e),r=e.getBoundingClientRect();return {locale:document.documentElement.lang,width:innerWidth,tag:e.tagName,text:e.textContent,font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight,color:s.color,align:s.textAlign,transform:s.textTransform,overflow:document.documentElement.scrollWidth>innerWidth,titleFits:r.width<=innerWidth}})()`,
          ),
        );
      }
    }
  log.push({ kind: 'typo', samples: typo });
  await writeFile(path.join(root, 'gallery-cold-zoom-report.json'), JSON.stringify(log, null, 2));
  console.log(
    JSON.stringify(
      {
        coldManifest: {
          accepted: accepted.inline,
          panned: panned.inline,
          afterRelease: settled.inline,
          anchorBefore: panned.anchor,
          anchorAfter: settled.anchor,
        },
        hd: {
          base: base.currentSrc,
          decoded: hdDecoded.currentSrc,
          transform: hdDecoded.inline,
          anchorBefore: zoomPan.anchor,
          anchorAfter: hdDecoded.anchor,
        },
        navigation: log.find((x) => x.kind === 'navigation-close'),
      },
      null,
      2,
    ),
  );
} finally {
  ws?.close();
  chrome.kill();
  await delay(600);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
