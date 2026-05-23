# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Local-first, research-grade Chrome MV3 extension that exports a user's TimeTree Web calendars to JSON / ICS. The repo is contract-first TypeScript: the runtime is small, but the field schema, normalization rules, and the network/observation boundary are treated as the product.

`AGENTS.md` is the authoritative project guidance for tone, commit style (Conventional Commits + Lore trailers), and Korean-first writing. `docs/README.md` lists the canonical reading order for product/research/decision/spec context.

## Commands

```bash
npm install
npm run typecheck                          # tsc --noEmit, fast feedback
npm run build                              # tsc to dist/, then esbuild bundles content-script
npm test                                   # build, then node --test dist/test/**/*.test.js
node --test 'dist/test/core/*.test.js'     # run a subset (build first)
node --test dist/test/core/normalize.test.js  # single file
```

Build pipeline detail: `tsc` emits ESM to `dist/` so `node --test` and the extension background service worker can `import` modules. The content script is then bundled separately as an IIFE via esbuild because MV3 content scripts cannot be ES modules. The `manifest.json` references `dist/src/extension/content-script.bundle.js` (IIFE) and `dist/src/extension/background.js` (module) — `npm run build` must succeed before loading the unpacked extension.

Tests are Node's built-in test runner (`node:test`); there is no Jest/Vitest. Tests live under `test/` mirroring `src/` and import the compiled `.js` from `dist/`, so a stale `dist/` will mask source changes — always rebuild before running tests directly.

Manual smoke (the only way to exercise the side panel end-to-end): after `npm run build`, open `chrome://extensions`, enable Developer mode, **Load unpacked** → repo root. Open `https://timetreeapp.com` while logged in, click the extension action to open the side panel. Side-panel logs surface in its own devtools (right-click inside the panel → Inspect); content-script logs are in the TimeTree tab's devtools console; background service-worker logs are under the extension entry on `chrome://extensions`.

## Layered architecture

The four `src/` layers have hard one-way dependencies. Do not introduce edges that violate them.

| Layer | Allowed to import | May depend on browser APIs? |
| --- | --- | --- |
| `src/core/` | nothing project-internal | No. No `window`, `document`, `fetch`, `chrome`, `IndexedDB`. Pure TS. |
| `src/browser/` | `src/core` | Yes, but injected. `fetch` is passed in as `PageFetchJson`; sql.js and IndexedDB are wrapped behind adapters. |
| `src/extension/` | `src/core`, `src/browser` | Yes. Thin Chrome MV3 glue (content script, background service worker, side panel). |
| `src/cli/` | `src/core`, `src/browser` | Node only. Local harness for preview/export without the extension. |

`src/core/` is the contract: `RawTimeTreeEvent` (validated shape from any source) → `NormalizedCalendarEvent` (provider-agnostic) → ICS. Warning vocabularies (`EXTRACTION_WARNING_VALUES`, `NORMALIZATION_WARNING_VALUES`) are closed enums — extend the const tuple when adding a case so validators and tests stay in sync.

`src/browser/` has two parallel data sources, both feeding the same `RawTimeTreeEvent` contract:
1. **Live**: `timetree-page-extractor` + `timetree-events-fetch` call internal `https://timetreeapp.com/api/v1/...` endpoints via the injected `PageFetchJson` (extension supplies `x-csrf-token` from the page meta tag). `passive-fetch-observer` is the watcher variant.
2. **Cache**: `indexeddb-sqlite-cache-reader` + `sqljs-adapter` read TimeTree's local SQLite cache out of IndexedDB blocks using sql.js.

The shipped side panel currently uses path (1) only. Path (2) is library-only — fully implemented and tested, but no extension/CLI caller wires up `SqlJsStatic` yet. That is why `sql.js` is a runtime dependency without an obvious consumer; do not delete it.

`src/extension/` connects the side panel (UI) to the page via `chrome.runtime.sendMessage` with the typed `ExtensionRequest`/`ExtensionResponse` protocol in `message-protocol.ts`. The content script also accepts page-side `postMessage` payloads from an injected observer — that boundary strips anything containing credential-like keys (see `CREDENTIAL_LIKE_KEYS` in `content-script.ts`).

## Non-obvious constraints (read before adding features)

These are policy guardrails from `docs/specs/privacy-and-local-only-boundary.md` and `docs/decisions/0002-implementation-go-no-go.md`. They override convenience:

- **Local-only research prototype.** No server component, no hosted collector, no background polling, no scheduled sync, no public distribution (no Chrome Web Store), no SaaS, no cross-account aggregation.
- **Never persist credentials.** Cookies, session tokens, CSRF headers, `Authorization`, HAR captures, and raw private response dumps must not be written to disk or sent across the extension messaging boundary. `matchTimeTreeEndpoint` rejects URLs with token-like query keys and any non-GET method — keep that allowlist tight when adding endpoints.
- **Data minimization is the default.** Comments, files, images, and participants are off by default; attachment binaries are out of scope for v1. Export raw normalized event shape, not the full upstream response.
- **No retry/backoff to dodge rate limits.** The TimeTree AUP prohibits excessive load — if a request fails, surface it; do not paper over it.
- **Shared-calendar warning is required** before any export runs (the user-facing copy lives in the privacy spec).
- The autonomy directive in `AGENTS.md` is for Codex/OMX automation. For Claude Code, still pause for destructive or irreversible actions per the standard system prompt.

## Writing style

- Human-facing docs and commit subjects in Korean. Keep widely understood technical terms in English (`browser extension`, `content script`, `JSON`, `ICS`, `schema`, `DOM`, `API`).
- Conclusion first, then reasons / evidence / risks. Distinguish what is known, inferred, and unverified — do not write speculation as fact.
- Commits use Conventional Commits (`type(scope): subject`) with optional Lore trailers (`Constraint:`, `Rejected:`, `Confidence:`, `Scope-risk:`, `Directive:`, `Tested:`, `Not-tested:`). See the `lore_commit_protocol` block in `AGENTS.md`.

## PR / workflow notes

- The `check-plan-files` GitHub workflow comments on PRs that include files under `docs/superpowers/plans/**`. Those are scratch implementation plans — delete them from the branch before merging to `main`.
- `dist/` and `.omx/` are gitignored. Most of `.codex/` is gitignored except curated `agents/`, `skills/`, and `prompts/` subdirectories.
