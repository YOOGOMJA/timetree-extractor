# side panel 진입 라이브 반응성 + 진입 화면 재설계 (#67)

결론: side panel이 탭 이동/전환에 **라이브로 반응**하도록 `chrome.tabs.onActivated`/`onUpdated`를 구독하고, init의 early-return 구조를 제거한다. "TimeTree 아님" 화면은 **TimeTree 열기/포커스 버튼**을 제공하고, TimeTree 진입 시 캘린더 목록을 **자동 로드**해 진입 화면에 맥락(연결 상태·캘린더·설명)을 준다.

- 대상 이슈: #67
- 상태 구분: **검증됨**(코드 확인) / 결정

## 현재 문제 (검증됨)

- `sidepanel.tsx:322` init이 `DOMContentLoaded`에서 `isOnTimetree()`를 **1회만** 호출, `:331` TimeTree 아니면 **early return** → 버튼 리스너조차 안 붙음(세션 내내 죽은 패널).
- `chrome.tabs.onActivated`/`onUpdated` 구독 0개 → TimeTree로 이동해도 자동 전환 없음.
- 진입(idle) 화면 = 버튼 1개. 맥락 정보 0.

## 설계

### 1. 라이브 반응성 (구조 개편)

```
DOMContentLoaded:
  attachListeners()            // 버튼 리스너 — 항상, 게이트 없음
  chrome.tabs.onActivated   → refreshPanelForActiveTab()
  chrome.tabs.onUpdated     → (changeInfo.url || status==='complete') 일 때만 refreshPanelForActiveTab()
  refreshPanelForActiveTab()   // 초기 1회
```

- `refreshPanelForActiveTab()`: 활성 탭 query → `isTimetreeUrl(tab.url)` → `panel-not-timetree`/`panel-main` 토글. 메인 내부 state(`state-*`)는 건드리지 않음 → TimeTree를 떠났다 돌아와도 진행 상태 보존.
- `isTimetreeUrl(url: string | undefined): boolean`은 **pure 함수로 `sidepanel-utils.ts`에 추출**(단위테스트 대상). 기존 `isOnTimetree()`는 이를 사용.

### 2. "TimeTree 아님" 화면

- 안내문 + **"TimeTree 열기" 버튼**(`btn-open-timetree`).
- 동작: `chrome.tabs.query({ url: 'https://timetreeapp.com/*' })` → 있으면 그 탭 `active` + 창 `focused`, 없으면 `chrome.tabs.create({ url: 'https://timetreeapp.com/calendars' })`. 이동하면 onUpdated/onActivated가 패널을 자동 전환.

### 3. 진입 화면 재설계 (자동 로드)

- TimeTree 활성 감지 시 현재 메인 state가 `idle`이고 **아직 자동 로드를 시도하지 않았다면** `loadCalendars()` 자동 호출.
  - 패널을 연 것 자체가 사용자 액션 → background polling 아님(1회성 GET). 정책 위반 없음.
  - 자동 호출 실패(content script 미주입 등) 시 **조용히 idle로 복귀**(에러 화면 대신 수동 버튼 fallback) — 페이지 로딩 중 여는 흔한 케이스에서 겁주지 않기.
  - `autoLoadAttempted` 플래그로 1회만 시도(재시도는 수동 버튼).
- 헤더 아래 1줄 설명(도구 소개), 연결 상태 라인(`#context-line`: "연결됨 — timetreeapp.com").
- "캘린더 불러오기" 버튼은 fallback/재시도 용도로 유지.

### 4. 흡수하는 가이드라인 항목

- `#state-loading` 로딩 문구에 `role="status"` `aria-live="polite"`.
- 패널 전환 안내(`#context-line`)에 `aria-live="polite"`.
- `button:focus-visible`/`input:focus-visible` 가시 포커스 ring CSS 추가(전 버튼 공통).

## 테스트

- pure: `isTimetreeUrl` — https 정확 도메인 매칭(`https://timetreeapp.com` + `/...`), http/서브도메인 위장(`https://timetreeapp.com.evil.com`)/undefined 거부. `sidepanel-utils` 테스트에 추가.
- Chrome glue(리스너/탭 열기/자동 로드)는 thin glue로 단위테스트 비대상(CLAUDE.md 패턴) — 수동 smoke로 검증.

## 범위 외

- 결과 요약/상세 분리(#68), 추출 기록(#69), 나머지 a11y/CSS(#70).
- 계정 정보 표시(전용 API 필요 — 캘린더 목록이 사실상의 컨텍스트).
