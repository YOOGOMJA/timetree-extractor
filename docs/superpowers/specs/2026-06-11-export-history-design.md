# 추출 기록 (메타데이터만 로컬 저장) (#69)

결론: 내보내기 성공 시 **메타데이터만** `chrome.storage.local`에 저장하고, 진입(idle) 화면에 "최근 내보내기"로 보여준다. 이벤트 내용·토큰·raw 응답은 저장하지 않는다(privacy 스펙 정합). 상한 20건, 전체 삭제 제공.

- 대상 이슈: #69 (선행 #67 진입 화면 위에 얹음)

## privacy 정책 정합 (검증됨)

`docs/specs/privacy-and-local-only-boundary.md`:
- 저장 금지: credential/cookie/session token/CSRF header/HAR/**raw private response dump**.
- 저장 허용: redacted fixture, user-selected export file.

→ 내보내기 메타(시점·캘린더 이름·기간·형식·건수·파일명)는 금지 목록 밖이고 로컬 전용(전송 없음)이라 허용. **이벤트 제목/내용은 저장 안 함**(개인 일정 내용 비저장).

## 컴포넌트

### 1. `export-history.ts` (신규, pure)

```ts
export type ExportHistoryRecord = {
  at: number;            // epoch ms
  calendarCount: number; // 선택 캘린더 수(이름 비저장)
  fromDate: string;      // YYYY-MM-DD
  toDate: string;
  format: 'ics' | 'json';
  exportCount: number;   // 내보낸 이벤트 수
  warningCount: number;  // 경고 총 건수
  filename: string;
};
export const HISTORY_MAX = 20;
export function prependRecord(records: ExportHistoryRecord[], record: ExportHistoryRecord, max?: number): ExportHistoryRecord[];
```

- `prependRecord`: 새 record를 맨 앞에 + 상한 초과분 절단. 입력 비변형(새 배열).
- **테스트**: 앞에 추가, 상한 절단, 입력 불변성.

### 2. storage glue (thin, sidepanel 내부 또는 `export-history-store.ts`)

```ts
const HISTORY_KEY = 'timetree-export-history';
async function loadHistory(): Promise<ExportHistoryRecord[]>;   // 손상/부재 시 []
async function recordExport(record): Promise<void>;             // load→prepend→save
async function clearHistory(): Promise<void>;
```

- `chrome.storage.local` 사용. 파싱 실패/타입 불일치는 빈 배열로 안전 처리. CLAUDE.md 패턴상 chrome glue는 단위테스트 비대상(수동 smoke).

### 3. UI — 진입 화면 "최근 내보내기"

- `state-idle`에 `#recent-exports` 컨테이너 추가. idle 표시 시 `loadHistory()` → 렌더.
- record 1줄: "MM/DD HH:mm · ICS · 138건 · 캘린더 2개". 없으면 섹션 숨김.
- "기록 지우기" 버튼(있을 때만) → `clearHistory()` 후 재렌더.
- 가이드라인: 날짜는 `Intl.DateTimeFormat`(로케일 자동), 빈 상태 처리, `tabular-nums`.

### 4. 기록 적재 지점

`exportEvents`에서 `downloadFile` 성공 직후:
- 선택 캘린더 이름 = `loadedCalendars.filter(selected).map(name)`.
- range = date-from/to 입력값, format = 선택 형식, exportCount = `lastNormalized.length`, warningCount = 경고 총합, filename = `decision.filename`.
- `recordExport(buildRecord(...))` (await, 실패해도 export 자체는 이미 완료 — 조용히 무시).

## manifest

- `permissions`에 `"storage"` 추가.

## 범위 외

- 기록에서 재내보내기(re-run) — v1 미포함.
- 나머지 a11y/CSS(#70).

## 테스트

- pure: `prependRecord`(추가/절단/불변).
- storage glue·UI는 수동 smoke + 시각 확인.
