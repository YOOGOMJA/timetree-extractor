# #84 전체기간 기본 (소비자 편의) — design

> 상태: 승인됨(2026-06-12). 범위: 기간 필터 기본을 "전체"로. 캘린더 선택은 이미 존재 → 손대지 않음.

## 문제

setup 화면의 기간 필터 기본값이 `now-1년 ~ now+1년`(`sidepanel.tsx` 로드 시 prefill). TimeTree fetch는 `since:0`으로 **이미 전량**을 가져오므로(client-side 필터일 뿐, 요청량 영향 없음 = AUP 무관), 데이터는 다 있는데 ±1년 밖 일정이 대시보드 "제외 D건"으로 빠진다. 마이그레이터의 기본 기대("전부 옮긴다")와 어긋난다.

## 목표 / 비목표

**목표**
- 기본 = 전체 기간(필터 미적용) → 수집·내보내기에 모든 일정 포함.
- 기간 좁히기는 opt-in으로 유지(좁히면 "제외 D건" 그대로 = no-silent-loss).

**비목표**
- 캘린더 선택 UI(이미 `CalendarList` + `getSelectedCalendarIds`로 존재) 변경 없음.
- 해제 시 실제 일정 min/max 자동계산(YAGNI) — ±1년 유지.
- fetch/요청 동작 변경 없음(이미 전량).

## UX

```
[ 일정 가져오기 설정 ]
캘린더: ☑ 개인  ☑ 가족  …            (기존, 변경 없음)
☑ 전체 기간                          ← 신규, 기본 ON
  └ (해제 시 노출) 시작일 [____]  종료일 [____]
[ 가져오기 ]
```

- "전체 기간" 체크박스 기본 ON → 날짜 입력 비활성(disabled), 필터 미적용.
- 해제 → 날짜 입력 활성, 기본값 `now±1년` prefill 유지. 좁히는 사람만 사용.
- 대시보드 "제외 D건": 전체 모드 0(기간 사유 없음). 좁히면 현행대로 표시.

## 동작 (data flow)

1. setup 로드: 캘린더 목록 렌더(현행), 날짜 입력 ±1년 prefill(현행), **"전체 기간" 체크박스 ON, 날짜 입력 disabled**.
2. 체크박스 toggle: ON→날짜 input disabled, OFF→enabled.
3. `analyzeEvents`(수집) 및 export 결정 시 **range 산출**:
   - 전체 모드(체크 ON) → `range = null`(전체) → `filterEventsByRange` 스킵, 전량 사용.
   - 좁힘 모드(체크 OFF) → 현행 `getDateRangeMs()` 사용, 유효하지 않으면 현행대로 에러.
4. 나머지 정규화·링크·대시보드·export 경로 불변.

핵심 변경점: 현재 `analyzeEvents`는 `range`가 없으면 `showError('유효한 기간을 입력하세요')`. 전체 모드에서는 range 부재가 **정상(전체)** 이어야 하므로, "전체 모드인가?"를 먼저 보고 분기한다.

## 컴포넌트 / 책임

- `sidepanel.html` (setup 섹션): "전체 기간" 체크박스 + 날짜 입력을 묶는 컨테이너. 체크박스 `id="range-all"`, 기본 `checked`.
- `sidepanel.tsx`:
  - `isFullRange(): boolean` — 체크박스 상태 읽기(순수 DOM 접근, 얇게).
  - `resolveRange(): { fromMs; toMs } | null | 'invalid'` — 전체면 `null`, 좁힘+유효면 범위, 좁힘+무효면 `'invalid'`. (수집·export 공용)
  - `analyzeEvents`: `resolveRange()` 분기 — `'invalid'`만 에러, `null`이면 미필터.
  - 체크박스 change 핸들러: 날짜 input `disabled` 토글.
  - export 경로(`buildExport`/`decideExport` 호출부): 같은 `resolveRange()` 결과로 필터(전체면 미필터).
- `sidepanel-export-policy.ts`: 변경 없음(순수 `filterEventsByRange`/`parseDateRange` 그대로). 호출 측에서 전체면 안 부른다.

## 에러 / 엣지

- 전체 모드 + 일정 0건 → 기존 빈 상태 흐름 그대로.
- 좁힘 모드 + 무효 날짜 → 기존 에러 메시지 유지.
- 토글을 OFF로 했다가 다시 ON → 날짜 input 값은 보존(disabled만), 다음 수집은 전체.
- export와 수집이 **같은** range 로직(`resolveRange`)을 쓰도록 해 둘이 어긋나지 않게 한다.

## 테스트

- `resolveRange` 분기(전체=null / 유효=범위 / 무효='invalid')를 순수 함수로 뽑아 단위 테스트. (DOM 의존 최소화 위해 입력을 인자로 받는 순수 헬퍼 + 얇은 DOM 래퍼로 분리)
- 기존 `filterEventsByRange`/`parseDateRange` 테스트 유지.
- DOM 렌더(체크박스 disabled 토글)는 jsdom 없어 미검증 — 순수 로직으로 핵심 커버.

## 리스크

- 낮음. 요청량·fetch 불변, 순수 client 필터 기본값 변경 + 작은 UI 토글.
- "제외 D건"이 기본 0이 되어 사용자가 누락 걱정을 덜되, 좁힐 때만 다시 신뢰 장치로 작동.
