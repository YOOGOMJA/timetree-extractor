# 수집 데이터 대시보드 재설계 (#75)

결론: "분석 결과" 단계 화면을 **수집된 데이터 대시보드**로 바꾼다. 충실도 hero(유지) 아래에 캘린더별 집계·라벨 카테고리 칩·이슈 드릴다운을 더해 "수집된 것"을 한눈에 보이고, 진입 화면을 중앙 정렬로 다듬고, 상세 보기의 입력 일관성·레이아웃을 고친다. 공유 캘린더는 1급 카테고리로 포함하고 막지 않는다(1회 정보 동의 모달은 유지 — privacy 스펙).

- /frontend-design + /web-design-guidelines 기준
- 데이터 근거: `RawTimeTreeCalendar`엔 색 없음 → 라벨 카테고리 색은 라벨명 기반 결정적 hue. 이벤트엔 `calendarName`·`labels[]`·`warnings[]` 있음.

## 결정

- 공유 데이터: 대시보드·내보내기에 **포함, 절대 제외/숨김 안 함**. 동의 모달은 1회 정보 동의(차단 아님) 유지.

## 컴포넌트 (pure, 테스트)

### 1. `dashboard-aggregate.ts`
```ts
export type CalendarCount = { name: string; count: number };
export type LabelCount = { name: string; count: number };
export type WarningGroup = { code: string; events: { title: string; calendarName: string }[] };
export function aggregateByCalendar(events: NormalizedCalendarEvent[]): CalendarCount[]; // count desc
export function aggregateByLabel(events: NormalizedCalendarEvent[]): LabelCount[];       // count desc, 라벨 없는 이벤트 제외
export function groupWarnings(events: NormalizedCalendarEvent[]): WarningGroup[];         // code별 영향 이벤트
```
- 테스트: 집계 정확성·정렬·라벨 없는 이벤트·복수 라벨·경고 그룹화.

### 2. `label-color.ts`
```ts
export function labelHue(name: string): number; // 0..359 결정적
export function labelChipColors(name: string): { bg: string; fg: string }; // hsl
```
- 테스트: 같은 이름 같은 hue, 다른 이름 분포, 빈 문자열 안전.

## UI

### 진입(idle) — 중앙 정렬·준비된 느낌
- 도구명 + 한 줄 목적 + 단일 **"캘린더 수집"** CTA + 최근 내보내기. 세로 여백 크게, 콘텐츠 중앙 정렬.

### 대시보드(state-results)
1. 충실도 hero(유지): 내보낼 N / 전체 M / 제외 D + 비율 바.
2. **캘린더** 섹션: `aggregateByCalendar` → 이름 + 건수(tabular). 전체 포함(공유 포함).
3. **카테고리(라벨)** 섹션: `aggregateByLabel` → `labelChipColors` 색 칩 + 건수. 라벨 없으면 섹션 숨김.
4. **발견된 이슈** 섹션: `groupWarnings` → `describeWarning` label + 건수 + **펼침(▸/▾)** 시 영향 이벤트 목록(title · calendar). = "오류 내용 상세히 보기".
5. **전체 일정 N건 보기 →** (상세) + 내보내기 형식/버튼.

### 상세(state-detail) 수정
- 검색 input을 버튼과 동일 메트릭 공통 `.field`(높이·테두리·radius·focus)로 → 일관성.
- 표 상단 몰림 해결: 툴바 아래 결과 수 헤더 + 여백, 스크롤 영역이 남은 높이 채움(고정 box 제거, flex). 행 정보 확장(시간·캘린더).

## 토큰
- 색: bg `#fff`, ink `#0f172a`, muted `#64748b`, line `#e2e8f0`, primary `#2563eb`(기존), 제외 `#dc2626`, 경고 `#b45309`/`#fffbeb`, 카테고리 칩 = 라벨명 hue.
- 타입: system-ui 유지. 숫자 tabular-nums, eyebrow uppercase 좁은 트래킹("계기판" 시그니처).
- 시그니처: 대시보드가 *사용자의 실제 캘린더·라벨 카테고리*로 구성 + 이슈 드릴다운(아무것도 숨기지 않음).

## 가이드라인 흡수
- 펼침 버튼 `aria-expanded`, 칩 색 대비, 검색 input 일관 focus, 상세 리스트 가상화 유지, tabular-nums.

## 범위 외
- 캘린더 토글/재수집(클라이언트 필터)은 후속. 이번엔 표시·정보 노출·상세 수정 중심.
- shared 배지: 데이터(공유 여부 필드) 없음 → 가짜 배지 안 만듦. 모든 캘린더를 동등 표시.
