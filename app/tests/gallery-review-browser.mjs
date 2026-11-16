import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const configuredBaseUrl = process.env.FILING_QA_BASE_URL;
let baseUrl = configuredBaseUrl;
const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : 'google-chrome');
const tempRoot = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  ...(process.env.LOCALAPPDATA ? ['Temp', 'opencode'] : []),
);
const userDataDir = await mkdtemp(path.join(tempRoot, 'gallery-review-chrome-'));
let chrome;
let server;
let ws;
let targetSession;
const failedResponses = [];
const successfulResponses = [];
const networkRequests = [];
const networkEvents = [];
let desktopProbeTargetId;
let desktopProbeSession;

async function waitFor(readiness) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const value = await readiness();
      if (value) return value;
    } catch {
      // Browser startup and image/network events are asynchronous.
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for Chrome or the requested UI state');
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function imageManifest(html) {
  const match = html.match(
    /<script type="application\/json" data-gallery-manifest>([\s\S]*?)<\/script>/,
  );
  assert.ok(match, 'server response embeds the gallery manifest');
  return JSON.parse(match[1]);
}

function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const channels = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

try {
  if (!baseUrl) {
    const serverPort = await availablePort();
    baseUrl = `http://127.0.0.1:${serverPort}`;
    server = spawn(process.execPath, ['dist/server/entry.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(serverPort) },
      stdio: 'inherit',
    });
  }
  await waitFor(async () => {
    const result = await fetch(new URL('/galerie', baseUrl));
    return result.ok;
  });
  const httpSuite = spawnSync(process.execPath, ['--test', 'tests/gallery-production.test.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, FILING_QA_BASE_URL: baseUrl },
    stdio: 'inherit',
  });
  assert.equal(httpSuite.status, 0, 'production HTTP regression suite succeeds against this build');
  const coldZoomSuite = spawnSync(
    process.execPath,
    ['tests/gallery-cold-zoom-browser.mjs', 'navigation'],
    {
      cwd: process.cwd(),
      env: { ...process.env, QA_URL: baseUrl },
      stdio: 'inherit',
    },
  );
  assert.equal(coldZoomSuite.status, 0, 'fresh-profile cold-zoom browser regressions pass');

  const response = await fetch(new URL('/galerie?category=macrame', baseUrl), {
    headers: { cookie: 'locale=fr' },
  });
  assert.equal(response.status, 200, `production server available at ${baseUrl}`);
  const categoryHtml = await response.text();
  const categoryManifest = imageManifest(categoryHtml);
  const labels = [...categoryHtml.matchAll(/class="catalogue-card"[^>]*aria-label="([^"]+)"/g)].map(
    ([, label]) => label,
  );
  assert.equal(labels.length, 2);
  assert.equal(new Set(labels).size, 2, 'SSR labels are distinct');

  const group = categoryManifest.types.find(({ imageCount }) => imageCount > 1);
  assert.ok(group, 'Macramé fixture includes a multi-image group for viewer geometry');
  const port = await availablePort();
  chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--autoplay-policy=no-user-gesture-required',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const version = await waitFor(async () => {
    const result = await fetch(`http://127.0.0.1:${port}/json/version`);
    return result.ok ? result.json() : undefined;
  });
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) {
      if (message.method === 'Network.requestWillBeSent') {
        networkRequests.push(message.params.request.url);
        networkEvents.push({
          type: 'request',
          sessionId: message.sessionId,
          requestId: message.params.requestId,
          timestamp: message.params.timestamp,
          url: message.params.request.url,
          frameId: message.params.frameId,
          loaderId: message.params.loaderId,
          initiator: message.params.initiator,
        });
      } else if (message.method === 'Network.responseReceived') {
        const { url, status } = message.params.response;
        (status >= 400 ? failedResponses : successfulResponses).push({ url, status });
        networkEvents.push({
          type: 'response',
          sessionId: message.sessionId,
          requestId: message.params.requestId,
          timestamp: message.params.timestamp,
          url,
          status,
          mimeType: message.params.response.mimeType,
          encodedDataLength: message.params.response.encodedDataLength,
        });
      } else if (message.method === 'Network.loadingFinished') {
        networkEvents.push({
          type: 'finished',
          sessionId: message.sessionId,
          requestId: message.params.requestId,
          timestamp: message.params.timestamp,
          encodedDataLength: message.params.encodedDataLength,
        });
      } else if (message.method === 'Network.loadingFailed') {
        networkEvents.push({
          type: 'failed',
          sessionId: message.sessionId,
          requestId: message.params.requestId,
          timestamp: message.params.timestamp,
          errorText: message.params.errorText,
        });
      }
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(message.error);
    else request.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: targetSession } = await send('Target.attachToTarget', {
    targetId,
    flatten: true,
  }));
  const call = (method, params) => send(method, params, targetSession);
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  let lifecycleProbeError;
  let lifecycleProbeInstalled = false;
  let lifecycleProbeInstallCount = 0;
  let heldLocaleResponse;
  let heldZoomResponse;
  ws.addEventListener('message', async ({ data }) => {
    const message = JSON.parse(data);
    if (message.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = message.params;
    if (heldLocaleResponse && message.params.responseStatusCode) {
      const url = new URL(request.url);
      if (
        url.pathname === '/galerie' &&
        url.searchParams.get('seed') === heldLocaleResponse.seed &&
        (url.searchParams.get('category') ?? undefined) === heldLocaleResponse.category
      ) {
        heldLocaleResponse.paused = {
          requestId,
          responseStatusCode: message.params.responseStatusCode,
          url: request.url,
          resourceType: message.params.resourceType,
        };
        return;
      }
    }
    if (heldZoomResponse && message.params.responseStatusCode) {
      const url = new URL(request.url);
      if (url.pathname === '/galerie' && url.searchParams.get('zoom') === '1') {
        heldZoomResponse.paused = {
          requestId,
          responseStatusCode: message.params.responseStatusCode,
          url: request.url,
          resourceType: message.params.resourceType,
        };
        return;
      }
    }
    if (!request.url.includes('galerie.astro')) {
      await call('Fetch.continueRequest', { requestId });
      return;
    }
    try {
      const body = await call('Fetch.getResponseBody', { requestId });
      let source = body.base64Encoded ? Buffer.from(body.body, 'base64').toString() : body.body;
      const gsapImport = source.match(/import\{([^}]+)\}from["'][^"']*gsap[^"']*["'];/);
      assert.ok(gsapImport, 'gallery client module has its bundled GSAP import');
      const gsapName = gsapImport[1].match(/\bas (\w+)$/)?.[1];
      assert.ok(gsapName, 'GSAP module context binding identified');
      const importEnd = gsapImport.index + gsapImport[0].length;
      assert.ok(importEnd > 0, 'gallery module import is terminated');
      const observation = `const __originalContext=${gsapName}.context;${gsapName}.context=(...args)=>{const context=__originalContext(...args);(window.__galleryContexts??=[]).push(context);return context;};window.__galleryGsap=${gsapName};`;
      source = source.slice(0, importEnd) + observation + source.slice(importEnd);
      const registry = source.match(/function \w+\(\w+,\w+=!0\)\{let \w+=(\w+)\.get\(/);
      assert.ok(registry, 'viewer-instance tween registry located for read-only count');
      source = source.replace(
        registry[0],
        `window.__galleryViewerMotion=()=>${registry[1]}.size;${registry[0]}`,
      );
      await call('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }],
        body: Buffer.from(source).toString('base64'),
      });
      lifecycleProbeInstalled = true;
      lifecycleProbeInstallCount++;
      await call('Fetch.disable');
    } catch (error) {
      lifecycleProbeError = error;
      await call('Fetch.continueRequest', { requestId });
    }
  });
  const clickAt = async (selector) => {
    const point = await evaluate(
      `(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`,
    );
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      ...point,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      ...point,
    });
  };
  const movePointerTo = async (selector, dx = 0, dy = 0) => {
    const point = await evaluate(
      `(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2+${dx},y:r.top+r.height/2+${dy}}})()`,
    );
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    return point;
  };
  const dragPointerBy = async (selector, dx, dy) => {
    const point = await movePointerTo(selector);
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      ...point,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      button: 'left',
      buttons: 1,
      x: point.x + dx,
      y: point.y + dy,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      x: point.x + dx,
      y: point.y + dy,
    });
    return evaluate(
      `(() => {const image=document.querySelector('[data-viewer-photo]'),stage=document.querySelector('[data-viewer-stage]');return {transform:image.style.transform,zoomed:stage.hasAttribute('data-zoomed'),src:image.src}})()`,
    );
  };
  const pressEscape = async () => {
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
  };

  await call('Page.enable');
  await call('Network.enable');
  await call('Fetch.enable', {
    patterns: [{ urlPattern: '*galerie.astro*script*.js', requestStage: 'Response' }],
  });
  for (const locale of ['fr', 'en', 'it']) {
    await call('Network.setCookie', { name: 'locale', value: locale, url: baseUrl });
    const localizedResponse = await fetch(new URL('/galerie?category=macrame', baseUrl), {
      headers: { cookie: `locale=${locale}` },
    });
    const localizedHtml = await localizedResponse.text();
    const localizedLabels = [
      ...localizedHtml.matchAll(/class="catalogue-card"[^>]*aria-label="([^"]+)"/g),
    ].map(([, label]) => label);
    assert.equal(localizedLabels.length, 2, `${locale} SSR retains both groups`);
    assert.equal(new Set(localizedLabels).size, 2, `${locale} SSR names differ`);

    await call('Page.navigate', { url: new URL('/galerie', baseUrl).href });
    await waitFor(() =>
      evaluate(
        `document.readyState === 'complete' && !!document.querySelector('[data-gallery-category="macrame"]')`,
      ),
    );
    if (locale === 'fr') {
      await waitFor(() => lifecycleProbeInstalled || lifecycleProbeError);
      if (lifecycleProbeError) throw lifecycleProbeError;
    }
    await evaluate(`document.querySelector('[data-gallery-category="macrame"]').click()`);
    await waitFor(() =>
      evaluate(
        `document.querySelectorAll('[data-gallery-card]').length === 2 && !document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')`,
      ),
    );
    const clientLabels = await evaluate(
      `Array.from(document.querySelectorAll('[data-gallery-card]'), button => button.getAttribute('aria-label'))`,
    );
    assert.deepEqual(clientLabels, localizedLabels, `${locale} client labels match SSR`);
    assert.doesNotMatch(
      await evaluate(`document.querySelector('[data-gallery-root]').innerText`),
      /Aperçu de nos broderies|Samples:|Images:/i,
    );
    await evaluate(
      `document.querySelector('.catalogue-nav [data-gallery-category="macrame"]').focus({focusVisible:true})`,
    );
    await waitFor(() =>
      evaluate(
        `getComputedStyle(document.querySelector('.catalogue-nav [data-gallery-category="macrame"]')).backgroundColor==='rgb(244, 132, 8)'`,
      ),
    );
    const selectedControl = await evaluate(`(() => {
      const button=document.querySelector('.catalogue-nav [data-gallery-category="macrame"]');
      const style=getComputedStyle(button);
      return {pressed:button.getAttribute('aria-pressed'),background:style.backgroundColor,color:style.color,outline:style.outlineStyle};
    })()`);
    assert.equal(selectedControl.pressed, 'true');
    assert.equal(selectedControl.background, 'rgb(244, 132, 8)');
    assert.ok(contrastRatio(selectedControl.color, selectedControl.background) >= 4.5);
    assert.notEqual(
      selectedControl.outline,
      'none',
      'selected filter remains keyboard focus visible',
    );
    console.log(`Accessible names PASS (${locale}): ${clientLabels.join(' | ')}`);

    if (locale !== 'fr') continue;
    for (const [width, height] of [
      [1440, 900],
      [1920, 1080],
      [1024, 768],
      [768, 1024],
      [375, 812],
      [667, 375],
    ]) {
      await call('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await evaluate(
        `document.querySelector('[data-gallery-card][data-type="${group.id}"]').click()`,
      );
      await waitFor(() =>
        evaluate(
          `!!document.querySelector('[data-viewer-photo]')?.naturalWidth && !document.querySelector('[data-gallery-viewer]').hasAttribute('aria-busy')`,
        ),
      );

      for (const state of ['normal', 'error']) {
        if (state === 'error') {
          await evaluate(
            `(() => { const image = document.querySelector('[data-viewer-photo]'); image.srcset = ''; image.src = '/qa-unavailable-image.webp'; })()`,
          );
          await waitFor(() => evaluate(`!document.querySelector('[data-viewer-retry]').hidden`));
        }
        const geometry = await evaluate(`(() => {
          const selectors = ['[data-viewer-close]', '[data-viewer-prev]', '[data-viewer-next]'${state === 'error' ? ", '[data-viewer-retry]'" : ''}];
          const rect = element => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, top:r.top, right:r.right, bottom:r.bottom, left:r.left, width:r.width, height:r.height }; };
          const photo = rect(document.querySelector('[data-viewer-photo]'));
          const controls = rect(document.querySelector('.catalogue-viewer__controls'));
          return { panel: rect(document.querySelector('.catalogue-viewer__panel')), photo, controls, paintedPhotoGap: controls.top-photo.bottom, buttons: selectors.map(selector => ({selector, ...rect(document.querySelector(selector))})) };
        })()`);
        assert.ok(
          geometry.panel.top >= 0 && geometry.panel.bottom <= height,
          JSON.stringify(geometry),
        );
        for (const button of geometry.buttons) {
          assert.ok(button.width >= 44 && button.height >= 44, JSON.stringify(button));
          assert.ok(
            button.top >= 0 && button.left >= 0 && button.bottom <= height && button.right <= width,
            JSON.stringify(button),
          );
        }
        if (width >= 1024) {
          const previous = geometry.buttons.find(({ selector }) => selector.endsWith('prev]'));
          const next = geometry.buttons.find(({ selector }) => selector.endsWith('next]'));
          assert.ok(previous.left <= geometry.panel.left + 1);
          assert.ok(next.right >= geometry.panel.right - 1);
        }
        if (width < 1024 && state === 'normal') {
          assert.ok(Math.abs(geometry.paintedPhotoGap - 12) <= 1, JSON.stringify(geometry));
        }
        console.log(`Geometry PASS ${width}x${height} ${state}: ${JSON.stringify(geometry)}`);
        if (width === 375 && state === 'normal') {
          await evaluate(
            `(() => {const image=document.querySelector('[data-viewer-photo]');image.srcset='';image.width=600;image.height=1200;image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1200"><rect width="600" height="1200" fill="orange"/></svg>');image.dispatchEvent(new Event('load'));})()`,
          );
          await waitFor(() =>
            evaluate(`document.querySelector('[data-viewer-photo]').naturalWidth===600`),
          );
          const portrait = await evaluate(
            `(() => {const image=document.querySelector('[data-viewer-photo]'),controls=document.querySelector('.catalogue-viewer__controls'),panel=document.querySelector('.catalogue-viewer__panel'),i=image.getBoundingClientRect(),c=controls.getBoundingClientRect(),p=panel.getBoundingClientRect();return {ratio:i.width/i.height,natural:Number(image.naturalWidth)/image.naturalHeight,gap:c.top-i.bottom,panelTop:p.top,panelBottom:p.bottom}})()`,
          );
          assert.ok(Math.abs(portrait.ratio - 0.5) < 0.01);
          assert.ok(Math.abs(portrait.gap - 12) <= 1);
          assert.ok(portrait.panelTop >= 0 && portrait.panelBottom <= height);
          console.log(`Portrait viewer geometry PASS: ${JSON.stringify(portrait)}`);
        }
        if (width === 667 && state === 'error') {
          await evaluate(`document.querySelector('[data-viewer-retry]').click()`);
          await waitFor(() =>
            evaluate(
              `!!document.querySelector('[data-viewer-photo]')?.naturalWidth && document.querySelector('[data-viewer-retry]').hidden`,
            ),
          );
          console.log('Real image error/retry PASS');
        }
      }
      await evaluate(`document.querySelector('[data-viewer-close]').click()`);
    }
  }

  // Locale arrival suppression must survive the genuine language-switch flow
  // even when sessionStorage forces a client seed unlike the URL's SSR seed.
  await call('Network.setCookie', { name: 'locale', value: 'fr', url: baseUrl });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  const localeArrivalProbeKey = 'filing:qa-locale-arrival-probe';
  const localeArrivalProbeSource = `(() => {
    const key=${JSON.stringify(localeArrivalProbeKey)};
    const install=()=>{
      let config;
      try{config=JSON.parse(sessionStorage.getItem(key)||'null')}catch{return}
      if(!config||window.__localeArrivalProbe?.id===config.id)return;
      const probe=window.__localeArrivalProbe={...config,samples:0,expectedSeedSamples:0,expectedSeedVisibleMax:0,expectedSeedActiveMs:0,replayFrames:0,positiveSamples:0,positiveFrames:0,firstReplay:null,startedAt:performance.now(),seedSeenAt:null,responseReadyAt:config.baselineNodeIds?performance.now():null,responseHeldAt:null,responseReleaseAt:null,commitAt:null,baselineNodeIds:config.baselineNodeIds??null,committedNodeCount:0};
      const sample=()=>{
        if(window.__localeArrivalProbe!==probe||probe.stopped)return;
        probe.samples++;
        const root=document.querySelector('[data-gallery-root]');
        if(root){
          const allCards=[...root.querySelectorAll('[data-gallery-card]')];
          const signature=allCards.map(card=>card.dataset.category+'/'+card.dataset.type+'/'+card.dataset.image);
          const nodeIds=allCards.map(card=>{if(!card.__qaArrivalNodeId)card.__qaArrivalNodeId=crypto.randomUUID();return card.__qaArrivalNodeId});
          const newNodes=probe.baselineNodeIds&&nodeIds.length===probe.expectedSignature.length&&nodeIds.every(id=>!probe.baselineNodeIds.includes(id));
          const renderedExpectedSeed=JSON.stringify(signature)===JSON.stringify(probe.expectedSignature)&&newNodes;
          const cards=[...root.querySelectorAll('[data-gallery-card]')].filter(card=>{const r=card.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0});
          const active=[];
          for(const card of cards){const node=card.querySelector('[data-card-motion]');if(!node)continue;const style=getComputedStyle(node);const matrix=new DOMMatrixReadOnly(style.transform);const translated=Math.abs(matrix.m41)>.5||Math.abs(matrix.m42)>.5;const scaled=Math.abs(Math.hypot(matrix.a,matrix.b)-1)>.002;const opacity=Number(style.opacity);if(opacity<.999||translated||scaled)active.push({type:card.dataset.type,image:card.dataset.image,opacity,x:matrix.m41,y:matrix.m42,scale:Math.hypot(matrix.a,matrix.b),transform:style.transform});}
          if(probe.phase==='suppression'&&renderedExpectedSeed){
            if(probe.seedSeenAt===null){probe.seedSeenAt=performance.now();probe.commitAt=probe.seedSeenAt;probe.committedNodeCount=nodeIds.filter(id=>!probe.baselineNodeIds.includes(id)).length;}
            probe.expectedSeedSamples++;
            probe.expectedSeedVisibleMax=Math.max(probe.expectedSeedVisibleMax,cards.length);
            probe.expectedSeedActiveMs=performance.now()-probe.seedSeenAt;
            if(active.length){probe.replayFrames++;probe.firstReplay??={at:performance.now(),seed:probe.expectedSeed,cards:active};}
          }else if(probe.phase==='positive'){
            probe.positiveSamples++;
            if(active.length)probe.positiveFrames++;
          }
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    };
    window.__localeArrivalProbeArm=(config)=>{sessionStorage.setItem(key,JSON.stringify(config));window.__localeArrivalProbe=undefined;install()};
    window.__localeArrivalProbeCaptureBaseline=()=>{const p=window.__localeArrivalProbe;if(!p)return null;const cards=[...document.querySelectorAll('[data-gallery-card]')];const ids=cards.map(card=>{if(!card.__qaArrivalNodeId)card.__qaArrivalNodeId=crypto.randomUUID();return card.__qaArrivalNodeId});window.__localeArrivalPreResponseCards={probeId:p.id,cards,ids};return {probeId:p.id,nodeIds:ids,nodeCount:ids.length}};
    window.__localeArrivalProbeAnchorResponse=()=>{const p=window.__localeArrivalProbe,baseline=window.__localeArrivalPreResponseCards;if(!p||!baseline||baseline.probeId!==p.id)return null;const baselineNodeIds=baseline.ids;p.baselineNodeIds=baselineNodeIds;p.responseReadyAt=performance.now();p.responseHeldAt=p.responseReadyAt;p.seedSeenAt=null;p.commitAt=null;p.expectedSeedSamples=0;p.expectedSeedVisibleMax=0;p.expectedSeedActiveMs=0;p.replayFrames=0;p.firstReplay=null;p.committedNodeCount=0;sessionStorage.setItem(key,JSON.stringify({...p,baselineNodeIds}));return {baselineNodeIds,baselineNodeCount:baselineNodeIds.length,baselineConnectedCount:baseline.cards.filter(card=>card.isConnected).length,at:p.responseReadyAt}};
    window.__localeArrivalProbeMarkRelease=(at)=>{const p=window.__localeArrivalProbe;if(!p)return false;p.responseReleaseAt=at;return true};
    window.__localeArrivalProbeStop=()=>{const p=window.__localeArrivalProbe;if(p)p.stopped=true;sessionStorage.removeItem(key);return true};
    window.__localeArrivalProbePhase=(phase)=>{const probe=window.__localeArrivalProbe;if(!probe)return false;probe.phase=phase;if(phase==='positive'){probe.positiveSamples=0;probe.positiveFrames=0}return true};
    window.__localeArrivalProbeSnapshot=()=>{const p=window.__localeArrivalProbe;if(!p)return null;return {id:p.id,phase:p.phase,expectedSeed:p.expectedSeed,samples:p.samples,expectedSeedSamples:p.expectedSeedSamples,expectedSeedVisibleMax:p.expectedSeedVisibleMax,expectedSeedActiveMs:p.expectedSeedActiveMs,replayFrames:p.replayFrames,positiveSamples:p.positiveSamples,positiveFrames:p.positiveFrames,firstReplay:p.firstReplay,seedSeen:p.seedSeenAt!==null,responseReady:p.responseReadyAt!==null,responseHeldMs:p.responseReadyAt===null?0:performance.now()-p.responseReadyAt,baselineNodeCount:p.baselineNodeIds?.length??0,committedNodeCount:p.committedNodeCount,commitAt:p.commitAt,releaseAt:p.responseReleaseAt,releaseToCommitMs:p.commitAt===null||p.responseReleaseAt===null?null:p.commitAt-p.responseReleaseAt}};
    install();
    new MutationObserver(install).observe(document,{childList:true,subtree:true});
    document.addEventListener('astro:after-swap',install);
  })()`;
  await call('Page.addScriptToEvaluateOnNewDocument', { source: localeArrivalProbeSource });
  await evaluate(localeArrivalProbeSource);
  const readVisibleCards = () =>
    evaluate(`(() => {
      const cards=[...document.querySelectorAll('[data-gallery-card]')];
      const visible=cards.filter(card=>{const rect=card.getBoundingClientRect();return rect.top<innerHeight&&rect.bottom>0});
      return {scrollY,visible:visible.map(card=>{const motion=card.querySelector('[data-card-motion]'),style=getComputedStyle(motion);return {type:card.dataset.type,image:card.dataset.image,opacity:Number(style.opacity),visibility:style.visibility,transform:style.transform,inlineOpacity:motion.style.opacity,inlineVisibility:motion.style.visibility,inlineTransform:motion.style.transform}})};
    })()`);
  const scrollCardsIntoView = () =>
    evaluate(
      `(() => {const card=document.querySelector('[data-gallery-card]'),rect=card.getBoundingClientRect(),target=Math.max(100,Math.round(scrollY+rect.top-240));window.scrollTo(0,target);return scrollY})()`,
    );
  const assertSettledVisibleCards = async (minimum, label, expectedScrollY = languageScrollY) => {
    await waitFor(async () => {
      const state = await readVisibleCards();
      return state.visible.length >= minimum &&
        state.visible.every(
          ({ opacity, visibility, transform, inlineOpacity, inlineVisibility, inlineTransform }) =>
            opacity === 1 &&
            visibility === 'visible' &&
            transform === 'none' &&
            inlineOpacity === '' &&
            inlineVisibility === '' &&
            inlineTransform === '',
        )
        ? state
        : undefined;
    });
    const state = await readVisibleCards();
    assert.ok(state.visible.length >= minimum, `${label}: at least ${minimum} cards are in view`);
    assert.ok(Math.abs(state.scrollY - expectedScrollY) <= 1, `${label}: scroll position restored`);
    assert.ok(
      state.visible.every(
        ({ opacity, visibility, transform, inlineOpacity, inlineVisibility, inlineTransform }) =>
          opacity === 1 &&
          visibility === 'visible' &&
          transform === 'none' &&
          inlineOpacity === '' &&
          inlineVisibility === '' &&
          inlineTransform === '',
      ),
      `${label}: visible cards have no replayed arrival styles`,
    );
    return state;
  };
  const armLocaleArrivalProbe = async (id, expectedSeed, expectedCards) => {
    await evaluate(
      `window.__localeArrivalProbeArm(${JSON.stringify({ id, expectedSeed, expectedSignature: cardSignature(expectedCards), phase: 'suppression' })})`,
    );
  };
  const pauseLocaleSyncResponse = async (seed, category) => {
    heldLocaleResponse = { seed, category, paused: undefined };
    await call('Fetch.enable', {
      patterns: [{ urlPattern: `*galerie?seed=${seed}*`, requestStage: 'Response' }],
    });
  };
  const releaseLocaleSyncResponse = async () => {
    assert.ok(heldLocaleResponse?.paused, 'locale sync response is paused at response stage');
    const paused = heldLocaleResponse.paused;
    const releaseAt = await evaluate('performance.now()');
    await evaluate(`window.__localeArrivalProbeMarkRelease(${releaseAt})`);
    await call('Fetch.continueResponse', { requestId: paused.requestId });
    heldLocaleResponse = undefined;
    await call('Fetch.disable');
    return { ...paused, releaseAt };
  };
  const pauseNextZoomResponse = async () => {
    heldZoomResponse = { paused: undefined };
    await call('Fetch.enable', {
      patterns: [{ urlPattern: '*galerie*zoom=1*', requestStage: 'Response' }],
    });
  };
  const releaseZoomResponse = async () => {
    assert.ok(heldZoomResponse?.paused, 'HD manifest response is paused at response stage');
    const paused = heldZoomResponse.paused;
    await call('Fetch.continueResponse', { requestId: paused.requestId });
    heldZoomResponse = undefined;
    await call('Fetch.disable');
    return paused;
  };
  const waitForLocaleSuppressionWindow = async (minimum, label) => {
    const probe = await waitFor(async () => {
      const state = await evaluate('window.__localeArrivalProbeSnapshot?.()');
      return state?.seedSeen &&
        state.expectedSeedSamples > 0 &&
        state.expectedSeedVisibleMax >= minimum &&
        state.baselineNodeCount > 0 &&
        state.committedNodeCount === state.baselineNodeCount &&
        state.expectedSeedActiveMs >= 1650
        ? state
        : undefined;
    });
    assert.ok(
      probe.samples > 0 && probe.expectedSeedSamples > 0,
      `${label}: capture sampled frames after the client seed rendered`,
    );
    assert.ok(
      probe.expectedSeedVisibleMax >= minimum,
      `${label}: at least ${minimum} visible cards sampled`,
    );
    assert.ok(probe.baselineNodeCount > 0, `${label}: SSR nodes were anchored at response-ready`);
    assert.equal(
      probe.committedNodeCount,
      probe.baselineNodeCount,
      `${label}: every SSR card node was replaced by the committed client response render`,
    );
    assert.ok(
      probe.releaseToCommitMs >= 0,
      `${label}: observed DOM commit occurred after response release`,
    );
    assert.equal(
      probe.replayFrames,
      0,
      `${label}: no visible photo arrival styles replayed during the live observation window`,
    );
    console.log(
      `${label} live suppression probe: ${JSON.stringify({ samples: probe.samples, seedSamples: probe.expectedSeedSamples, visibleMax: probe.expectedSeedVisibleMax, baselineNodes: probe.baselineNodeCount, committedNewNodes: probe.committedNodeCount, releaseAt: probe.releaseAt, commitAt: probe.commitAt, releaseToCommitMs: Math.round(probe.releaseToCommitMs), commitToWindowMs: Math.round(probe.expectedSeedActiveMs), replayFrames: probe.replayFrames })}`,
    );
    return probe;
  };
  const assertPositiveArrivalProbe = async (label) => {
    const probe = await waitFor(async () => {
      const state = await evaluate('window.__localeArrivalProbeSnapshot?.()');
      return state?.positiveSamples > 0 && state.positiveFrames > 0 ? state : undefined;
    });
    assert.ok(probe.positiveSamples > 0, `${label}: positive-control frames sampled`);
    assert.ok(probe.positiveFrames > 0, `${label}: observer detected active arrival styles`);
    console.log(
      `${label} positive live arrival probe: ${JSON.stringify({ samples: probe.positiveSamples, activeFrames: probe.positiveFrames })}`,
    );
    return probe;
  };
  const cardSignature = (cards) =>
    cards.map(({ category, type, image }) => `${category}/${type}/${image}`);
  const fetchGalleryManifest = async (locale, pathname) => {
    const response = await fetch(new URL(pathname, baseUrl), {
      headers: { cookie: `locale=${locale}` },
    });
    assert.equal(response.status, 200, `${locale} gallery fixture SSR responds`);
    return imageManifest(await response.text());
  };
  const hasSeedRequest = (fromIndex, seed, category) =>
    networkRequests.slice(fromIndex).some((requestUrl) => {
      try {
        const url = new URL(requestUrl);
        return (
          url.pathname === '/galerie' &&
          url.searchParams.get('seed') === seed &&
          (url.searchParams.get('category') ?? undefined) === category
        );
      } catch {
        return false;
      }
    });

  const overviewSsrSeed = '35791';
  const overviewClientSeed = '24817';
  await call('Page.navigate', {
    url: new URL(`/galerie?seed=${overviewSsrSeed}`, baseUrl).href,
  });
  await waitFor(() =>
    evaluate(
      `document.readyState==='complete'&&document.documentElement.lang==='fr'&&document.querySelectorAll('[data-gallery-card]').length===18`,
    ),
  );
  const overviewBeforeSwitch = await evaluate(
    `(() => {const manifest=JSON.parse(document.querySelector('[data-gallery-manifest]').textContent);return {seed:manifest.seed,version:manifest.version,cards:manifest.cards.map(({category,type,image})=>({category,type,image}))}})()`,
  );
  assert.equal(
    overviewBeforeSwitch.seed,
    overviewSsrSeed,
    'URL seed is the actual French SSR seed',
  );
  await evaluate(
    `sessionStorage.setItem(${JSON.stringify(`filing-gallery:${overviewBeforeSwitch.version}`)},${JSON.stringify(overviewClientSeed)})`,
  );
  await scrollCardsIntoView();
  let beforeSwitchVisible = await waitFor(async () => {
    const state = await readVisibleCards();
    return state.visible.length >= 3 &&
      state.visible.every(
        ({ opacity, visibility, transform, inlineOpacity, inlineVisibility, inlineTransform }) =>
          opacity === 1 &&
          visibility === 'visible' &&
          transform === 'none' &&
          inlineOpacity === '' &&
          inlineVisibility === '' &&
          inlineTransform === '',
      )
      ? state
      : undefined;
  });
  assert.ok(
    beforeSwitchVisible.visible.length >= 3,
    'French overview has multiple visible cards before switching',
  );
  const languageScrollY = beforeSwitchVisible.scrollY;
  assert.ok(languageScrollY > 100, 'language switch starts from a meaningful scrolled position');
  const englishOverview = await fetchGalleryManifest('en', `/galerie?seed=${overviewClientSeed}`);
  assert.equal(englishOverview.seed, overviewClientSeed);
  assert.notDeepEqual(
    cardSignature(overviewBeforeSwitch.cards),
    cardSignature(englishOverview.cards),
    'the chosen client seed produces a genuinely different overview card order from SSR',
  );
  await armLocaleArrivalProbe('overview-fr-en', overviewClientSeed, englishOverview.cards);
  const overviewSsrIdentityCapture = await evaluate('window.__localeArrivalProbeCaptureBaseline()');
  assert.equal(overviewSsrIdentityCapture.nodeCount, 18);
  await pauseLocaleSyncResponse(overviewClientSeed, undefined);
  const overviewRequestStart = networkRequests.length;
  await evaluate(`document.querySelector('.lang-switcher__btn[data-locale="en"]').click()`);
  const overviewPausedResponse = await waitFor(() => heldLocaleResponse?.paused);
  assert.equal(new URL(overviewPausedResponse.url).searchParams.get('seed'), overviewClientSeed);
  const overviewResponseAnchor = await evaluate('window.__localeArrivalProbeAnchorResponse()');
  assert.equal(
    overviewResponseAnchor.baselineNodeCount,
    18,
    `response-ready anchor must still see SSR nodes: ${JSON.stringify({ response: overviewPausedResponse, location: await evaluate('location.href'), cards: await evaluate('document.querySelectorAll("[data-gallery-card]").length') })}`,
  );
  const overviewBeforeRelease = await evaluate('window.__localeArrivalProbeSnapshot()');
  assert.equal(
    overviewBeforeRelease.seedSeen,
    false,
    'client window has not started before response release',
  );
  assert.equal(overviewBeforeRelease.expectedSeedSamples, 0);
  await releaseLocaleSyncResponse();
  await waitFor(() => hasSeedRequest(overviewRequestStart, overviewClientSeed, undefined));
  assert.ok(
    networkRequests.slice(overviewRequestStart).some((requestUrl) => {
      const url = new URL(requestUrl);
      return url.pathname === '/galerie' && url.searchParams.get('seed') === overviewClientSeed;
    }),
    'actual FR→EN synchronization requested the forced client seed',
  );
  await waitFor(() =>
    evaluate(
      `document.documentElement.lang==='en'&&!document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')&&document.querySelectorAll('[data-gallery-card]').length===18`,
    ),
  );
  const overviewAfterSwitch = await evaluate(
    `(() => {const manifest=JSON.parse(document.querySelector('[data-gallery-manifest]').textContent);return {lang:document.documentElement.lang,urlSeed:new URLSearchParams(location.search).get('seed'),storedSeed:sessionStorage.getItem(${JSON.stringify(`filing-gallery:${overviewBeforeSwitch.version}`)}),cards:[...document.querySelectorAll('[data-gallery-card]')].map(card=>({category:card.dataset.category,type:card.dataset.type,image:card.dataset.image}))}})()`,
  );
  assert.equal(overviewAfterSwitch.lang, 'en');
  assert.equal(overviewAfterSwitch.urlSeed, overviewSsrSeed, 'same URL retains its SSR seed');
  assert.equal(
    overviewAfterSwitch.storedSeed,
    overviewClientSeed,
    'client session seed remains distinct',
  );
  assert.deepEqual(cardSignature(overviewAfterSwitch.cards), cardSignature(englishOverview.cards));
  await waitForLocaleSuppressionWindow(3, 'FR→EN overview seeded synchronization');
  await assertSettledVisibleCards(3, 'FR→EN overview seeded synchronization');
  console.log(
    `FR→EN real language switch, seed ${overviewSsrSeed}→${overviewClientSeed}, visible cards and scroll suppression PASS (${languageScrollY}px)`,
  );

  // Completed category-URL synchronization is observed live; its positive
  // control also proves the capture sees the next user-filter arrival.
  const categorySsrSeed = '116003';
  const categoryClientSeed = '99081';
  await call('Network.setCookie', { name: 'locale', value: 'en', url: baseUrl });
  await call('Page.navigate', {
    url: new URL(`/galerie?category=macrame&seed=${categorySsrSeed}`, baseUrl).href,
  });
  await waitFor(() =>
    evaluate(
      `document.readyState==='complete'&&document.documentElement.lang==='en'&&document.querySelectorAll('[data-gallery-card]').length===2`,
    ),
  );
  const categoryBeforeSwitch = await evaluate(
    `(() => {const manifest=JSON.parse(document.querySelector('[data-gallery-manifest]').textContent);return {seed:manifest.seed,version:manifest.version,cards:manifest.cards.map(({category,type,image})=>({category,type,image}))}})()`,
  );
  assert.equal(categoryBeforeSwitch.seed, categorySsrSeed);
  await evaluate(
    `sessionStorage.setItem(${JSON.stringify(`filing-gallery:${categoryBeforeSwitch.version}`)},${JSON.stringify(categoryClientSeed)})`,
  );
  await scrollCardsIntoView();
  beforeSwitchVisible = await waitFor(async () => {
    const state = await readVisibleCards();
    return state.visible.length >= 2 &&
      state.visible.every(
        ({ opacity, visibility, transform, inlineOpacity, inlineVisibility, inlineTransform }) =>
          opacity === 1 &&
          visibility === 'visible' &&
          transform === 'none' &&
          inlineOpacity === '' &&
          inlineVisibility === '' &&
          inlineTransform === '',
      )
      ? state
      : undefined;
  });
  assert.ok(beforeSwitchVisible.visible.length >= 2);
  const categoryLanguageScrollY = beforeSwitchVisible.scrollY;
  const italianCategory = await fetchGalleryManifest(
    'it',
    `/galerie?seed=${categoryClientSeed}&category=macrame`,
  );
  assert.equal(italianCategory.seed, categoryClientSeed);
  assert.equal(italianCategory.category, 'macrame');
  await armLocaleArrivalProbe('category-en-it-complete', categoryClientSeed, italianCategory.cards);
  const categorySsrIdentityCapture = await evaluate('window.__localeArrivalProbeCaptureBaseline()');
  assert.equal(categorySsrIdentityCapture.nodeCount, 2);
  await pauseLocaleSyncResponse(categoryClientSeed, 'macrame');
  const categoryRequestStart = networkRequests.length;
  await evaluate(`document.querySelector('.lang-switcher__btn[data-locale="it"]').click()`);
  const categoryPausedResponse = await waitFor(() => heldLocaleResponse?.paused);
  const categoryResponseAnchor = await evaluate('window.__localeArrivalProbeAnchorResponse()');
  assert.equal(categoryResponseAnchor.baselineNodeCount, 2);
  const heldWindow = await waitFor(async () => {
    const state = await evaluate('window.__localeArrivalProbeSnapshot()');
    return state.responseHeldMs > 1750 ? state : undefined;
  });
  assert.equal(
    heldWindow.seedSeen,
    false,
    'category observation window remains unstarted while response is held',
  );
  assert.equal(
    heldWindow.expectedSeedSamples,
    0,
    'no seeded-render samples before response release',
  );
  assert.equal(
    heldWindow.committedNodeCount,
    0,
    'no response-committed replacement nodes before release',
  );
  assert.ok(heldWindow.samples > 0, 'observer continues sampling while the response is held');
  const categoryRelease = await releaseLocaleSyncResponse();
  console.log(
    `Category response gate: ${JSON.stringify({ responseUrl: categoryPausedResponse.url, baselineNodes: categoryResponseAnchor.baselineNodeCount, heldMs: Math.round(heldWindow.responseHeldMs), preReleaseSamples: heldWindow.samples, preReleaseSeedSamples: heldWindow.expectedSeedSamples, releaseAt: categoryRelease.releaseAt })}`,
  );
  await waitFor(() => hasSeedRequest(categoryRequestStart, categoryClientSeed, 'macrame'));
  await waitFor(() =>
    evaluate(
      `document.documentElement.lang==='it'&&!document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')&&document.querySelectorAll('[data-gallery-card]').length===${italianCategory.cards.length}`,
    ),
  );
  const completedCategoryState = await evaluate(
    `(() => ({scrollY,cards:[...document.querySelectorAll('[data-gallery-card]')].map(card=>({category:card.dataset.category,type:card.dataset.type,image:card.dataset.image}))}))()`,
  );
  assert.deepEqual(
    cardSignature(completedCategoryState.cards),
    cardSignature(italianCategory.cards),
  );
  assert.ok(Math.abs(completedCategoryState.scrollY - categoryLanguageScrollY) <= 1);
  await waitForLocaleSuppressionWindow(2, 'EN→IT category URL seeded synchronization');
  await assertSettledVisibleCards(
    2,
    'EN→IT category URL seeded synchronization',
    categoryLanguageScrollY,
  );
  await evaluate(`window.__localeArrivalProbePhase('positive')`);
  await evaluate(`document.querySelector('[data-gallery-category="cornely"]').click()`);
  await waitFor(() =>
    evaluate(
      `document.querySelector('[data-gallery-category="cornely"]').getAttribute('aria-pressed')==='true'&&!document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')`,
    ),
  );
  await assertPositiveArrivalProbe('next category filter after locale arrival');

  // Keep the interrupted-sync branch distinct; user input must supersede a
  // genuinely pending client-seed synchronization.
  await call('Network.emulateNetworkConditions', {
    offline: false,
    latency: 800,
    downloadThroughput: 2_000_000,
    uploadThroughput: 1_000_000,
  });
  await call('Network.setCookie', { name: 'locale', value: 'en', url: baseUrl });
  await call('Page.navigate', {
    url: new URL(`/galerie?category=macrame&seed=${categorySsrSeed}`, baseUrl).href,
  });
  await waitFor(() =>
    evaluate(
      `document.readyState==='complete'&&document.documentElement.lang==='en'&&document.querySelectorAll('[data-gallery-card]').length===2`,
    ),
  );
  await evaluate(
    `sessionStorage.setItem(${JSON.stringify(`filing-gallery:${categoryBeforeSwitch.version}`)},${JSON.stringify(categoryClientSeed)})`,
  );
  await scrollCardsIntoView();
  const interruptedCategoryRequestStart = networkRequests.length;
  await evaluate(`document.querySelector('.lang-switcher__btn[data-locale="it"]').click()`);
  await waitFor(() =>
    hasSeedRequest(interruptedCategoryRequestStart, categoryClientSeed, 'macrame'),
  );
  const pendingInitialSync = networkEvents.findLast(
    (event) =>
      event.sessionId === targetSession &&
      event.type === 'request' &&
      event.url?.includes(`seed=${categoryClientSeed}`) &&
      event.url.includes('category=macrame'),
  );
  assert.ok(pendingInitialSync, 'category locale sync starts a real request using the client seed');
  assert.equal(
    networkEvents.some(
      (event) =>
        event.sessionId === targetSession &&
        event.type === 'finished' &&
        event.requestId === pendingInitialSync.requestId,
    ),
    false,
    'initial locale sync remains pending when user input interrupts it',
  );
  assert.equal(
    await evaluate(`document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')`),
    true,
  );
  await evaluate(`document.querySelector('[data-gallery-category="cornely"]').click()`);
  await waitFor(() =>
    hasSeedRequest(interruptedCategoryRequestStart, categoryClientSeed, 'cornely'),
  );
  await waitFor(() =>
    evaluate(
      `document.documentElement.lang==='it'&&document.querySelector('[data-gallery-category="cornely"]').getAttribute('aria-pressed')==='true'&&!document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')`,
    ),
  );
  const italianCornely = await fetchGalleryManifest(
    'it',
    `/galerie?seed=${categoryClientSeed}&category=cornely`,
  );
  const categoryAfterInterrupt = await evaluate(
    `(() => ({scrollY,cards:[...document.querySelectorAll('[data-gallery-card]')].map(card=>({category:card.dataset.category,type:card.dataset.type,image:card.dataset.image})),pressed:document.querySelector('[data-gallery-category="cornely"]').getAttribute('aria-pressed')}))()`,
  );
  assert.deepEqual(
    cardSignature(categoryAfterInterrupt.cards),
    cardSignature(italianCornely.cards),
  );
  assert.equal(categoryAfterInterrupt.pressed, 'true');
  assert.ok(Math.abs(categoryAfterInterrupt.scrollY - categoryLanguageScrollY) <= 1);
  const userFilterArrival = await waitFor(async () => {
    const state = await evaluate(
      `(() => {const visible=[...document.querySelectorAll('[data-card-motion]')].filter(node=>{const rect=node.getBoundingClientRect();return rect.top<innerHeight&&rect.bottom>0});return visible.map(node=>({opacity:Number(getComputedStyle(node).opacity),transform:getComputedStyle(node).transform,visibility:getComputedStyle(node).visibility}))})()`,
    );
    return state.some(
      ({ opacity, transform, visibility }) =>
        opacity > 0.3 && opacity < 0.999 && transform !== 'none' && visibility === 'visible',
    )
      ? state
      : undefined;
  });
  assert.ok(
    userFilterArrival.some(({ opacity, transform }) => opacity < 1 && transform !== 'none'),
    'next user-selected filter still runs its normal positive arrival',
  );
  console.log(
    `EN→IT category sync interrupted by user filter; client seed ${categorySsrSeed}→${categoryClientSeed}, normal filter arrival remains active PASS (${categoryLanguageScrollY}px)`,
  );
  await call('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  // Leave subsequent geometry/masonry checks in their original clean state.
  await evaluate('window.__localeArrivalProbeStop()');
  await call('Network.setCookie', { name: 'locale', value: 'fr', url: baseUrl });
  await evaluate(
    `(() => {const manifest=JSON.parse(document.querySelector('[data-gallery-manifest]').textContent);sessionStorage.removeItem('filing-gallery:'+manifest.version)})()`,
  );
  await call('Page.navigate', { url: new URL('/galerie', baseUrl).href });
  await waitFor(() =>
    evaluate(
      `document.readyState==='complete'&&document.documentElement.lang==='fr'&&!!document.querySelector('[data-gallery-root]')&&!document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')`,
    ),
  );
  await evaluate(`window.scrollTo(0,0)`);

  // Lifecycle instrumentation is read-only: the wrapper returns the exact
  // original GSAP context and snapshots only context entries, tween targets,
  // and the viewer-instance registry size. It never kills/reverts a tween.
  if (lifecycleProbeError) throw lifecycleProbeError;
  assert.equal(lifecycleProbeInstalled, true, 'lifecycle observations installed in client module');
  const previousProbeInstallCount = lifecycleProbeInstallCount;
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Fetch.enable', {
    patterns: [{ urlPattern: '*galerie.astro*script*.js', requestStage: 'Response' }],
  });
  await call('Page.navigate', {
    url: new URL('/galerie?category=macrame', baseUrl).href,
  });
  await waitFor(
    () => lifecycleProbeInstallCount > previousProbeInstallCount || lifecycleProbeError,
  );
  if (lifecycleProbeError) throw lifecycleProbeError;
  await waitFor(() =>
    evaluate(
      `typeof window.__galleryViewerMotion==='function'&&window.__galleryContexts?.length>=3&&document.querySelectorAll('[data-gallery-card]').length===2`,
    ),
  ).catch(async (error) => {
    const state = await evaluate(
      `({motion:typeof window.__galleryViewerMotion,contexts:window.__galleryContexts?.length,cards:document.querySelectorAll('[data-gallery-card]').length,url:location.href})`,
    );
    throw new Error(`${error.message}; lifecycle readiness: ${JSON.stringify(state)}`);
  });
  const lifecycle = {
    snapshot: () =>
      evaluate(
        `(() => {const viewerSelector='[data-gallery-viewer]',targets=tween=>tween.targets?.().filter(node=>node instanceof Element&&(node.matches(viewerSelector)||node.closest(viewerSelector)))||[],tweens=window.__galleryGsap.globalTimeline.getChildren(true,true,true).filter(tween=>targets(tween).length),current=document.querySelector('[data-gallery-viewer]:not([inert])');return {contexts:window.__galleryContexts.map(context=>({entries:context.data.length,viewerTargets:context.getTweens().flatMap(tween=>tween.targets()).filter(node=>node instanceof Element&&(node.matches(viewerSelector)||node.closest(viewerSelector))).length})),activeViewerTweens:tweens.length,activeCurrentViewerTweens:current?tweens.filter(tween=>targets(tween).some(node=>node===current||current.contains(node))).length:0,owned:window.__galleryViewerMotion(),viewers:document.querySelectorAll(viewerSelector).length}})()`,
      ),
    open: () => evaluate(`document.querySelector('[data-gallery-card]').click()`),
    close: () =>
      evaluate(
        `document.querySelector('[data-gallery-viewer]:not([inert]) [data-viewer-close]').click()`,
      ),
  };
  const readyViewer = () =>
    waitFor(() =>
      evaluate(
        `!!document.querySelector('[data-gallery-viewer]:not([inert]) [data-viewer-photo]')?.naturalWidth&&getComputedStyle(document.querySelector('[data-gallery-viewer]:not([inert])')).opacity==='1'`,
      ),
    );
  const waitForCurrentViewerTween = () =>
    waitFor(async () => {
      const state = await lifecycle.snapshot();
      return state.owned > 0 && state.activeCurrentViewerTweens > 0 ? state : undefined;
    });
  await evaluate(`document.querySelector('[data-gallery-masonry]').scrollIntoView()`);
  await delay(1000);
  const lifecycleBaseline = await lifecycle.snapshot();
  assert.equal(lifecycleBaseline.viewers, 0);
  assert.equal(lifecycleBaseline.owned, 0);
  for (let cycle = 0; cycle < 20; cycle++) {
    await lifecycle.open();
    if (cycle === 0) {
      const openingTween = await waitForCurrentViewerTween();
      assert.equal(openingTween.viewers, 1);
      assert.ok(openingTween.owned > 0, 'open tween is owned before its animation settles');
      assert.ok(
        openingTween.activeCurrentViewerTweens > 0,
        'an active tween targets the current viewer during its opening animation',
      );
    }
    await readyViewer();
    await lifecycle.close();
    await waitFor(() => evaluate(`!document.querySelector('[data-gallery-viewer]')`));
    if (cycle === 0) {
      const closedTween = await lifecycle.snapshot();
      assert.equal(closedTween.owned, 0, 'instance registry returns to zero after viewer close');
      assert.equal(closedTween.activeViewerTweens, 0, 'no viewer tween remains active after close');
      assert.equal(closedTween.activeCurrentViewerTweens, 0);
    }
  }
  const lifecycleAfter20 = await lifecycle.snapshot();
  assert.deepEqual(
    lifecycleAfter20.contexts,
    lifecycleBaseline.contexts,
    '20 completed open/close cycles do not grow long-lived context entries or retain viewer targets',
  );
  assert.equal(lifecycleAfter20.activeViewerTweens, 0);
  assert.equal(lifecycleAfter20.owned, 0);
  assert.equal(lifecycleAfter20.viewers, 0);
  console.log('Viewer lifecycle 20 cycles/context and target retention PASS');

  // A just-closed viewer's completion callback must not remove or hide the
  // immediately reopened instance. The probe only records its identity/state.
  await lifecycle.open();
  await waitFor(() => evaluate(`!!document.querySelector('[data-gallery-viewer]:not([inert])')`));
  await lifecycle.close();
  await lifecycle.open();
  await readyViewer();
  await delay(400);
  const rapidLifecycle = await evaluate(
    `(() => {const viewer=document.querySelector('[data-gallery-viewer]:not([inert])');return {viewers:document.querySelectorAll('[data-gallery-viewer]').length,currentConnected:!!viewer?.isConnected,opacity:viewer&&getComputedStyle(viewer).opacity,inert:viewer?.inert}})()`,
  );
  assert.deepEqual(rapidLifecycle, {
    viewers: 1,
    currentConnected: true,
    opacity: '1',
    inert: false,
  });
  await lifecycle.close();
  await waitFor(() => evaluate(`!document.querySelector('[data-gallery-viewer]')`));
  assert.equal((await lifecycle.snapshot()).owned, 0);

  // Close synchronously before the open tween completes, then open again.
  await lifecycle.open();
  await waitFor(() => evaluate(`!!document.querySelector('[data-gallery-viewer]:not([inert])')`));
  await lifecycle.close();
  await lifecycle.open();
  await readyViewer();
  const immediateReopen = await evaluate(
    `({viewers:document.querySelectorAll('[data-gallery-viewer]').length,opacity:getComputedStyle(document.querySelector('[data-gallery-viewer]:not([inert])')).opacity,inert:document.querySelector('[data-gallery-viewer]:not([inert])').inert})`,
  );
  assert.deepEqual(immediateReopen, { viewers: 1, opacity: '1', inert: false });
  await lifecycle.close();
  await waitFor(() => evaluate(`!document.querySelector('[data-gallery-viewer]')`));
  assert.equal((await lifecycle.snapshot()).owned, 0);

  await lifecycle.open();
  await waitFor(() => evaluate(`!!document.querySelector('[data-gallery-viewer]:not([inert])')`));
  const beforeReducedMotion = await waitForCurrentViewerTween();
  assert.ok(
    beforeReducedMotion.owned > 0,
    'viewer tween is owned immediately before reduced-motion interruption',
  );
  assert.ok(
    beforeReducedMotion.activeCurrentViewerTweens > 0,
    'viewer-targeted tween is active immediately before reduced-motion interruption',
  );
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await waitFor(() => evaluate(`window.__galleryViewerMotion()===0`));
  const reducedOpen = await lifecycle.snapshot();
  assert.equal(reducedOpen.viewers, 1);
  assert.equal(reducedOpen.activeViewerTweens, 0);
  assert.equal(
    reducedOpen.contexts.some(({ viewerTargets }) => viewerTargets > 0),
    false,
  );
  await lifecycle.close();
  await waitFor(() => evaluate(`!document.querySelector('[data-gallery-viewer]')`));
  const reducedClosed = await lifecycle.snapshot();
  assert.equal(reducedClosed.owned, 0);
  assert.equal(reducedClosed.activeViewerTweens, 0);

  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await lifecycle.open();
  await waitFor(() => evaluate(`!!document.querySelector('[data-gallery-viewer]:not([inert])')`));
  await lifecycle.close();
  await evaluate(
    `document.dispatchEvent(new Event('astro:before-swap'));document.dispatchEvent(new Event('astro:before-swap'))`,
  );
  const afterAstroCleanup = await lifecycle.snapshot();
  assert.equal(afterAstroCleanup.viewers, 0);
  assert.equal(afterAstroCleanup.activeViewerTweens, 0);
  assert.equal(afterAstroCleanup.owned, 0);
  assert.ok(
    afterAstroCleanup.contexts.every(
      ({ entries, viewerTargets }) => entries === 0 && viewerTargets === 0,
    ),
    JSON.stringify(afterAstroCleanup),
  );
  assert.equal(
    await evaluate(
      `({inert:document.querySelector('main').inert,overflow:document.body.style.overflow})`,
    ).then(({ inert, overflow }) => !inert && overflow !== 'hidden'),
    true,
  );
  console.log('Viewer rapid reopen/immediate close/reduced-motion/double Astro cleanup PASS');

  const matelasseResponse = await fetch(new URL('/galerie?category=matelasse', baseUrl), {
    headers: { cookie: 'locale=fr' },
  });
  const matelasseManifest = imageManifest(await matelasseResponse.text());
  const viewerGroup = matelasseManifest.types.find(({ imageCount }) => imageCount > 1);
  assert.ok(viewerGroup, 'Matelassé contains a multi-image viewer fixture');

  // C: responsive masonry tiers, fixed per-column phases, square fixtures and the
  // non-JavaScript CSS columns fallback.
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await call('Network.setCookie', { name: 'locale', value: 'fr', url: baseUrl });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Page.navigate', {
    url: new URL('/galerie?category=matelasse', baseUrl).href,
  });
  await waitFor(() =>
    evaluate(
      `document.querySelectorAll('[data-gallery-card]').length === ${matelasseManifest.types.length} && !!document.querySelector('[data-gallery-masonry][data-layout]')`,
    ),
  );
  for (const [width, height, expectedColumns] of [
    [375, 812, 2],
    [667, 375, 2],
    [768, 1024, 3],
    [1024, 768, 3],
    [1440, 900, 4],
    [1920, 1080, 4],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const layout = await evaluate(`(() => {
      const masonry=document.querySelector('[data-gallery-masonry]');
      const style=getComputedStyle(masonry);
      return {width:masonry.clientWidth,columns:style.gridTemplateColumns.split(' ').length,gap:style.columnGap,overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.equal(layout.columns, expectedColumns, `masonry columns at ${width}px`);
    assert.equal(layout.gap, '4px');
    assert.equal(layout.overflow, false, `no horizontal overflow at ${width}px`);
    if (width === 1440) assert.ok(Math.abs(layout.width - 1382) <= 2, JSON.stringify(layout));
    if (width === 1920) assert.ok(Math.abs(layout.width - 1856) <= 2, JSON.stringify(layout));
  }
  const setViewport = (width, height) =>
    call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  const waitForLayout = (columns, count = matelasseManifest.types.length) => {
    const phases = columns === 4 ? [7, 18, 0, 12] : columns === 3 ? [9, 0, 16] : [0, 8];
    return waitFor(() =>
      evaluate(
        `(() => {const masonry=document.querySelector('[data-gallery-masonry]:not([hidden])'),cards=[...masonry.children],columns=getComputedStyle(masonry).gridTemplateColumns.split(' ').length,phases=${JSON.stringify(phases)};return cards.length===${count}&&columns===${columns}&&cards.slice(0,columns).every((card,index)=>Number(getComputedStyle(card).gridColumnStart)===index+1&&Number(getComputedStyle(card).gridRowStart)===phases[index]+1)})()`,
      ),
    );
  };
  await setViewport(1440, 900);
  await evaluate(`(async () => {
    for(const image of document.querySelectorAll('[data-gallery-card] img')){
      const square=document.createElement('img');
      square.width=800;square.height=800;square.alt='';square.loading='eager';square.src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="800"/%3E';
      image.replaceWith(square);
    }
    await Promise.all([...document.querySelectorAll('[data-gallery-card] img')].map(image=>image.decode()));
  })()`);
  await setViewport(1024, 768);
  await setViewport(1440, 900);
  await waitForLayout(4);
  const squareGrid = await evaluate(`(() => {
    const masonry=document.querySelector('[data-gallery-masonry]:not([hidden])');
    const count=getComputedStyle(masonry).gridTemplateColumns.split(' ').length;
    return {cards:[...masonry.children].map(card=>{const image=card.querySelector('img');return {column:Number(getComputedStyle(card).gridColumnStart),row:Number(getComputedStyle(card).gridRowStart),layoutTop:card.offsetTop,layoutHeight:card.offsetHeight,rect:card.getBoundingClientRect().toJSON(),image:image.getBoundingClientRect().toJSON(),natural:{width:image.naturalWidth,height:image.naturalHeight,attrWidth:image.getAttribute('width'),attrHeight:image.getAttribute('height')},fit:getComputedStyle(image).objectFit}}),width:masonry.clientWidth,count};
  })()`);
  assert.equal(squareGrid.count, 4);
  assert.deepEqual(
    squareGrid.cards.slice(0, squareGrid.count).map(({ column }) => column),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    squareGrid.cards.slice(0, 4).map(({ row }) => row - 1),
    [7, 18, 0, 12],
    'four-column fixed phase is compact and is not repeated per row',
  );
  assert.ok(
    Math.abs(squareGrid.cards[1].image.width - squareGrid.cards[1].image.height) <= 1,
    JSON.stringify(squareGrid.cards[1]),
  );
  assert.ok(squareGrid.cards.every(({ fit }) => fit !== 'cover'));
  const sameColumn = squareGrid.cards
    .filter(({ column }) => column === 1)
    .sort((left, right) => left.layoutTop - right.layoutTop)
    .slice(0, 2);
  const verticalGap =
    sameColumn[1].layoutTop - sameColumn[0].layoutTop - sameColumn[0].layoutHeight;
  assert.ok(
    verticalGap > 0 && verticalGap <= 5,
    `positive bounded vertical spacing ${verticalGap}px`,
  );
  const squareSignature = squareGrid.cards.map(({ column, row }) => [column, row]);
  for (const [width, height, columns, phases] of [
    [375, 812, 2, [0, 8]],
    [667, 375, 2, [0, 8]],
    [768, 1024, 3, [9, 0, 16]],
    [1024, 768, 3, [9, 0, 16]],
    [1440, 900, 4, [7, 18, 0, 12]],
    [1920, 1080, 4, [7, 18, 0, 12]],
  ]) {
    await setViewport(width, height);
    await waitForLayout(columns);
    const profile = await evaluate(
      `(() => {const masonry=document.querySelector('[data-gallery-masonry]:not([hidden])'),cards=[...masonry.children],columns=getComputedStyle(masonry).gridTemplateColumns.split(' ').length;return {width:masonry.clientWidth,columns,phases:cards.slice(0,columns).map(card=>Number(getComputedStyle(card).gridRowStart)-1),overflow:document.documentElement.scrollWidth>innerWidth}})()`,
    );
    assert.equal(profile.columns, columns, `masonry columns at ${width}px`);
    assert.deepEqual(profile.phases, phases, `fixed non-alternating phases at ${width}px`);
    assert.equal(profile.overflow, false, `no horizontal overflow at ${width}px`);
    if (width === 1440) assert.ok(Math.abs(profile.width - 1382) <= 2);
    if (width === 1920) assert.ok(Math.abs(profile.width - 1856) <= 2);
  }
  await setViewport(1920, 1080);
  await setViewport(1024, 768);
  await waitForLayout(3);
  await setViewport(768, 1024);
  await waitForLayout(3);
  await setViewport(375, 812);
  await waitForLayout(2);
  const mobileAfterDesktop = await evaluate(
    `({columns:getComputedStyle(document.querySelector('[data-gallery-masonry]:not([hidden])')).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth})`,
  );
  assert.deepEqual(mobileAfterDesktop, { columns: 2, overflow: false });
  await setViewport(1440, 900);
  await waitForLayout(4);
  const resizedBack = await evaluate(
    `Array.from(document.querySelector('[data-gallery-masonry]:not([hidden])').children,card=>[Number(getComputedStyle(card).gridColumnStart),Number(getComputedStyle(card).gridRowStart)])`,
  );
  assert.deepEqual(
    resizedBack,
    squareSignature,
    'resize-back reproduces the same square-card grid',
  );

  await evaluate(`document.querySelector('[data-gallery-category="cornely"]').click()`);
  await waitFor(() =>
    evaluate(
      `!document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')&&document.querySelector('[data-gallery-category="cornely"]').getAttribute('aria-pressed')==='true'`,
    ),
  );
  await evaluate(`document.querySelector('[data-gallery-category="matelasse"]').click()`);
  await waitFor(() =>
    evaluate(
      `!document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')&&document.querySelector('[data-gallery-category="matelasse"]').getAttribute('aria-pressed')==='true'`,
    ),
  );
  await evaluate(
    `(async () => {for(const image of document.querySelectorAll('[data-gallery-card] img')){const square=document.createElement('img');square.width=800;square.height=800;square.alt='';square.src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="800"/%3E';image.replaceWith(square)}await Promise.all([...document.querySelectorAll('[data-gallery-card] img')].map(image=>image.decode()))})()`,
  );
  await setViewport(1024, 768);
  await setViewport(1440, 900);
  await waitForLayout(4);
  const refiltered = await evaluate(
    `Array.from(document.querySelector('[data-gallery-masonry]:not([hidden])').children,card=>[Number(getComputedStyle(card).gridColumnStart),Number(getComputedStyle(card).gridRowStart)])`,
  );
  assert.deepEqual(
    refiltered,
    squareSignature,
    're-filtering reproduces the same square-card grid',
  );

  await call('Page.navigate', {
    url: new URL('/galerie?category=matelasse', baseUrl).href,
  });
  await waitFor(() =>
    evaluate(
      `document.readyState==='complete'&&document.querySelectorAll('[data-gallery-card]').length===${matelasseManifest.types.length}`,
    ),
  );
  await evaluate(
    `Promise.all([...document.querySelectorAll('[data-gallery-card] img')].map(image=>{image.loading='eager';return image.decode()}))`,
  );
  await waitForLayout(4);
  const mixedGrid = await evaluate(
    `(() => {const masonry=document.querySelector('[data-gallery-masonry]:not([hidden])'),cards=[...masonry.children];return {columns:getComputedStyle(masonry).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth,cards:cards.map(card=>({column:Number(getComputedStyle(card).gridColumnStart),top:card.offsetTop,height:card.offsetHeight,image:card.querySelector('img').getBoundingClientRect().toJSON(),ratio:Number(card.querySelector('img').getAttribute('width'))/Number(card.querySelector('img').getAttribute('height'))}))}})()`,
  );
  assert.equal(mixedGrid.columns, 4);
  assert.equal(mixedGrid.overflow, false);
  assert.ok(new Set(mixedGrid.cards.map(({ ratio }) => ratio)).size > 1);
  assert.ok(
    mixedGrid.cards.every(
      ({ image, ratio }) => Math.abs(image.width / image.height - ratio) < 0.02,
    ),
  );
  for (const column of [1, 2, 3, 4]) {
    const stack = mixedGrid.cards
      .filter((card) => card.column === column)
      .sort((a, b) => a.top - b.top);
    for (let index = 1; index < stack.length; index++) {
      const gap = stack[index].top - (stack[index - 1].top + stack[index - 1].height);
      assert.ok(gap > 0 && gap <= 5, `column ${column} positive gap/overlap: ${gap}px`);
    }
  }
  console.log('Masonry responsive fixed phases/square-real mixed ratios/refilter/resize PASS');

  // Shared long photo reveal is exercised on the gallery and both Atelier
  // compositions, including both production photo groups.
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  const observePhotoArrival = async (pathname, groupSelector, expectedCount, targetIndex = 0) => {
    await call('Page.navigate', { url: new URL(pathname, baseUrl).href });
    await waitFor(() =>
      evaluate(
        `document.readyState==='complete'&&document.querySelectorAll(${JSON.stringify(groupSelector)}).length===${expectedCount}`,
      ),
    );
    const measured = await evaluate(`(() => {
      const target=document.querySelectorAll(${JSON.stringify(groupSelector)})[${targetIndex}];
      target.scrollIntoView({block:'center'});
      return new Promise(resolve=>{
        let started,firstMotion,activeSamples=0;
        const initial=performance.now();
        const layout=()=>{const frame=target.closest('[data-atelier-frame],.catalogue-card')||target.parentElement,image=target.querySelector('img'),masonry=target.closest('[data-gallery-masonry]');return {imageCssHeight:image?parseFloat(getComputedStyle(image).height):null,imageOffsetHeight:image?.offsetHeight??null,frameTop:frame?.offsetTop??null,frameHeight:frame?.offsetHeight??null,masonryWidth:masonry?.clientWidth??null,masonryGap:masonry?getComputedStyle(masonry).columnGap:null,gridColumn:frame?.style.gridColumn??null,gridRow:frame?.style.gridRow??null}};
        const sample=now=>{
          const style=getComputedStyle(target),opacity=Number(style.opacity),transform=style.transform,matrix=new DOMMatrixReadOnly(transform==='none'?'matrix(1,0,0,1,0,0)':transform),scale=Math.hypot(matrix.a,matrix.b),moving=Math.abs(matrix.m41)>.5||Math.abs(matrix.m42)>.5||Math.abs(scale-1)>.002;
          if(started===undefined&&(opacity<.999||moving)){started=now;firstMotion={opacity,transform,x:matrix.m41,y:matrix.m42,scale,layout:layout()};}
          if(started!==undefined&&(opacity<.999||moving))activeSamples++;
          if(started!==undefined&&opacity>.999&&transform==='none') return resolve({elapsed:now-started,opacity,transform,firstMotion,activeSamples,finalLayout:layout()});
          if(now-initial>3500) return resolve({timeout:true,opacity,transform,started:started!==undefined,firstMotion,activeSamples,finalLayout:layout()});
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
    })()`);
    assert.notEqual(measured.timeout, true, `${pathname} arrival reaches its cleared final styles`);
    assert.ok(
      measured.elapsed >= 1_250 && measured.elapsed <= 2_700,
      `${pathname} measured ${measured.elapsed}ms arrival`,
    );
    assert.equal(measured.opacity, 1);
    assert.equal(measured.transform, 'none');
    assert.ok(
      measured.activeSamples > 1,
      `${pathname}: multiple live frames were sampled during arrival`,
    );
    assert.ok(measured.firstMotion.opacity < 0.999, `${pathname}: arrival visibly changes opacity`);
    assert.ok(
      Math.abs(measured.firstMotion.x) > 0.5,
      `${pathname}: historical horizontal offset is active`,
    );
    assert.ok(
      Math.abs(measured.firstMotion.y) > 0.5,
      `${pathname}: historical vertical offset is active`,
    );
    assert.ok(
      Math.abs(measured.firstMotion.scale - 1) > 0.002,
      `${pathname}: historical scale offset is active`,
    );
    for (const key of [
      'imageCssHeight',
      'imageOffsetHeight',
      'frameTop',
      'frameHeight',
      'masonryWidth',
      'masonryGap',
      'gridColumn',
      'gridRow',
    ]) {
      assert.equal(
        measured.firstMotion.layout[key],
        measured.finalLayout[key],
        `${pathname}: ${key} is independent from the animated transform`,
      );
    }
    return measured;
  };
  const arrivalDurations = {
    galerie: await observePhotoArrival('/galerie', '[data-card-motion]', 18),
    creation: await observePhotoArrival(
      '/creation',
      '[data-atelier-presentation] [data-atelier-motion]',
      8,
    ),
    production: await observePhotoArrival(
      '/production',
      '[data-atelier-presentation] [data-atelier-motion]',
      12,
      0,
    ),
    finition: await observePhotoArrival(
      '/production',
      '[data-atelier-presentation] [data-atelier-motion]',
      12,
      6,
    ),
  };
  console.log(
    `Historical photo arrival live motion/layout evidence: ${JSON.stringify(arrivalDurations)}`,
  );

  await call('Emulation.setScriptExecutionDisabled', { value: true });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Page.navigate', {
    url: new URL('/galerie?category=matelasse', baseUrl).href,
  });
  await waitFor(() =>
    evaluate(
      `document.readyState === 'complete' && !!document.querySelector('[data-gallery-masonry]')`,
    ),
  );
  const fallback = await evaluate(`(() => {
    const masonry=document.querySelector('[data-gallery-masonry]'),first=masonry.querySelector('.catalogue-card');
    return {enhanced:masonry.hasAttribute('data-layout'),hidden:masonry.hidden,columns:getComputedStyle(masonry).columnCount,padding:getComputedStyle(masonry).paddingTop,firstMargin:getComputedStyle(first).marginTop,overflow:document.documentElement.scrollWidth>innerWidth,visible:getComputedStyle(first).visibility};
  })()`);
  assert.equal(fallback.enhanced, false);
  assert.equal(fallback.hidden, false);
  assert.equal(fallback.columns, '2');
  assert.equal(fallback.padding, '8px');
  assert.equal(fallback.firstMargin, '-8px');
  assert.equal(fallback.overflow, false);
  assert.equal(fallback.visible, 'visible');
  console.log('CSS-only masonry fallback PASS');
  await call('Emulation.setScriptExecutionDisabled', { value: false });

  // Category-title entrance is visibly active, but keyboard focus cancels it
  // immediately; initial reduced-motion also starts from settled styles.
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await call('Page.navigate', { url: new URL('/galerie', baseUrl).href });
  await waitFor(() =>
    evaluate(
      `document.readyState==='complete'&&!!document.querySelector('[data-category-arrival]')`,
    ),
  );
  await evaluate(`document.querySelector('.catalogue-nav').scrollIntoView({block:'start'})`);
  const titleEntrance = await waitFor(async () => {
    const state = await evaluate(
      `(() => {const label=document.querySelector('[data-category-arrival]'),style=getComputedStyle(label);return {opacity:Number(style.opacity),transform:style.transform}})()`,
    );
    return state.opacity > 0.3 && state.opacity < 0.999 && state.transform !== 'none'
      ? state
      : undefined;
  });
  assert.ok(titleEntrance.opacity < 1 && titleEntrance.transform !== 'none');
  await evaluate(`document.querySelector('[data-gallery-category="cornely"]').focus()`);
  await waitFor(() =>
    evaluate(
      `document.querySelectorAll('[data-category-arrival]').length>0&&[...document.querySelectorAll('[data-category-arrival]')].every(label=>label.style.opacity===''&&label.style.transform==='')`,
    ),
  );
  await evaluate(`document.querySelector('[data-gallery-category="cornely"]').click()`);
  await waitFor(() =>
    evaluate(
      `document.querySelector('[data-gallery-category="cornely"]').getAttribute('aria-pressed')==='true'&&!document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')`,
    ),
  );
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await call('Page.navigate', { url: new URL('/galerie', baseUrl).href });
  await waitFor(() =>
    evaluate(
      `document.readyState==='complete'&&!!document.querySelector('[data-category-arrival]')`,
    ),
  );
  assert.equal(
    await evaluate(
      `[...document.querySelectorAll('[data-category-arrival]')].every(label=>getComputedStyle(label).opacity==='1'&&label.style.transform==='')`,
    ),
    true,
  );
  console.log('Category entrance, keyboard interruption, initial reduced-motion PASS');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });

  // Category hover reuses the footer's real CSS animation/keyframes, while
  // selected/focus state retains the orange background and token radius.
  await setViewport(1440, 900);
  await call('Page.navigate', { url: new URL('/galerie', baseUrl).href });
  await waitFor(() =>
    evaluate(
      `document.readyState==='complete'&&!!document.querySelector('[data-gallery-category="macrame"]')&&[...document.querySelectorAll('[data-category-arrival]')].every(node=>getComputedStyle(node).opacity==='1'&&getComputedStyle(node).transform==='none')`,
    ),
  );
  const navMarginDesktop = await evaluate(
    `parseFloat(getComputedStyle(document.querySelector('.catalogue-nav')).marginBottom)`,
  );
  assert.ok(
    navMarginDesktop >= 24,
    `desktop category nav reserves margin below it: ${navMarginDesktop}px`,
  );
  await setViewport(375, 812);
  const navMarginMobile = await evaluate(
    `parseFloat(getComputedStyle(document.querySelector('.catalogue-nav')).marginBottom)`,
  );
  assert.ok(
    navMarginMobile >= 24,
    `mobile category nav reserves margin below it: ${navMarginMobile}px`,
  );
  await setViewport(1440, 900);

  const hoverEvidence = async (selector, contentSelector, expectedScale) => {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
    await evaluate(
      `new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`,
    );
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
    );
    await movePointerTo(selector);
    assert.equal(
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).matches(':hover')`),
      true,
      `${selector} receives a real CDP mouse hover`,
    );
    const evidence = await waitFor(async () => {
      const state = await evaluate(
        `(() => {const button=document.querySelector(${JSON.stringify(selector)}),content=button.querySelector(${JSON.stringify(contentSelector)}),animation=content.getAnimations().find(item=>item.animationName==='hover-slide-in'),style=getComputedStyle(button),matrix=new DOMMatrixReadOnly(style.transform);return animation?{animationName:animation.animationName,duration:animation.effect.getComputedTiming().duration,easing:animation.effect.getComputedTiming().easing,keyframes:animation.effect.getKeyframes().map(({offset,opacity,transform})=>({offset,opacity,transform})),scale:matrix.a,scaleToken:style.getPropertyValue('--hover-slide-scale').trim(),background:style.backgroundColor}:null})()`,
      );
      return state?.animationName === 'hover-slide-in' &&
        Math.abs(state.scale - expectedScale) < 0.015
        ? state
        : undefined;
    });
    return evidence;
  };
  const categoryHover = await hoverEvidence(
    '[data-gallery-category="macrame"]',
    '[data-hover-slide-content]',
    1.03,
  );
  const socialHover = await hoverEvidence(
    '.footer__icon-link--instagram',
    '[data-hover-slide-content]',
    1.5,
  );
  const transportHover = await hoverEvidence(
    '.footer__icon-link--access',
    '[data-hover-slide-content]',
    1.03,
  );
  for (const [label, observed] of [
    ['social', socialHover],
    ['transport', transportHover],
  ]) {
    assert.equal(
      observed.animationName,
      categoryHover.animationName,
      `${label} uses same slide keyframe`,
    );
    assert.equal(observed.duration, categoryHover.duration, `${label} uses same hover duration`);
    assert.equal(observed.easing, categoryHover.easing, `${label} uses same hover easing`);
    assert.deepEqual(
      observed.keyframes,
      categoryHover.keyframes,
      `${label} uses same label keyframes`,
    );
  }
  assert.equal(categoryHover.duration, 300);
  assert.ok(
    Math.abs(categoryHover.scale - 1.03) < 0.015,
    'category uses shared default 1.03× hover scale',
  );
  assert.equal(socialHover.scaleToken, '1.5');
  assert.equal(transportHover.scaleToken, '1.03');
  const selectedCategory = '[data-gallery-category="macrame"]';
  await evaluate(
    `document.querySelector(${JSON.stringify(selectedCategory)}).scrollIntoView({block:'center',behavior:'instant'})`,
  );
  await clickAt(selectedCategory);
  await waitFor(() =>
    evaluate(
      `document.querySelector(${JSON.stringify(selectedCategory)}).getAttribute('aria-pressed')==='true'&&!document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')`,
    ),
  );
  await movePointerTo('[data-gallery-heading]');
  await waitFor(() =>
    evaluate(
      `getComputedStyle(document.querySelector(${JSON.stringify(selectedCategory)})).borderRadius==='8px'`,
    ),
  );
  const selectedVisual = await evaluate(
    `(() => {const button=document.querySelector(${JSON.stringify(selectedCategory)}),style=getComputedStyle(button);return {hover:button.matches(':hover'),text:button.innerText.trim(),ariaLabel:button.getAttribute('aria-label'),pressed:button.getAttribute('aria-pressed'),background:style.backgroundColor,radius:style.borderRadius}})()`,
  );
  assert.equal(selectedVisual.hover, false);
  assert.equal(selectedVisual.pressed, 'true');
  assert.equal(selectedVisual.ariaLabel, null);
  assert.ok(selectedVisual.text.length > 0);
  assert.notEqual(selectedVisual.background, 'rgba(0, 0, 0, 0)');
  assert.equal(selectedVisual.radius, '8px');
  await evaluate(`document.querySelector(${JSON.stringify(selectedCategory)}).blur()`);
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    modifiers: 8,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    modifiers: 8,
  });
  assert.equal(
    await evaluate(
      `document.querySelector(${JSON.stringify(selectedCategory)}).matches(':focus-visible')`,
    ),
    true,
    'keyboard Tab navigation gives the selected category focus-visible state',
  );
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector(${JSON.stringify(selectedCategory)})).backgroundColor`,
    ),
    selectedVisual.background,
  );
  console.log(
    `Category/footer hover shared CSS PASS: ${JSON.stringify({ desktopMargin: navMarginDesktop, mobileMargin: navMarginMobile, category: categoryHover, socialScale: socialHover.scaleToken, transportScale: transportHover.scaleToken, selected: selectedVisual })}`,
  );

  // E: active rapid filters cannot strand stale/hidden cards; changing to
  // reduced motion during an active transition must reveal everything.
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Network.emulateNetworkConditions', {
    offline: false,
    latency: 450,
    downloadThroughput: 2_000_000,
    uploadThroughput: 1_000_000,
  });
  await call('Page.navigate', { url: new URL('/galerie', baseUrl).href });
  await waitFor(() =>
    evaluate(
      `document.readyState==='complete' && !!document.querySelector('[data-gallery-category="macrame"]')`,
    ),
  );
  await evaluate(
    `document.querySelector('[data-gallery-masonry]').scrollIntoView({block:'start'})`,
  );
  await evaluate(
    `document.querySelector('[data-gallery-category="cornely"]').click();document.querySelector('[data-gallery-category="matelasse"]').click();document.querySelector('[data-gallery-category="macrame"]').click()`,
  );
  await waitFor(() =>
    evaluate(
      `(() => {const root=document.querySelector('[data-gallery-root]');return !root.hasAttribute('aria-busy')&&document.querySelector('[data-gallery-category="macrame"]').getAttribute('aria-pressed')==='true'&&document.querySelectorAll('[data-gallery-card]').length===2})()`,
    ),
  );
  const activeTransition = await waitFor(async () => {
    const state = await evaluate(
      `(() => {const h=document.querySelector('[data-gallery-heading]'),motion=document.querySelector('[data-card-motion]'),image=motion?.querySelector('img');return {opacity:Number(getComputedStyle(h).opacity),cardTransform:motion&&getComputedStyle(motion).transform,imageTransform:image&&getComputedStyle(image).transform,visible:[...document.querySelectorAll('[data-card-motion]')].every(n=>getComputedStyle(n).visibility==='visible'&&Number(getComputedStyle(n).opacity)>0)}})()`,
    );
    return state.visible &&
      state.opacity > 0.35 &&
      state.opacity < 0.999 &&
      state.cardTransform !== 'none'
      ? state
      : undefined;
  });
  assert.ok(activeTransition.opacity < 1, 'filter heading animation is active with motion enabled');
  assert.notEqual(activeTransition.cardTransform, 'none');
  assert.equal(
    activeTransition.imageTransform,
    'none',
    'catalogue reveal moves the wrapper, not its photo',
  );
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await waitFor(() =>
    evaluate(
      `Number(getComputedStyle(document.querySelector('[data-gallery-heading]')).opacity)===1`,
    ),
  );
  const afterReduce = await evaluate(
    `(() => {const wrappers=[...document.querySelectorAll('[data-card-motion]')];return {invisible:wrappers.filter(n=>getComputedStyle(n).visibility==='hidden'||Number(getComputedStyle(n).opacity)===0).length,inlineTransform:wrappers.some(n=>n.style.transform!==''),pressed:document.querySelector('[data-gallery-category="macrame"]').getAttribute('aria-pressed')}})()`,
  );
  assert.equal(afterReduce.invisible, 0);
  assert.equal(afterReduce.inlineTransform, false);
  assert.equal(afterReduce.pressed, 'true');
  await evaluate(`document.querySelector('[data-gallery-category="cornely"]').click()`);
  await waitFor(() =>
    evaluate(
      `!document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')&&document.querySelector('[data-gallery-category="cornely"]').getAttribute('aria-pressed')==='true'`,
    ),
  );
  assert.equal(
    await evaluate(
      `Number(getComputedStyle(document.querySelector('[data-gallery-heading]')).opacity)`,
    ),
    1,
  );
  console.log('Rapid active filters/reduced-motion interruption PASS');
  await call('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await call('Network.setCacheDisabled', { cacheDisabled: false });

  // Viewer semantics: focus/inert/scroll lock, open/close, stale photo/HD
  // responses, close during image motion, Escape, and restored page state.
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(`document.querySelector('[data-gallery-category="matelasse"]').click()`);
  await waitFor(() =>
    evaluate(
      `!document.querySelector('[data-gallery-root]').hasAttribute('aria-busy')&&document.querySelectorAll('[data-gallery-card]').length===${matelasseManifest.types.length}`,
    ),
  );
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Network.emulateNetworkConditions', {
    offline: false,
    latency: 850,
    downloadThroughput: 2_000_000,
    uploadThroughput: 1_000_000,
  });
  const triggerSelector = `[data-gallery-card][data-type="${viewerGroup.id}"]`;
  await evaluate(`document.querySelector(${JSON.stringify(triggerSelector)}).click()`);
  await waitFor(() => evaluate(`!!document.querySelector('[data-gallery-viewer]')`));
  await evaluate(`document.querySelector('[data-viewer-close]').click()`);
  const rapidClose = await evaluate(
    `(() => {const v=document.querySelector('[data-gallery-viewer][aria-hidden="true"]');return {present:!!v,inert:v?.inert,overflow:document.body.style.overflow}})()`,
  );
  assert.deepEqual(rapidClose, { present: true, inert: true, overflow: '' });
  await evaluate(`document.querySelector(${JSON.stringify(triggerSelector)}).click()`);
  await waitFor(() =>
    evaluate(`!!document.querySelector('[data-gallery-viewer]:not([aria-hidden="true"])')`),
  );
  await waitFor(() => evaluate(`document.querySelectorAll('[data-gallery-viewer]').length===1`));
  assert.equal(
    await evaluate(`document.querySelector('main').inert`),
    true,
    'rapid reopen has one current modal and keeps background inert',
  );
  await waitFor(() =>
    evaluate(
      `!!document.querySelector('[data-gallery-viewer] img')?.naturalWidth&&!document.querySelector('[data-gallery-viewer]').hasAttribute('aria-busy')`,
    ),
  );
  const opened = await evaluate(
    `({focus:document.activeElement.matches('[data-viewer-close]'),inert:document.querySelector('main').inert,locked:document.body.style.overflow==='hidden'})`,
  );
  assert.deepEqual(opened, { focus: true, inert: true, locked: true });
  const beforeHDRequest = networkRequests.length;
  await pauseNextZoomResponse();
  await clickAt('[data-viewer-stage] img');
  await waitFor(() =>
    networkRequests.slice(beforeHDRequest).some((url) => {
      try {
        return new URL(url).searchParams.get('zoom') === '1';
      } catch {
        return false;
      }
    }),
  );
  const heldHD = await waitFor(() => heldZoomResponse?.paused);
  assert.equal(new URL(heldHD.url).searchParams.get('zoom'), '1');
  assert.equal(heldHD.resourceType, 'XHR');
  const zoomedState = await evaluate(
    `({transform:document.querySelector('[data-viewer-photo]').style.transform,src:document.querySelector('[data-viewer-photo]').src})`,
  );
  assert.match(zoomedState.transform, /scale\(2\.5\)/);
  const draggedAt2_5 = await dragPointerBy('[data-viewer-stage] img', 20, 15);
  assert.match(draggedAt2_5.transform, /scale\(2\.5\)/);
  assert.ok(
    !/translate\(0px, 0px\)/.test(draggedAt2_5.transform),
    `pan is nonzero while HD response remains held: ${draggedAt2_5.transform}`,
  );
  const panBeforeHDCommit = draggedAt2_5.transform;
  await releaseZoomResponse();
  const highResolutionPhoto = await waitFor(async () => {
    const photo = await evaluate(
      `(() => {const image=document.querySelector('[data-viewer-photo]');return {src:image.src,naturalWidth:image.naturalWidth,transform:image.style.transform}})()`,
    );
    return Number(new URL(photo.src).searchParams.get('w')) === 4096 && photo.naturalWidth > 0
      ? photo
      : undefined;
  });
  assert.equal(
    highResolutionPhoto.transform,
    panBeforeHDCommit,
    '1600→4096 HD replacement preserves both zoom level and pan',
  );
  await clickAt('[data-viewer-stage] img');
  assert.equal(
    await evaluate(`document.querySelector('[data-viewer-photo]').style.transform`),
    'translate(0px, 0px) scale(1)',
    'second desktop click resets to center after HD replacement',
  );
  assert.equal(
    await evaluate(`document.querySelector('[data-viewer-stage]').hasAttribute('data-zoomed')`),
    false,
  );
  assert.equal(
    networkRequests.slice(beforeHDRequest).filter((url) => {
      try {
        return new URL(url).searchParams.get('zoom') === '1';
      } catch {
        return false;
      }
    }).length,
    1,
    'zoom levels/click cycle do not issue duplicate HD requests',
  );
  await evaluate(`document.querySelector('[data-viewer-next]').click()`);
  await waitFor(() =>
    evaluate(
      `document.querySelector('[data-viewer-photo]').src!==${JSON.stringify(highResolutionPhoto.src)}&&!!document.querySelector('[data-viewer-photo]').naturalWidth`,
    ),
  );
  const nextPhoto = await evaluate(`document.querySelector('[data-viewer-photo]').src`);
  assert.ok(Number(new URL(nextPhoto).searchParams.get('w')) <= 1600);
  const lateHDStart = networkRequests.length;
  await clickAt('[data-viewer-stage] img');
  await waitFor(() =>
    networkRequests.slice(lateHDStart).some((url) => {
      try {
        return new URL(url).searchParams.get('zoom') === '1';
      } catch {
        return false;
      }
    }),
  );
  const lateHDZoom = await evaluate(
    `({transform:document.querySelector('[data-viewer-photo]').style.transform,src:document.querySelector('[data-viewer-photo]').src})`,
  );
  assert.match(lateHDZoom.transform, /scale\(2\.5\)/);
  await evaluate(`document.querySelector('[data-viewer-next]').click()`);
  await waitFor(() =>
    evaluate(
      `document.querySelector('[data-viewer-photo]').src!==${JSON.stringify(nextPhoto)}&&!!document.querySelector('[data-viewer-photo]').naturalWidth`,
    ),
  );
  const navigatedPhoto = await evaluate(`document.querySelector('[data-viewer-photo]').src`);
  await delay(1000);
  assert.equal(
    await evaluate(`document.querySelector('[data-viewer-photo]').src`),
    navigatedPhoto,
    'late HD response cannot replace the navigated image',
  );
  assert.match(
    await evaluate(`document.querySelector('[data-viewer-photo]').style.transform`),
    /scale\(1\)/,
  );
  assert.equal(
    await evaluate(`document.querySelector('[data-viewer-stage]').hasAttribute('data-zoomed')`),
    false,
  );

  // Browser-native touch protocol under Chrome touch emulation (not a physical
  // handset): single tap stays still, double tap zooms, pinch clamps at 2.5×,
  // and an out-and-back >=8px pan cannot advance/reset the zoom state.
  await call('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const touchPoint = await evaluate(
    `(() => {const r=document.querySelector('[data-viewer-stage]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
  const touchEvent = (type, touchPoints) => call('Input.dispatchTouchEvent', { type, touchPoints });
  const touch = (id, x, y) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 });
  const tapAt = async () => {
    await touchEvent('touchStart', [touch(21, touchPoint.x, touchPoint.y)]);
    await touchEvent('touchEnd', []);
  };
  await tapAt();
  assert.match(
    await evaluate(`document.querySelector('[data-viewer-photo]').style.transform`),
    /scale\(1\)/,
    'a single touch tap does not zoom',
  );
  await evaluate(
    `new Promise(resolve=>{const start=performance.now(),sample=now=>now-start>320?resolve(true):requestAnimationFrame(sample);requestAnimationFrame(sample)})`,
  );
  await tapAt();
  await tapAt();
  assert.match(
    await evaluate(`document.querySelector('[data-viewer-photo]').style.transform`),
    /scale\(2\.5\)/,
    'native touch-emulated double tap retains its zoom behavior',
  );
  const mobilePhotoBeforePinch = await evaluate(
    `document.querySelector('[data-viewer-photo]').src`,
  );
  await touchEvent('touchStart', [
    touch(31, touchPoint.x - 30, touchPoint.y),
    touch(32, touchPoint.x + 30, touchPoint.y),
  ]);
  await touchEvent('touchMove', [
    touch(31, touchPoint.x - 165, touchPoint.y),
    touch(32, touchPoint.x + 165, touchPoint.y),
  ]);
  const mobilePinchTransform = await evaluate(
    `document.querySelector('[data-viewer-photo]').style.transform`,
  );
  assert.match(
    mobilePinchTransform,
    /scale\(2\.5\)/,
    'mobile pinch cannot exceed shared 2.5× maximum',
  );
  await touchEvent('touchEnd', []);
  const panOrigin = await evaluate(
    `(() => {const r=document.querySelector('[data-viewer-stage]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
  await touchEvent('touchStart', [touch(41, panOrigin.x, panOrigin.y)]);
  await touchEvent('touchMove', [touch(41, panOrigin.x + 20, panOrigin.y + 15)]);
  await touchEvent('touchMove', [touch(41, panOrigin.x, panOrigin.y)]);
  await touchEvent('touchEnd', []);
  assert.equal(
    await evaluate(`document.querySelector('[data-viewer-photo]').style.transform`),
    mobilePinchTransform,
    '20×15px round-trip touch pan leaves 2.5× level and centered translation unchanged',
  );
  assert.equal(
    await evaluate(`document.querySelector('[data-viewer-photo]').src`),
    mobilePhotoBeforePinch,
  );
  await call('Emulation.setTouchEmulationEnabled', { enabled: false });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(`document.querySelector('[data-viewer-close]').click()`);
  const leaving = await evaluate(
    `(() => {const v=document.querySelector('[data-gallery-viewer][aria-hidden="true"]');return {present:!!v,inert:v?.inert,pointerEvents:v?.style.pointerEvents,mainInert:document.querySelector('main').inert,bodyOverflow:document.body.style.overflow}})()`,
  );
  assert.deepEqual(leaving, {
    present: true,
    inert: true,
    pointerEvents: 'none',
    mainInert: false,
    bodyOverflow: '',
  });
  await waitFor(() => evaluate(`!document.querySelector('[data-gallery-viewer]')`));
  assert.equal(await evaluate(`document.activeElement.matches('[data-gallery-card]')`), true);
  await evaluate(`document.querySelector(${JSON.stringify(triggerSelector)}).click()`);
  await waitFor(() => evaluate(`!!document.querySelector('[data-gallery-viewer]')`));
  await pressEscape();
  await waitFor(() => evaluate(`!document.querySelector('[data-gallery-viewer]')`));
  const restored = await evaluate(
    `({inert:document.querySelector('main').inert,overflow:document.body.style.overflow,lightbox:document.documentElement.hasAttribute('data-lightbox-open'),focus:document.activeElement.matches('[data-gallery-card]')})`,
  );
  assert.deepEqual(restored, { inert: false, overflow: '', lightbox: false, focus: true });
  console.log('Viewer focus/inert/scroll/Escape/close-during-photo-animation PASS');
  await call('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await call('Network.setCacheDisabled', { cacheDisabled: false });

  // Mobile/desktop Hero source selection is checked from currentSrc and real
  // response events, not only SSR markup or a guessed media URL.
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 667,
    height: 375,
    deviceScaleFactor: 1,
    mobile: false,
  });
  successfulResponses.length = 0;
  await call('Page.navigate', { url: new URL('/', baseUrl).href });
  await waitFor(() => evaluate(`!!document.querySelector('[data-hero-media]')?.currentSrc`));
  await waitFor(() =>
    evaluate(
      `document.querySelector('[data-hero-media]').dataset.mediaReady==='true'||document.querySelector('[data-hero-media]').dataset.mediaFailed==='true'`,
    ),
  );
  const mobileHero = await evaluate(
    `(() => {const v=document.querySelector('[data-hero-media]');return {src:v.currentSrc,muted:v.muted,loop:v.loop,inline:v.playsInline,preloadAttribute:v.getAttribute('preload'),preload:v.preload,ready:v.dataset.mediaReady,failed:v.dataset.mediaFailed,poster:document.querySelector('[data-hero-fallback]').dataset.src}})()`,
  );
  assert.match(mobileHero.src, /hero-video-mobile/);
  assert.equal(mobileHero.muted, true);
  assert.equal(mobileHero.loop, true);
  assert.equal(mobileHero.inline, true);
  assert.ok(['metadata', 'auto'].includes(mobileHero.preload));
  assert.ok(mobileHero.poster);
  await waitFor(() => successfulResponses.some(({ url }) => url.includes('hero-video-mobile')));
  assert.ok(
    !successfulResponses.some(({ url }) => /hero-video\.[^/]+\.mp4/.test(url)),
    'mobile does not fetch desktop MP4',
  );
  if (mobileHero.ready === 'true') {
    assert.equal(await evaluate(`!!document.querySelector('.hero__first-frame')`), true);
    await waitFor(() => evaluate(`!document.querySelector('[data-hero-media]').paused`));
    await evaluate(`window.scrollTo(0,document.querySelector('.hero').offsetHeight+50)`);
    await waitFor(() => evaluate(`document.querySelector('[data-hero-media]').paused`));
    await evaluate(`window.scrollTo(0,0)`);
    await waitFor(() => evaluate(`!document.querySelector('[data-hero-media]').paused`));
  } else {
    await waitFor(() => evaluate(`!!document.querySelector('[data-hero-fallback]').naturalWidth`));
  }
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await waitFor(() => evaluate(`document.querySelector('[data-hero-media]').paused`));
  console.log('Mobile Hero source/network/muted-loop-inline/reduced-motion pause PASS');

  // Direct-load and Astro-return source selection, plus migrated hero/timeline
  // image readiness and the EPV badge placement.
  await call('Page.navigate', { url: new URL('/galerie', baseUrl).href });
  await waitFor(() =>
    evaluate(`document.readyState==='complete'&&!!document.querySelector('a[href="/"]')`),
  );
  await evaluate(`document.querySelector('a[href="/"]').click()`);
  await waitFor(() =>
    evaluate(
      `location.pathname==='/'&&/hero-video-mobile/.test(document.querySelector('[data-hero-media]')?.currentSrc||'')`,
    ),
  );
  console.log('Mobile Hero currentSrc after Astro navigation PASS');

  // Start a clean browsing context with desktop emulation already active.
  // Network events are scoped to this CDP session and sliced by navigation so
  // prior mobile routes and late responses cannot contaminate the evidence.
  ({ targetId: desktopProbeTargetId } = await send('Target.createTarget', {
    url: 'about:blank',
  }));
  ({ sessionId: desktopProbeSession } = await send('Target.attachToTarget', {
    targetId: desktopProbeTargetId,
    flatten: true,
  }));
  const desktopCall = (method, params) => send(method, params, desktopProbeSession);
  const desktopEvaluate = async (expression) => {
    const result = await desktopCall('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const desktopSessionEvents = () =>
    networkEvents.filter(({ sessionId }) => sessionId === desktopProbeSession);
  const desktopHeroEvidence = (events) => {
    const requests = new Map();
    for (const event of events) {
      if (!event.url?.includes('hero-video')) continue;
      const entry = requests.get(event.requestId) ?? { requestId: event.requestId };
      if (event.type === 'request') {
        Object.assign(entry, {
          requestTimestamp: event.timestamp,
          url: event.url,
          frameId: event.frameId,
          loaderId: event.loaderId,
          initiator: event.initiator,
        });
      } else if (event.type === 'response') {
        Object.assign(entry, {
          responseTimestamp: event.timestamp,
          status: event.status,
          mimeType: event.mimeType,
          responseEncodedDataLength: event.encodedDataLength,
        });
      } else if (event.type === 'finished') {
        Object.assign(entry, {
          finishedTimestamp: event.timestamp,
          transferredBytes: event.encodedDataLength,
        });
      } else if (event.type === 'failed') {
        Object.assign(entry, { failure: event.errorText });
      }
      requests.set(event.requestId, entry);
    }
    return [...requests.values()];
  };
  const waitForDesktopNetworkQuiet = async () => {
    let previousCount = desktopSessionEvents().length;
    let quietSamples = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      await delay(100);
      const currentCount = desktopSessionEvents().length;
      quietSamples = currentCount === previousCount ? quietSamples + 1 : 0;
      if (quietSamples >= 3) return;
      previousCount = currentCount;
    }
    throw new Error('Isolated desktop target network did not quiesce within 4s');
  };
  await desktopCall('Page.enable', {});
  await desktopCall('Network.enable', {});
  await desktopCall('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await desktopCall('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  const directLoadStart = desktopSessionEvents().length;
  await desktopCall('Page.navigate', { url: new URL('/', baseUrl).href });
  await waitFor(() =>
    desktopEvaluate(
      `document.readyState==='complete'&&/hero-video\\.[^/]+\\.mp4/.test(document.querySelector('[data-hero-media]')?.currentSrc||'')`,
    ),
  );
  await waitForDesktopNetworkQuiet();
  const directDesktopState = await desktopEvaluate(
    `(() => {const video=document.querySelector('[data-hero-media]');return {innerWidth,screenWidth:screen.width,mobileMedia:matchMedia('(max-width: 767.98px)').matches,currentSrc:video.currentSrc,sources:[...video.querySelectorAll('source')].map(source=>({src:source.src,media:source.media,mediaMatches:source.media?matchMedia(source.media).matches:null}))}})()`,
  );
  const directDesktopEvidence = desktopHeroEvidence(desktopSessionEvents().slice(directLoadStart));
  console.log(
    `Isolated direct desktop hero: ${JSON.stringify({ state: directDesktopState, requests: directDesktopEvidence })}`,
  );
  assert.equal(directDesktopState.innerWidth, 1440);
  assert.equal(directDesktopState.mobileMedia, false);
  assert.ok(/hero-video\.[^/]+\.mp4/.test(directDesktopState.currentSrc));
  assert.ok(
    directDesktopEvidence.every(({ url }) => !url.includes('hero-video-mobile')),
    `fresh desktop navigation has no mobile-video request: ${JSON.stringify(directDesktopEvidence)}`,
  );

  const astroOutboundStart = desktopSessionEvents().length;
  await desktopEvaluate(`document.querySelector('a[href="/creation"]').click()`);
  await waitFor(() =>
    desktopEvaluate(`location.pathname==='/creation'&&document.readyState==='complete'`),
  );
  await waitForDesktopNetworkQuiet();
  const astroReturnStart = desktopSessionEvents().length;
  await desktopEvaluate(`document.querySelector('a[href="/"]').click()`);
  await waitFor(() =>
    desktopEvaluate(
      `location.pathname==='/'&&/hero-video\\.[^/]+\\.mp4/.test(document.querySelector('[data-hero-media]')?.currentSrc||'')`,
    ),
  );
  await waitForDesktopNetworkQuiet();
  const astroReturnState = await desktopEvaluate(
    `(() => {const video=document.querySelector('[data-hero-media]');return {innerWidth,mobileMedia:matchMedia('(max-width: 767.98px)').matches,currentSrc:video.currentSrc,sources:[...video.querySelectorAll('source')].map(source=>({src:source.src,media:source.media,mediaMatches:source.media?matchMedia(source.media).matches:null}))}})()`,
  );
  const astroOutboundEvidence = desktopHeroEvidence(
    desktopSessionEvents().slice(astroOutboundStart, astroReturnStart),
  );
  const astroReturnEvidence = desktopHeroEvidence(desktopSessionEvents().slice(astroReturnStart));
  console.log(
    `Isolated Astro desktop return: ${JSON.stringify({ state: astroReturnState, outboundRequests: astroOutboundEvidence, returnRequests: astroReturnEvidence })}`,
  );
  assert.equal(astroReturnState.innerWidth, 1440);
  assert.equal(astroReturnState.mobileMedia, false);
  assert.ok(/hero-video\.[^/]+\.mp4/.test(astroReturnState.currentSrc));
  assert.ok(
    astroReturnEvidence.every(({ url }) => !url.includes('hero-video-mobile')),
    `desktop Astro return has no mobile-video request: ${JSON.stringify(astroReturnEvidence)}`,
  );
  await send('Target.closeTarget', { targetId: desktopProbeTargetId });
  desktopProbeTargetId = undefined;
  desktopProbeSession = undefined;
  console.log('Fresh-target desktop initial load and Astro return source/network selection PASS');

  for (const route of ['/creation', '/production', '/galerie']) {
    await call('Page.navigate', { url: new URL(route, baseUrl).href });
    await waitFor(() =>
      evaluate(
        `document.readyState==='complete'&&!!document.querySelector('.page-hero__img')?.naturalWidth`,
      ),
    );
  }
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await call('Page.navigate', { url: new URL('/', baseUrl).href });
  await waitFor(() =>
    evaluate(`document.readyState==='complete'&&!!document.querySelector('.section-timeline img')`),
  );
  const timeline = await evaluate(
    `(async () => {const images=[...document.querySelectorAll('.section-timeline img')];images.forEach(image=>image.loading='eager');await Promise.all(images.map(image=>image.decode()));return images.map(image=>({src:image.currentSrc,naturalWidth:image.naturalWidth}));})()`,
  );
  assert.ok(timeline.length > 0 && timeline.every(({ naturalWidth }) => naturalWidth > 0));
  const epv = await evaluate(
    `(async () => {const card=[...document.querySelectorAll('.value-block')].find(node=>/Entreprise du patrimoine vivant/i.test(node.querySelector('h3')?.innerText||''));if(!card)return null;card.scrollIntoView({block:'center'});const image=card.querySelector('.value-block__logo');image.loading='eager';await image.decode();const title=card.querySelector('h3'),a=image.getBoundingClientRect(),b=title.getBoundingClientRect();return {src:image.currentSrc,title:title.innerText,above:a.bottom<=b.top+1,width:a.width,height:a.height,centerDelta:Math.abs((a.left+a.right)/2-(b.left+b.right)/2)}})()`,
  );
  assert.ok(epv, 'localized EPV value block and mark render on the home page');
  assert.match(epv.src, /EPV_logo/);
  assert.match(epv.title, /Entreprise du patrimoine vivant/i);
  assert.equal(epv.above, true);
  assert.ok(epv.width >= 40 && epv.width <= 140 && epv.height >= 40 && epv.height <= 140);
  assert.ok(epv.centerDelta <= 2);
  const fabrication = await evaluate(
    `(async () => {const image=[...document.querySelectorAll('.value-block__logo')].find(node=>node.src.includes('made_in_france'));if(!image)return false;image.loading='eager';await image.decode();return image.naturalWidth>0})()`,
  );
  assert.equal(fabrication, true, 'Made in France icon remains present and loaded');
  assert.ok(
    failedResponses.filter(
      ({ url }) => /(?:_astro|_image)/.test(url) && !url.includes('qa-unavailable-image'),
    ).length === 0,
    JSON.stringify(failedResponses),
  );
  console.log(
    `Migrated page/timeline images and EPV placement PASS: ${JSON.stringify({ timeline: timeline.length, epv })}`,
  );

  console.log('Targeted gallery browser regressions passed.');
} finally {
  if (desktopProbeTargetId && ws?.readyState === WebSocket.OPEN) {
    await send('Target.closeTarget', { targetId: desktopProbeTargetId }).catch(() => {});
  }
  ws?.close();
  if (chrome?.pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      chrome.kill('SIGTERM');
    }
  }
  if (server?.pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      server.kill('SIGTERM');
    }
  }
  if (process.platform === 'win32' && chrome?.pid) await delay(300);
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
