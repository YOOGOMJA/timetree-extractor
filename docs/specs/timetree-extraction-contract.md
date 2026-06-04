# TimeTree Extraction Contract

결론: 구현을 시작한다면 첫 대상은 UI가 아니라 **read-only extraction contract와 redacted fixture test**다. 목표는 TimeTree Web 내부 event model을 그대로 신뢰하는 것이 아니라, P0 field가 실제 sample에서 안정적으로 채워지는지 검증하는 것이다.

## Scope

In scope:

- 현재 로그인된 TimeTree Web context에서 read-only event data를 관찰한다.
- calendar metadata, label metadata, event data의 최소 schema를 정의한다.
- 실제 값은 저장하지 않고 redacted fixture 또는 synthetic fixture를 사용한다.
- extraction warning을 contract에 포함한다.

Out of scope:

- UI 구현
- Browser extension packaging
- ICS file writer 구현
- credential/session/token 저장
- background sync
- public distribution
- comments/files/images export

## Raw contract draft

```ts
type RawTimeTreeCalendar = {
  id: number;
  aliasCode: string;
  name: string;
  updatedAt?: number;
  createdAt?: number;
};

type RawTimeTreeLabel = {
  id: number;
  calendarId: number;
  name: string;
  color?: number;
  defaultColor?: number;
  order?: number;
};

type RawTimeTreeEvent = {
  id: string;
  calendarId: number;
  title: string;
  allDay: boolean;
  startAt: number;
  startTimezone: string | null;
  endAt: number;
  endTimezone: string | null;
  labelId?: number | null;
  location?: string | null;
  url?: string | null;
  note?: string | null;
  recurrences: string[];
  recurringUuid?: string | null;
  recurStartAt?: number | null;
  recurEndAt?: number | null;
  alerts?: unknown[];
  attendees?: unknown[];
  attachment?: unknown;
  files?: unknown[];
  updatedAt?: number;
  createdAt?: number;
  deactivatedAt?: number | null;
  extractionWarnings: ExtractionWarning[];
};

type ExtractionWarning =
  | 'internal-api-surface'
  | 'missing-timezone'
  | 'missing-end-timezone'
  | 'inferred-field'
  | 'unsupported-attachment'
  | 'unsupported-comment'
  | 'shared-calendar-personal-data'
  | 'recurrence-not-normalized';
```

## Required P0 validation

구현 go 조건은 sample fixture에서 다음이 모두 확인되는 것이다.

| Field | Required validation |
| --- | --- |
| `title` | string, empty title 처리 rule 존재 |
| `allDay` | boolean으로 확보 |
| `startAt` / `endAt` | number epoch millisecond로 확보 |
| `startTimezone` / `endTimezone` | timezone string 또는 explicit null + warning |
| `recurrences` | string array로 확보, empty array 허용 |
| `recurStartAt` / `recurEndAt` | 수정된 반복 instance의 *원래* occurrence 시각(epoch ms). optional+nullable, 일반 이벤트엔 없음. SQLite `recur_start_at`/`recur_end_at` · API `recur_start_at`/`recur_end_at` 매핑. RECURRENCE-ID 산출용(#14) |
| calendar metadata | calendar id/name/alias mapping 가능 |
| label metadata | label id/name/color mapping 가능 |

## Event type fixtures

최소 fixture set:

1. timed single event
2. all-day single event
3. timed recurring event
4. all-day recurring event
5. event with label
6. event with note
7. event with location
8. deleted/deactivated event if observed
9. timezone-different event if available

실제 개인 data를 fixture로 저장하지 않는다. 값은 synthetic으로 바꾸되 field presence와 type은 유지한다.

## Extraction acceptance criteria

- extractor는 mutation API를 호출하지 않는다.
- extractor는 credential/session/token/header를 file에 쓰지 않는다.
- extractor는 selected calendar/date range 밖 data를 요청하지 않는다.
- missing P0 field가 있으면 export를 silent success로 처리하지 않고 warning 또는 fail로 반환한다.
- raw event 전체 response dump가 아니라 contract shape만 저장한다.
- schema test가 redacted fixture로 통과한다.

## No-go conditions

다음 중 하나라도 발견되면 구현을 중지한다.

- timezone이 실제 event payload에서도 비어 있거나 browser locale inference에만 의존한다.
- all-day가 실제 payload에서 boolean으로 확보되지 않는다.
- recurrence가 text만 있고 machine-readable rule이 없다.
- data 확보에 session/token 저장이 필요하다.
- data 확보에 background crawling이 필요하다.
- TimeTree response가 강한 anti-automation block을 반환한다.

## 결론

구현은 **extractor product**가 아니라 **contract validator**부터 시작해야 한다. Contract validator가 P0 fixture를 통과하면 그때 parser/normalizer 구현으로 넘어간다.
