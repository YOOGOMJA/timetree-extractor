# Google Calendar ICS Import Field Research

결론: Google Calendar의 **파일 import**(Settings → Import & export → Import) 경로는 RFC 5545 `VEVENT`를 읽지만, **honor하는 field가 제한적이고 일부는 조용히 버리거나 파일 전체 import를 깨뜨린다.** 시간/제목/설명/위치/반복은 안정적으로 들어가지만 `CATEGORIES`·`URL`·`CONFERENCE`·per-event color는 UI에 노출되지 않고, `VTIMEZONE` 블록은 무시되며(TZID 문자열을 자체 IANA DB로 재해석), `GEO`의 잘못된 값은 import 자체를 실패시킨다. Google은 file-import field 사양을 공식 문서로 공개하지 않으므로 아래 다수 항목은 **미검증(추론)** 이며 실제 import smoke로 승격이 필요하다.

> 이 문서는 ICS → Google Calendar **import 파일 호환성**을 위한 외부 동작 조사 note다. Google Calendar API 연동/동기화가 아니라, 우리가 내보내는 `.ics` 파일이 Google import에서 어떻게 처리되는지를 다룬다. 이 조사에서 도출한 **확정 매핑 정책은 별도 spec으로 분리 예정**이다(issue #11 / PR #17 — `docs/specs/google-calendar-import-field-compat.md`, 머지 전까지 본 저장소에 없음). source-side 포함/제외 정책은 기존 `docs/specs/v1-export-policy.md`를 본다.

## 확인일

- 2026-05-25

## 조사 방법과 한계

- 근거: Google Calendar Help/Community thread, RFC 5545 / RFC 7986, ical-generator·gcalcli 등 공개 engineering source.
- **중요 한계 1**: Google은 *file import*가 어떤 field를 honor하는지 공식 field-level 명세를 공개하지 않는다. 따라서 high 외 항목은 community 보고 + RFC 기반 **추론**이다.
- **중요 한계 2**: Google Calendar API의 `events.import` 동작("guest/conference data는 import하지 않음" 등)과 *file import*는 같지 않을 수 있다. 겹치는 부분만 high로 본다.
- **중요 한계 3**: Google의 import 동작은 시간에 따라 바뀐다. med 이하 항목은 **수동 import smoke로 재확인** 후 spec에 "확인된 사실"로 옮긴다.

## 핵심 판단 (확인된 사실 / high confidence)

- **UID 기반 dedup**: 같은 calendar에 같은 `UID`를 다시 import하면 기존 event를 **update**(중복 생성 X). 다른 calendar로 넣으면 별도 복사본 생성(UID는 calendar별 scope). `UID`가 없거나 깨지면 Google이 새로 발급 → 재import마다 중복.
- **VTIMEZONE 무시**: Google은 `VTIMEZONE` component를 신뢰하지 않고 `TZID` 문자열을 자체 IANA DB로 해석한다. 따라서 단일 STANDARD-only VTIMEZONE의 DST 한계는 **Google 한정으로는 무의미**하고, 진짜 위험은 **TZID이 IANA 이름이 아닐 때**(예: `KST`, Windows `"Korea Standard Time"`) → fallback으로 시간이 틀어짐.
- **all-day DTEND는 exclusive**: 단일 날짜 all-day는 `DTEND = DTSTART + 1일`이어야 한다. inclusive로 넣으면 하루 길어지고, `DTEND=DTSTART`면 0일/이상 span.
- **GEO 파손**: `GEO:null;null` 같은 잘못된 값은 **파일 전체 import를 실패**시킨다(generic "couldn't import"). 유효 좌표 없으면 **emit 금지**.
- **파일 제약**: UTF-8 + CRLF + 75-octet folding 필요. Google은 Apple/Outlook보다 folding/CRLF에 **엄격**. 파일 크기 대략 ~1MB 한계, 수천 event는 timeout/실패 가능.

## VEVENT property별 honor 매트릭스

honor 표기: **yes** = UI에 노출 / **parsed-ignored** = 읽지만 안 보임 / **breaks** = 파일 import 실패 유발.

| Property | Honored? | UI 노출 | Quirks / 요구사항 | Confidence |
| --- | --- | --- | --- | --- |
| `UID` | yes | 안 보임 | calendar별 dedup→update. 누락 시 재import 중복 | high |
| `SUMMARY` | yes | 제목 | — | high |
| `DESCRIPTION` | yes | 설명란 | **plain text 취급.** bare URL은 autolink, HTML 태그는 literal로 노출. 줄바꿈은 `\n` escape | med |
| `LOCATION` | yes | 위치(지도 링크) | — | high |
| `DTSTART/DTEND;TZID=` | yes | 시간 | VTIMEZONE 무시, TZID 문자열을 IANA로 해석. 비IANA → fallback(보통 UTC) → 시간 오류 | high |
| all-day `;VALUE=DATE` | yes | 종일 배너 | DTEND **exclusive**(start+1). off-by-one 주의. 둘 다 `VALUE=DATE` | high |
| `DTSTART/DTEND` UTC(`Z`) | yes | 뷰어 zone으로 변환 | timed event에서 cross-client 가장 안전. floating(Z·TZID 없음)은 **import 사용자 zone**으로 해석 | high |
| `RRULE` | yes | 반복 series | `UNTIL`은 DTSTART가 zoned/UTC면 **UTC(`...Z`)** 여야 함. 불일치 시 파일 깨질 수 있음 | high |
| `RDATE` | yes(parsed) | 추가 instance | RRULE보다 덜 검증됨, 대체로 honor | med |
| `EXDATE` | yes | instance 제거 | 반복 instance의 시각/zone과 정확히 일치해야 취소됨 | med |
| `EXRULE` | parsed-ignored / 위험 | — | RFC 5545 deprecated. **emit 금지** | med |
| `RECURRENCE-ID` | yes(조건부) | 수정된 단일 instance | master VEVENT가 **같은 파일에 있고 UID 동일**할 때만. 단독이면 별 단발 event | med |
| `VALARM` | yes(큰 단서) | 알림 | **primary calendar로 import할 때만 반영**, secondary calendar는 조용히 드롭. `ACTION:DISPLAY`→popup, `EMAIL`→email, `AUDIO`→popup으로 강등. 상대 `TRIGGER`(`-PT30M`) honor | med-high |
| `ATTENDEE` | parsed-ignored | guest 추가 안 됨 | file import는 guest 미추가·**초대 미발송** | high |
| `ORGANIZER` | parsed-ignored | 안 보임 | import한 사람이 소유자가 됨 | high |
| `STATUS` | partial | CANCELLED 숨김/삭제; CONFIRMED/TENTATIVE 모두 정상 표시 | TENTATIVE 시각 구분 없음 | med |
| `TRANSP` | yes | 한가함/바쁨(Availability) | `TRANSPARENT`→Free, `OPAQUE`→Busy | med |
| `CLASS` | parsed-ignored(대체로) | calendar 기본 가시성 | PUBLIC/PRIVATE 반영 드묾 | low-med |
| `CATEGORIES` | parsed-ignored | **드롭(어디에도 안 뜸)** | Google에 category/tag 개념 없음 | med-high |
| color / per-event color | **no** | — | ICS로 Google event 색 지정 불가(수동 설정뿐) | high |
| `URL`(RFC 7986/5545) | parsed-ignored | field로 안 보임 | 링크는 DESCRIPTION에 넣어 autolink | med |
| `CONFERENCE`(RFC 7986) | parsed-ignored | Meet/회의 정보 없음 | conference data 미import | high |
| `ATTACH` | parsed-ignored | 드롭 | 첨부 binary/URL 미import | med |
| `GEO` | **breaks** on bad value | — | `null;null` 등 → 파일 전체 실패. 유효 `lat;lon`만, 그래도 노출 X. **무효면 omit** | high |
| `PRIORITY` | parsed-ignored | — | UI 없음 | med |
| `X-` 사용자 property | parsed-ignored | — | 대체로 허용·드롭. 깨진 X-line은 strict parser 걸림 가능 | med |
| `VERSION` | required | — | `2.0` | high |
| `PRODID` | required-ish | — | 유효 PRODID 포함. header 깨지면 reject 사례 | med |
| `METHOD` | tolerant | — | import은 `PUBLISH`. `REQUEST`는 초대 의미라 부적합 | med |
| `CALSCALE` | yes | — | `GREGORIAN` | high |
| line folding / CRLF | strict-ish | — | CRLF + 75-octet. bare LF/잘못된 folding은 실패 유발 | med |
| 파일 크기/개수 | hard limit | — | ~1MB, 수천 event는 timeout/실패. UTF-8 필수 | med-high |

## 미검증 — 수동 import smoke로 확인 필요

다음은 confidence가 med 이하라 spec에서 "확정"으로 쓰기 전 실제 Google import 테스트가 필요하다:

- `DESCRIPTION`의 bare-URL autolink / HTML literal 처리
- `VALARM`이 secondary calendar import에서 드롭되는지 (2026 기준 재확인)
- `STATUS:TENTATIVE` / `CLASS` / `TRANSP`의 UI 반영
- `RDATE`/`RECURRENCE-ID` 동작
- line folding strictness와 ~1MB/event-count 한계의 실제 임계

## Sources

- Import events to Google Calendar — https://support.google.com/calendar/answer/37118
- Reminders/alarms not imported to non-default calendar — https://support.google.com/calendar/thread/197942453
- Google ignores alarms/notifications in events — https://support.google.com/calendar/thread/9627602
- Re-import same ICS / duplicate behavior — https://support.google.com/calendar/thread/170250825
- Import should update existing events based on UID/SEQUENCE (gcalcli #784) — https://github.com/insanum/gcalcli/issues/784
- Events: import — Google Calendar API reference — https://developers.google.com/workspace/calendar/api/v3/reference/events/import
- GEO field can break Google Calendar import (ical-generator #618) — https://github.com/sebbo2002/ical-generator/issues/618
- ICS timezone errors (TZID/VTIMEZONE) — https://correctics.com/help/ics-timezone-errors-tzid-vtimezone/
- ICS timezone wrong in Google Calendar — https://synara.events/articles/ics-timezone-wrong-in-google-calendar-why-events-shift-and-how-to-fix-it
