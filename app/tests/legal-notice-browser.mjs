import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = process.env.FILING_QA_BASE_URL ?? 'http://127.0.0.1:14590';
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const temp = await mkdtemp(path.join(os.tmpdir(), 'legal-notice-browser-'));
let chrome;
let ws;

async function port() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
async function until(fn, label) {
  for (let i = 0; i < 150; i++) {
    try { const value = await fn(); if (value) return value; } catch {}
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}

try {
  const debugPort = await port();
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(temp, 'profile')}`, 'about:blank',
  ], { stdio: 'ignore' });
  const version = await until(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json(), 'Chrome');
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const item = pending.get(message.id); pending.delete(message.id);
    message.error ? item.reject(message.error) : item.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id; pending.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const navigate = async (pathname, width = 1440) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: new URL(pathname, baseUrl).href });
    await until(() => evaluate(`location.pathname===${JSON.stringify(pathname)}&&document.readyState==='complete'&&!!document.querySelector('footer')&&window.__qaPageLoads>0`), pathname);
  };
  const click = async (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.__qaPageLoads=0;document.addEventListener('astro:page-load',()=>window.__qaPageLoads++);` });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  const labels = { fr: 'Mention légales', en: 'Legal notice', it: 'Note legali' };
  for (const locale of ['fr', 'en', 'it']) {
    await call('Network.setCookie', { name: 'locale', value: locale, url: baseUrl });
    await navigate('/');
    await click('.footer__legal-link');
    await until(() => evaluate(`location.pathname==='/mentions_legales'&&document.readyState==='complete'`), `${locale} footer click`);
    assert.deepEqual(await evaluate(`({lang:document.documentElement.lang,body:document.querySelector('article').lang,label:document.querySelector('.footer__legal-link').textContent.trim(),title:document.querySelector('article h1').textContent})`), {
      lang: locale, body: 'fr', label: labels[locale], title: 'Mentions Légales / 2020 © Fil’ing Broderies',
    });
    const footerLink = await evaluate(`document.querySelector('.footer__legal-link').getAttribute('href')`);
    assert.equal(footerLink, '/mentions_legales');
    await call('Page.navigate', { url: new URL('/mentions_legales', baseUrl).href });
    await until(() => evaluate(`document.readyState==='complete'&&location.pathname==='/mentions_legales'`), `${locale} direct reload`);
    assert.equal(await evaluate(`document.documentElement.lang`), locale);
    assert.equal(await evaluate(`document.querySelector('article').lang`), 'fr');
    await click('.footer__sitemap-link[href="/creation"]');
    await until(() => evaluate(`location.pathname==='/creation'&&document.readyState==='complete'`), 'legal-to-creation');
    await click('.footer__sitemap-link[href="/galerie"]');
    await until(() => evaluate(`location.pathname==='/galerie'&&document.readyState==='complete'`), 'creation-to-gallery');
    await click('.footer__legal-link');
    await until(() => evaluate(`location.pathname==='/mentions_legales'&&document.readyState==='complete'`), 'gallery-to-legal return');
    assert.equal(await evaluate(`document.documentElement.lang`), locale, `${locale} cookie persists through route navigation`);
  }

  await call('Network.setCookie', { name: 'locale', value: 'fr', url: baseUrl });
  for (const width of [375, 768, 1024, 1440]) {
    await navigate('/mentions_legales', width);
    const layout = await evaluate(`(()=>({viewport:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,article:document.querySelector('article').getBoundingClientRect().width,legal:document.querySelector('.footer__legal-link').getBoundingClientRect().width}))()`);
    assert.ok(layout.doc <= width && layout.body <= width, `${width}px overflow: ${JSON.stringify(layout)}`);
  }

  // Exercise the user-visible scroll contract with a real CDP pointer and keyboard input.
  // Force instant scrolling only for setup; the page's own motion preference remains under test.
  const scrollToFooter = async (motion) => {
    await until(() => evaluate(`getComputedStyle(document.documentElement).scrollBehavior===${JSON.stringify(motion === 'reduce' ? 'auto' : 'smooth')}`), `${motion}: page scroll setup settled`);
    const setup = await evaluate(`(()=>{const root=document.documentElement,previous=root.style.scrollBehavior;root.style.scrollBehavior='auto';document.querySelector('.footer__legal-link').scrollIntoView({block:'center',behavior:'instant'});root.style.scrollBehavior=previous;return {previous,restored:root.style.scrollBehavior};})()`);
    assert.equal(setup.restored, setup.previous, 'setup restores the original inline scroll behavior');
    await delay(150);
    await until(() => evaluate(`scrollY>0&&document.querySelector('.footer__legal-link').getBoundingClientRect().bottom<=innerHeight`), 'footer reached with nonzero scroll');
    assert.equal(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`), motion === 'reduce', 'requested motion mode is active');
    await until(() => evaluate(`getComputedStyle(document.documentElement).scrollBehavior===${JSON.stringify(motion === 'reduce' ? 'auto' : 'smooth')}`), `${motion}: page scroll setup settled`);
    assert.equal(await evaluate(`getComputedStyle(document.documentElement).scrollBehavior`), motion === 'reduce' ? 'auto' : 'smooth', `${motion}: real CSS scroll behavior restored before activation`);
    return evaluate('scrollY');
  };
  const pointerActivateLegal = async (expectedPath = '/creation') => {
    await evaluate(`window.__qaLegalPageLoadsBefore=window.__qaPageLoads;window.__qaLegalSameRoute=location.pathname==='/mentions_legales';`);
    const before = await until(async () => {
      const state = await evaluate(`(()=>{const link=document.querySelector('.footer__legal-link'),r=link.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,target=document.elementFromPoint(x,y);return{pathname:location.pathname,scrollY,viewport:{width:innerWidth,height:innerHeight,visual:visualViewport&&[visualViewport.width,visualViewport.height,visualViewport.scale]},rect:{x:r.x,y:r.y,width:r.width,height:r.height},link:link.outerHTML,target:target?.outerHTML?.slice(0,300),hit:target===link||link.contains(target),x,y}})()`);
      return state.hit && state.y > 0 && state.y < state.viewport.height ? state : false;
    }, 'legal link is pointer-accessible after layout/scroll update');
    assert.equal(before.pathname, expectedPath, 'pointer starts on the expected source route');
    assert.ok(before.scrollY > 0, `pointer starts scrolled: ${JSON.stringify(before)}`);
    assert.equal(before.hit, true, `pointer hit-test must land on legal link, not overlay: ${JSON.stringify(before)}`);
    await evaluate(`window.__qaLegalClick=null;document.querySelector('.footer__legal-link').addEventListener('click',e=>{window.__qaLegalClick={trusted:e.isTrusted,href:e.currentTarget.getAttribute('href'),target:e.target.tagName}},{once:true})`);
    const point = { x: before.x, y: before.y };
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    await until(() => evaluate('window.__qaLegalClick?.trusted===true'), 'trusted pointer click on legal link');
  };
  const assertLegalAtTop = async (label) => {
    await until(() => evaluate(`location.pathname==='/mentions_legales'&&document.querySelector('article h1')?.textContent.includes('Mentions')`), label);
    await until(() => evaluate(`window.__qaLegalSameRoute||window.__qaPageLoads>window.__qaLegalPageLoadsBefore`), `${label}: Astro page-load completed`);
    let settled = false;
    for (let sample = 0; sample < 20; sample++) {
      const top = await evaluate('scrollY<=1');
      if (top) {
        await delay(100);
        if (await evaluate('scrollY<=1')) { settled = true; break; }
      }
    }
    const state = await evaluate(`({pathname:location.pathname,hash:location.hash,scrollY,heading:document.querySelector('article h1')?.textContent})`);
    assert.equal(settled, true, `${label}: scroll position did not remain at top: ${JSON.stringify(state)}`);
    assert.equal(state.pathname, '/mentions_legales', label);
    assert.equal(state.hash, '', label);
    assert.ok(state.scrollY <= 1, `${label}: ${JSON.stringify(state)}`);
    assert.ok(state.heading?.includes('Mentions'), `${label}: legal title present`);
    for (let sample = 0; sample < 15; sample++) {
      await delay(80);
      assert.ok(await evaluate('scrollY<=1'), `${label}: top remains stable after page-load/animation`);
    }
    return state.scrollY;
  };
  const keyboardActivateLegal = async (expectedPath = '/creation') => {
    await evaluate(`window.__qaLegalPageLoadsBefore=window.__qaPageLoads;window.__qaLegalSameRoute=location.pathname==='/mentions_legales';`);
    const before = await evaluate(`({pathname:location.pathname,scrollY})`);
    assert.equal(before.pathname, expectedPath, 'keyboard starts on the expected source route');
    assert.ok(before.scrollY > 0, `keyboard starts scrolled: ${JSON.stringify(before)}`);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    // Start tabbing from the current focus until the real footer link owns focus.
    for (let tab = 0; tab < 80 && !(await evaluate(`document.activeElement.matches('.footer__legal-link')`)); tab++) {
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    }
    assert.equal(await evaluate(`document.activeElement.matches('.footer__legal-link')`), true, 'keyboard activation starts with actual link focus');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  };

  const scrollFailures = [];
  for (const motion of ['no-preference', 'reduce']) {
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }] });
    // Use CSS viewport widths (including 375px) rather than mobile device emulation:
    // the latter scales the layout viewport and CDP's DOM hit-test coordinates diverge.
    for (const viewport of [{ width: 1440, mobile: false }, { width: 375, mobile: false }]) {
      await call('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: 900, deviceScaleFactor: 1, mobile: viewport.mobile });
      // Other route -> legal, via pointer; then same-route footer link again after Astro swap.
      await navigate('/creation', viewport.width);
      const beforeOtherRoute = await scrollToFooter(motion);
      await pointerActivateLegal();
      const afterOtherRoute = await assertLegalAtTop(`${motion}/${viewport.width}: creation pointer`);
      assert.ok(beforeOtherRoute > 0);
      const beforeSameRoute = await scrollToFooter(motion);
      await pointerActivateLegal('/mentions_legales');
      let afterSameRoute = null;
      try {
        afterSameRoute = await assertLegalAtTop(`${motion}/${viewport.width}: legal same-route pointer`);
      } catch (error) {
        scrollFailures.push(`${motion}/${viewport.width} same-route pointer: ${error.message}`);
        console.error(`SCROLL CASE FAILED: ${scrollFailures.at(-1)}`);
      }
      assert.ok(beforeSameRoute > 0);

      // Keyboard activation must likewise start at the footer and on the actual focused anchor.
      await navigate('/creation', viewport.width);
      const beforeKeyboard = await scrollToFooter(motion);
      await keyboardActivateLegal();
      const afterKeyboard = await assertLegalAtTop(`${motion}/${viewport.width}: keyboard`);
      assert.ok(beforeKeyboard > 0);
      await scrollToFooter(motion);
      await keyboardActivateLegal('/mentions_legales');
      await assertLegalAtTop(`${motion}/${viewport.width}: same-route keyboard`);

      // A native smooth scroll is still pending when the trusted click arrives.
      await navigate('/', viewport.width);
      await scrollToFooter(motion);
      await evaluate(`window.scrollBy({top:-16,behavior:'smooth'});`);
      await pointerActivateLegal('/');
      await assertLegalAtTop(`${motion}/${viewport.width}: home pointer during smooth scroll`);

      // Exercise back navigation only as a route transition, not as a new scroll-restoration requirement.
      await navigate('/creation', viewport.width);
      await scrollToFooter(motion);
      await pointerActivateLegal();
      await assertLegalAtTop(`${motion}/${viewport.width}: history setup`);
      await evaluate('history.back()');
      await until(() => evaluate(`location.pathname==='/creation'`), 'history back to creation');
      console.log(`SCROLL ${motion}/${viewport.width}: other ${beforeOtherRoute}->${afterOtherRoute}; same ${beforeSameRoute}->${afterSameRoute}; keyboard ${beforeKeyboard}->${afterKeyboard}; history returned to /creation`);
    }
  }
  assert.deepEqual(scrollFailures, [], 'all same-route scroll cases must reach and remain at the top');

  await navigate('/creation');
  await until(() => evaluate(`location.pathname==='/creation'&&!!document.querySelector('.page-hero__title')&&document.querySelector('.footer__legal-link')?.getAttribute('href')==='/mentions_legales'`), 'settled creation page and footer link');
  for (let tab = 0; tab < 60 && !(await evaluate(`document.activeElement.matches('.footer__legal-link')`)); tab++) {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  }
  assert.equal(await evaluate(`document.activeElement.matches('.footer__legal-link')`), true, 'Tab reaches the legal link');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until(() => evaluate(`location.pathname==='/mentions_legales'&&document.querySelector('article h1')?.textContent==='Mentions Légales / 2020 © Fil’ing Broderies'`), 'keyboard link activation and destination title');
  console.log('PASS: FR/EN/IT footer click, direct load/reload, French body, route navigation/return and persisted locale; keyboard focus/Enter; no horizontal overflow at 375/768/1024/1440px');
} finally {
  ws?.close();
  if (chrome && !chrome.killed) { chrome.kill(); await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), delay(3000)]); }
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
