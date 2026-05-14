# CLI Harness Implementation Plan

> **For agentic workers:** REQUIRED: Use test-driven-development for implementation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 Chrome extension packaging 전에, TimeTree cache → normalization → `ICS` export path를 local CLI로 재현 가능하게 만든다.

**Architecture:** CLI는 export core를 직접 호출하되, browser session 접근은 별도 adapter로 둔다. v1 CLI는 raw credential/session token을 저장하지 않고, smoke/preview와 explicit file write를 분리한다.

**Tech Stack:** TypeScript, Node.js 20+, `sql.js`, Node test runner. Browser access는 초기에는 `agent-browser`/Chrome profile smoke로 검증하고, 제품 CLI adapter는 별도 gate에서 결정한다.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/cli/index.ts` | CLI entry point. args parsing과 command dispatch만 담당한다. |
| `src/cli/export-preview.ts` | read/normalize/write pipeline의 summary를 생성한다. raw value를 log하지 않는다. |
| `src/cli/write-ics.ts` | explicit output path가 있을 때만 `.ics` file을 쓴다. |
| `src/browser/indexeddb-sqlite-cache-reader.ts` | browser context에서 IndexedDB read-only adapter. 이미 구현됨. |
| `src/core/ics.ts` | `NormalizedCalendarEvent[]` → `ICS` text writer. 이미 구현됨. |
| `test/cli/export-preview.test.ts` | raw value 없이 summary만 생성하는지 검증한다. |
| `test/cli/write-ics.test.ts` | explicit path write와 overwrite policy를 검증한다. |
| `docs/specs/cli-harness-plan.md` | 이 계획 문서. |

## Scope boundary

### v1 CLI에 포함

- `preview` command
  - event count
  - normalized count
  - warning count
  - ICS structural check
- `export` command
  - explicit `--output` path가 있을 때 `.ics` file 생성
  - overwrite는 기본 거부
- local-only execution
- no credential persistence

### v1 CLI에서 제외

- TimeTree login automation
- credential vault
- background sync
- public SaaS upload
- automatic month crawling
- Chrome extension manifest/popup

## Task 1: Export preview summary

**Files:**
- Create: `src/cli/export-preview.ts`
- Test: `test/cli/export-preview.test.ts`

- [ ] **Step 1: Write failing test**

Expected behavior:

- input: normalized events + warning list
- output: summary object only
- summary does not include title, note, location, URL, participant value

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test
```

Expected: module not found or function not found.

- [ ] **Step 3: Implement minimal summary**

Summary fields:

- `eventCount`
- `normalizedCount`
- `icsLineCount`
- `veventCount`
- `hasDtStart`
- `hasDtEnd`
- `hasRRule`
- `warningCounts`

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test
npm run typecheck
```

## Task 2: ICS file writer with explicit output

**Files:**
- Create: `src/cli/write-ics.ts`
- Test: `test/cli/write-ics.test.ts`

- [ ] **Step 1: Write failing tests**

Expected behavior:

- writes only when output path is explicit
- refuses overwrite unless `overwrite: true`
- creates parent directory only when explicit option is set

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test
```

- [ ] **Step 3: Implement minimal writer**

Use Node `fs/promises`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test
npm run typecheck
```

## Task 3: CLI command wrapper

**Files:**
- Create: `src/cli/index.ts`
- Modify: `package.json`
- Test: `test/cli/cli-args.test.ts`

- [ ] **Step 1: Write failing args tests**

Commands:

```text
timetree-exporter preview
timetree-exporter export --output ./calendar.ics
```

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement minimal parser without adding dependency**

No new argument parser dependency unless explicitly approved.

- [ ] **Step 4: Verify GREEN**

## Task 4: Browser-source adapter decision

**Files:**
- Create: `docs/decisions/0004-cli-browser-source.md`

Decision to make before implementation:

- Option A: CLI calls an already-open browser through `agent-browser`/CDP for local smoke only.
- Option B: CLI expects an exported sanitized SQLite byte source from a browser-side helper.
- Option C: Skip standalone browser access in CLI and keep browser extraction for extension only.

Recommendation for now: **Option A for developer smoke, Option C for product boundary**. Do not build login/session handling into the CLI.

## Verification checklist

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `git diff --check`
- [ ] no raw event value in CLI preview output
- [ ] no credential/session/HAR file created
- [ ] `.ics` file write requires explicit output path

## Stop conditions

Stop and revisit plan if:

- CLI requires storing browser cookies/session tokens.
- CLI needs HAR/raw response capture.
- TimeTree cache reader cannot run without page context.
- `.ics` compatibility fails in target calendar app smoke.
