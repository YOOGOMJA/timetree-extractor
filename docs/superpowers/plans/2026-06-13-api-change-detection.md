# 내부 API 변경 감지 + graceful 실패 (#92) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TimeTree 비공식 API가 바뀌어 fetch가 실패할 때, 잘못된 export를 막고 "TimeTree 형식 변경 가능성"을 사용자에게 친절히 안내하며, API 버전 핀을 한 곳에서 관리한다.

**Architecture:** 실패 경로는 이미 분리돼 있다 — `FETCH_*`가 `{ok:false, issues}`면 contract/shape 위반(TimeTree 변경 가능성), `fetchJson` throw면 transient(HTTP/네트워크). 소스 기반으로 분류해 순수 헬퍼 `describeFetchFailure`가 사용자 메시지를 만들고, sidepanel이 각 분기에서 그 title로 `showError`한다. 부분 export 방지는 기존 동작(extractor가 페이지 실패 시 ok:false, analyzeEvents가 중단)을 유지·확인한다.

**Tech Stack:** TypeScript, 순수 함수 + Node `node:test`, esbuild 번들(content-script IIFE / sidepanel), MV3.

---

## File Structure

- `src/extension/fetch-failure-copy.ts` — **신규**: 순수 헬퍼 `describeFetchFailure` + `FetchFailureKind` 타입. DOM/네트워크 의존 없음.
- `test/extension/fetch-failure-copy.test.ts` — **신규**: 단위 테스트.
- `src/extension/sidepanel.tsx` — **수정**: `loadCalendars`/`analyzeEvents`의 `ok:false`·`catch` 분기를 `describeFetchFailure`로 교체.
- `src/extension/content-script.ts` — **수정**: `'web/2.1.0/en'`을 `TIMETREE_API_CLIENT` 상수로 추출·export.

---

## Task 1: 순수 메시지 헬퍼 `describeFetchFailure`

**Files:**
- Create: `src/extension/fetch-failure-copy.ts`
- Test: `test/extension/fetch-failure-copy.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`test/extension/fetch-failure-copy.test.ts` 생성:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeFetchFailure } from '../../src/extension/fetch-failure-copy.js';

test('contract: 형식 변경 안내 + issues를 detail에 담는다 (#92)', () => {
  const out = describeFetchFailure('contract', ['events must be an array']);
  assert.match(out.title, /형식이 바뀐/);
  assert.match(out.title, /가져올 수 없/);
  assert.match(out.detail, /events must be an array/);
});

test('contract: issues 없으면 detail은 빈 문자열 (#92)', () => {
  assert.equal(describeFetchFailure('contract').detail, '');
});

test('transient: 접근 실패 안내 (#92)', () => {
  const out = describeFetchFailure('transient', ['HTTP 401: /api/v1/...']);
  assert.match(out.title, /접근하지 못했/);
  assert.match(out.detail, /HTTP 401/);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run build && node --test dist/test/extension/fetch-failure-copy.test.js`
Expected: FAIL — 모듈/`describeFetchFailure` 없음.

- [ ] **Step 3: 헬퍼 구현**

`src/extension/fetch-failure-copy.ts` 생성:

```ts
// fetch 실패를 사용자 메시지로 변환한다(#92, 배포 게이팅 1).
// 실패 종류는 소스로 정해진다: FETCH_* ok:false = contract(TimeTree 형식 변경
// 가능성, shape/validation 위반), fetchJson throw = transient(HTTP/네트워크).
// 순수 함수 — DOM/네트워크 의존 없음.
export type FetchFailureKind = 'contract' | 'transient';

export function describeFetchFailure(
  kind: FetchFailureKind,
  issues?: string[],
): { title: string; detail: string } {
  const detail = issues && issues.length > 0 ? issues.join(', ') : '';
  if (kind === 'contract') {
    return {
      title: 'TimeTree 응답 형식이 바뀐 것 같습니다. 지금은 안전하게 가져올 수 없어요. (가져오기 중단)',
      detail,
    };
  }
  return {
    title: 'TimeTree에 접근하지 못했습니다. 로그인·네트워크를 확인하고 다시 시도하세요.',
    detail,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run build && node --test dist/test/extension/fetch-failure-copy.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/extension/fetch-failure-copy.ts test/extension/fetch-failure-copy.test.ts
git commit -m "feat(extension): fetch 실패 메시지 헬퍼 describeFetchFailure (#92)"
```

---

## Task 2: sidepanel 실패 분기를 헬퍼로 교체

**Files:**
- Modify: `src/extension/sidepanel.tsx` (import 추가, `loadCalendars` ok:false, `analyzeEvents` ok:false·catch)

- [ ] **Step 1: import 추가**

`src/extension/sidepanel.tsx`에서 `describeWarning` import 줄:

