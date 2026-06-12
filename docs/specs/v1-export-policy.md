# V1 export policy

결론: v1 export는 **일정의 핵심 시간 정보와 반복 규칙까지 포함**하되, participant, attachment, file, activity/comment의 *내용*은 export하지 않는다. 단, **참가자/첨부는 "있었다"는 신호를 잃지 않도록 개수만 메모로 보존**한다(#81): 참가자 인원수(`participantCount`)와 첨부 파일 수(`attachmentCount`)를 normalized event에 담고 ICS `DESCRIPTION`에 "참가자 N명", "첨부 파일 N개(미포함)" 한 줄로 미러링한다. 이름·ID·바이너리는 여전히 싣지 않는다.

## 기준

이 문서는 TimeTree 내부 Web cache에서 읽은 `RawTimeTreeEvent`를 나중에 `ICS`로 내보낼 때 무엇을 포함하고 무엇을 제외할지 고정한다.

확인된 근거:

- SQLite `events` table에 `title`, `all_day`, `start_at`, `end_at`, `start_timezone`, `end_timezone` field가 있다.
- SQLite JSONB column은 SQLite `json(column)` 함수로 text JSON으로 변환할 수 있다.
- 실제 page smoke에서 `recurrences`는 array이며, 원소가 string인 shape가 확인됐다.
- `attendees`, `attachment`, `files`도 decode 가능하지만 privacy-sensitive data이므로 v1 export payload에 싣지 않는다.
- `alerts`도 decode 가능하며, 원본 payload는 싣지 않고 reminder timing(`minutesBefore`)만 추출해 `VALARM`으로 export한다 (정책: `google-calendar-import-field-compat.md`).

## Include

| Field | v1 처리 | 이유 |
| --- | --- | --- |
| `id` | source identifier로 보존 | 중복 방지와 traceability |
| `calendar_id` | source identifier로 보존 | calendar context 유지 |
| `title` | export | calendar migration 핵심 정보 |
| `all_day` | export | all-day/timed event 구분 |
| `start_at`, `end_at` | export | 일정 시간 핵심 정보 |
| `start_timezone`, `end_timezone` | export | TimeTree DOM only에서 부족했던 핵심 정보 |
| `location` | 있으면 export | 일반 calendar field |
| `url` | 있으면 export | 일반 calendar field |
| `note` | 있으면 export | description 후보 |
| `label_id` | label metadata가 있으면 label name으로 export | calendar organization 보존 |
| `recurrences` | string rule만 export | JSONB decode로 string array 확인 |
| `alerts` | reminder timing(`minutesBefore`)만 추출해 `VALARM` emit | raw payload는 보존하지 않음 (`google-calendar-import-field-compat.md` 정책) |

## Exclude with warning

| Field | v1 처리 | Warning |
| --- | --- | --- |
| `attendees` | 내용 제외, **인원수만** `participantCount`로 보존 후 `DESCRIPTION`에 "참가자 N명" 미러링 | `shared-calendar-personal-data` / `participant-omitted` |
| `attachment` | export하지 않음 (이미지/cover 등 metadata는 개수 집계에서 제외) | `unsupported-attachment` / `attachment-omitted` |
| `files` | 내용 제외, **파일 수만** `attachmentCount`로 보존 후 `DESCRIPTION`에 "첨부 파일 N개(미포함)" 미러링 | `unsupported-attachment` / `attachment-omitted` |
| activities/comments | 읽지 않음 (정책 차원 제외, normalize warning 없음) | `unsupported-comment` (EXTRACTION; 현재 emit 경로 없음) |

## Recurrence policy

v1은 TimeTree `recurrences`가 이미 `RRULE`, `RDATE`, `EXRULE`, `EXDATE` 같은 calendar rule string이면 보존한다.

- 지원 (#61: FREQ 표준 4종, modifier 무관):
  - `RRULE:FREQ=DAILY` / `WEEKLY` / `MONTHLY` / `YEARLY`
  - `RDATE`
  - `EXDATE`
- 보존하지만 warning:
  - `EXRULE` (Apple/Outlook 호환 위해 emit 유지)
- event-level fail + `recurrence-unsupported` warning:
  - `FREQ`가 표준 4종이 아닌 `RRULE` (`SECONDLY`/`MINUTELY`/`HOURLY` 등) 또는 `FREQ` 누락
  - 알 수 없는 rule prefix
- fail/warning:
  - JSONB decode는 되지만 string array가 아닌 recurrence shape

## Privacy policy

v1 export output은 다음을 포함하지 않는다.

- cookie
- token
- CSRF value
- request/response header
- HAR
- raw SQLite file
- raw TimeTree row dump
- participant list
- attachment/file payload
- activity/comment payload

## Acceptance criteria

- SQLite reader는 `json(recurrences)`를 통해 recurrence string array를 얻는다.
- participant/attachment/file JSONB는 decode 가능해도 raw value를 `RawTimeTreeEvent`에 싣지 않는다.
- export 대상이 아닌 private data는 warning count나 warning enum으로만 표현한다.
- v1 `ICS` writer는 `NormalizedCalendarEvent`만 입력으로 받는다.


## ICS writer policy

결론: v1 `ICS` writer는 `TZID` 기반 date-time과 `VALUE=DATE` all-day event를 출력하며, 사용된 `TZID`마다 STANDARD-only `VTIMEZONE` 컴포넌트를 함께 emit한다 (issue #5에서 도입). DAYLIGHT 컴포넌트와 DST 경계 모델링은 후순위.

포함:

- `VCALENDAR` 기본 header: `VERSION`, `PRODID`, `CALSCALE`, `METHOD`
- `VEVENT`: `UID`, `DTSTAMP`, `SUMMARY`, `DTSTART`, `DTEND`
- 선택 field: `DESCRIPTION`, `LOCATION`, `URL`, `CATEGORIES`
- recurrence line: `RRULE`, `RDATE`, `EXRULE`, `EXDATE`

Timezone rule:

- timed event는 `DTSTART;TZID=Asia/Seoul:YYYYMMDDTHHMMSS` 형태로 출력한다.
- all-day event는 `DTSTART;VALUE=DATE:YYYYMMDD`와 `DTEND;VALUE=DATE:YYYYMMDD` 형태로 출력한다.
- 사용된 `TZID`마다 STANDARD-only `VTIMEZONE` 블록을 emit한다 — 첫 이벤트 기준 offset으로 고정되므로 DST 경계를 넘는 단일 export에서는 한쪽이 1시간 어긋날 수 있다 (`src/core/ics.ts:72-79`).

Text escaping:

- backslash, comma, semicolon, newline은 ICS text 규칙에 맞게 escape한다.
- 긴 line은 folding한다.
