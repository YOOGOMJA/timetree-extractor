# RECURRENCE-ID override 실데이터 smoke runbook (#59)

결론: #14(PR #58)에서 구현한 `RECURRENCE-ID` override emit이 **실제 TimeTree 데이터**에서 동작하는지 사람이 한 번 확인하기 위한 절차다. 코드 메커니즘은 검증됐지만 데이터 모델 의미론은 미검증 가정이다. 이 runbook은 그 수동 확인을 "캡처 → 한 줄 실행 → 판정"으로 줄인다.

- 대상 이슈: #59 (#14 후속)
- 자동화 가능 구간: 캡처한 JSON → ICS 링크 판정 (`scripts/verify-recurrence-smoke.mjs`)
- 사람만 가능한 구간: 계정 로그인 · 반복 일정 수정 · Google import 육안 확인

## 검증하려는 미검증 가정

`src/core/recurrence-link.ts`의 판별은 다음을 가정한다. 이 runbook은 가정의 참/거짓을 실데이터로 가른다.

1. master와 수정 instance가 **동일 `recurring_uuid`** 를 공유한다 (override의 `recurring_uuid`가 master의 `id`를 가리키는 게 아니라).
2. 수정 instance는 `recur_start_at`(원래 occurrence 시각)을 보유하고, master는 `recur_start_at == null`.
3. master는 `recurrences`(RRULE)를 보유한다.

가정이 틀려도 `linkRecurringOverrides`는 단발 UID + `recurrence-override-orphaned` warning으로 fallback하므로 data-loss는 없다. 이 검증은 fallback이 아니라 **정상 링크 경로**가 실데이터에서 동작하는지 본다.

## 절차

### 1. (사람) 반복 일정과 수정 instance 만들기

1. `https://timetreeapp.com` 로그인.
2. 아무 캘린더에 **주간 반복 일정**을 하나 만든다 (예: 매주 월 10:00).
3. 그 일정의 **한 회차만** 시간/제목을 수정한다 (해당 회차만 변경, "이후 전체"가 아니라 "이 일정만").

### 2. (사람) raw API 응답 캡처

1. TimeTree 탭에서 DevTools → **Network** 탭 열기.
2. 캘린더 화면을 새로고침하거나 해당 월로 이동하면 `GET /api/v1/calendar/{calendarId}/events?since=...` 요청이 뜬다.
3. 그 요청의 **Response**(JSON)를 통째로 복사해 파일로 저장한다 (예: `captured.json`).
   - 응답 전체(`{ "events": [...] }`)를 그대로 붙여넣어도 되고, `events` 배열만 떼어내도 된다.
   - 최소한 위 1~3에서 만든 **master와 수정 instance 두 event**가 포함돼야 한다.
   - 캡처 파일은 개인 일정 데이터이므로 **commit하지 말 것** (`.gitignore`된 위치나 repo 밖에 둔다).

캡처에서 눈으로 확인할 raw 필드(스키마는 `src/browser/timetree-page-extractor.ts:50` `mapApiEventToRawTimeTreeEvent` 기준):

| API 필드 | 의미 |
| --- | --- |
| `id` | event 식별자 (master ≠ override) |
| `recurring_uuid` | series 그룹 키 — master·override가 같아야 가정 1 성립 |
| `recur_start_at` | 수정 instance의 원래 occurrence 시각 (master는 null 기대) |
| `recurrences` | master의 RRULE 배열 |

### 3. (자동) 링크 판정 스크립트 실행

```bash
npm run build
node scripts/verify-recurrence-smoke.mjs captured.json
```

스크립트는 캡처를 **프로덕션과 동일한 경로**(`mapApiEventToRawTimeTreeEvent` → `normalizeRawTimeTreeEvent` → `linkRecurringOverrides` → `createIcsCalendar`)로 통과시키고 다음을 출력한다:

- **관찰된 raw 링크 필드** 테이블 — `recurring_uuid`/`recur_start_at` 실값 (4절 기록용)
- **링크 판정** 테이블 — 각 event의 최종 `uid`, `recurrenceId`, orphan 여부
- **ICS UID / RECURRENCE-ID 라인**
- **종합 판정** + exit code (0 = 모든 override 링크됨, 1 = orphan 발생 또는 override 없음)

판정 해석:

- `✅ 모든 override가 master와 링크됐다` → 가정이 실데이터와 일치. 4절로 진행.
- `⚠️ 일부 override가 orphan으로 떨어졌다` → 가정이 틀렸을 가능성. 관찰 테이블에서 master와 override의 `recurring_uuid`가 실제로 같은지 비교하고, 다르면 `linkRecurringOverrides` 판별 로직 정정 이슈를 발행한다.

### 4. (사람) Google Calendar import 육안 확인

`✅` 판정일 때만 의미 있다.

1. 스크립트가 보여준 ICS(또는 확장으로 export한 `.ics`)를 Google Calendar에 import.
2. 수정한 회차가 **series의 그 회차로 반영**(시간/제목이 바뀐 채 시리즈 안에 있음)되는지 확인한다.
   - ✅ 성공: 시리즈의 해당 회차만 수정된 모습. 별도 단발 event가 **아니다**.
   - ❌ 실패: 시리즈 + 별도 단발 event 2개로 보임 → `RECURRENCE-ID` 매칭 실패. master DTSTART와 RECURRENCE-ID의 VALUE/TZID·시각이 어긋났는지 ICS를 재확인한다.

### 5. (사람) 결과 기록

- 관찰된 `recurring_uuid`/`recur_start_at` 실값과 가정 참/거짓을 `docs/research/google-calendar-import-field-research.md`의 RECURRENCE-ID 항목에 한 줄로 반영한다 (현재 "med confidence(조건부)" → 실측 결과로 갱신).
- 가정이 틀렸으면: 판별 로직 정정 이슈 발행 + 이 runbook에 관찰 사례를 남긴다.
- 검증 완료 시 #59를 닫는다.

## 비고

- 단일 계정·단일 시점 검증이다. Google import 동작은 시간에 따라 변할 수 있으므로 날짜를 함께 기록한다.
- `scripts/verify-recurrence-smoke.mjs`는 dev/QA 유틸리티다 (`dist/` 모듈 import → `npm run build` 선행 필요). 실데이터 캡처 파일은 절대 commit하지 않는다.
