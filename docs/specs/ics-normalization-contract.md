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
  reminders?: NormalizedReminder[];
  source: {
    provider: 'timetree';
    eventId: string;
    calendarId: number;
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
  | 'participant-omitted'
  | 'title-empty'
  | 'reminder-unsupported'
  | 'url-invalid';

type NormalizedReminder = {
  /** 이벤트 시작 시각 기준 음수 분 (e.g., -30 = 30분 전). */
  minutesBefore: number;
};
```

- `reminder-unsupported`: VALARM 매핑 대상이 아닌 alert(미지원 shape, 양수 trigger 등). normalize raw → reminder 단계에서 emit하며 ICS writer는 단순 skip한다.

## Mapping rules

| Raw field | Normalized field | Rule |
| --- | --- | --- |
| `id` | `uid`, `source.eventId` | `uid`는 `timetree:{calendarId}:{sanitize(id)}` 형식으로 deterministic 생성. ASCII printable(U+0020–U+007E) 외 byte는 UTF-8 percent-encoding으로 정규화 (재import dedup 보장). `source.eventId`는 원본 보존. |
| `calendarId` | `source.calendarId` | 그대로 보존 |
| `title` | `title` | empty title이면 placeholder와 `title-empty` warning |
| `note` | `description` | plain text 보존, HTML 변환 금지 |
| `location` | `location` | string 그대로 보존 |
| `url` | `url` | `new URL()` 파싱 + U+0000–U+001F/U+007F 제어문자 검사. 실패 시 drop + `url-invalid` warning. |
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

normalize가 통과시키는 RRULE은 `FREQ`가 표준 4종일 때다 (#61에서 #27의 좁은 allowlist를 완화).

- `RRULE:FREQ=DAILY` / `WEEKLY` / `MONTHLY` / `YEARLY` — `INTERVAL`/`COUNT`/`UNTIL`/`BYxxx`/`WKST` 등 modifier와 무관하게 통과 (RFC 5545 valid, Google import honor).
- `RDATE` / `EXDATE`는 그대로 보존.

`FREQ`가 위 4종이 아니거나(`SECONDLY`/`MINUTELY`/`HOURLY` 등), `FREQ`가 없거나, 알 수 없는 rule prefix를 만나면 `recurrence-unsupported` warning과 함께 **event-level fail**(`NormalizationResult.ok = false`)로 처리한다 — silent emit으로 사용자가 빠진 일정을 모르는 일을 막는다.

> #27은 본래 `WEEKLY +BYDAY 필수`, `YEARLY 제외`, `MONTHLY BYSETPOS 거부`로 좁게 제한했으나, 실데이터(Claude in Chrome 관찰)에서 bare `FREQ=WEEKLY`·`FREQ=YEARLY`가 통째로 드롭되는 data-loss가 확인돼 #61에서 FREQ-allowlist로 완화했다. 셋 다 RFC valid이고 Google이 honor한다.

EXRULE은 위 정책에서 제외 — RFC 5545에서 deprecated이고 Google import는 무시하지만 Apple/Outlook이 honor하므로 emit을 유지한다 (`v1-export-policy.md` "EXRULE 보존"). `recurrence-unsupported` warning은 동반.

## Recurring instance override (RECURRENCE-ID)

수정된 반복 instance(특정 회차만 변경)는 실데이터에서 **별도 이벤트**로 존재하며, 그 `recurrenceGroupId`(raw `recurring_uuid`)가 **master의 `source.eventId`를 가리킨다**(공유 그룹키가 아님 — Claude in Chrome 실관찰, #62). master는 RRULE에 `EXDATE:<수정일>`을 갖는다.

`linkRecurringOverrides`는 export될 **최종 set(range filter 이후)** 위에서:

- override의 `recurrenceGroupId`로 master(`source.eventId` 일치, RRULE 보유)를 찾는다.
- **미이동** override(override.start가 master의 EXDATE 슬롯 중 하나와 일치)는 master UID를 공유하고 `override.start`를 `RECURRENCE-ID`로 emit하며, **그 EXDATE를 master에서 제거**한다 — RFC 5545상 한 날짜에 EXDATE와 RECURRENCE-ID를 동시에 두면 안 되기 때문.
- **이동**(start가 어떤 EXDATE와도 불일치) 또는 매칭 실패는 독립 이벤트로 둔다 — master의 EXDATE가 해당 슬롯을 비워두므로 "series(수정일 제외) + 수정일 독립 이벤트"로 비파손(중복·data-loss 없음).
- master가 export에 없으면 단발 UID 유지 + `recurrence-override-orphaned` warning.

원래 슬롯 시각은 master EXDATE로만 확정 가능하므로, 잘못된 `RECURRENCE-ID`를 절대 emit하지 않도록 **EXDATE 슬롯과 정확히 일치한 override만** 링크한다. `recur_start_at`(=`originalStartAt`)은 웹 API에 없어 링크에서 사용하지 않는다(SQLite 캐시 경로엔 존재할 수 있어 필드는 보존).

## 결론

`ICS`는 두 번째 구현 단계다. 첫 구현은 `RawTimeTreeEvent -> NormalizedCalendarEvent` 변환과 warning/fail policy까지이며, 실제 `.ics` file 생성은 P0/P1 fixture가 안정화된 뒤 시작한다.


## V1 writer decision

결론: v1 writer는 `NormalizedCalendarEvent`만 입력으로 받고 `ICS` text를 생성한다. TimeTree raw row나 private JSONB payload는 writer에 직접 전달하지 않는다.

- timed event: `TZID` parameter를 사용한다.
- all-day event: `VALUE=DATE`를 사용한다.
- recurrence: normalized recurrence line을 중복 property name 없이 보존한다.
- `VTIMEZONE`: emit된 `TZID`마다 STANDARD-only 컴포넌트 1개를 생성한다(issue #5 / commit `4143355`). DST 경계를 모델링하지 않으므로, 단일 export가 DST 경계를 넘으면 한쪽 시간대가 1시간 어긋난다 — `src/core/ics.ts:72-79` 주석에 한계가 기록되어 있고 후속 DAYLIGHT 모델링은 별도 이슈에서 다룬다.
