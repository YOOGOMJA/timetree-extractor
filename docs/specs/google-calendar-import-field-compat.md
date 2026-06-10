# Google Calendar import field 호환 정책

결론: v1 `ICS` writer는 standards-compliant property를 유지하되, Google Calendar의 **파일 import**가 실제로 반영하는 field에 맞춰 일부 정보를 `DESCRIPTION`으로 mirror하고, Google이 무시하거나 위험한 property는 제거한다.

범위: 이 문서는 우리가 만든 `.ics` file을 Google Calendar **파일 import**(설정 → 가져오기/내보내기)로 넣을 때의 field 호환만 다룬다. Google Calendar API 연동이나 지속 sync는 범위 밖이며, 그 결정은 `decisions/0001-local-first-v1.md`(Google 연동 대신 local export 선택)와 일치한다.

## 참고 문서

- 근거(검증): `docs/research/google-calendar-import-field-research.md` — Google import가 어떤 field를 반영/무시하는지에 대한 evidence.
- source-side 정책: `docs/specs/v1-export-policy.md` — `RawTimeTreeEvent`에서 무엇을 export 대상으로 포함/제외하는지.
- normalization 계약: `docs/specs/ics-normalization-contract.md` — `NormalizedCalendarEvent` shape와 mapping rule.

## 확인된 매핑 결정

이 항목들은 issue #12에서 구현하는 code와 일치한다. 정책상 고정으로 본다.

### labels(`CATEGORIES`) / `URL` — 유지하고 `DESCRIPTION`으로 mirror

- `CATEGORIES`와 `URL` line은 **그대로 유지한다**. standards-compliant client(예: 일반 calendar app)는 이 line을 읽는다.
- 동시에 같은 정보를 `DESCRIPTION` 본문에 mirror한다: 라벨은 `라벨:` line, 링크는 `링크:` line.
- 이유: Google import는 `CATEGORIES`/`URL`을 UI에 노출하지 않고 drop한다. mirror는 **추가(additive)**이며 기존 property 제거가 아니다 — standards client와 Google import 둘 다에서 정보가 살아남는다.

### `EXRULE` — 유지 (Google은 무시)

- `EXRULE` line은 그대로 **출력한다** (`docs/specs/v1-export-policy.md`의 "보존" 정책과 정합).
- 이유: `EXRULE`은 RFC 5545에서 deprecated이고 Google import는 이를 **무시**하지만(파손은 아님), Apple/Outlook 등은 honor한다. emit을 빼면 그 client들에서 제외되었던 instance가 다시 나타나는 data-loss가 발생하므로 제거하지 않는다. (additive 원칙 — Google 위해 다른 client를 깨지 않는다.)
- `recurrence-unsupported` warning은 그대로 유지한다 — `EXRULE`을 포함한 unsupported recurrence는 silent가 아니라 warning으로 남긴다.

### all-day 날짜 — timezone-stable `VALUE=DATE`

- all-day event는 `DTSTART;VALUE=DATE`와 `DTEND;VALUE=DATE`로 출력하며, `DTEND`는 exclusive(= start 날짜 + 1일)로 계산한다.
- 날짜 계산은 machine local timezone에 의존하지 않는다. UTC 기준 등 timezone-stable 방식으로 계산해 off-by-one(하루 밀림)을 피한다.

### `TZID` — valid IANA name 필수

