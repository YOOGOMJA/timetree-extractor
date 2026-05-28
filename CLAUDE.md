# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Local-first, research-grade Chrome MV3 extension that exports a user's TimeTree Web calendars to JSON / ICS. The repo is contract-first TypeScript: the runtime is small, but the field schema, normalization rules, and the network/observation boundary are treated as the product.

`AGENTS.md` is the authoritative project guidance for tone, commit style (Conventional Commits + Lore trailers), and Korean-first writing. `docs/README.md` lists the canonical reading order for product, research, spec, decision, and architecture context.

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
- `dist/` and `.omx/` are gitignored. Most of `.codex/` is gitignored except curated `agents/`, `skills/`, and `prompts/` subdirectories. `.claude/` follows the same pattern — only `.claude/agents/` and `.claude/skills/` are tracked.
- `_workspace/` (그리고 백업본 `_workspace_prev_*/`)는 하네스 실행 시 메인이 만드는 중간 산출물 저장소이며 gitignored.

## 하네스: TimeTree Extractor implementation

**목표:** 기능 추가/변경/구현 요청을 디자인 → contract → 구현 → 검증의 5단계로 일관 실행한다. ux-designer / contract-designer / core-implementer / extension-implementer / verifier 5개 서브에이전트를 메인이 오케스트레이트한다.

**트리거:** "구현해줘 / 추가해줘 / 만들어줘 / 수정해줘 / 보완해줘", "UI / 화면 / 디자인 / sidepanel / 버튼", "새 필드 / spec / contract / decision / warning enum", "normalize / ics emit / MV3 / manifest" 등의 *작업 요청*에는 `feature-build` 스킬을 사용한다. 단순 정보 질문(어디 정의돼 있어, 왜 이래)은 직접 응답 가능. 자세한 운영 규칙은 `.claude/skills/feature-build/SKILL.md`.

**구성:** 에이전트 정의 6개 (`.claude/agents/{ux-designer,contract-designer,core-implementer,extension-implementer,verifier,ics-emitter-reviewer}.md`) + 오케스트레이터 스킬 1개 (`.claude/skills/feature-build/SKILL.md`). integrator(리더) 역할은 메인 에이전트가 스킬 실행 시 수행.

**환경 제약:** Claude Code 환경에서 `TeamCreate` 미지원 → 서브 에이전트 모드 + `_workspace/` 파일 기반 통신으로 운영.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-05-28 | 초기 구성 | `.claude/agents/{ux-designer,contract-designer,core-implementer,extension-implementer,verifier}.md`, `.claude/skills/feature-build/SKILL.md`, `.gitignore`(skills/+_workspace 허용/제외) | implementation-centric 하네스 신규 구축 — 구현 흐름 일관화 + spec drift/privacy 누수 사전 차단 |