```ts
import { describeWarning } from './warning-copy.js';
```

바로 아래에 추가:

```ts
import { describeFetchFailure } from './fetch-failure-copy.js';
```

- [ ] **Step 2: loadCalendars ok:false 교체**

현재(파일 내 1곳):

```ts
      showError(`캘린더 로드 실패: ${res.issues.join(', ')}`);
```

를 아래로 교체:

```ts
      console.warn('캘린더 로드 실패(contract):', res.issues.join(', '));
      showError(describeFetchFailure('contract', res.issues).title);
```

- [ ] **Step 3: analyzeEvents 이벤트 ok:false 교체**

현재:

```ts
      if (!res.ok) {
        showError(`이벤트 로드 실패 (calendar ${calendarId}): ${res.issues.join(', ')}`);
        return;
      }
```

를 아래로 교체:

```ts
      if (!res.ok) {
        console.warn(`이벤트 로드 실패(contract) calendar ${calendarId}:`, res.issues.join(', '));
        showError(describeFetchFailure('contract', res.issues).title);
        return;
      }
```

- [ ] **Step 4: analyzeEvents catch(transient) 교체**

현재:

```ts
    } catch (err) {
      showError(`오류: ${errorMessage(err)}`);
      return;
    }
```

를 아래로 교체:

```ts
    } catch (err) {
      console.warn('이벤트 로드 오류(transient):', errorMessage(err));
      showError(describeFetchFailure('transient', [errorMessage(err)]).title);
      return;
    }
```

- [ ] **Step 5: 타입체크 + 빌드 + 테스트**

Run: `npm run typecheck && npm test`
Expected: 전부 통과. (`errorMessage`는 기존 import 유지 — 여전히 catch에서 사용.)

- [ ] **Step 6: 커밋**

```bash
git add src/extension/sidepanel.tsx
git commit -m "feat(extension): fetch 실패 분기를 contract/transient 안내로 (#92)"
```

---

## Task 3: API 버전 핀 상수화

**Files:**
- Modify: `src/extension/content-script.ts` (상수 정의 + 헤더 참조)

- [ ] **Step 1: 상수 정의**

`src/extension/content-script.ts` 파일 상단(첫 import 줄들 바로 아래, 함수 정의 전)에 추가:

```ts
// TimeTree 내부 API 클라이언트 식별 헤더. 비공식 contract라 버전이 바뀌면
// 응답이 달라질 수 있다 — 한 곳에서 관리하고 export로 가시화한다(#92).
export const TIMETREE_API_CLIENT = 'web/2.1.0/en';
```

- [ ] **Step 2: 헤더가 상수를 참조하도록 교체**

현재:

```ts
        'x-timetreea': 'web/2.1.0/en',
```

를 아래로 교체:

```ts
        'x-timetreea': TIMETREE_API_CLIENT,
```

- [ ] **Step 3: 잔여 하드코딩 확인**

Run: `grep -rn "web/2.1.0/en" src/`
Expected: `content-script.ts`의 상수 정의 1곳만. 헤더 자리엔 `TIMETREE_API_CLIENT`.

- [ ] **Step 4: 타입체크 + 빌드 + 테스트**

Run: `npm run typecheck && npm test`
Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/extension/content-script.ts
git commit -m "feat(extension): X-TimeTreeA 버전 핀 상수화 TIMETREE_API_CLIENT (#92)"
```

---

## Task 4: 부분 export 방지 — 기존 가드 확인

**Files:** 없음(기존 동작 확인).

- [ ] **Step 1: 기존 가드 테스트 확인**

Run: `node --test dist/test/browser/timetree-events-extractor.test.js`
Expected: PASS. 특히 `propagates per-page errors immediately without further pagination`(중간 페이지 실패 시 `extractCalendarEvents`가 `ok:false`, events 미반환)와 `aborts when cursor does not advance`가 통과 — 부분 수집/export가 일어나지 않음을 보장.

(추가 코드 불필요. `analyzeEvents`는 캘린더 `ok:false`에서 `return`하므로 정상화/export로 진입하지 않는다.)

---

## Self-Review 결과

- **Spec 커버리지**: 분류·안내(Task 1·2), 버전핀(Task 3), 부분 export 방지(Task 4 기존 가드). 모두 태스크 존재.
- **Placeholder**: 없음 — 모든 코드 블록 실제 내용.
- **타입 일관성**: `describeFetchFailure(kind, issues?)`/`FetchFailureKind`(Task 1) ↔ Task 2 호출 시그니처 일치. `TIMETREE_API_CLIENT`(Task 3) 정의·참조 일치.
- **YAGNI**: detail은 v1에서 `console.warn`으로만 노출(레이아웃 변경 회피), title만 사용자 표시 — spec과 일치.