- timed event의 `TZID` parameter는 valid IANA timezone name이어야 한다(예: `Asia/Seoul`).
- 이유: Google은 `VTIMEZONE` component를 무시하고, `TZID` string을 자신의 IANA database에 직접 resolve한다. 따라서 non-IANA string(예: Windows 표기, alias)이면 Google이 시각을 잘못 해석한다.
- `TZID`가 valid IANA가 아니면 normalize 단계에서 `UTC`로 fallback하고 `timezone-not-iana` warning을 emit한다(#28). epochMs는 변경하지 않으므로 절대 시각은 보존되고, 사용자는 warning으로 fallback 사실을 인지한다.

### `alerts → VALARM` — `ACTION:DISPLAY` 일관, relative `TRIGGER`

- TimeTree reminder를 ICS `VALARM` component로 emit한다.
- `ACTION`은 항상 `DISPLAY`. Google file import는 `EMAIL`/`AUDIO`를 popup으로 강등하므로 매핑을 단순화한다.
- `TRIGGER`는 relative offset format(`-PT{N}M` / `-PT{N}H` / `-P{N}D`)로 출력하며 단위는 시간/일로 깔끔히 떨어지지 않으면 분 단위로 fallback한다.
- `DESCRIPTION`은 RFC 5545 요구사항으로 event title을 재사용한다.
- caveat: Google file import의 reminder는 **primary calendar로 import할 때만 신뢰성 있게 반영**되고, secondary calendar는 silent drop된다. UI 추가 경고는 두지 않으며(공유 캘린더 경고 모달이 export 게이트로 충분), 사용자는 import 실패 시 이 문서를 참조한다.
- 음수 정수가 아닌 `minutesBefore`(0/양수/소수/NaN)는 ICS writer 단에서 silent skip한다. raw → normalized 단계에서 `reminder-unsupported` warning을 emit한다(후속 작업, #13).

### 구현됨

- `recurringUuid → RECURRENCE-ID`: issue #14. 수정된 반복 instance를 master와 동일 UID로 묶고 `originalStartAt`(raw `recurStartAt`)을 master DTSTART의 VALUE/TZID로 포맷해 `RECURRENCE-ID`를 emit한다. master가 같은 export(range filter 이후 set)에 없거나 애매하면 단발 UID 유지 + `recurrence-override-orphaned` warning으로 fallback(data-loss 0). 실데이터 의미론(어떤 값이 master/override를 가리키는지)은 별도 후속으로 검증한다.

### 의도적으로 제외 (정책 + Google 모두)

다음은 우리 privacy 정책과 Google file import 동작 양쪽에서 모두 제외된다 — 즉 굳이 넣어도 Google import가 drop한다.

| Field | 제외 이유 |
| --- | --- |
| attendees | privacy 정책상 personal data 제외(`participant-omitted`), Google file import도 attendee를 반영하지 않음 |
| attachment / files | v1 binary export 범위 밖(`attachment-omitted`), Google file import도 첨부를 반영하지 않음 |
| per-event color | per-event color는 Google file import에서 반영되지 않음 |
| CONFERENCE | conferencing data는 file import 경로에서 생성되지 않음 |

## Gap table — raw → normalized → `ICS`

`RawTimeTreeEvent` field → `NormalizedCalendarEvent` → `ICS` property와 처리(emit / remap / drop)를 한눈에 본다.

| Raw TimeTree field | NormalizedCalendarEvent | ICS property | 처리 |
| --- | --- | --- | --- |
| `id` | `uid`, `source.eventId` | `UID` | emit |
| `title` | `title` | `SUMMARY` | emit (empty면 placeholder + `title-empty`) |
| `note` | `description` | `DESCRIPTION` | emit (라벨/링크 mirror line 추가) |
| `location` | `location` | `LOCATION` | emit |
| `url` | `url` | `URL` + `DESCRIPTION`의 `링크:` | emit + mirror |
| `labelId` (+ labels) | `labels` | `CATEGORIES` + `DESCRIPTION`의 `라벨:` | emit + mirror |
| `allDay=true` | `start/end.kind='date'` | `DTSTART;VALUE=DATE`, `DTEND;VALUE=DATE`(exclusive) | emit (timezone-stable) |
| `allDay=false` | `start/end.kind='date-time'` | `DTSTART;TZID=`, `DTEND;TZID=` | emit (IANA `TZID` 필수, 아니면 `timezone-not-iana`) |
| `startTimezone`/`endTimezone` | `timezone` | `TZID` parameter | remap (IANA 검증) |
| `recurrences` (`RRULE`/`RDATE`/`EXDATE`) | `recurrence` | `RRULE`/`RDATE`/`EXDATE` | emit (supported subset만) |
| `recurrences` (`EXRULE`) | `recurrence.exrule` | `EXRULE` | emit (Google은 무시, Apple/Outlook 위해 보존, `recurrence-unsupported` 유지) |
| `alerts` | `reminders` | `VALARM` | emit (`ACTION:DISPLAY`, relative `TRIGGER`) |
| `recurringUuid` | `recurrenceGroupId` | `RECURRENCE-ID` | emit (master 동일 UID 그룹, 부재/애매 시 `recurrence-override-orphaned` fallback) (#14) |
| `recurStartAt` | `originalStartAt` → `recurrenceId` | `RECURRENCE-ID` 값 | emit (master tz/VALUE 타입으로 포맷) (#14) |
| `attendees` | warning만 | — | drop (`participant-omitted`) |
| `attachment` / `files` | warning만 | — | drop (`attachment-omitted`) |
| per-event color | — | — | drop |
| (conferencing) | — | `CONFERENCE` | drop |

## 미검증 항목과 승격 경로

다음 Google import 동작은 아직 직접 import smoke로 검증되지 않은 추론이다. confidence를 표시하고, issue #15(수동 import smoke)에서 실제 import 후 확인되면 "확인된 사실"로 승격한다.

> **2026-06-04 import 검증으로 정리** (research note "실제 import 검증" 참조):
> - `CATEGORIES`/`URL` drop, 비IANA `TZID` 시각 shift(`KST`→UTC fallback) — **확인됨**.
> - `VALARM` "primary 전용" 추론 — **정정**. secondary 캘린더 import에서도 honor(`overrideReminders` popup).
> - `CLASS:PRIVATE`·`STATUS:TENTATIVE`·`TRANSP:TRANSPARENT`도 honor 확인.

| 항목 | 추론 내용 | confidence |
| --- | --- | --- |
| `EXRULE` 위험성 | `EXRULE`이 import를 불안정하게 만들거나 무시된다 | med |
| per-event color / CONFERENCE drop | file import가 두 field를 생성/반영하지 않는다 | med |

승격 기준: issue #15에서 실제 `.ics`를 Google Calendar에 import한 뒤 해당 field의 반영 여부를 캡처/기록하면, 그 항목을 이 표에서 "확인된 매핑 결정"으로 옮긴다.
