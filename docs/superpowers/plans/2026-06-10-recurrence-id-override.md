# RECURRENCE-ID override 보존 (#14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수정된 반복 instance를 master와 동일 UID + `RECURRENCE-ID`로 emit해 Google Calendar에서 series override로 반영하고, master 부재/애매 시 단발 UID + warning으로 안전 fallback한다.

**Architecture:** core에 pure linking pass(`linkRecurringOverrides`)를 추가한다. per-event `normalizeRawTimeTreeEvent`는 raw `recurringUuid`/`recurStartAt`를 provider-neutral 필드(`recurrenceGroupId`/`originalStartAt`)로 번역만 하고, 배열 단위 linking pass가 그룹화→UID 통합→`recurrenceId` 부여→fallback warning을 담당한다. ics.ts는 `recurrenceId`를 RECURRENCE-ID 라인으로 emit한다. 호출부(`cli/export-preview.ts`, `extension/sidepanel.tsx`)는 `createIcsCalendar` 직전(sidepanel은 range filter 이후)에 linking pass를 끼운다.

**Tech Stack:** TypeScript (ESM, `tsc`→`dist/`), Node 내장 test runner(`node:test`). 빌드 후 `node --test dist/test/**/*.test.js` 실행.

**Spec:** `docs/superpowers/specs/2026-06-10-recurrence-id-override-design.md`

---

## File Structure

- `src/core/normalize.ts` (수정) — `NormalizedCalendarEvent`에 `recurrenceGroupId?`/`originalStartAt?`/`recurrenceId?` 추가, normalize가 group/originalStart 채움, `toUtcDate` export, warning enum에 `recurrence-override-orphaned` 추가
- `src/core/recurrence-link.ts` (신규) — `buildRecurrenceId`, `linkRecurringOverrides` (pure)
- `src/core/ics.ts` (수정) — `formatDateTimeLine` name union에 `'RECURRENCE-ID'` 추가, `recurrenceId` emit
- `src/core/index.ts` (수정) — `linkRecurringOverrides` re-export
- `src/cli/export-preview.ts` (수정) — linking pass 배선
- `src/extension/sidepanel.tsx` (수정) — filter 이후 linking pass 배선
- `test/core/recurrence-link.test.ts` (신규) — linking 규칙·fallback·포맷 테스트
- `test/core/normalize.test.ts` (수정) — 필드 번역 테스트 추가
- `test/core/ics.test.ts` (수정) — RECURRENCE-ID emit 테스트 추가
- `docs/specs/google-calendar-import-field-compat.md`, `docs/specs/ics-normalization-contract.md` (수정) — 정책 반영

각 task 후 빌드는 `npm run build`, 테스트는 `node --test dist/test/core/<file>.js`로 확인한다(stale `dist/` 주의 — 반드시 빌드 후 실행).

---

## Task 1: NormalizedCalendarEvent 링크 필드 + normalize 번역

