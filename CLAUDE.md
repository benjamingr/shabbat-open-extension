# CLAUDE.md

## The site list has two copies

`data/sites.json` is bundled at build time **and** fetched at runtime.

- **Bundled** — `src/lib/dataset.ts` imports the JSON. The `dataset` / `sites` exports are
  this copy and must stay that way: both manifests and `scripts/check-manifest.mjs` build
  `content_scripts.matches` from them, and host access has to be decided entirely at build
  time.
- **Fetched** — `src/lib/remote.ts` pulls the copy on `main` from
  raw.githubusercontent.com every ~12 h, validates it, caches it in `storage.local`.

Anything that renders to a user calls `await getSites()` / `await getDataset()`. Never
import `sites` into UI code.

## Rules

- **Bump `revision` on every `data/sites.json` edit.** It is the only thing an install
  compares. `npm run check:revision` and CI enforce it.
- **A fetched list cannot add a banner to a new domain.** `content_scripts.matches` is
  fixed at install. New sites get badge + popup + proof page; the banner waits for a
  release. Removals and downgrades *are* immediate.
- **Never add `host_permissions` or `alarms`.** The fetch works on CORS alone; the refresh
  is TTL-checked from events the worker already handles. A new permission disables the
  extension on update until the user re-accepts — the exact cost this feature avoids.
- **`npm run check:manifest` must pass unedited.** That is the proof nothing widened host
  access.
- **Validate before trusting.** `src/lib/validate.ts` runs on every fetched dataset. Two of
  its rules exist only for remote data: `evidence_url` must be https (it goes into
  `link.href`, in the content script's case on the host page), and `proof_image` must be a
  bare filename (it goes into a URL). Do not relax either.
- **Data only.** No `eval`, no dynamic `import`, no remote code — store policy.
- **Touching the network story means touching `PRIVACY.md`.** It describes the request in
  detail (§2.3) and is a binding published document.

## Verify

```bash
npm run build          # validate → typecheck → vite → check:manifest
npm test               # unit; remote.test.ts covers the whole update flow
npm run test:e2e       # real browser; updates.spec.ts covers the cached-list path
npm run build:firefox && npm run lint:firefox
```
