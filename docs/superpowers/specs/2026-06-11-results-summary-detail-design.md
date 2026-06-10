# 결과 요약 ↔ 상세 목록 분리 + 가상화 (#68)

결론: 결과 화면을 **요약(충실도 hero + 사람말 경고 + 내보내기 CTA)** 과 **상세 목록(검색 + 가상화)** 으로 분리한다. 경고 enum 코드를 사용자용 한국어 문구로 매핑하고, 상세 목록은 큰 데이터셋 대비 고정행 windowing으로 가상화한다.

- 대상 이슈: #68 (선행 #67 merged — 진입/상태 구조 위에 얹음)
- 디자인: 데이터 도구의 thesis = **충실도**. hero는 "내보낼 N / 전체 M, 제외 D". 기존 패널 시스템(system-ui, `#2563eb`) 유지, 재브랜딩 없음(패널 간 일관성).

## 현재 문제 (검증됨)

- `sidepanel.html` `state-results`에 통계·경고·미리보기·내보내기가 한 화면(인라인).
- `sidepanel.tsx:123` `events.slice(0, 20)` — 디자인 회피용 상한.
- `sidepanel.tsx:115` 경고를 enum 코드 원문 렌더.
- `EventPreviewList`는 비가상화 map — 수백 건 부적합.

## 컴포넌트

### 1. `warning-copy.ts` (신규, pure)

`NORMALIZATION_WARNING_VALUES` 각 코드를 사용자 문구로 매핑.

```ts
export type WarningCopy = { label: string; hint: string };
export function describeWarning(code: string): WarningCopy;
```

- 9개 코드 전부 매핑. 예:
  - `recurrence-override-orphaned` → label "수정된 반복 회차가 단독 일정으로 처리됨", hint "원본 반복 일정이 범위 밖이라 시리즈로 묶지 못했습니다."
  - `timezone-not-iana` → "표준이 아닌 시간대 → UTC로 변환", "Google 호환을 위해 UTC로 내보냈습니다."
  - `recurrence-unsupported` → "지원하지 않는 반복 규칙은 제외", "표준 반복(매일/매주/매월/매년)만 내보냅니다."
  - (나머지 timezone-missing/attachment-omitted/participant-omitted/title-empty/reminder-unsupported/url-invalid 동일 패턴)
- 미지 코드 fallback: `{ label: code, hint: '' }`.
- **테스트**: `NORMALIZATION_WARNING_VALUES` 전 코드가 fallback이 아닌 매핑을 갖는지(closed-enum 동기화 가드) + 미지 코드 fallback.

### 2. `virtual-window.ts` (신규, pure)

고정행 가상화의 윈도 계산.

```ts
export type VirtualWindow = { start: number; end: number; padTop: number; padBottom: number };
export function computeVirtualWindow(
  scrollTop: number, viewportHeight: number, rowHeight: number, count: number, overscan?: number,
): VirtualWindow;
```

- `start = max(0, floor(scrollTop/rowHeight) - overscan)`, 보이는 행 수 + 2*overscan, `end = min(count, ...)`. `padTop = start*rowHeight`, `padBottom = (count-end)*rowHeight`.
- overscan 기본 4. count 0/소량/스크롤 끝 경계 처리.
- **테스트**: 상단/중간/하단 스크롤, count< viewport, count 0.

### 3. 상세 목록 컴포넌트 `EventDetailList` (가상화)

- props: 전체 events(상한 없음), `formatDate`, 검색어.
- 검색: title/calendarName 부분일치 필터(대소문자 무시). 필터 후 `computeVirtualWindow`로 윈도만 렌더.
- 컨테이너 `overflow:auto` 고정 높이, scroll 이벤트로 윈도 갱신. 행 높이 고정.
- 가이드라인: 텍스트 overflow `truncate`(title 길이 가변), `aria-live` 불필요(사용자 스크롤), 빈 결과 안내.

### 4. 화면 구조 (sidepanel.html)

- `state-results`(요약):
  - **충실도 hero**: `내보낼 N` 큰 숫자(28px/600/tabular-nums) + 보조 라인 `전체 M · 제외 D`(D>0이면 빨강) + 가는 비율 바.
  - 경고 섹션: `describeWarning`로 label + hint + 건수(앰버 카드).
  - 내보내기 형식(ICS/JSON) + 내보내기 버튼.
  - **"상세 보기 N건 →"** 버튼 → `state-detail`.
  - "다시 설정".
- `state-detail`(신규): 뒤로(←) + 검색 input + 가상화 리스트.
- `showState` 타입에 `'detail'` 추가.

### 5. 통계/요약 데이터

`renderResults`가 받는 `events`(정규화 완료)와 `totalFetched`로:
- N(내보낼) = events.length, M(전체 fetch) = totalFetched, D(제외) = M - N (드롭+범위밖 합). 표기는 "전체 M · 제외 D".
- 숫자 `tabular-nums`.

## 흡수 가이드라인

- 리스트 >50 가상화(§2,3), 텍스트 overflow truncate, `tabular-nums`, 경고 specific labels(§1).

## 범위 외

- 추출 기록(#69), 나머지 a11y/CSS(#70: focus-visible는 #67에서 일부 적용됨).

## 테스트

- pure: `describeWarning`(enum 동기화), `computeVirtualWindow`(경계).
- DOM glue(스크롤/검색 입력)는 thin — 수동 smoke + 시각 확인.
