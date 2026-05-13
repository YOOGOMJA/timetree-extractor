# TimeTree Network and Page State Research

결론: **기술적으로는 pass에 가깝지만, 제품 결정은 아직 보류해야 한다.** TimeTree Web은 first-party API와 client-side SQLite cache를 사용하며, client bundle 기준 event model에는 `all_day`, `start_timezone`, `end_timezone`, `recurrences`, `location`, `note`, `alerts`, `files` 같은 machine-readable field가 존재한다. 따라서 DOM only에서 실패한 P0 gap은 기술적으로 해소될 가능성이 높다. 다만 이 surface는 공식 공개 API가 아니라 로그인된 Web client의 내부 동작이므로, 구현 전 policy/risk boundary를 별도 decision으로 고정해야 한다.

## 조사 범위

- 확인일: 2026-05-13
- Browser access: `agent-browser`를 통한 로그인된 TimeTree Web 화면 조작
- Evidence boundary: limited network/page-state observation
- Credential/session token 저장: 하지 않음
- HAR 저장: 하지 않음
- 대량 호출: 하지 않음
- Mutation 목적 API 호출: 하지 않음
- 문서화 정책: 실제 calendar name, event title, person name, token, request header 값은 기록하지 않음

## 왜 이 조사를 했는가

`docs/research/timetree-web-data-surface.md`에서 DOM only validation은 fail이었다.

Fail reason:

- `timezone`이 DOM에 명시적으로 노출되지 않음
- `all-day 여부`가 explicit field가 아니라 DOM structure와 text 유무에 의존함

이번 조사의 목적은 구현이 아니라, TimeTree Web 내부 data surface에 이 P0 field가 machine-readable하게 존재하는지만 제한적으로 확인하는 것이다.

## 확인한 first-party API surface

Network request 목록에서 다음 TimeTree first-party endpoint가 관찰됐다. 실제 numeric calendar identifier와 event identifier는 문서에 기록하지 않는다.

| Endpoint pattern | Method | 용도 추정 | 메모 |
| --- | --- | --- | --- |
| `/api/v2/calendars` | `GET` | calendar metadata | `id`, `alias_code`, `name`, `author_id`, `badge`, `purpose`, `order`, `updated_at`, `created_at` schema 확인 |
| `/api/v1/user/setting` | `GET` | user display/settings | `start_weekday`, `holiday_countries`, `military_time`, `lang` 등 schema 확인 |
| `/api/v1/calendar/{calendarId}/events?since={cursor}` | `GET` | event sync | reload 시 request 관찰. 이미 local cache가 최신이라 response `events`는 empty였음 |
| `/api/v1/calendar/{calendarId}/labels` | `GET` | calendar labels | label `name`, `color`, `default_color`, `order` schema 확인 |
| `/api/v2/calendars/{calendarId}/users` | `GET` | calendar members | shared calendar participant data risk 존재 |
| `/api/v1/calendars/{calendarId}/virtual_users` | `GET` | virtual users | participant-like data risk 존재 |
| `/api/v1/calendar/{calendarId}/event/{eventId}/activities` | `GET` | event activity | activity `type`, `author_id`, `editor_id`, `attachment`, timestamps schema 확인 |
| `/api/v2/memorialdays` | `GET` | holidays | country/date range 기반 holiday data |

## 확인한 page-state / storage surface

### IndexedDB

TimeTree Web은 다음 IndexedDB database를 사용한다.

| Database | Version | Object stores | 메모 |
| --- | --- | --- | --- |
| `timetree-keyval` | 2 | `event_since`, `public_event_interests` | event sync cursor 저장 |
| `timetree-sqlite` | 6 | `blocks`, `metadata` | client-side SQLite block storage로 보임 |

`event_since` store에는 calendar별 sync cursor가 저장된다. `timetree-sqlite`는 block storage 형태라 DOM처럼 직접 읽기 쉬운 key-value event store는 아니다.

### Client bundle evidence

TimeTree Web의 loaded client bundle과 lazy chunk를 확인했다. 이 조사는 client code의 field mapping만 확인했고, 개인 event value는 기록하지 않았다.

관찰된 event model mapping에는 다음 field가 존재한다.

