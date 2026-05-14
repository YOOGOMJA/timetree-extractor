# TimeTree cache mapping smoke

결론: 실제 로그인된 TimeTree Web profile의 IndexedDB `timetree-sqlite` cache를 대상으로 `src/browser/sqlite-cache-reader` → `core/normalize` → `core/ics` 파이프라인이 end-to-end로 동작함을 확인했다. shape mismatch는 없었다.

## 절차

1. `agent-browser --profile "<TimeTree 로그인된 Chrome profile>" open https://timetreeapp.com/calendars` 로 세션 attach.
2. 세션이 만료되어 `/signin`으로 redirect됐지만 origin이 같아 IndexedDB 접근은 가능했다.
3. `agent-browser eval --stdin`으로 `indexedDB.open('timetree-sqlite')` → `metadata.getAll()` + `blocks.getAll()` 추출.
4. negative offset(`fileSize + offset`) 처리하여 `Uint8Array` 재조합. SQLite magic header `SQLite format 3\0` 일치 확인.
5. base64 round-trip으로 로컬로 가져온 뒤 throwaway smoke harness(`/tmp/timetree-smoke/smoke.mjs`, repo 밖)에서 `sql.js` 어댑터로 events 테이블 cursor scan.
6. `normalizeRawTimeTreeEvent` 적용 후 `createIcsCalendar`로 ICS 생성.

## 데이터 경계

- credential, session cookie, header는 어떤 단계에서도 캡처하지 않았다.
- raw event title, note, location, url, attendee 정보는 출력/로그/문서 어디에도 남기지 않았다.
- 임시 `.sqlite` 파일과 smoke harness는 `/tmp/timetree-smoke/`에 두고 smoke 직후 삭제 대상.
- repo 안에는 count와 type shape만 기록한다.

## 관찰 결과

### IndexedDB 구조

- `timetree-sqlite` database, version 6
- object stores: `metadata`, `blocks`
- `metadata`의 단일 record: `{ name: '/timetree', fileSize: 225280, version: -12 }`
- `blocks` count: 55
- block record shape: `{ path: string, offset: number, version: number, data: Uint8Array(4096) }`
- block의 `offset`은 negative value(예: `-221184`)도 등장하며, `fileSize + offset`으로 정상 매핑됨.

### 재조합

- 55 blocks 모두 file 경계 내에서 정상 기록(out-of-bounds 0).
- 재조합 결과 첫 16바이트가 `53 51 4c 69 74 65 20 66 6f 72 6d 61 74 20 33 00` (= `SQLite format 3\0`).

### Events 테이블

- cursor scan 결과 event row 16건, mapping 실패 0건.
- 필드 이름: `alerts, allDay, attachment, attendees, calendarId, createdAt, deactivatedAt, endAt, endTimezone, extractionWarnings, files, id, labelId, location, note, recurrences, recurringUuid, startAt, startTimezone, title, updatedAt, url` — `RawTimeTreeEvent` 정의와 정확히 일치.
- 필드별 type:
  - 필수 P0 필드는 모두 채워짐(`id: string`, `calendarId: number`, `title: string`, `allDay: boolean`, `startAt: number`, `endAt: number`, `startTimezone: string`, `endTimezone: string`).
  - `note`, `url`, `recurringUuid`, `attachment`, `deactivatedAt`는 모두 `null` — schema의 nullable 허용과 일치.
  - `alerts`, `attendees`, `files`는 empty array.
  - `recurrences`는 array(1) — 최소 1개의 RRULE이 포함되어 있다.
  - `extractionWarnings`는 array(3) — extractor가 부여한 ExtractionWarning이 보존됨.

### Normalize / ICS

- `normalizeRawTimeTreeEvent` 결과: ok 16, fail 0, normalization warning 0건.
  - 즉 `timezone-missing`, `recurrence-unsupported`, `participant-omitted`, `attachment-omitted`, `title-empty` 중 어느 것도 발생하지 않음.
- `createIcsCalendar` 결과: 123 라인, 16 `BEGIN:VEVENT`, `DTSTART`/`DTEND`/`RRULE` 모두 존재.

## 검증된 contract

- `TimeTreeSqliteMetadataRecord` (`name?: string`, `fileSize?: number`)는 실 데이터와 호환된다(`version: number` 필드가 추가로 존재하지만 reader가 무시하므로 무해).
- `SqliteCacheBlock` (`offset`, `data`, optional `path`)는 실 데이터와 일치한다. negative offset 처리 로직(`reconstructSqliteCacheBytes`)이 실제로 필요했다.
- `buildEventsCursorSql`이 SELECT하는 컬럼 27개가 실 `events` 테이블에 존재한다(쿼리 에러 없음, 16건 모두 scan 성공).
- `mapSqliteEventRowToRawTimeTreeEvent` + `validateRawTimeTreeEvent`가 실 row 16건을 모두 통과시킨다.

