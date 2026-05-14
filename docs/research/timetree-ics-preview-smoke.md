# TimeTree ICS preview smoke

결론: **실제 로그인된 TimeTree Web cache에서 읽은 일정 row를 `ICS` preview까지 생성하는 end-to-end smoke가 성공했다.** Raw 일정 값이나 `.ics` file은 저장하지 않았고, count와 structural presence만 확인했다.

## 실행 범위

- 확인일: 2026-05-14
- 대상: 로그인된 TimeTree Web page의 `timetree-sqlite` IndexedDB cache
- 방식: page context에서 read-only IndexedDB open → SQLite bytes 복원 → `events` cursor scan → normalization → `ICS` preview text 생성
- 저장하지 않은 것:
  - raw SQLite file
  - raw event row
  - event title, note, location, participant value
  - cookie, token, CSRF, request/response header
  - HAR
  - 실제 `.ics` file

## 결과 요약

| 항목 | 결과 |
| --- | ---: |
| SQLite block count | 55 |
| SQLite byte size | 225280 |
| raw row count | 17 |
| mapped count | 17 |
| normalized count | 17 |
| failed count | 0 |
| generated `VEVENT` count | 17 |
| `ICS` line count | 130 |

## ICS structural check

| Check | 결과 |
| --- | --- |
| `BEGIN:VCALENDAR` / `END:VCALENDAR` | pass |
| `DTSTART` | pass |
| `DTEND` | pass |
| `TZID` parameter | pass |
| `VALUE=DATE` all-day marker | pass |
| `RRULE` recurrence marker | pass |
| private token-like pattern | not detected |

## Warning summary

| Warning | Count | 처리 |
| --- | ---: | --- |
| `shared-calendar-personal-data` | 15 | raw participant value를 export하지 않음 |

이번 smoke에서 participant-like data가 존재하는 row가 확인됐다. 따라서 v1 export에서 participant, attachment, file, activity/comment를 제외하는 결정은 유지한다.

## 판단

현재 구현 흐름은 실제 page에서 다음 chain을 통과했다.

```text
TimeTree IndexedDB SQLite cache
  -> block reconstruction
  -> SQLite events cursor scan
  -> SQLite row mapper
  -> RawTimeTreeEvent validation
  -> NormalizedCalendarEvent
  -> ICS preview text
```

따라서 다음 구현 단계는 browser extension packaging이 아니라, 먼저 local CLI harness로 export 경로를 재현 가능하게 만드는 것이 적절하다.

## 남은 risk

- `VTIMEZONE` component를 생성하지 않으므로 calendar app별 timezone compatibility smoke가 필요하다.
- 실제 `.ics` file write는 아직 구현하지 않았다.
- CLI가 browser IndexedDB에 접근하는 방식은 Chrome profile/remote debugging/session boundary 설계가 필요하다.
- TimeTree internal SQLite schema는 공식 API가 아니므로 변경 가능성이 있다.
