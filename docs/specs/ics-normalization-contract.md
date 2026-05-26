# ICS Normalization Contract

결론: `ICS` export 구현은 extraction contract가 P0 fixture를 통과한 뒤에만 시작한다. `ICS`는 data loss가 사용자 calendar migration에 직접 영향을 주므로, timezone/all-day/recurrence를 임의 추론으로 처리하면 안 된다.

## Normalized event

```ts
type NormalizedCalendarEvent = {
  uid: string;
  calendarName: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  start: NormalizedDateTime;
  end: NormalizedDateTime;
  recurrence?: NormalizedRecurrence;
  labels?: string[];
  source: {
    provider: 'timetree';
    eventId: string;
    calendarId: number;
    originalUrl?: string;
  };
  warnings: NormalizationWarning[];
};

type NormalizedDateTime =
  | { kind: 'date'; date: string }
  | { kind: 'date-time'; epochMs: number; timezone: string };

type NormalizedRecurrence = {
  rrule?: string[];
  rdate?: string[];
  exrule?: string[];
  exdate?: string[];
};

type NormalizationWarning =
  | 'timezone-missing'
  | 'timezone-not-iana'
  | 'recurrence-unsupported'
  | 'attachment-omitted'
  | 'comment-omitted'
  | 'participant-omitted'
  | 'label-color-approximation'
  | 'title-empty';
```

## Mapping rules

| Raw field | Normalized field | Rule |
| --- | --- | --- |
| `id` | `uid`, `source.eventId` | `uid`는 deterministic하게 생성 |
| `calendarId` | `source.calendarId` | 그대로 보존 |
| `title` | `title` | empty title이면 placeholder와 `title-empty` warning |
| `note` | `description` | plain text 보존, HTML 변환 금지 |
| `location` | `location` | string 그대로 보존 |
| `url` | `url` | URL string 검증 후 보존 |
| `allDay=true` | `start/end.kind='date'` | `VALUE=DATE`로 export |
| `allDay=false` | `start/end.kind='date-time'` | timezone 필수 |
| `startTimezone/endTimezone` | `timezone` | missing이면 timed event export fail |
| `recurrences` | `recurrence` | supported rule만 변환, unknown rule은 warning/fail |
| `labelId` + labels | `labels` | label name 중심, color는 optional |
| `files`, `attachment` | warning | v1에서는 binary export 제외 |

## ICS go criteria

- all-day event는 `VALUE=DATE`로 표현한다.
- timed event는 timezone이 없으면 export하지 않는다.
- recurrence rule은 fixture로 검증된 subset만 허용한다.
- unsupported field는 silent drop하지 않고 warning에 남긴다.
- generated `ICS`는 standard parser로 round-trip smoke test를 통과해야 한다.

## Initial recurrence subset

처음 허용할 recurrence는 다음으로 제한한다.

- `RRULE:FREQ=DAILY`
- `RRULE:FREQ=WEEKLY` with `BYDAY`
- `RRULE:FREQ=MONTHLY` basic patterns, fixture 확인 후
- `RDATE` / `EXDATE`는 fixture 확인 후

지원하지 않는 recurrence는 `recurrence-unsupported` warning과 함께 해당 event의 `ICS` export를 fail 처리한다.

## 결론

`ICS`는 두 번째 구현 단계다. 첫 구현은 `RawTimeTreeEvent -> NormalizedCalendarEvent` 변환과 warning/fail policy까지이며, 실제 `.ics` file 생성은 P0/P1 fixture가 안정화된 뒤 시작한다.


## V1 writer decision

결론: v1 writer는 `NormalizedCalendarEvent`만 입력으로 받고 `ICS` text를 생성한다. TimeTree raw row나 private JSONB payload는 writer에 직접 전달하지 않는다.

- timed event: `TZID` parameter를 사용한다.
- all-day event: `VALUE=DATE`를 사용한다.
- recurrence: normalized recurrence line을 중복 property name 없이 보존한다.
- `VTIMEZONE`: v1에서는 생성하지 않는다.