## 한계

- 이번 smoke 대상 cache는 record 16건의 단일 calendar로 보이며, 본격적인 long-history/multi-calendar/공유 calendar/복잡한 recurrence/timezone-null 경우는 포함되지 않았다.
- 세션이 만료된 상태였기 때문에 `passive-fetch-observer` 경로(API payload smoke)는 이번 회차에서 다루지 않았다. 별도 smoke 회차에서 검증 필요.
- normalization warning이 0건이라는 결과는 "본 cache가 잘 정돈된 경우"라는 의미일 뿐, 다른 사용자의 cache가 동일하게 통과한다는 보장은 아니다.

---

# 추가 회차: 라이브 세션 API surface smoke

결론: 위 cache smoke 직후 같은 profile로 로그인한 라이브 세션에서 REST API 경로(`/api/v1/calendar/:id/events`)를 함께 검증했다. **IndexedDB cache는 라이브 세션 후에도 갱신되지 않는다**는 사실을 확인했고, 라이브 데이터는 REST API에서만 얻을 수 있다. `mapApiEventToRawTimeTreeEvent` → `validateRawTimeTreeEvent` → `normalizeRawTimeTreeEvent` 파이프라인이 실제 API payload 934건을 0건의 mapping/validation/normalize 실패로 통과시켰다.

## 절차

1. `agent-browser --headed --profile "<TimeTree 로그인된 Chrome profile>"` 로 visible window 띄움.
2. 사용자가 직접 로그인(자동 로그인은 boundary 위반이므로 사용자 본인이 수행).
3. 로그인 후에도 IndexedDB `timetree-sqlite`의 `metadata.fileSize`/`blocks.count`는 변하지 않음을 확인 → cache가 source of truth가 아님.
4. 페이지가 실제로 호출하는 fetch를 hook해서 헤더 캡처 (`window.fetch`와 `XMLHttpRequest.prototype` 양쪽).
5. 캡처된 헤더로 `/api/v1/calendar/{id}/events?since=0` 호출 → 성공.
6. `chunk` flag + `since` cursor 페이지네이션 반복.
7. 응답을 로컬 throwaway harness에 넘겨 `mapApiEventToRawTimeTreeEvent` → `validateRawTimeTreeEvent` → `normalizeRawTimeTreeEvent`로 처리.

## 데이터 경계

- 사용자 로그인은 사용자가 직접 수행. 자격증명은 어떤 단계에서도 코드/스니펫이 다루지 않음.
- API 응답 raw payload는 `/tmp/timetree-smoke/`에 일시 저장 후 회차 종료시 삭제 대상.
- repo에는 count, shape, contract 사실만 기록. 사용자의 이벤트 제목/장소/노트/참여자 정보는 남기지 않음.

## API contract (관찰된 실제 surface)

- Endpoint: `GET /api/v1/calendar/{calendarId}/events?since=<ms>`
- 인증: HttpOnly cookie(자동 첨부) **+ 명시 헤더가 함께 있어야 -401이 안 뜸**:
  - `x-timetreea: web/2.1.0/en` (없으면 `code: -401`)
  - `x-csrf-token: <meta[name=csrf-token] content>` (GET에도 보냄)
  - `content-type: application/json`
- `fetch` 호출 시 `credentials: 'include'` 필요 (`'same-origin'`은 실패).
- 응답 shape: `{ since: number, chunk: boolean, events: ApiEvent[] }`
  - `chunk: true`면 다음 호출에 `since=<응답의 since>`로 이어 호출해야 함 — cursor 기반 페이지네이션.
- 한 페이지는 약 300건 단위로 관찰됨.

## 관찰 결과 (이번 라이브 세션)

- IndexedDB metadata version은 `-12` → `-13`으로 한 단계 갱신됐지만 `fileSize`(225280)와 block count(55)는 그대로. cache table이 의미 있게 hydrate되지 않음.
- 실 API에서 가져온 이벤트:
  - shared calendar: 928건 (페이지네이션 4회로 누적)
  - personal calendar: 6건
  - 합계 934건
- 파이프라인 통과율:
  - `mapApiEventToRawTimeTreeEvent` 실패: 0
  - `validateRawTimeTreeEvent` 실패: 0
  - `normalizeRawTimeTreeEvent` 실패: 0
- 반복 이벤트 (`recurrences` 배열 비어있지 않음): shared 15건. 관찰된 RRULE 형식:
  - `RRULE:FREQ=WEEKLY;BYDAY=SU,TU,TH`
  - `RRULE:FREQ=MONTHLY;BYMONTHDAY=11`
  - `RRULE:FREQ=YEARLY`
