# Production gallery QA checks

These checks use Node's built-in test runner and the real production SSR server,
with no mocks or extra dependencies. Build first, run the standalone server on
port 4330, then from `app/` run:

```powershell
$env:FILING_QA_BASE_URL = 'http://127.0.0.1:4330'
node --test tests/gallery-production.test.mjs
```

The media integrity test reads and hashes the 741 original catalogue files and
their 741 prepared WebP copies (about 5.5 GB of sequential read I/O). It never
writes to or transforms those files.
