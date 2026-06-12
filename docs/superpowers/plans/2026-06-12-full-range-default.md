# 전체기간 기본 (#84) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** setup 화면의 기간 필터 기본을 "전체 기간(미필터)"으로 바꾸고, 좁히기는 opt-in 체크 해제로 제공한다.

**Architecture:** TimeTree fetch는 이미 `since:0`으로 전량을 가져오고 기간 필터는 순수 client-side(`filterEventsByRange`, `sidepanel.tsx:445`)다. 따라서 "전체 기간"은 그 한 줄을 조건부로 스킵하는 문제다. 범위 결정 분기를 순수 헬퍼 `resolveRangeMode`로 뽑아 단위 테스트하고, `analyzeEvents`에서 그 결과로 필터를 조건 적용한다. UI는 setup에 "전체 기간" 체크박스(기본 ON)를 추가하고, 해제 시에만 날짜 입력을 활성화한다.

**Tech Stack:** TypeScript, Preact(렌더 일부), 순수 함수 + Node `node:test`, esbuild 번들(content/sidepanel), MV3 side panel.

---

## File Structure

- `src/extension/sidepanel-export-policy.ts` — **수정**: 순수 헬퍼 `resolveRangeMode` 추가(전체/범위/무효 분기). 기존 `parseDateRange`/`filterEventsByRange`는 그대로 재사용.
- `test/extension/sidepanel-export-policy.test.ts` — **수정**: `resolveRangeMode` 단위 테스트 추가. (없으면 생성)
- `sidepanel.html` — **수정**: setup 섹션에 "전체 기간" 체크박스 + 날짜 입력 래퍼.
- `src/extension/sidepanel.tsx` — **수정**: `analyzeEvents` 범위 분기, 체크박스 toggle 핸들러(날짜 input disabled), setup 진입 시 초기화, `recordExport` 전체 모드 날짜 공란.

---

## Task 1: 순수 범위 분기 헬퍼 `resolveRangeMode`

**Files:**
- Modify: `src/extension/sidepanel-export-policy.ts`
- Test: `test/extension/sidepanel-export-policy.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`test/extension/sidepanel-export-policy.test.ts` 파일이 이미 있으면 아래 블록을 append, 없으면 파일을 생성하고 상단에 import를 넣는다.

파일이 **없을 때** 생성 내용:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRangeMode } from '../../src/extension/sidepanel-export-policy.js';

test('전체 모드면 kind=all (날짜 무시)', () => {
  assert.deepEqual(resolveRangeMode(true, '', ''), { kind: 'all' });
  assert.deepEqual(resolveRangeMode(true, '2026-01-01', '2026-12-31'), { kind: 'all' });
});

test('좁힘 모드 + 유효 날짜면 kind=range', () => {
  const out = resolveRangeMode(false, '2026-01-01', '2026-01-31');
  assert.equal(out.kind, 'range');
  assert.equal(out.kind === 'range' && typeof out.range.fromMs, 'number');
});

test('좁힘 모드 + 무효/공란 날짜면 kind=invalid', () => {
  assert.deepEqual(resolveRangeMode(false, '', ''), { kind: 'invalid' });
  assert.deepEqual(resolveRangeMode(false, '2026-12-31', '2026-01-01'), { kind: 'invalid' });
});
```

파일이 **이미 있을 때**는 위의 import에서 `resolveRangeMode`를 기존 import 줄에 합치고, 세 개의 `test(...)` 블록만 파일 끝에 append 한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run build && node --test dist/test/extension/sidepanel-export-policy.test.js`
Expected: FAIL — `resolveRangeMode`가 export되지 않아 타입/런타임 에러.

- [ ] **Step 3: 헬퍼 구현**

`src/extension/sidepanel-export-policy.ts`의 `parseDateRange` 함수 정의 **직후**에 아래를 추가한다(파일 상단 import는 그대로):

```ts
export type RangeMode =
  | { kind: 'all' }
  | { kind: 'range'; range: { fromMs: number; toMs: number } }
  | { kind: 'invalid' };