- 사용자가 화면에서 본 "이번 주" 이벤트와 파이프라인 결과(필터 후 11건)가 일치. RRULE 전개는 throwaway harness에서 수행했고 핵심 normalize 결과 자체는 RRULE을 보존만 함.

## 검증된 contract

- `mapApiEventToRawTimeTreeEvent`가 라이브 API payload 934건에 대해 모두 valid `RawTimeTreeEvent`를 생산한다.
- `validateRawTimeTreeEvent`가 934건 모두 통과시킨다.
- `normalizeRawTimeTreeEvent`가 934건 모두 통과시킨다.
- 응답 필드(`recurrences`, `start_at`, `end_at`, `start_timezone`, `end_timezone`, `attendees`, `attachment`, `files`, `recurring_uuid`, `deactivated_at`, `label_id`, `note`, `location`, `url`, `all_day`)가 contract와 일관됨.

## 발견된 contract 갭

1. **페이지네이션 미지원**. `src/browser/timetree-page-extractor.ts`의 `extractVisibleTimeTreeEvents`는 `since` 쿼리를 한 번만 호출하고 결과를 반환한다. 실 API는 `chunk: true`/`since: number` cursor를 사용하므로, 사용자 calendar가 ~300건을 넘으면 단순 호출 한 번으로는 전체를 못 가져온다. 후속 작업 필요.
2. **인증 헤더 부재**. `extractVisibleTimeTreeEvents`는 `fetchJson` 어댑터를 받는데, 외부에서 직접 호출할 때는 위에서 관찰된 `x-timetreea`/`x-csrf-token`/`credentials: 'include'`를 적용해야 한다. 페이지 컨텍스트 내부(extension content script)에서는 페이지 자체 fetch wrapper에 의존하면 됨. CLI/외부 호출은 별도 정책 필요(현행 Decision 0004 boundary는 외부 직접 호출을 거부하므로 추가 작업 없음).
3. **RRULE 전개 미구현**. `normalizeRawTimeTreeEvent`는 RRULE을 보존만 한다. ICS 출력 관점에서는 표준에 맞고 의도된 동작이지만, "특정 주에 어떤 인스턴스가 있는가" 같은 질의에는 별도 expander가 필요하다(현행 v1 export 범위에는 들어가지 않음).
4. **All-day 이벤트의 타임존 경계**. `normalize`는 all-day 이벤트의 date를 UTC ISO date로 직렬화한다. "주간 필터" 같은 KST 기준 질의를 외부에서 수행할 때 UTC/KST 경계에서 하루 어긋날 수 있음을 throwaway harness 측에서 확인. 본 프로젝트 contract 자체 문제는 아님 (소비자가 KST 기준으로 다시 해석).

## 갱신된 검증된 contract

- IndexedDB SQLite cache 경로는 보존된 과거 snapshot에 한해 유효. 라이브/현재 데이터의 source of truth는 REST API 쪽이다.
- REST API surface가 실 데이터 934건에 대해 mapping/validation/normalize 0 fail로 검증됨.

## 한계 (라이브 세션 회차)

- 단일 사용자, 두 캘린더(shared 1 + personal 1)만 본 결과다.
- recurrence는 WEEKLY/MONTHLY/YEARLY만 관찰. DAILY, COUNT/UNTIL, EXDATE, EXRULE은 미관찰.
- 모든 이벤트가 `start_timezone`/`end_timezone`을 채우고 있어 `timezone-missing` warning은 0건. 다른 사용자/지역의 데이터에서는 다를 수 있음.
- RRULE 전개의 정확성은 throwaway 코드 수준으로만 확인됐다. 표준 ICS 소비자(Google Calendar 등)가 우리가 보존한 RRULE을 어떻게 해석하는지는 별도 검증 필요.

## 후속

- 더 큰 cache(여러 캘린더, 더 긴 기간, 공유 calendar 포함)에서 같은 smoke를 반복하면 warning/issue가 드러날 가능성이 있다.
- `extractVisibleTimeTreeEvents`에 `chunk`/`since` 페이지네이션 추가 — 이번 갭에 대한 직접적인 후속 작업.
- TimeTree 페이지 source map/version별로 `x-timetreea` 헤더 값이 바뀌면 호출이 깨질 수 있으므로 contract drift 모니터링이 필요.
- 이번 smoke 결과가 안정적이라면 다음 gate는 `cli-harness-plan`이 가리키는 helper format 또는 Chrome extension packaging이다. 다만 helper format/CLI 경로는 외부에서 API를 직접 호출하지 않고 (Decision 0004), extension 또는 사용자 brower context 안에서만 데이터를 만들어야 한다.
