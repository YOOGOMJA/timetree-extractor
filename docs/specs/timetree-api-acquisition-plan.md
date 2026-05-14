# TimeTree API Acquisition Implementation Plan

> **For agentic workers:** REQUIRED: Use test-driven-development for implementation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TimeTree REST API의 페이지네이션을 정확히 처리하고 acquisition layer 안에서 single-page 호출과 다중 페이지 집계를 분리한다. Calendar 목록 조회도 같은 패턴으로 추가한다. 외부에 노출되는 `RawTimeTreeEvent[]` 경계는 보존해서 `core/`, `cli/`, `extension/` 은 영향받지 않는다.

**Architecture:** Acquisition 책임을 두 계층으로 분리한다. 하위 계층은 한 페이지를 가져오는 순수 함수(`fetchCalendarEventsPage`), 상위 계층은 `chunk`/`since` cursor를 따라가는 aggregator(`extractCalendarEvents`). 기존 `extractVisibleTimeTreeEvents`는 새 aggregator를 호출하는 wrapper로 축소하고 외부 시그니처는 유지한다. Calendar enumeration은 별도 모듈(`listTimeTreeCalendars`).

**Tech Stack:** TypeScript ESM, Node.js 20+ test runner (`node:test`), 외부 의존성 추가 없음. `fetchJson` 어댑터 패턴은 현행 그대로 — Decision 0004 boundary 유지(헤더/credentials은 호출자가 책임).

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/browser/timetree-events-fetch.ts` | 한 페이지만 가져온다. `{ events, cursor, hasMore }` envelope을 반환하며 raw payload 검증은 하지만 normalize/aggregate는 안 한다. |
| `src/browser/timetree-events-extractor.ts` | `fetchCalendarEventsPage`를 반복 호출해 cursor가 멈출 때까지 누적한다. 안전 상한 `maxPages` 보유. 결과는 `RawTimeTreeEvent[]` + `lastCursor`. |
| `src/browser/timetree-calendars.ts` | `/api/v2/calendars`로 calendar 목록을 가져와 `RawTimeTreeCalendar[]`로 매핑한다. |
| `src/browser/timetree-page-extractor.ts` | 기존 `extractVisibleTimeTreeEvents`를 신규 aggregator의 wrapper로 축소한다. 외부 시그니처 보존. `mapApiEventToRawTimeTreeEvent`는 그대로. |
| `src/browser/index.ts` | 신규 모듈 re-export. |
| `test/browser/timetree-events-fetch.test.ts` | single page envelope 검증. |
| `test/browser/timetree-events-extractor.test.ts` | cursor 페이지네이션, 안전 상한, 오류 전파 검증. |
| `test/browser/timetree-calendars.test.ts` | calendar 목록 매핑 및 오류 검증. |
| `test/browser/timetree-page-extractor.test.ts` | 기존 테스트를 envelope-aware 응답 mock으로 갱신. |

## Scope boundary

### 이 plan에 포함

- `chunk`/`since` cursor 기반 페이지네이션 정확한 구현
- single-page와 multi-page 책임 분리
- `/api/v2/calendars` 응답 매핑
- 기존 `extractVisibleTimeTreeEvents`의 외부 시그니처 유지(내부만 교체)
- 신규/수정 모듈 모두에 대한 unit test

### 이 plan에서 제외

- RRULE 전개(개별 instance 생성). `core/normalize`는 현행대로 RRULE 보존만 함.
- Authorization 헤더(예: `x-timetreea`) 자동 첨부. `fetchJson` 어댑터 책임으로 유지(Decision 0004).
- Label / read-marker / mark API. 별도 plan으로 미룬다.
- Calendar 목록 + per-calendar 추출을 묶는 high-level orchestrator. Acquisition 부품이 완성된 뒤 별도 plan.
- Chrome extension packaging 또는 helper format.

---

## Task 1: single-page envelope contract

**Files:**
- Create: `src/browser/timetree-events-fetch.ts`
- Test: `test/browser/timetree-events-fetch.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// test/browser/timetree-events-fetch.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchCalendarEventsPage } from '../../src/browser/timetree-events-fetch.js';

