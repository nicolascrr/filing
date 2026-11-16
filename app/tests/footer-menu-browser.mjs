import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuredBaseUrl = process.env.FILING_QA_BASE_URL;
const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : 'google-chrome');
const workDir = await mkdtemp(path.join(os.tmpdir(), 'footer-menu-qa-'));
const profile = path.join(workDir, 'chrome-profile');
const results = [];
let server;
let chrome;
let ws;

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function waitFor(readiness, label = 'browser state') {
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const value = await readiness();
      if (value) return value;
    } catch {
      // Chrome startup, navigation, and browser events are asynchronous.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

try {
  let baseUrl = configuredBaseUrl;
  if (!baseUrl) {
    const port = await availablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['dist/server/entry.mjs'], {
      cwd: appRoot,
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
      stdio: 'ignore',
    });
  }
  await waitFor(async () => (await fetch(baseUrl)).ok, 'production SSR server');

  const routes = ['/', '/creation', '/production', '/galerie'];
  const expectedHrefs = [
    'mailto:contact@filing.fr',
    'https://maps.app.goo.gl/Lv3RT9JYYH2KcvF9A',
    'https://www.instagram.com/filing_broderies/',
    'https://www.linkedin.com/company/filing-broderies/',
    'https://www.google.com/maps/dir/?api=1&origin=Gare%20Lyon%20Part-Dieu%2C%20France&destination=45.903903%2C4.8771092',
    'https://www.google.com/maps/dir/?api=1&origin=A%C3%A9roport%20Lyon-Saint-Exup%C3%A9ry%2C%20France&destination=45.903903%2C4.8771092',
  ];
  for (const locale of ['fr', 'en', 'it']) {
    for (const route of routes) {
      const response = await fetch(new URL(route, baseUrl), {
        headers: { cookie: `locale=${locale}` },
      });
      assert.equal(response.status, 200, `${locale} ${route}`);
      const html = (await response.text()).replaceAll('&amp;', '&');
      assert.ok(html.includes(`lang="${locale}"`));
      for (const href of expectedHrefs) assert.ok(html.includes(`href="${href}"`), href);
    }
  }
  results.push('12 SSR route/locale combinations: exact hrefs and lang');

  const debugPort = await availablePort();
  chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const version = await waitFor(
    async () => (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json(),
    'Chrome DevTools endpoint',
  );
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let commandId = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(message.error);
    else request.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++commandId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async (expression, userGesture = false) => {
    const response = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture,
    });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const click = async (selector) => {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
    );
    await delay(1000);
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
    );
    await delay(200);
    const point = await evaluate(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
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
  const key = async (keyName) => {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName });
  };
  const navigate = async (route = '/') => {
    await evaluate('window.__qaOld=true');
    await call('Page.navigate', { url: new URL(route, baseUrl).href });
    await waitFor(
      () =>
        evaluate(
          `!window.__qaOld&&document.readyState==='complete'&&!!document.querySelector('[data-footer-email-trigger][aria-haspopup]')`,
        ),
      `navigation to ${route}`,
    );
  };
  const openPopover = async () => {
    await click('[data-footer-email-trigger]');
    await waitFor(
      () => evaluate(`document.querySelector('#footer-email-popover').matches(':popover-open')`),
      'email popover',
    );
    assert.equal(await evaluate(`document.activeElement.matches('[data-email-copy]')`), true);
    assert.deepEqual(
      await evaluate(
        `(()=>{const p=document.querySelector('#footer-email-popover');return {actions:[...p.querySelectorAll('.footer__email-action')].map(e=>e.textContent.trim()).filter(Boolean).length,decorativeIcons:[...p.querySelectorAll('svg')].every(e=>e.getAttribute('aria-hidden')==='true'),liveRegions:p.querySelectorAll('[aria-live]').length}})()`,
      ),
      { actions: 2, decorativeIcons: true, liveRegions: 1 },
    );
  };
  const isClosed = () =>
    evaluate(`!document.querySelector('#footer-email-popover').matches(':popover-open')`);

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate();
  for (const route of routes) {
    await navigate(route);
    await openPopover();
    await key('Escape');
    assert.equal(await isClosed(), true);
    assert.equal(
      await evaluate(`document.activeElement.matches('[data-footer-email-trigger]')`),
      true,
    );
  }
  results.push('Native popover opening, initial focus, Escape, and opener focus on all routes');

  await send('Browser.setPermission', {
    permission: { name: 'clipboard-read' },
    setting: 'granted',
    origin: baseUrl,
  });
  await send('Browser.setPermission', {
    permission: { name: 'clipboard-write' },
    setting: 'granted',
    origin: baseUrl,
  });
  await openPopover();
  await click('[data-email-copy]');
  await waitFor(
    () => evaluate(`document.querySelector('[data-email-status]').textContent.length>0`),
    'clipboard success announcement',
  );
  assert.equal(await evaluate('navigator.clipboard.readText()', true), 'contact@filing.fr');
  assert.equal(
    await evaluate(`document.querySelector('[data-email-status]').textContent`),
    'Adresse copiée.',
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('#footer-email-popover [aria-live]').length`),
    1,
  );
  await key('Escape');
  results.push('Native clipboard writes the exact address and announces success once');

  for (const fixture of ['denied', 'absent']) {
    const clipboard =
      fixture === 'denied'
        ? `{writeText:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))}`
        : 'undefined';
    await evaluate(
      `Object.defineProperty(navigator,'clipboard',{configurable:true,value:${clipboard}})`,
    );
    await openPopover();
    await click('[data-email-copy]');
    await waitFor(
      () => evaluate(`!document.querySelector('[data-email-manual]').hidden`),
      `${fixture} clipboard fallback`,
    );
    assert.equal(
      await evaluate(
        `(()=>{const i=document.querySelector('#footer-email-address');return i.value==='contact@filing.fr'&&i.readOnly&&document.activeElement===i&&i.selectionStart===0&&i.selectionEnd===17})()`,
      ),
      true,
    );
    assert.equal(
      await evaluate(
        `document.querySelector('[data-email-status]').textContent.includes('manuellement')`,
      ),
      true,
    );
    await key('Escape');
  }
  results.push('Denied and unavailable clipboard show the selectable exact-address fallback');

  await evaluate(
    `Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(r=>window.resolveCopy=r)}})`,
  );
  await openPopover();
  await click('[data-email-copy]');
  await key('Escape');
  await openPopover();
  await evaluate('window.resolveCopy()');
  await delay(100);
  assert.equal(await evaluate(`document.querySelector('[data-email-status]').textContent`), '');
  await evaluate(`document.querySelector('[data-email-copy]').focus()`);
  await key('Tab');
  assert.equal(await evaluate(`document.activeElement.matches('.footer__email-send')`), true);
  await key('Tab');
  assert.equal(
    await evaluate(
      `!document.querySelector('#footer-email-popover').contains(document.activeElement)`,
    ),
    true,
  );
  await key('Escape');
  assert.equal(await isClosed(), true);
  assert.equal(
    await evaluate(`!document.activeElement.matches('[data-footer-email-trigger]')`),
    true,
  );
  await openPopover();
  await click('.footer__sitemap-link[href="/creation"]');
  await waitFor(
    () =>
      evaluate(
        `location.pathname==='/creation'&&!!document.querySelector('[data-footer-email-trigger][aria-haspopup]')`,
      ),
    'outside link Astro navigation',
  );
  await openPopover();
  await key('Escape');
  results.push(
    'Late clipboard completion after close/reopen is ignored; Tab is free and outside Astro navigation works',
  );

  await evaluate(
    `Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(r=>window.resolveOldCopy=r)}})`,
  );
  await openPopover();
  await click('[data-email-copy]');
  await click('.footer__sitemap-link[href="/production"]');
  await waitFor(
    () =>
      evaluate(
        `location.pathname==='/production'&&!!document.querySelector('[data-footer-email-trigger][aria-haspopup]')`,
      ),
    'Astro swap during pending clipboard',
  );
  await openPopover();
  await evaluate('window.resolveOldCopy()');
  assert.equal(await evaluate(`document.querySelector('[data-email-status]').textContent`), '');
  await key('Escape');

  await openPopover();
  await evaluate(
    `document.querySelector('.footer__email-send').addEventListener('click',e=>{window.mailDefault={prevented:e.defaultPrevented,href:e.currentTarget.getAttribute('href')};e.preventDefault()},{once:true})`,
  );
  await click('.footer__email-send');
  assert.deepEqual(await evaluate('window.mailDefault'), {
    prevented: false,
    href: 'mailto:contact@filing.fr',
  });
  assert.equal(await isClosed(), true);
  results.push(
    'Pending completion after Astro swap is ignored; mailto default is unblocked (QA listener prevents launch)',
  );

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
  for (const locale of ['en', 'it', 'fr']) {
    await call('Network.setCookie', { name: 'locale', value: locale, url: baseUrl });
    await navigate();
    await openPopover();
    assert.equal(await evaluate('document.documentElement.lang'), locale);
    const labels = await evaluate(
      `(()=>{const p=document.querySelector('#footer-email-popover'),c=p.querySelector('[data-email-copy]'),s=p.querySelector('.footer__email-send');return {copy:c.textContent.trim(),copyAria:c.getAttribute('aria-label'),copyTitle:c.title,send:s.textContent.trim(),dialog:p.getAttribute('aria-label'),address:p.querySelector('label').textContent.trim(),success:p.dataset.copySuccess,manual:p.dataset.copyManual,raw:p.outerHTML.includes('common.footer.email.')}})()`,
    );
    assert.deepEqual(labels, {
      copy: 'contact@filing.fr',
      copyAria: expectedLabels[locale].copy,
      copyTitle: expectedLabels[locale].copy,
      send: expectedLabels[locale].send,
      dialog: expectedLabels[locale].dialog,
      address: expectedLabels[locale].address,
      success: expectedLabels[locale].success,
      manual: expectedLabels[locale].manual,
      raw: false,
    });

    await evaluate(
      `Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))}})`,
    );
    await click('[data-email-copy]');
    await waitFor(
      () =>
        evaluate(
          `document.querySelector('[data-email-status]').textContent===${JSON.stringify(expectedLabels[locale].manual)}`,
        ),
      `${locale} localized copy fallback`,
    );
    assert.equal(await evaluate(`!document.querySelector('[data-email-manual]').hidden`), true);
    assert.equal(
      await evaluate(
        `document.querySelector('#footer-email-popover').outerHTML.includes('common.footer.email.')`,
      ),
      false,
    );
    await key('Escape');
  }
  results.push(
    'FR/EN/IT visible, accessible and feedback labels; translated fallback and no raw keys',
  );

  for (const [width, height] of [
    [375, 812],
    [768, 1024],
    [1024, 768],
    [1440, 900],
    [375, 240],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await openPopover();
    await delay(150);
    const bounds = await evaluate(
      `(()=>{const p=document.querySelector('#footer-email-popover'),r=p.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,bg:getComputedStyle(p).backgroundColor,footer:getComputedStyle(document.querySelector('footer')).backgroundColor,white:getComputedStyle(p.querySelector('a')).backgroundColor,targets:[...p.querySelectorAll('button,a')].map(e=>e.getBoundingClientRect().height)}})()`,
    );
    assert.ok(
      bounds.x >= 7 && bounds.y >= 7 && bounds.right <= width - 7 && bounds.bottom <= height - 7,
      JSON.stringify(bounds),
    );
    assert.equal(bounds.bg, bounds.footer);
    assert.equal(bounds.white, 'rgb(255, 255, 255)');
    assert.ok(bounds.targets.every((targetHeight) => targetHeight >= 44));
    await key('Escape');

    await click('[data-menu-trigger]');
    await waitFor(
      () => evaluate(`document.querySelector('[data-thread-menu]').dataset.menuState==='open'`),
      'thread menu open',
    );
    await delay(450);
    const menu = await evaluate(
      `(()=>{const p=document.querySelector('.menu__panel'),r=p.getBoundingClientRect(),s=getComputedStyle(document.querySelector('.menu__filets'));return {x:r.x,right:r.right,bottom:r.bottom,scroll:p.scrollHeight>p.clientHeight,mask:s.maskImage,position:s.maskPosition,dash:document.querySelector('[data-menu-thread]').style.strokeDasharray}})()`,
    );
    assert.ok(menu.x >= 0 && menu.right <= width && menu.bottom <= height, JSON.stringify(menu));
    assert.match(menu.mask, /repeating-linear-gradient/);
    assert.equal(menu.dash, '1');
    assert.match(menu.position, /28px/);
    assert.match(menu.position, /100%/);
    if (height === 240) assert.equal(menu.scroll, true);
    await key('Escape');
  }
  results.push(
    'Popover clamp, footer background, white action and 44px targets; menu mask/stroke/scroll at five viewports',
  );

  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate();
  await openPopover();
  await key('Escape');
  await click('[data-menu-trigger]');
  await waitFor(() =>
    evaluate(`document.querySelector('[data-thread-menu]').dataset.menuState==='open'`),
  );
  await key('Escape');
  results.push('Popup and thread-menu smoke check with normal motion');

  await call('Emulation.setScriptExecutionDisabled', { value: true });
  await call('Page.navigate', { url: new URL('/creation', baseUrl).href });
  await delay(700);
  assert.equal(
    await evaluate(`document.querySelector('[data-footer-email-trigger]').getAttribute('href')`),
    'mailto:contact@filing.fr',
  );
  assert.equal(await evaluate(`document.querySelector('#footer-email-popover').hidden`), true);
  results.push('JavaScript disabled preserves mailto and leaves popover hidden');
  await call('Emulation.setScriptExecutionDisabled', { value: false });

  await call('Page.addScriptToEvaluateOnNewDocument', {
    source:
      'HTMLElement.prototype.showPopover=undefined;HTMLElement.prototype.hidePopover=undefined;',
  });
  await call('Page.navigate', { url: new URL('/production', baseUrl).href });
  await delay(700);
  assert.equal(
    await evaluate(
      `document.querySelector('[data-footer-email-trigger]').getAttribute('aria-haspopup')`,
    ),
    null,
  );
  assert.equal(
    await evaluate(`document.querySelector('[data-footer-email-trigger]').getAttribute('href')`),
    'mailto:contact@filing.fr',
  );
  assert.equal(await evaluate(`document.querySelector('#footer-email-popover').hidden`), true);
  results.push('Missing native Popover API preserves untouched mailto fallback');

  console.log(JSON.stringify(results, null, 2));
} finally {
  ws?.close();
  for (const child of [chrome, server]) {
    if (!child || child.killed) continue;
    child.kill();
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(3000)]);
  }
  await rm(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
