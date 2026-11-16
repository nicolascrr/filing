# Production gallery QA checks

These checks use Node's built-in test runner and the real production SSR server,
with no added dependencies. The catalogue-integrity test hashes every listed
source file and prepared WebP copy (currently about 5.5 GB of sequential reads);
it never writes to or transforms those files.

Legal-notice regression checks use the same built-in runner and Chrome CDP
harness style: run `node --test tests/legal-notice.test.mjs` and
`node tests/legal-notice-browser.mjs` against a fresh server by setting
`FILING_QA_BASE_URL`. They cover localized footer labels, preserved French
legal content, route/reload behavior, keyboard activation, and horizontal
overflow at 375/768/1024/1440px. The browser check uses DOM activation (not a
physical pointer or assistive-technology test).

After building, run the zoom-handler harness and the combined production HTTP
and targeted Chrome regressions from `app/`:

```powershell
node --test tests/gallery-zoom.test.mjs
node --test tests/photo-arrival.test.mjs
node tests/gallery-review-browser.mjs
node tests/footer-menu-browser.mjs
```

`footer-menu-browser.mjs` starts a fresh production SSR server from `dist/` on
an available local port and a fresh headless Chrome profile, then removes both
on exit. Set `CHROME_PATH` if Chrome is not at the default Windows path. To use
an already-running current production build instead, set
`FILING_QA_BASE_URL`; do not point it at a stale server/build.

`gallery-review-browser.mjs` starts the production server from `dist/` on an
available localhost port, runs the HTTP suite against it, then launches
headless Chrome. Before the long browser journey, it starts a separate Chrome
process with a fresh profile and target, disables cache before first navigation,
and runs `gallery-cold-zoom-browser.mjs` against that server. That focused
regression gates the initial viewer manifest across first click and pan, then
checks a decoded, newly requested 4096px `currentSrc`, painted image rectangle,
normalized anchor, and pan before/after HD replacement; it also injects HD
failure/retry and stale-navigation/close cases. Its read-only sample report is
written under `%LOCALAPPDATA%/Temp/opencode/`, not into the repository.
The main Chrome journey covers localized Macramé names, viewer normal/error/retry
geometry at 1440×900, 1920×1080, 1024×768, 768×1024, 375×812, and 667×375,
including a generated portrait fixture and the 12px mobile photo/control gap.
It also checks compact fixed masonry phases across responsive tiers, square and
mixed-ratio layouts after filtering/resizing, CSS fallback, measured shared
photo-arrival duration on Galerie/Création/Production/Finition, keyboard
interruption and reduced-motion (initial and dynamic), rapid filters, viewer
focus/inert/scroll/late-HD reset, and
mobile/desktop hero source selection from `currentSrc` plus network responses,
Astro-return navigation, migrated image loading and EPV placement. Set
`CHROME_PATH` if Chrome is not at the standard Windows install path. To use an
already running production server instead, set `FILING_QA_BASE_URL`; do not
point it at a stale build.

The desktop hero network assertion uses a new Chrome target with the 1440px
viewport configured before its first navigation. It captures only that target's
CDP network events for the initial load and a desktop Astro return, including
request initiator, response status, timestamps and transferred-byte metadata;
the assertion does not reuse the mobile journey's accumulated request list.

Locale-arrival coverage drives the actual FR→EN switch at a scrolled position
with an SSR URL seed and a deliberately different session seed, verifies the
client-seeded cards and that visible cards retain settled styles/scroll position,
and arms a continuous CDP-injected `requestAnimationFrame` probe before each
language click. The probe survives Astro swaps/new documents, matches the
rendered card signature to the fetched client-seed manifest, retains the SSR
card-node identities captured before the language click, and anchors them when
the targeted XHR response is paused at response-ready. It starts
the 1.65s window only after every expected card is a new DOM node, not merely
when matching data appears. The category response is held for >1.65s while the
probe continues sampling; the test asserts no window/commit starts until release.
It samples visible photo wrappers for opacity/translation/scale and fails on any
replay frame. The same probe detects active arrival styles on the next user
filter as a positive control. A separate delayed-request case preserves the
interrupted initial-sync precedence check.

The browser harness also runs 20 viewer open/close cycles and observes the
long-lived GSAP context entry/target counts, active viewer-targeted tweens and
the per-viewer tween registry through a browser-only, read-only probe. It checks
rapid reopen, immediate close, reduced-motion interruption and duplicate Astro
cleanup. This is evidence about those observable lists and live targets only;
it is **not** a heap snapshot, garbage-collection test or proof that no detached
object remains reachable elsewhere.

The animation regression checks the historical shared photo gesture's six
index combinations at compact/desktop breakpoints, live opacity/x/y/scale frames
and stable masonry/image geometry on Galerie and atelier compositions. The
browser suite also compares the category hover animation's actual CSS keyframes,
duration and easing with one social and one transport footer link, then checks
selected/focus styling and the category-nav gap. Zoom coverage includes the
desktop 1×↔2.5× toggle, 7px-vs-8px drag threshold, round-trip pans at 2.5×,
cancellation/lost capture, wheel/keyboard bounds, and an HD response held across
a pan and 1600→4096 image replacement. Chrome's CDP native touch protocol is
exercised with touch emulation for single/double tap, the shared 2.5× pinch
ceiling and round-trip pan; this is browser touch emulation, not a physical-
device test.

The HTTP suite compares the current gallery manifest against the canonical
`src/assets/gallery/` tree and original catalogue bytes without pinning the
current catalogue totals. `tests/fixtures/site-media-sha256.json` records the
verified hashes for the relocated hero/timeline media and the intact copied
content originals. The locally verified migration/hash reports remain outside
the repository.

The gesture-handler harness imports the actual `galleryZoom.ts` module and
drives its registered handlers with controlled synthetic pointer, wheel, and
keyboard events. Browser regressions use headless Chrome for rendered DOM,
browser image-error/retry behavior, mouse-driven zoom intent, and CDP touch
emulation. There is no physical-device test evidence.

The production HTTP suite also checks the Footer's exact contact and directions
hrefs (including percent-encoded origins), the SSR `mailto:` fallback, and
`html lang` on all four routes in FR/EN/IT. It makes no requests to third-party
services. It asserts the visible copy action is only `contact@filing.fr`, the
localized human send label, copy `aria-label`/`title`, and localized success and
manual-fallback messages; it also rejects raw translation keys. The headless
Chrome Footer/Menu QA checks exercise clipboard success and rejected/unavailable
fallbacks in each locale, stale clipboard completions across
close/reopen and Astro swaps, the unblocked `mailto:` click default, popover
keyboard behavior, no-JS/Popover-API fallback, and popup/menu viewport geometry
at 375×812, 768×1024, 1024×768, 1440×900, and 375×240. These are not
screen-reader, physical-device, email-delivery, or real-world directions tests.
