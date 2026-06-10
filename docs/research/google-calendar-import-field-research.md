# Google Calendar ICS Import Field Research

결론: Google Calendar의 **파일 import**(Settings → Import & export → Import) 경로는 RFC 5545 `VEVENT`를 읽지만, **honor하는 field가 제한적이고 일부는 조용히 버리거나 파일 전체 import를 깨뜨린다.** 시간/제목/설명/위치/반복은 안정적으로 들어가지만 `CATEGORIES`·`URL`·`CONFERENCE`·per-event color는 UI에 노출되지 않고, `VTIMEZONE` 블록은 무시되며(TZID 문자열을 자체 IANA DB로 재해석), `GEO`의 잘못된 값은 import 자체를 실패시킨다. Google은 file-import field 사양을 공식 문서로 공개하지 않으므로 아래 다수 항목은 **미검증(추론)** 이며 실제 import smoke로 승격이 필요하다.

> 이 문서는 ICS → Google Calendar **import 파일 호환성**을 위한 외부 동작 조사 note다. Google Calendar API 연동/동기화가 아니라, 우리가 내보내는 `.ics` 파일이 Google import에서 어떻게 처리되는지를 다룬다. 이 조사에서 도출한 **확정 매핑 정책은 `docs/specs/google-calendar-import-field-compat.md`**로 정리한다(issue #11). source-side 포함/제외 정책은 기존 `docs/specs/v1-export-policy.md`를 본다.

## 확인일

- 2026-05-25 (공개 source 기반 조사)
- 2026-06-04 (실제 import round-trip 검증 — 아래 "실제 import 검증" 참조)

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

(UTF-8/CRLF/75-octet folding 요구와 ~1MB 파일 크기 한계는 confidence가 med/med-high라 아래 매트릭스·"미검증" 목록에서 다룬다 — 확정 사실로 단정하지 않는다.)

## 실제 import 검증 (2026-06-04)

방법: 실제 TimeTree export(`.ics`, 253 VEVENT)를 Google Calendar 웹 import → Google Calendar API로 read-back해 저장 결과를 round-trip 대조. 단일 실계정 1회, **API read-back = 저장 상태** 기준이므로 UI 표시 세부(autolink 등)는 별도 확인 대상이다. (issue #15)

### Round 1 — 실제 export(253 VEVENT) round-trip

경험적으로 확인된 사실:

- **UID dedup**: export에 동일 UID 2건이 섞여 있었고(별도 exporter 버그 #52), Google이 iCalUID로 **각각 1개만** 등록 → UID 기반 dedup 동작 확인.
- **all-day DTEND exclusive**: 1일/2일 종일 이벤트가 `DTEND = DTSTART + N`로 정확히 N일 배너 → off-by-one 없음.
- **TZID(IANA) 시각 보존**: `TZID=Asia/Seoul` timed event가 KST wall-time 그대로 저장.
- **RRULE 반복 series**: `FREQ=MONTHLY`(+`UNTIL`)가 별도 단발이 아니라 **master 연결 series**(`recurringEventId`)로 전개. `UNTIL` 경계도 정확.
- **RDATE 반복**: RDATE 날짜들이 series instance로 전개·연결(조회 창 내).
- **이벤트 누락 0건**: 253 source 이벤트가 모두 Google에 존재(반복 전개분 제외 1:1).

(이 export는 VALARM·STATUS·CLASS·TRANSP·비IANA TZID를 담지 않아 Round 2 probe로 별도 검증.)

### Round 2 — probe `.ics` (secondary 캘린더 `ics 테스트`)

STATUS/CLASS/TRANSP/VALARM/비IANA TZID/DESCRIPTION을 담은 손제작 probe 9건을 **secondary 캘린더**에 import 후 read-back + UI 육안.

- **VALARM secondary honor (정정)**: secondary import에서도 `TRIGGER:-PT30M`가 `overrideReminders` popup 30m으로 honor. probe 중 VALARM 가진 1건만 reminder 보유 → calendar 기본값 아님. **과거 community의 "secondary drop" 보고와 상반** — 2026 기준 동작이 바뀐 것으로 보인다.
- **CLASS:PRIVATE honor (정정)**: `visibility:private`로 저장. 기존 "parsed-ignored 대체로" 추론을 정정.
- **DESCRIPTION HTML 렌더 (정정)**: `<b>bold</b>`가 UI에서 **굵게 렌더**(literal 아님), bare URL은 autolink(클릭 가능). 기존 "HTML literal" 추론을 정정.
- **STATUS**: `TENTATIVE`→`status:tentative`, `CANCELLED`→read-back 미노출.
- **TRANSP**: `TRANSPARENT`→`transparency:transparent`.
- **비IANA TZID shift**: `TZID=KST`의 12:00이 UTC로 fallback돼 21:00(+09)로 **9시간 shift**, 대조군 `Asia/Seoul`은 정확 → IANA TZID emit 설계의 정당성 실증.
- **CATEGORIES/URL drop**: read-back에 해당 필드 없음.

여전히 미검증 (낮은 우선순위 edge case):

- line folding strictness, ~1MB/event-count 파일 한계의 실제 임계
- `RECURRENCE-ID` (현재 미emit, #14)
- 단일 계정·단일 시점 결과 — Google 동작은 시간에 따라 변할 수 있음(특히 VALARM secondary는 과거 보고와 상반).

## VEVENT property별 honor 매트릭스

honor 표기: **yes** = UI에 노출 / **parsed-ignored** = 읽지만 안 보임 / **breaks** = 파일 import 실패 유발.

| Property | Honored? | UI 노출 | Quirks / 요구사항 | Confidence |
| --- | --- | --- | --- | --- |
| `UID` | yes | 안 보임 | calendar별 dedup→update. 누락 시 재import 중복 | high |
| `SUMMARY` | yes | 제목 | — | high |
| `DESCRIPTION` | yes | 설명란 | bare URL **autolink(클릭 가능)**. **`<b>`/`<i>` 등 기본 HTML은 UI에서 렌더됨**(literal 아님 — 기존 추론 정정). API엔 원문 저장. 줄바꿈 `\n` escape | high |
| `LOCATION` | yes | 위치(지도 링크) | — | high |
| `DTSTART/DTEND;TZID=` | yes | 시간 | VTIMEZONE 무시, TZID 문자열을 IANA로 해석. 비IANA → fallback(UTC) → 시간 오류 (2026-06-04 확인: `TZID=KST` → UTC fallback로 9h shift, `Asia/Seoul`은 정확) | high |
| all-day `;VALUE=DATE` | yes | 종일 배너 | DTEND **exclusive**(start+1). off-by-one 주의. 둘 다 `VALUE=DATE` | high |
| `DTSTART/DTEND` UTC(`Z`) | yes | 뷰어 zone으로 변환 | timed event에서 cross-client 가장 안전. floating(Z·TZID 없음)은 **import 사용자 zone**으로 해석 | high |
| `RRULE` | yes | 반복 series | `UNTIL`은 DTSTART가 zoned/UTC면 **UTC(`...Z`)** 여야 함. 불일치 시 파일 깨질 수 있음 | high |
| `RDATE` | yes | 추가 instance | 2026-06-04 import으로 series instance 전개·연결 확인(조회 창 내) | high |
| `EXDATE` | yes | instance 제거 | 반복 instance의 시각/zone과 정확히 일치해야 취소됨 | med |
| `EXRULE` | parsed-ignored / 위험 | — | RFC 5545 deprecated. **emit 금지** | med |
| `RECURRENCE-ID` | yes(조건부) | 수정된 단일 instance | master VEVENT가 **같은 파일에 있고 UID 동일**할 때만. 단독이면 별 단발 event | med |
| `VALARM` | yes | 알림 | **2026-06-04 secondary 캘린더 import에서도 honor**(`overrideReminders` popup 30m — 과거 community의 "secondary drop" 보고와 상반, 동작 변경된 것으로 보임). `ACTION:DISPLAY`→popup, 상대 `TRIGGER`(`-PT30M`) honor | high (single-account 검증) |
| `ATTENDEE` | parsed-ignored | guest 추가 안 됨 | file import는 guest 미추가·**초대 미발송** | high |
| `ORGANIZER` | parsed-ignored | 안 보임 | import한 사람이 소유자가 됨 | high |
| `STATUS` | yes | CANCELLED 목록 미노출; TENTATIVE 저장 | 2026-06-04 확인: TENTATIVE→`status:tentative`, CANCELLED→read-back 미노출 | high |
| `TRANSP` | yes | 한가함/바쁨(Availability) | `TRANSPARENT`→`transparency:transparent` (2026-06-04 확인) | high |
| `CLASS` | yes | 가시성 | 2026-06-04 확인: `PRIVATE`→`visibility:private` honor (기존 "parsed-ignored 대체로" 추론 정정) | high |
| `CATEGORIES` | parsed-ignored | **드롭** | read-back에 category 필드 없음 (2026-06-04 확인) | high |
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

DESCRIPTION / VALARM(secondary) / STATUS / CLASS / TRANSP / 비IANA TZID는 2026-06-04 Round 2 probe에서 검증돼 위 "실제 import 검증" 섹션으로 이동했다. 남은 미검증 항목:

- `RECURRENCE-ID` 동작 — #14(PR #58)에서 **emit 구현됨**. 실데이터 import 검증은 #59로 분리; 절차는 [recurrence-id-smoke-runbook.md](./recurrence-id-smoke-runbook.md).
- line folding strictness와 ~1MB/event-count 한계의 실제 임계 (의도적 대용량/오folding fixture 필요)

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