**Files:**
- Modify: `src/core/normalize.ts`
- Test: `test/core/normalize.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`test/core/normalize.test.ts` 끝에 추가. (fixture는 `validRawTimeTreeEvent()` 같은 헬퍼가 이미 있으면 사용; 없으면 아래처럼 인라인 raw 객체 사용.)

```ts
test('수정된 반복 instance: recurringUuid/recurStartAt를 neutral 필드로 번역한다', () => {
  const result = normalizeRawTimeTreeEvent({
    id: 'evt-override', calendarId: 7, category: 'schedule', allDay: false,
    title: '회의', startAt: 1767607200000, endAt: 1767610800000,
    startTimezone: 'Asia/Seoul', endTimezone: 'Asia/Seoul',
    recurrences: [], recurringUuid: 'grp-abc',
    recurStartAt: 1767604800000, recurEndAt: 1767608400000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.recurrenceGroupId, 'grp-abc');
  assert.equal(result.value.originalStartAt, 1767604800000);
  assert.equal(result.value.recurrenceId, undefined);
});

test('일반 이벤트: 링크 필드는 absent다', () => {
  const result = normalizeRawTimeTreeEvent({
    id: 'evt-plain', calendarId: 7, category: 'schedule', allDay: false,
    title: '회의', startAt: 1767607200000, endAt: 1767610800000,
    startTimezone: 'Asia/Seoul', endTimezone: 'Asia/Seoul', recurrences: [],
  });
  assert.equal(result.ok, true);
  assert.equal('recurrenceGroupId' in result.value, false);
  assert.equal('originalStartAt' in result.value, false);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run build` (타입 에러로 빌드 실패 — `recurrenceGroupId`가 타입에 없음)
Expected: FAIL — `Property 'recurrenceGroupId' does not exist on type 'NormalizedCalendarEvent'`

- [ ] **Step 3: 타입에 필드 추가**

`src/core/normalize.ts`의 `NormalizedCalendarEvent` 타입에서 `recurrence?: NormalizedRecurrence;` 다음 줄에 추가:

```ts
  recurrence?: NormalizedRecurrence;
  /** 같은 반복 series를 묶는 그룹 키 (raw recurringUuid 번역). 일반 이벤트엔 absent. */
  recurrenceGroupId?: string;
  /** 수정된 반복 instance의 *원래* occurrence 시각(epoch ms, raw recurStartAt 번역). */
  originalStartAt?: number;
  /** export 시 RECURRENCE-ID로 emit되는 원래 occurrence (linkRecurringOverrides가 설정). */
  recurrenceId?: NormalizedDateTime;
```

- [ ] **Step 4: normalize가 필드를 채우도록 수정**

`src/core/normalize.ts`의 `normalizeRawTimeTreeEvent` 내부, `if (alertResult.reminders.length > 0) value.reminders = alertResult.reminders;` 다음 줄에 추가:

```ts
  if (event.recurringUuid != null) value.recurrenceGroupId = event.recurringUuid;
  if (event.recurStartAt != null) value.originalStartAt = event.recurStartAt;
```

- [ ] **Step 5: `toUtcDate` export (Task 3에서 재사용)**

`src/core/normalize.ts`의 `function toUtcDate(epochMs: number): string {`를 `export function toUtcDate(...)`로 변경.

- [ ] **Step 6: 빌드 + 테스트 통과 확인**

Run: `npm run build && node --test dist/test/core/normalize.test.js`
Expected: PASS (신규 2개 포함 전부 통과)

- [ ] **Step 7: Commit**

```bash
git add src/core/normalize.ts test/core/normalize.test.ts
git commit -m "feat(core): normalize가 recurringUuid/recurStartAt를 neutral 링크 필드로 번역 (#14)"
```

---

## Task 2: warning enum에 `recurrence-override-orphaned` 추가

**Files:**
- Modify: `src/core/normalize.ts`
- Test: `test/core/normalize.test.ts` (enum sync 테스트가 있으면 거기, 없으면 신규)

- [ ] **Step 1: 실패 테스트 작성**

`test/core/normalize.test.ts`에 추가:

```ts
test('NORMALIZATION_WARNING_VALUES는 recurrence-override-orphaned를 포함한다', () => {
  assert.ok(NORMALIZATION_WARNING_VALUES.includes('recurrence-override-orphaned'));
});
```

(파일 상단 import에 `NORMALIZATION_WARNING_VALUES`가 없으면 추가.)

- [ ] **Step 2: 실패 확인**

Run: `npm run build && node --test dist/test/core/normalize.test.js`
Expected: FAIL — assertion false

- [ ] **Step 3: enum tuple에 값 추가**

`src/core/normalize.ts`의 `NORMALIZATION_WARNING_VALUES` 배열에서 `'url-invalid',` 다음 줄에 추가:

```ts
  'url-invalid',
  'recurrence-override-orphaned',
```

- [ ] **Step 4: 통과 확인**

Run: `npm run build && node --test dist/test/core/normalize.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/normalize.ts test/core/normalize.test.ts
git commit -m "feat(core): recurrence-override-orphaned warning enum 추가 (#14)"
```

---

## Task 3: `linkRecurringOverrides` + `buildRecurrenceId` (core pure)

**Files:**
- Create: `src/core/recurrence-link.ts`
- Modify: `src/core/index.ts`
- Test: `test/core/recurrence-link.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`test/core/recurrence-link.test.ts` 신규 작성:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkRecurringOverrides } from '../../src/core/recurrence-link.js';
import type { NormalizedCalendarEvent } from '../../src/core/normalize.js';

function master(over: Partial<NormalizedCalendarEvent> = {}): NormalizedCalendarEvent {
  return {
    uid: 'timetree:7:evt-master', calendarName: 'cal', title: '주간 회의',
    start: { kind: 'date-time', epochMs: 1767000000000, timezone: 'Asia/Seoul' },
    end: { kind: 'date-time', epochMs: 1767003600000, timezone: 'Asia/Seoul' },
    recurrence: { rrule: ['RRULE:FREQ=WEEKLY;BYDAY=MO'] },
    recurrenceGroupId: 'grp-abc',
    source: { provider: 'timetree', eventId: 'evt-master', calendarId: 7 },
    warnings: [], ...over,
  };
}
function override(over: Partial<NormalizedCalendarEvent> = {}): NormalizedCalendarEvent {
  return {
    uid: 'timetree:7:evt-override', calendarName: 'cal', title: '주간 회의(변경)',
    start: { kind: 'date-time', epochMs: 1767607200000, timezone: 'Asia/Seoul' },
    end: { kind: 'date-time', epochMs: 1767610800000, timezone: 'Asia/Seoul' },
    recurrenceGroupId: 'grp-abc', originalStartAt: 1767604800000,
    source: { provider: 'timetree', eventId: 'evt-override', calendarId: 7 },
    warnings: [], ...over,
  };
}

test('master 존재: override.uid를 master.uid로 통합하고 recurrenceId를 부여한다', () => {
  const [m, o] = linkRecurringOverrides([master(), override()]);
  assert.equal(o.uid, 'timetree:7:evt-master');
  assert.deepEqual(o.recurrenceId, { kind: 'date-time', epochMs: 1767604800000, timezone: 'Asia/Seoul' });
  assert.equal(m.uid, 'timetree:7:evt-master'); // master 무변경
  assert.equal(m.recurrenceId, undefined);
});

test('master 부재: 단발 uid 유지 + recurrence-override-orphaned warning', () => {
  const [o] = linkRecurringOverrides([override()]);
  assert.equal(o.uid, 'timetree:7:evt-override');
  assert.equal(o.recurrenceId, undefined);
  assert.ok(o.warnings.includes('recurrence-override-orphaned'));
});

test('all-day master: recurrenceId는 date 종류로 구성된다', () => {
  const m = master({ start: { kind: 'date', date: '2026-01-05' } });
  const [, o] = linkRecurringOverrides([m, override()]);
  assert.deepEqual(o.recurrenceId, { kind: 'date', date: '2026-01-05' });
});

test('한 master에 복수 override: 각각 distinct recurrenceId, 공통 uid', () => {
  const o2 = override({ uid: 'timetree:7:evt-override2', originalStartAt: 1768209600000,
    source: { provider: 'timetree', eventId: 'evt-override2', calendarId: 7 } });
  const out = linkRecurringOverrides([master(), override(), o2]);
  const overrides = out.filter((e) => e.recurrenceId);
  assert.equal(overrides.length, 2);
  assert.ok(overrides.every((e) => e.uid === 'timetree:7:evt-master'));
  assert.notDeepEqual(overrides[0].recurrenceId, overrides[1].recurrenceId);
});

test('동일 그룹에 master 2개(애매): override는 orphan 처리', () => {
  const m2 = master({ uid: 'timetree:7:evt-master2',
    source: { provider: 'timetree', eventId: 'evt-master2', calendarId: 7 } });
  const out = linkRecurringOverrides([master(), m2, override()]);
  const o = out.find((e) => e.source.eventId === 'evt-override')!;
  assert.equal(o.uid, 'timetree:7:evt-override');
  assert.ok(o.warnings.includes('recurrence-override-orphaned'));
});

test('일반 이벤트(group 없음): 무변경, warning/recurrenceId 없음', () => {
  const plain: NormalizedCalendarEvent = {
    uid: 'timetree:7:evt-plain', calendarName: 'cal', title: '단발',
    start: { kind: 'date-time', epochMs: 1767000000000, timezone: 'Asia/Seoul' },
    end: { kind: 'date-time', epochMs: 1767003600000, timezone: 'Asia/Seoul' },
    source: { provider: 'timetree', eventId: 'evt-plain', calendarId: 7 }, warnings: [],
  };
  const [out] = linkRecurringOverrides([plain]);
  assert.equal(out.uid, 'timetree:7:evt-plain');
  assert.equal(out.recurrenceId, undefined);
  assert.equal(out.warnings.length, 0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run build`
Expected: FAIL — `Cannot find module '../core/recurrence-link.js'`

- [ ] **Step 3: `recurrence-link.ts` 구현**

`src/core/recurrence-link.ts` 신규:

```ts
import { toUtcDate, type NormalizedCalendarEvent, type NormalizedDateTime } from './normalize.js';

// originalStartAt(원래 occurrence)을 master.start의 VALUE/TZID 특성으로 구성한다.
// RECURRENCE-ID는 master DTSTART와 종류·timezone이 일치해야 RRULE 원래 슬롯과 매칭된다.
export function buildRecurrenceId(originalStartAt: number, masterStart: NormalizedDateTime): NormalizedDateTime {
  if (masterStart.kind === 'date') return { kind: 'date', date: toUtcDate(originalStartAt) };
  return { kind: 'date-time', epochMs: originalStartAt, timezone: masterStart.timezone };
}

// 수정된 반복 instance를 master와 동일 UID + recurrenceId로 묶는다. master 부재/애매 시
// 단발 uid 유지 + recurrence-override-orphaned warning으로 fallback(data-loss 0).
// 반드시 export될 최종 set(range filter 이후) 위에서 호출한다.
export function linkRecurringOverrides(events: NormalizedCalendarEvent[]): NormalizedCalendarEvent[] {
  const groups = new Map<string, NormalizedCalendarEvent[]>();
  for (const event of events) {
    if (event.recurrenceGroupId == null) continue;
    const list = groups.get(event.recurrenceGroupId) ?? [];
    list.push(event);
    groups.set(event.recurrenceGroupId, list);
  }

  return events.map((event) => {
    if (event.recurrenceGroupId == null || event.originalStartAt == null) return event;
    const group = groups.get(event.recurrenceGroupId) ?? [];
    const masters = group.filter((e) => e.recurrence != null && e.originalStartAt == null);
    if (masters.length !== 1) {
      return { ...event, warnings: [...event.warnings, 'recurrence-override-orphaned' as const] };
    }
    const master = masters[0];
    return { ...event, uid: master.uid, recurrenceId: buildRecurrenceId(event.originalStartAt, master.start) };
  });
}
```

- [ ] **Step 4: index.ts에 re-export**

`src/core/index.ts`의 `export * from './ics.js';` 위에 추가:

```ts
export { linkRecurringOverrides, buildRecurrenceId } from './recurrence-link.js';
```

- [ ] **Step 5: 빌드 + 테스트 통과 확인**

Run: `npm run build && node --test dist/test/core/recurrence-link.test.js`
Expected: PASS (6개 테스트 전부)

- [ ] **Step 6: Commit**

```bash
git add src/core/recurrence-link.ts src/core/index.ts test/core/recurrence-link.test.ts
git commit -m "feat(core): linkRecurringOverrides로 override를 master UID+RECURRENCE-ID로 묶음 (#14)"
```

---

## Task 4: ics.ts가 RECURRENCE-ID emit

**Files:**
- Modify: `src/core/ics.ts`
- Test: `test/core/ics.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`test/core/ics.test.ts`에 추가(파일의 import·헬퍼 스타일에 맞춰 NormalizedCalendarEvent 구성):

```ts
test('recurrenceId가 있으면 RECURRENCE-ID 라인을 emit한다 (zoned)', () => {
  const ev = {
    uid: 'timetree:7:evt-master', calendarName: 'cal', title: '회의',
    start: { kind: 'date-time', epochMs: 1767607200000, timezone: 'Asia/Seoul' },
    end: { kind: 'date-time', epochMs: 1767610800000, timezone: 'Asia/Seoul' },
    recurrenceId: { kind: 'date-time', epochMs: 1767604800000, timezone: 'Asia/Seoul' },
    source: { provider: 'timetree', eventId: 'evt-master', calendarId: 7 }, warnings: [],
  } as const;
  const ics = createIcsCalendar([ev as any]);
  assert.match(ics, /RECURRENCE-ID;TZID=Asia\/Seoul:\d{8}T\d{6}/);
});

test('all-day recurrenceId는 VALUE=DATE로 emit한다', () => {
  const ev = {
    uid: 'timetree:7:evt-master', calendarName: 'cal', title: '회의',
    start: { kind: 'date', date: '2026-01-12' }, end: { kind: 'date', date: '2026-01-13' },
    recurrenceId: { kind: 'date', date: '2026-01-05' },
    source: { provider: 'timetree', eventId: 'evt-master', calendarId: 7 }, warnings: [],
  } as const;
  const ics = createIcsCalendar([ev as any]);
  assert.match(ics, /RECURRENCE-ID;VALUE=DATE:20260105/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run build && node --test dist/test/core/ics.test.js`
Expected: FAIL — RECURRENCE-ID 라인 없음

- [ ] **Step 3: `formatDateTimeLine` name union 확장**

`src/core/ics.ts`의 시그니처를 변경:

```ts
function formatDateTimeLine(name: 'DTSTART' | 'DTEND' | 'RECURRENCE-ID', value: NormalizedDateTime): string {
```

- [ ] **Step 4: emit 라인 추가**

`src/core/ics.ts`의 `createIcsEventLines`에서 `formatDateTimeLine('DTEND', event.end),` 다음 줄에 추가:

```ts
    formatDateTimeLine('DTEND', event.end),
    ...(event.recurrenceId ? [formatDateTimeLine('RECURRENCE-ID', event.recurrenceId)] : []),
```

- [ ] **Step 5: 빌드 + 테스트 통과 확인**

Run: `npm run build && node --test dist/test/core/ics.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/ics.ts test/core/ics.test.ts
git commit -m "feat(core): recurrenceId를 RECURRENCE-ID 라인으로 emit (#14)"
```

---

## Task 5: cli/export-preview.ts 배선

**Files:**
- Modify: `src/cli/export-preview.ts`
- Test: `test/cli/export-preview.test.ts` (있으면 보강, 없으면 신규 케이스)

- [ ] **Step 1: 실패 테스트 작성**

`test/cli/export-preview.test.ts`에 추가(없으면 기존 테스트 파일 패턴 따라 신규). master+override raw 2건을 넣어 ICS에 VEVENT가 2개이고 RECURRENCE-ID가 1개 나오는지 확인:

```ts
test('master+override raw → ICS에 RECURRENCE-ID 1개, UID 통합', () => {
  const base = { calendarId: 7, category: 'schedule', allDay: false,
    startTimezone: 'Asia/Seoul', endTimezone: 'Asia/Seoul' };
  const summary = createExportPreview({ rawEvents: [
    { ...base, id: 'm', title: 'M', startAt: 1767000000000, endAt: 1767003600000,
      recurrences: ['RRULE:FREQ=WEEKLY;BYDAY=MO'], recurringUuid: 'g1' },
    { ...base, id: 'o', title: 'O', startAt: 1767607200000, endAt: 1767610800000,
      recurrences: [], recurringUuid: 'g1', recurStartAt: 1767604800000 },
  ]});
  assert.equal(summary.veventCount, 2);
});
```

(`ExportPreviewSummary`에 RECURRENCE-ID 카운트 필드를 새로 노출하지 않는다 — YAGNI. veventCount=2와 normalizedCount=2로 회귀 없음만 확인.)

- [ ] **Step 2: 실패하지 않을 수 있음 → 배선 전 baseline 확인**

Run: `npm run build && node --test dist/test/cli/export-preview.test.js`
Expected: 이 테스트는 배선 없이도 veventCount=2라 PASS할 수 있다. 배선의 핵심 검증은 Task 3 단위테스트가 담당하므로, 여기서는 **배선이 회귀를 만들지 않음**을 보장하는 가드로 둔다.

- [ ] **Step 3: linking pass 배선**

`src/cli/export-preview.ts` import에 추가:

```ts
import { linkRecurringOverrides } from '../core/recurrence-link.js';
```

`const ics = createIcsCalendar(normalized, ...)` 바로 위에 한 줄 삽입하고 `normalized`를 링크 결과로 교체:

```ts
  const linked = linkRecurringOverrides(normalized);
  const ics = createIcsCalendar(linked, input.now ? { now: input.now } : {});
```

> 주의: `warningCounts`는 link 이전 `result.value.warnings` 기준으로 집계되고 있다. orphan warning을 카운트에 포함하려면 집계를 `linked` 기준으로 옮긴다:
> `for (const event of linked) for (const warning of event.warnings) warningCounts[warning] = (warningCounts[warning] ?? 0) + 1;`
> (기존 loop 내 warning 집계 블록을 제거하고 linked 집계로 대체.)

- [ ] **Step 4: 빌드 + 테스트 통과 확인**

Run: `npm run build && node --test dist/test/cli/export-preview.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/export-preview.ts test/cli/export-preview.test.ts
git commit -m "feat(cli): export-preview에 linkRecurringOverrides 배선 (#14)"
```

---

## Task 6: extension/sidepanel.tsx 배선 (filter 이후)

**Files:**
- Modify: `src/extension/sidepanel.tsx`

(sidepanel.tsx는 DOM glue로 단위테스트 대상이 아니다 — 빌드/타입체크 + 수동 smoke로 검증.)

- [ ] **Step 1: import 추가**

`src/extension/sidepanel.tsx`의 `import { normalizeRawTimeTreeEvent } ...` 부근에 추가:

```ts
import { linkRecurringOverrides } from '../core/recurrence-link.js';
```

- [ ] **Step 2: filter 이후 linking 적용**

`const normalized = filterEventsByRange(normalizedAll, range);` 를 다음으로 교체:

```ts
  const normalized = linkRecurringOverrides(filterEventsByRange(normalizedAll, range));
```

- [ ] **Step 3: 빌드 + 타입체크 + 전체 테스트**

Run: `npm run typecheck && npm test`
Expected: typecheck PASS, 전체 테스트 PASS (회귀 없음)

- [ ] **Step 4: Commit**

```bash
git add src/extension/sidepanel.tsx
git commit -m "feat(extension): sidepanel이 range filter 이후 linkRecurringOverrides 적용 (#14)"
```

---

## Task 7: 문서 동기화

**Files:**
- Modify: `docs/specs/google-calendar-import-field-compat.md`
- Modify: `docs/specs/ics-normalization-contract.md`

- [ ] **Step 1: compat 문서 갱신**

`docs/specs/google-calendar-import-field-compat.md`에서 `recurringUuid` 관련 "(계획)" 표기를 구현 반영으로 갱신. 예: 표의 `| recurringUuid | (계획) | RECURRENCE-ID | 계획됨 (#14) |` 행을 `| recurringUuid | 구현 | RECURRENCE-ID | master 동일 UID 그룹, fallback 시 orphan warning (#14) |` 로 수정하고, `recurringUuid → RECURRENCE-ID: issue #14` 줄을 "구현됨"으로 갱신.

- [ ] **Step 2: normalization-contract 문서에 정책 추가**

`docs/specs/ics-normalization-contract.md`에 한 절 추가:

```markdown
### Recurring instance override (RECURRENCE-ID)

수정된 반복 instance는 `recurrenceGroupId`(raw `recurringUuid`)로 master와 묶고, master가 같은 export에 정확히 1개 있으면 master UID를 공유하며 `originalStartAt`(raw `recurStartAt`)을 master DTSTART의 VALUE/TZID로 포맷해 `RECURRENCE-ID`를 emit한다. master 부재·복수(애매)면 단발 UID를 유지하고 `recurrence-override-orphaned` warning을 부착한다(data-loss 0). 그룹화/master-presence 판정은 export될 최종 set(range filter 이후) 위에서 수행한다.
```

- [ ] **Step 3: 전체 빌드/테스트 최종 확인**

Run: `npm run typecheck && npm test`
Expected: PASS 전부 (213 + 신규)

- [ ] **Step 4: Commit**

```bash
git add docs/specs/google-calendar-import-field-compat.md docs/specs/ics-normalization-contract.md
git commit -m "docs(specs): RECURRENCE-ID override 정책 반영 (#14)"
```

---

## Done 기준

- `npm run typecheck` PASS, `npm test` PASS (기존 213 + 신규 모두).
- master+override → 동일 UID + RECURRENCE-ID emit, master 부재 → orphan warning + 단발 UID.
- 일반 이벤트·기존 export 동작 무회귀.
- spec/contract 문서가 구현과 일치.

## 병합 전 정리

- `docs/superpowers/plans/2026-06-10-recurrence-id-override.md`는 scratch plan이므로 **main 병합 전 브랜치에서 삭제**(CLAUDE.md `check-plan-files` 워크플로 규칙). spec(`docs/superpowers/specs/...`)은 유지.