```text
id
primary_id
calendar_id
uuid
category
type
author_id
author_type
title
all_day
start_at
start_timezone
end_at
end_timezone
label_id
location
location_lat
location_lon
url
note
lunar
attendees
recurrences
recurring_uuid
alerts
parent_id
link_object_id
link_object_id_string
row_order
attachment
like_count
files
deactivated_at
pinned_at
updated_at
created_at
recur_start_at
recur_end_at
```

반복 일정 계산 code도 확인됐다. Client는 `recurrences`, `startAt`, `allDay`, `startTimezone`을 사용해 recurrence expansion을 수행한다. 이는 `ICS` 변환에 필요한 timezone/all-day/recurrence 정보가 DOM text가 아니라 app data model에는 존재한다는 강한 근거다.

## Field gap 재평가

| Field | DOM only 결과 | Network/page-state 결과 | 재평가 |
| --- | --- | --- | --- |
| calendar name | accessible | `/api/v2/calendars` schema에 `name` 존재 | pass |
| event title | accessible | event model에 `title` 존재 | pass 가능성 높음 |
| start/end time | accessible for timed events | event model에 `start_at`, `end_at` 존재 | pass 가능성 높음 |
| all-day 여부 | inferable only | event model에 `all_day` 존재 | pass 가능성 높음 |
| timezone | inaccessible | event model에 `start_timezone`, `end_timezone` 존재 | pass 가능성 높음 |
| recurrence | human text only | event model에 `recurrences`, `recurring_uuid`, `recur_start_at`, `recur_end_at` 존재 | pass 가능성 높음 |
| memo/description | not observed | event model에 `note`, `url`, `location` 존재 | pass 가능성 있음 |
| labels | partial | label API에 `name`, `color`, `default_color` 존재 | pass 가능성 높음 |
| activities | partial | activity API에 typed activity와 timestamps 존재 | partial/pass 가능성 |
| attachments | UI only | event model에 `attachment`, `files` 존재 | pass 가능성은 있으나 privacy/file handling risk 큼 |

## 기술 판정

기술적으로는 **contract 기반 extractor를 설계할 근거가 생겼다.** DOM only에서는 P0가 부족했지만, TimeTree Web app data model에는 P0를 채울 field가 존재한다.

다만 아직 pass로 확정하지 않는다.

이유:

- 실제 event sync response는 최신 cache 상태에서 empty response만 확인했다.
- Client bundle field mapping은 강한 근거지만, 모든 event type에서 값이 채워지는지는 fixture로 검증하지 않았다.
- 이 surface는 공식 공개 API가 아니라 Web client 내부 API와 local cache에 의존한다.
- shared calendar data와 participant data를 포함하므로 privacy risk가 DOM only보다 커진다.

## Policy/risk 판정

제품 관점에서는 **바로 구현하면 안 된다.**

허용 가능한 방향은 다음처럼 좁혀야 한다.

- 개인 사용 목적의 local-only tool
- browser session을 외부로 저장하지 않음
- token, cookie, CSRF header, credential을 파일로 저장하지 않음
- server 전송 없음
- export 전 shared calendar participant data warning 표시
- 내부 endpoint 안정성 보장 없음과 data loss 가능성 표시
- public SaaS 또는 hosted collector 방향 금지

## 다음 decision

추천 decision은 다음과 같다.

1. **Limited local-first extractor research를 허용한다.**
   - 대상은 event sync response와 local cache schema 확인이다.
   - 구현 목표는 product가 아니라 fixture와 contract 검증이다.
2. **Public distribution과 SaaS는 금지한다.**
   - 최소한 TimeTree 정책/법리 검토가 더 진행되기 전까지 금지한다.
3. **credential/session/token 저장은 계속 금지한다.**
   - Browser extension 또는 local script가 현재 session에서 read-only로 동작하는 방향만 검토한다.
4. **먼저 contract와 fixture test를 만든다.**
   - `RawTimeTreeEvent` schema
   - `NormalizedCalendarEvent` schema
   - timezone/all-day/recurrence fixture
   - data loss warning model

## 다음 산출물 제안

다음 문서는 구현 전 작성하는 것이 좋다.

- `docs/specs/timetree-extraction-contract.md`
- `docs/specs/privacy-and-local-only-boundary.md`
- `docs/specs/ics-normalization-contract.md`

## 결론

DOM only milestone은 fail이었지만, 제한된 network/page-state research 결과 **기술적 가능성은 다시 열렸다.** 다음 단계는 exporter 구현이 아니라, 내부 Web surface 의존을 명시한 local-only contract와 fixture 기반 검증이다.
