# #92 내부 API 변경 감지 + graceful 실패 — design

> 상태: 승인됨(2026-06-13). 배포 게이팅 1(ADR 0006). 범위: 분류+안내+버전핀.

## 문제

TimeTree `/api/v1/...`는 비공식 contract라 언제든 변경·차단될 수 있다. 배포 후 최대 런타임 리스크: (1) 잘못된/부분 export가 나가거나, (2) 사용자가 raw 에러 덤프만 보고 영문을 모른다. 정확성(잘못된 export 금지)은 이미 `validateRawTimeTreeEvent`로 차단되므로, 이 작업의 공백은 **실패 분류 + 친절한 안내 + 버전핀 가시화**다.

## 핵심 통찰: 실패 경로가 이미 분리돼 있다

- **contract 위반**: `fetchCalendarEventsPage`가 payload shape(chunk/since/events 타입) 또는 per-event `validateRawTimeTreeEvent` 위반을 잡아 `{ ok:false, issues }`로 반환 → `FETCH_*` 응답이 `ok:false`. 이 issues는 **항상** shape/validation 사유(네트워크 아님).
- **transient**: `buildPageFetchJson`의 `fetchJson`이 `HTTP {status}`를 throw → `sendToContentScript`가 reject → `analyzeEvents`의 `catch`.

따라서 문자열 매칭 없이 **소스 기반 분류**가 가능하다: `ok:false` ⇒ contract, `throw` ⇒ transient.

## 목표 / 비목표

**목표**
- `ok:false`(contract) 시 "TimeTree 형식이 바뀐 듯 — 안전하게 가져올 수 없음(중단)" 안내, raw issues는 보조.
- `throw`(transient) 시 "접근 실패 — 로그인·네트워크 확인" 안내.
- `X-TimeTreeA` 버전 문자열을 명명 상수로 한 곳에서 관리·가시화.
- 부분/잘못된 export가 발생하지 않음을 테스트로 가드.

**비목표(YAGNI)**
- 선제 canary 검사, 의미 drift(epoch 단위 변경 등) 감지.
- 자동 재시도/backoff(AUP: 금지). 실패는 surface.

## 컴포넌트 / 책임

1. `src/extension/fetch-failure-copy.ts` (신규, 순수)
   - `type FetchFailureKind = 'contract' | 'transient'`
   - `describeFetchFailure(kind: FetchFailureKind, issues?: string[]): { title: string; detail: string }`
     - `contract`: title="TimeTree 응답 형식이 바뀐 것 같습니다. 지금은 안전하게 가져올 수 없어요. (가져오기 중단)", detail=issues 요약(있으면 join, 없으면 '').
     - `transient`: title="TimeTree에 접근하지 못했습니다. 로그인·네트워크를 확인하고 다시 시도하세요.", detail=issues?.join('') ?? ''.
   - DOM/네트워크 의존 없음 → 단위 테스트.

2. `src/extension/sidepanel.tsx`
   - `analyzeEvents`의 `FETCH_EVENTS`/`FETCH_CALENDARS`(로드 경로) `ok:false` 분기 → `describeFetchFailure('contract', res.issues)` 결과의 `title`로 `showError`.
   - `catch` 분기 → `describeFetchFailure('transient')`의 `title`로 `showError`.
   - (선택) detail은 현재 단일 `#error-message`에만 표시되므로 v1은 title만 노출, detail은 `console.warn`으로 남긴다(레이아웃 변경 회피, YAGNI).

3. `src/extension/timetree-api-client.ts` 또는 `content-script.ts` 상수화
   - `export const TIMETREE_API_CLIENT = 'web/2.1.0/en';` 한 곳 정의. `content-script.ts`의 헤더가 이를 참조.
   - 위치: `content-script.ts` 상단 상수로 두고 export(별도 파일 과함 — YAGNI). import 경로 단순화 위해 같은 파일 export.

## 데이터 흐름

```
content-script fetchJson → HTTP throw ───────────────► sidepanel catch → describeFetchFailure('transient')
fetchCalendarEventsPage shape/validation 위반 → ok:false issues → FETCH_* ok:false
                                                          └────────► sidepanel ok:false → describeFetchFailure('contract', issues)
```

부분 export 방지(유지·가드):
- `extractCalendarEvents`: 한 페이지라도 `ok:false`면 전체 `ok:false`(현행).
- `analyzeEvents`: 캘린더 루프에서 `ok:false`면 `showError` 후 `return`(현행) → 정상화/export 미진입.

## 에러 / 엣지

- issues 빈 배열 contract → title만, detail ''.
- 일부 캘린더만 contract 위반 → 첫 실패에서 전체 중단(부분 export 없음).
- transient(예: 비로그인 401) → "접근 실패" 안내. 사용자가 로그인 후 재시도.

## 테스트

- `fetch-failure-copy.test.ts`: `describeFetchFailure`
  - `('contract', ['events must be an array'])` → title에 "형식이 바뀐", detail에 issue 포함.
  - `('contract')` → detail ''.
  - `('transient')` → title에 "접근하지 못했".
- 부분 export 가드: `extractCalendarEvents`가 page 실패 시 `ok:false`라는 기존 동작 회귀 테스트가 있으면 유지, 없으면 1개 추가(중간 페이지 실패 → ok:false, events 미반환).
- 기존 fetch/validation 테스트 유지.
- DOM 분기(showError 텍스트)는 jsdom 없어 미검증 — title 생성은 순수 헬퍼로 커버.

## 리스크

- 낮음. 메시지 카피 + 상수화 + 분기. 런타임 동작(차단)은 기존 검증이 이미 보장.