test('returns single page when chunk flag is false', async () => {
  const result = await fetchCalendarEventsPage({
    calendarId: 1,
    fetchJson: async () => ({
      events: [{
        id: 'event-1', calendar_id: 1, title: 'a', all_day: true,
        start_at: 0, start_timezone: null, end_at: 0, end_timezone: null,
        recurrences: [], alerts: [], attendees: [], attachment: null, files: [],
      }],
      chunk: false,
      since: 1234,
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.page.hasMore, false);
  assert.equal(result.page.cursor, 1234);
  assert.equal(result.page.events.length, 1);
  assert.equal(result.page.events[0].id, 'event-1');
});

test('reports cursor and hasMore when chunk flag is true', async () => {
  const result = await fetchCalendarEventsPage({
    calendarId: 1,
    fetchJson: async () => ({ events: [], chunk: true, since: 5678 }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.page.hasMore, true);
  assert.equal(result.page.cursor, 5678);
});

test('passes since cursor in the request path', async () => {
  const requested: string[] = [];
  await fetchCalendarEventsPage({
    calendarId: 42,
    since: 999,
    fetchJson: async (path) => {
      requested.push(path);
      return { events: [], chunk: false, since: 999 };
    },
  });
  assert.equal(requested[0], '/api/v1/calendar/42/events?since=999');
});

test('omits since query when not provided', async () => {
  const requested: string[] = [];
  await fetchCalendarEventsPage({
    calendarId: 7,
    fetchJson: async (path) => {
      requested.push(path);
      return { events: [], chunk: false, since: 0 };
    },
  });
  assert.equal(requested[0], '/api/v1/calendar/7/events');
});

test('reports invalid envelope when chunk or since are missing or wrong type', async () => {
  const result = await fetchCalendarEventsPage({
    calendarId: 1,
    fetchJson: async () => ({ events: [] }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /chunk must be a boolean/);
});

test('reports invalid events array', async () => {
  const result = await fetchCalendarEventsPage({
    calendarId: 1,
    fetchJson: async () => ({ events: 'not-an-array', chunk: false, since: 0 }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /events must be an array/);
});

test('per-event mapping failures are reported as issues, not silent drop', async () => {
  const result = await fetchCalendarEventsPage({
    calendarId: 1,
    fetchJson: async () => ({
      events: [{ id: 'broken' /* missing required fields */ }],
      chunk: false, since: 0,
    }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /events\[0\]\./);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test
```

Expected: FAIL with `Cannot find module '../../src/browser/timetree-events-fetch.js'` (or compiled equivalent).

- [ ] **Step 3: Implement minimal single-page fetcher**

```ts
// src/browser/timetree-events-fetch.ts
import { validateRawTimeTreeEvent, type RawTimeTreeEvent } from '../core/contracts.js';
import { mapApiEventToRawTimeTreeEvent, type PageFetchJson } from './timetree-page-extractor.js';

export type FetchCalendarEventsPageInput = {
  calendarId: number;
  since?: number;
  fetchJson: PageFetchJson;
};

export type CalendarEventsPage = {
  events: RawTimeTreeEvent[];
  cursor: number;
  hasMore: boolean;
};

export type FetchCalendarEventsPageResult =
  | { ok: true; page: CalendarEventsPage; issues: [] }
  | { ok: false; page?: undefined; issues: string[] };

export async function fetchCalendarEventsPage(input: FetchCalendarEventsPageInput): Promise<FetchCalendarEventsPageResult> {
  const sinceQuery = input.since === undefined ? '' : `?since=${encodeURIComponent(String(input.since))}`;
  const payload = await input.fetchJson(`/api/v1/calendar/${input.calendarId}/events${sinceQuery}`);

  if (!isRecord(payload)) {
    return { ok: false, issues: ['response payload must be an object'] };
  }
  if (typeof payload.chunk !== 'boolean') {
    return { ok: false, issues: ['chunk must be a boolean'] };
  }
  if (typeof payload.since !== 'number' || !Number.isFinite(payload.since)) {
    return { ok: false, issues: ['since must be a finite number'] };
  }
  if (!Array.isArray(payload.events)) {
    return { ok: false, issues: ['events must be an array'] };
  }

  const events: RawTimeTreeEvent[] = [];
  const issues: string[] = [];
  payload.events.forEach((apiEvent, index) => {
    if (!isRecord(apiEvent)) {
      issues.push(`events[${index}] must be an object`);
      return;
    }
    const mapped = mapApiEventToRawTimeTreeEvent(apiEvent);
    const validation = validateRawTimeTreeEvent(mapped);
    if (!validation.ok) {
      issues.push(...validation.issues.map((issue) => `events[${index}].${issue}`));
      return;
    }
    events.push(validation.value);
  });

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    page: { events, cursor: payload.since, hasMore: payload.chunk },
    issues: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test
npm run typecheck
```

Expected: all new tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/browser/timetree-events-fetch.ts test/browser/timetree-events-fetch.test.ts
git commit -m "feat(browser): TimeTree events 단일 페이지 fetch contract를 추가한다"
```

---

## Task 2: paginated aggregator

**Files:**
- Create: `src/browser/timetree-events-extractor.ts`
- Test: `test/browser/timetree-events-extractor.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// test/browser/timetree-events-extractor.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCalendarEvents } from '../../src/browser/timetree-events-extractor.js';

function makeEvent(id: string) {
  return {
    id, calendar_id: 1, title: 't', all_day: true,
    start_at: 0, start_timezone: null, end_at: 0, end_timezone: null,
    recurrences: [], alerts: [], attendees: [], attachment: null, files: [],
  };
}

test('returns events from single page when chunk is false', async () => {
  const result = await extractCalendarEvents({
    calendarId: 1,
    fetchJson: async () => ({ events: [makeEvent('a')], chunk: false, since: 1 }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1);
  assert.equal(result.lastCursor, 1);
});

test('follows cursor through multiple chunks until hasMore is false', async () => {
  const calls: string[] = [];
  const result = await extractCalendarEvents({
    calendarId: 1,
    fetchJson: async (path) => {
      calls.push(path);
      if (calls.length === 1) return { events: [makeEvent('a')], chunk: true, since: 10 };
      if (calls.length === 2) return { events: [makeEvent('b')], chunk: true, since: 20 };
      return { events: [makeEvent('c')], chunk: false, since: 30 };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.events.length, 3);
  assert.equal(result.lastCursor, 30);
  assert.equal(calls[0], '/api/v1/calendar/1/events');
  assert.equal(calls[1], '/api/v1/calendar/1/events?since=10');
  assert.equal(calls[2], '/api/v1/calendar/1/events?since=20');
});

test('respects maxPages safety bound and reports when bound is hit', async () => {
  const result = await extractCalendarEvents({
    calendarId: 1,
    maxPages: 2,
    fetchJson: async () => ({ events: [makeEvent('a')], chunk: true, since: 99 }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /maxPages/);
});

test('aborts when cursor does not advance (server stuck)', async () => {
  const result = await extractCalendarEvents({
    calendarId: 1,
    fetchJson: async () => ({ events: [makeEvent('a')], chunk: true, since: 5 }),
  });
  // Even with chunk: true, cursor stays at 5 → should abort instead of looping
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /cursor did not advance/);
});

test('propagates per-page errors immediately without further pagination', async () => {
  let calls = 0;
  const result = await extractCalendarEvents({
    calendarId: 1,
    fetchJson: async () => {
      calls++;
      return { events: 'broken', chunk: false, since: 0 };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.match(result.issues.join('\n'), /events must be an array/);
});

test('honors since as starting cursor', async () => {
  const calls: string[] = [];
  await extractCalendarEvents({
    calendarId: 1,
    since: 42,
    fetchJson: async (path) => {
      calls.push(path);
      return { events: [], chunk: false, since: 42 };
    },
  });
  assert.equal(calls[0], '/api/v1/calendar/1/events?since=42');
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test
```

Expected: FAIL with `Cannot find module ... timetree-events-extractor.js`.

- [ ] **Step 3: Implement minimal aggregator**

```ts
// src/browser/timetree-events-extractor.ts
import { type RawTimeTreeEvent } from '../core/contracts.js';
import { fetchCalendarEventsPage, type FetchCalendarEventsPageInput } from './timetree-events-fetch.js';

const DEFAULT_MAX_PAGES = 50;

export type ExtractCalendarEventsInput = Omit<FetchCalendarEventsPageInput, 'since'> & {
  since?: number;
  maxPages?: number;
};

export type ExtractCalendarEventsResult =
  | { ok: true; events: RawTimeTreeEvent[]; lastCursor: number; issues: [] }
  | { ok: false; events?: undefined; lastCursor?: number; issues: string[] };

export async function extractCalendarEvents(input: ExtractCalendarEventsInput): Promise<ExtractCalendarEventsResult> {
  const maxPages = input.maxPages ?? DEFAULT_MAX_PAGES;
  const events: RawTimeTreeEvent[] = [];
  let cursor = input.since;
  let pages = 0;

  while (pages < maxPages) {
    const page = await fetchCalendarEventsPage({
      calendarId: input.calendarId,
      fetchJson: input.fetchJson,
      since: cursor,
    });
    if (!page.ok) return { ok: false, issues: page.issues };

    events.push(...page.page.events);
    pages += 1;

    if (!page.page.hasMore) {
      return { ok: true, events, lastCursor: page.page.cursor, issues: [] };
    }

    if (cursor !== undefined && page.page.cursor <= cursor) {
      return { ok: false, issues: [`cursor did not advance: stuck at ${page.page.cursor}`] };
    }
    cursor = page.page.cursor;
  }

  return { ok: false, issues: [`maxPages reached (${maxPages}); refusing to continue`] };
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test
npm run typecheck
```

Expected: all new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/browser/timetree-events-extractor.ts test/browser/timetree-events-extractor.test.ts
git commit -m "feat(browser): chunk/cursor 페이지네이션 aggregator를 추가한다"
```

---

## Task 3: migrate `extractVisibleTimeTreeEvents` to the aggregator

**Files:**
- Modify: `src/browser/timetree-page-extractor.ts`
- Modify: `test/browser/timetree-page-extractor.test.ts`

- [ ] **Step 1: Update existing tests to use envelope shape**

Update every `fetchJson: async () => ({ events: [...] })` mock to include `chunk: false, since: 0`. Keep the assertion shape (`result.ok`, `result.events[0].id`, etc.) unchanged. Add one new test for pagination behavior delegated through the wrapper:

```ts
test('extractVisibleTimeTreeEvents follows pagination internally', async () => {
  let call = 0;
  const result = await extractVisibleTimeTreeEvents({
    locationHref: 'https://timetreeapp.com/calendars/alias123/monthly',
    calendarId: 1,
    fetchJson: async () => {
      call++;
      if (call === 1) {
        return {
          events: [{
            id: 'event-1', calendar_id: 1, title: 't', all_day: true,
            start_at: 0, start_timezone: null, end_at: 0, end_timezone: null,
            recurrences: [], alerts: [], attendees: [], attachment: null, files: [],
          }],
          chunk: true, since: 100,
        };
      }
      return {
        events: [{
          id: 'event-2', calendar_id: 1, title: 't', all_day: true,
          start_at: 0, start_timezone: null, end_at: 0, end_timezone: null,
          recurrences: [], alerts: [], attendees: [], attachment: null, files: [],
        }],
        chunk: false, since: 200,
      };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.events.length, 2);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test
```

Expected: existing tests fail because new envelope validation requires `chunk` and `since`. New pagination test fails because wrapper currently does one call only.

- [ ] **Step 3: Reimplement `extractVisibleTimeTreeEvents` as a thin wrapper**

```ts
// src/browser/timetree-page-extractor.ts (top of file unchanged; replace extractVisibleTimeTreeEvents body)
import { extractCalendarEvents } from './timetree-events-extractor.js';

export async function extractVisibleTimeTreeEvents(input: ExtractVisibleTimeTreeEventsInput): Promise<ExtractVisibleTimeTreeEventsResult> {
  const calendarAlias = parseTimeTreeCalendarAlias(input.locationHref);
  if (!calendarAlias) {
    return { ok: false, events: [], issues: ['Extraction must run on a TimeTree origin calendar page'] };
  }

  const result = await extractCalendarEvents({
    calendarId: input.calendarId,
    since: input.since,
    fetchJson: input.fetchJson,
  });

  if (!result.ok) {
    return { ok: false, calendarAlias, events: [], issues: result.issues };
  }
  return { ok: true, calendarAlias, events: result.events, issues: [] };
}
```

Keep `mapApiEventToRawTimeTreeEvent`, `parseTimeTreeCalendarAlias`, and existing types in place. Remove the now-dead `readEventsArray` helper and any other code that became unreferenced (use TS `noUnusedLocals` via `npm run typecheck` to confirm).

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test
npm run typecheck
```

Expected: every existing test that was updated in Step 1 passes; new pagination test passes.

- [ ] **Step 5: Commit**

```bash
git add src/browser/timetree-page-extractor.ts test/browser/timetree-page-extractor.test.ts
git commit -m "refactor(browser): extractVisibleTimeTreeEvents가 aggregator 위에 올라가도록 한다"
```

---

## Task 4: calendar list mapper

**Files:**
- Create: `src/browser/timetree-calendars.ts`
- Test: `test/browser/timetree-calendars.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// test/browser/timetree-calendars.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listTimeTreeCalendars, mapApiCalendarToRawCalendar } from '../../src/browser/timetree-calendars.js';

test('maps snake_case API calendar to RawTimeTreeCalendar', () => {
  const raw = mapApiCalendarToRawCalendar({
    id: 99,
    alias_code: 'abc',
    name: 'Family',
    updated_at: 1700000000000,
    created_at: 1600000000000,
  });
  assert.equal(raw.id, 99);
  assert.equal(raw.aliasCode, 'abc');
  assert.equal(raw.name, 'Family');
  assert.equal(raw.updatedAt, 1700000000000);
  assert.equal(raw.createdAt, 1600000000000);
});

test('lists calendars via injected fetch', async () => {
  const requested: string[] = [];
  const result = await listTimeTreeCalendars({
    fetchJson: async (path) => {
      requested.push(path);
      return { calendars: [
        { id: 1, alias_code: 'one', name: 'A' },
        { id: 2, alias_code: 'two', name: 'B' },
      ]};
    },
  });
  assert.equal(result.ok, true);
  assert.equal(requested[0], '/api/v2/calendars');
  assert.equal(result.calendars.length, 2);
  assert.equal(result.calendars[0].aliasCode, 'one');
});

test('reports invalid calendar payload shape', async () => {
  const result = await listTimeTreeCalendars({
    fetchJson: async () => ({ unexpected: [] }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /calendars must be an array/);
});

test('reports per-calendar validation failures with index prefix', async () => {
  const result = await listTimeTreeCalendars({
    fetchJson: async () => ({ calendars: [{ id: 'not-a-number', alias_code: 'a', name: 'x' }] }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /calendars\[0\]\./);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test
```

Expected: FAIL with `Cannot find module ... timetree-calendars.js`.

- [ ] **Step 3: Implement minimal calendars module**

```ts
// src/browser/timetree-calendars.ts
import { validateRawTimeTreeCalendar, type RawTimeTreeCalendar } from '../core/contracts.js';
import { type PageFetchJson } from './timetree-page-extractor.js';

export type ListTimeTreeCalendarsInput = {
  fetchJson: PageFetchJson;
};

export type ListTimeTreeCalendarsResult =
  | { ok: true; calendars: RawTimeTreeCalendar[]; issues: [] }
  | { ok: false; calendars?: undefined; issues: string[] };

export async function listTimeTreeCalendars(input: ListTimeTreeCalendarsInput): Promise<ListTimeTreeCalendarsResult> {
  const payload = await input.fetchJson('/api/v2/calendars');
  if (!isRecord(payload) || !Array.isArray(payload.calendars)) {
    return { ok: false, issues: ['calendars must be an array under `calendars` key'] };
  }

  const calendars: RawTimeTreeCalendar[] = [];
  const issues: string[] = [];
  payload.calendars.forEach((apiCalendar, index) => {
    if (!isRecord(apiCalendar)) {
      issues.push(`calendars[${index}] must be an object`);
      return;
    }
    const mapped = mapApiCalendarToRawCalendar(apiCalendar);
    const validation = validateRawTimeTreeCalendar(mapped);
    if (!validation.ok) {
      issues.push(...validation.issues.map((issue) => `calendars[${index}].${issue}`));
      return;
    }
    calendars.push(validation.value);
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, calendars, issues: [] };
}

export function mapApiCalendarToRawCalendar(apiCalendar: Record<string, unknown>): RawTimeTreeCalendar {
  return {
    id: numberValue(apiCalendar.id),
    aliasCode: stringValue(apiCalendar.alias_code),
    name: stringValue(apiCalendar.name),
    updatedAt: optionalNumber(apiCalendar.updated_at),
    createdAt: optionalNumber(apiCalendar.created_at),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return numberValue(value);
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test
npm run typecheck
```

Expected: all new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/browser/timetree-calendars.ts test/browser/timetree-calendars.test.ts
git commit -m "feat(browser): TimeTree calendar 목록 조회와 매핑 contract를 추가한다"
```

---

## Task 5: re-export new modules

**Files:**
- Modify: `src/browser/index.ts`

- [ ] **Step 1: Write failing test for the re-export surface**

```ts
// Append to test/browser/timetree-events-extractor.test.ts
test('module is re-exported from src/browser barrel', async () => {
  const mod = await import('../../src/browser/index.js');
  assert.equal(typeof mod.extractCalendarEvents, 'function');
  assert.equal(typeof mod.fetchCalendarEventsPage, 'function');
  assert.equal(typeof mod.listTimeTreeCalendars, 'function');
  assert.equal(typeof mod.mapApiCalendarToRawCalendar, 'function');
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test
```

Expected: FAIL — exports are missing from barrel.

- [ ] **Step 3: Update barrel**

Replace `src/browser/index.ts` content with:

```ts
export {
  extractVisibleTimeTreeEvents,
  mapApiEventToRawTimeTreeEvent,
  parseTimeTreeCalendarAlias,
  type ExtractVisibleTimeTreeEventsInput,
  type ExtractVisibleTimeTreeEventsResult,
  type PageFetchJson,
} from './timetree-page-extractor.js';
export * from './timetree-events-fetch.js';
export * from './timetree-events-extractor.js';
export * from './timetree-calendars.js';
export * from './timetree-endpoints.js';
export * from './passive-fetch-observer.js';
export * from './observed-payload.js';
export * from './sqlite-cache-blocks.js';
export * from './sqlite-event-row-mapper.js';
export * from './sqlite-event-reader.js';
export * from './sqlite-cache-reader.js';
export * from './indexeddb-sqlite-cache-reader.js';
export * from './sqljs-adapter.js';
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test
npm run typecheck
```

Expected: barrel re-export test passes; everything else still passes.

- [ ] **Step 5: Commit**

```bash
git add src/browser/index.ts test/browser/timetree-events-extractor.test.ts
git commit -m "chore(browser): 새 acquisition 모듈을 barrel에 노출한다"
```

---

## Verification checklist

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `git diff --check`
- [ ] `src/browser/index.ts`가 `extractCalendarEvents`, `fetchCalendarEventsPage`, `listTimeTreeCalendars`, `mapApiCalendarToRawCalendar`를 모두 노출한다.
- [ ] `extractVisibleTimeTreeEvents`의 외부 시그니처(`ExtractVisibleTimeTreeEventsInput`, `ExtractVisibleTimeTreeEventsResult`)가 변하지 않았다.
- [ ] `core/contracts.ts`, `core/normalize.ts`, `core/ics.ts`, `src/cli/`, `src/extension/`에 변경 없음.
- [ ] 어떤 모듈도 `x-timetreea`, `x-csrf-token`, cookie를 코드에 하드코딩하거나 저장하지 않는다.
- [ ] aggregator는 cursor가 advance하지 않거나 `maxPages`를 넘기면 명시 issue로 실패한다(무한 루프 금지).

## Stop conditions

다음이 발생하면 plan을 멈추고 재논의한다.

- 실 TimeTree API의 응답 envelope이 `{ events, chunk, since }`와 다르다는 사실이 추가 smoke에서 드러난다.
- `extractVisibleTimeTreeEvents`의 외부 시그니처를 깨지 않고는 페이지네이션을 표현할 수 없다(현재 plan은 시그니처 보존이 가능하다고 본다).
- Calendar enumeration 응답이 `{ calendars: [...] }` 외 다른 wrapping을 쓴다.
- aggregator의 `maxPages` 기본값(50)이 실제 사용자 데이터에서 부족하다(즉 일부 calendar가 50 페이지 이상 chunk됨). 이 경우 default를 상향하거나 streaming API로 전환한다.
- header 인증 책임을 acquisition layer가 떠안아야 한다는 결정이 새로 내려진다(Decision 0004 재검토 필요).