// setup의 "전체 기간" 체크 상태 + 날짜 입력값으로 수집 범위를 결정한다.
// 전체(fullMode)면 필터를 적용하지 않는다(kind:'all'). 좁힘 모드에서 날짜가
// 유효하면 range, 아니면 invalid. 순수 함수 — DOM 접근은 호출 측 책임.
export function resolveRangeMode(fullMode: boolean, fromStr: string, toStr: string): RangeMode {
  if (fullMode) return { kind: 'all' };
  const range = parseDateRange(fromStr, toStr);
  return range ? { kind: 'range', range } : { kind: 'invalid' };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run build && node --test dist/test/extension/sidepanel-export-policy.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/extension/sidepanel-export-policy.ts test/extension/sidepanel-export-policy.test.ts
git commit -m "feat(extension): 수집 범위 분기 헬퍼 resolveRangeMode (#84)"
```

---

## Task 2: setup에 "전체 기간" 체크박스 추가

**Files:**
- Modify: `sidepanel.html:144-148`

- [ ] **Step 1: 마크업 교체**

`sidepanel.html`의 "기간" 섹션(현재 144-148줄)을 아래로 교체한다:

```html
      <div class="section">
        <h2>기간</h2>
        <label style="display:flex;align-items:center;gap:6px">
          <input type="checkbox" id="range-all" name="range-all" checked>
          전체 기간 (모든 일정)
        </label>
        <div id="range-fields" style="margin-top:8px">
          <label>시작일<input type="date" id="date-from" name="date-from" autocomplete="off" disabled></label>
          <label style="margin-top:8px">종료일<input type="date" id="date-to" name="date-to" autocomplete="off" disabled></label>
        </div>
      </div>
```

(체크박스 기본 `checked`, 날짜 입력 기본 `disabled` — 전체 기간이 기본이므로.)

- [ ] **Step 2: 빌드로 마크업 유효성 확인**

Run: `npm run build`
Expected: 성공(빌드는 HTML을 파싱하지 않지만 후속 tsx 변경 전 baseline 확인).

- [ ] **Step 3: 커밋**

```bash
git add sidepanel.html
git commit -m "feat(extension): setup에 전체 기간 체크박스 (#84)"
```

---

## Task 3: analyzeEvents 범위 분기 적용

**Files:**
- Modify: `src/extension/sidepanel.tsx` (import, `analyzeEvents` 범위 블록, 필터 적용 줄)

- [ ] **Step 1: import에 resolveRangeMode 추가**

`src/extension/sidepanel.tsx`의 export-policy import(현재):

```ts
import {
  parseDateRange,
  filterEventsByRange,
  decideExport,
} from './sidepanel-export-policy.js';
```

를 아래로 교체:

```ts
import {
  parseDateRange,
  filterEventsByRange,
  decideExport,
  resolveRangeMode,
} from './sidepanel-export-policy.js';
```

- [ ] **Step 2: analyzeEvents 범위 결정 블록 교체**

`analyzeEvents` 시작부의 현재 범위 검증(아래):

```ts
  const range = getDateRangeMs();
  if (!range) {
    showError('유효한 기간을 입력하세요');
    return;
  }
```

를 아래로 교체한다:

```ts
  const fullMode = (document.getElementById('range-all') as HTMLInputElement | null)?.checked ?? true;
  const fromVal = (document.getElementById('date-from') as HTMLInputElement | null)?.value ?? '';
  const toVal = (document.getElementById('date-to') as HTMLInputElement | null)?.value ?? '';
  const rangeMode = resolveRangeMode(fullMode, fromVal, toVal);
  if (rangeMode.kind === 'invalid') {
    showError('유효한 기간을 입력하세요');
    return;
  }
```

- [ ] **Step 3: 필터 적용 줄을 조건부로 변경**

현재 줄(`sidepanel.tsx:445` 부근):

```ts
  const normalized = linkRecurringOverrides(filterEventsByRange(normalizedAll, range));
```

를 아래로 교체:

```ts
  const ranged = rangeMode.kind === 'range'
    ? filterEventsByRange(normalizedAll, rangeMode.range)
    : normalizedAll;
  const normalized = linkRecurringOverrides(ranged);
```

- [ ] **Step 4: 타입체크 + 빌드**

Run: `npm run typecheck && npm run build`
Expected: 통과. (`getDateRangeMs`는 더 이상 analyzeEvents에서 안 쓰지만 다른 곳에서 안 쓰면 unused. Step 5에서 확인.)

- [ ] **Step 5: getDateRangeMs 미사용 처리**

Run: `grep -n "getDateRangeMs" src/extension/sidepanel.tsx`
Expected: 정의(62줄)만 남고 호출처 0건이면, `getDateRangeMs` 함수 정의(62-66줄) 전체를 삭제한다. 호출처가 있으면 삭제하지 말 것.
삭제 후 Run: `npm run typecheck` → 통과.

- [ ] **Step 6: 전체 테스트**

Run: `npm test`
Expected: 전부 PASS(기존 + Task 1).

- [ ] **Step 7: 커밋**

```bash
git add src/extension/sidepanel.tsx
git commit -m "feat(extension): analyzeEvents 전체/범위 분기 (#84)"
```

---

## Task 4: 체크박스 토글·초기화·기록 정합

**Files:**
- Modify: `src/extension/sidepanel.tsx` (DOMContentLoaded 핸들러, setup 진입 prefill, recordExport)

- [ ] **Step 1: 체크박스 toggle 핸들러 등록**

`DOMContentLoaded` 블록 안, `btn-analyze` 리스너 등록 바로 아래에 추가:

```ts
  document.getElementById('range-all')?.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    for (const id of ['date-from', 'date-to']) {
      (document.getElementById(id) as HTMLInputElement | null)?.toggleAttribute('disabled', on);
    }
  });
```

- [ ] **Step 2: setup 진입 시 초기화 (전체 기본)**

현재 캘린더 로드 후 prefill 블록(아래):

```ts
    const now = new Date();
    const fromDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const toDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    (document.getElementById('date-from') as HTMLInputElement).value = toIsoDate(fromDate);
    (document.getElementById('date-to') as HTMLInputElement).value = toIsoDate(toDate);
```

바로 **다음**에 추가(전체 기간 기본 ON + 날짜 입력 disabled 동기화):

```ts
    const rangeAll = document.getElementById('range-all') as HTMLInputElement | null;
    if (rangeAll) rangeAll.checked = true;
    (document.getElementById('date-from') as HTMLInputElement).disabled = true;
    (document.getElementById('date-to') as HTMLInputElement).disabled = true;
```

- [ ] **Step 3: recordExport 날짜 — 전체 모드면 공란**

현재 `recordExport` 호출의 fromDate/toDate(아래):

```ts
    fromDate: (document.getElementById('date-from') as HTMLInputElement | null)?.value ?? '',
    toDate: (document.getElementById('date-to') as HTMLInputElement | null)?.value ?? '',
```

를 아래로 교체(전체 모드면 빈 문자열 — 메타데이터가 실제 적용 범위를 반영):

```ts
    fromDate: (document.getElementById('range-all') as HTMLInputElement | null)?.checked
      ? ''
      : (document.getElementById('date-from') as HTMLInputElement | null)?.value ?? '',
    toDate: (document.getElementById('range-all') as HTMLInputElement | null)?.checked
      ? ''
      : (document.getElementById('date-to') as HTMLInputElement | null)?.value ?? '',
```

- [ ] **Step 4: 타입체크 + 빌드 + 전체 테스트**

Run: `npm run typecheck && npm test`
Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/extension/sidepanel.tsx
git commit -m "feat(extension): 전체 기간 토글·초기화·기록 정합 (#84)"
```

---

## Task 5: 수동 스모크 (선택, 빌드 산출물 확인)

**Files:** 없음(런타임 확인).

- [ ] **Step 1: 빌드 후 확장 로드 안내**

Run: `npm run build`
Expected: 성공. 이후 `chrome://extensions` → Load unpacked → repo root, TimeTree 로그인 상태에서 패널 열기.

- [ ] **Step 2: 동작 확인 (체크리스트)**

- setup에 "전체 기간" 체크박스가 기본 체크, 날짜 입력 비활성.
- 분석 → 대시보드 "제외 D건"이 기간 사유로는 0.
- 체크 해제 → 날짜 입력 활성, 좁히면 "제외 D건" 표시.

(jsdom 없어 자동화 불가 — 순수 로직은 Task 1에서 커버.)

---

## Self-Review 결과

- **Spec 커버리지**: 전체기간 기본(Task 2·3), opt-in 좁히기(Task 2·4), 미필터 분기(Task 1·3), export·수집 동일 결과(export는 `lastNormalized` 재사용 → 자동 정합, spec의 resolveRange 공용은 불필요로 단순화), 대시보드 "제외 D건"(분기로 자연 충족). 모두 태스크 존재.
- **Placeholder**: 없음(모든 코드 블록 실제 내용).
- **타입 일관성**: `resolveRangeMode`/`RangeMode`(Task 1) ↔ `rangeMode.kind`(Task 3) 일치. `range-all`/`date-from`/`date-to` id 일관.
- **단순화**: spec이 언급한 export용 `resolveRange` 공용 호출은, export가 이미 필터된 `lastNormalized`를 쓰므로 불필요 — 제거(YAGNI).
