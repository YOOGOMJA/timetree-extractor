# RED baseline — ICS emitter (Google Calendar 호환성)

이 문서는 reviewer subagent 정의(`docs/superpowers/specs/2026-05-27-ics-emitter-review-design.md` §5 RED phase) 이전에, **아무 spec/reference 없이 naive subagent에게 동일 prompt를 줬을 때의 결과**를 verbatim 보존한 것이다. subagent 정의의 must-check를 작성할 때 baseline이 빠뜨린 항목을 명시적으로 박는 근거가 된다.

- 일자: 2026-05-27
- 대상 파일: `src/core/ics.ts`, `src/core/normalize.ts`
- 제약: docs/, test/, 기타 src/ 파일, 외부 web 검색 모두 차단
- Prompt 요지: "Google Calendar `.ics` file import 관점에서 P0/P1/P2 finding을 file:line과 함께"

## Baseline 결과 (verbatim)

### Summary
P0 2건 / P1 6건 / P2 3건

### P0 — Import 실패 또는 데이터 손상

#### 1. All-day DTEND가 exclusive 변환 없이 그대로 방출됨
- 위치: `src/core/normalize.ts:99-102` (`normalizeEnd`), `src/core/ics.ts:186` (`formatDateTimeLine`)
- 설명: `event.endAt`을 그대로 `toUtcDate`로 변환해 `DTEND;VALUE=DATE`를 만든다. RFC 5545에서 `VALUE=DATE`의 DTEND는 비포함(exclusive)이어야 하지만, TimeTree의 `endAt`이 포함(inclusive) 마지막 날인 경우 +1일 보정이 없다. `endAt == startAt`인 1일 이벤트는 `DTSTART == DTEND`가 되어 zero-duration 이벤트가 된다.
- 왜 중요한가: Google Calendar는 `DTSTART == DTEND`인 all-day VEVENT를 사일런트로 누락하거나 0일짜리 이벤트로 표시하며, 멀티데이도 마지막 하루가 잘려 보인다.

#### 2. 잘못된 timezone 식별자가 DTSTART/DTEND에 그대로 출력됨
- 위치: `src/core/normalize.ts:96-97, 101-102` (`normalizeStart`/`normalizeEnd`), `src/core/ics.ts:187`
- 설명: `isValidIanaTimezone`은 `+09:00`, `GMT+9` 같은 offset 식별자를 거부하고 경고를 남기지만, 정규화 결과의 `timezone` 필드는 여전히 원본 문자열을 사용한다. 결과적으로 `DTSTART;TZID=+09:00:...` 같은 라인이 방출되며, `collectTzids`도 이를 받아 잘못된 VTIMEZONE을 생성한다(`Intl.DateTimeFormat`이 throw → 폴백 `+0000`).
- 왜 중요한가: Google import는 알 수 없는 TZID를 만나면 floating time으로 처리하거나 UTC로 강제 변환해 시간대가 어긋난다. 경고는 남지만 사일런트 데이터 손상이다.

### P1 — 정확성/호환성 저하

#### 3. RRULE의 `UNTIL` 값이 형식 점검 없이 통과됨
- 위치: `src/core/ics.ts:194-206` (`formatRecurrenceLines` / `formatRuleLine`), `src/core/normalize.ts:146-161`
- 설명: 원본 `RRULE:` 문자열을 그대로 방출한다. RFC 5545는 zoned DTSTART일 때 `UNTIL`이 UTC(Z 접미사) 형식이어야 한다고 규정한다. TimeTree가 floating 또는 zoned `UNTIL`을 보내면 그대로 통과된다.
- 왜 중요한가: Google import는 형식이 맞지 않는 `UNTIL`을 만나면 해당 VEVENT를 통째로 누락하는 경우가 있다.

#### 4. RDATE/EXDATE에 TZID 자동 부여 없음
- 위치: `src/core/ics.ts:194-206`, `src/core/normalize.ts:150-156`
- 설명: 이벤트 DTSTART가 `TZID=...` 형태인데 RDATE/EXDATE는 원본에 TZID가 없으면 그대로 출력된다(`RDATE:20250115T090000`). RFC는 동일 TZID를 요구한다.
- 왜 중요한가: Google은 TZID 누락 RDATE를 floating으로 해석해 다른 시간대 사용자에게 시각이 어긋나 표시된다.

#### 5. VTIMEZONE이 DST를 모델링하지 못함
- 위치: `src/core/ics.ts:80-94` (`createVtimezoneLines`)
- 설명: 단일 STANDARD 컴포넌트만 방출하며 첫 이벤트 기준 오프셋을 고정한다. 코드 주석에서도 인지된 한계.
- 왜 중요한가: Google import는 VTIMEZONE을 신뢰하므로, DST 경계를 건너는 이벤트는 1시간 어긋난다(예: America/New_York 1월/7월 혼재 캘린더).

#### 6. `event.url` 값이 검증·정제 없이 출력됨
- 위치: `src/core/ics.ts:160`
- 설명: `URL:${event.url}`로 직접 삽입한다. URL은 URI 값이라 escapeText 미적용이 맞지만, 개행/제어문자가 섞이면 라인 구조가 깨진다(TimeTree 원본은 자유 입력 가능성).
- 왜 중요한가: 잘못된 URL 한 줄이 이후 모든 properties를 깨뜨려 import 실패의 트리거가 된다.

#### 7. STANDARD-only VTIMEZONE의 `TZNAME`으로 offset 문자열을 사용함
- 위치: `src/core/ics.ts:137-140` (`resolveTimezoneShortName`)
- 설명: Intl이 `GMT+9`만 반환할 때 폴백으로 `-0500` 같은 raw offset을 TZNAME으로 넣는다. RFC는 TZNAME을 텍스트 라벨로 정의한다.
- 왜 중요한가: Google은 TZID를 우선 신뢰해 import 자체는 가능하지만, 일부 파서가 TZNAME 파싱에서 거부할 수 있고, 표시명도 비정상적이다.

#### 8. `collectTzids`가 TZID에서 `=`을 포함한 값을 잘못 잘라낼 수 있음
- 위치: `src/core/ics.ts:55`
- 설명: 정규식 `/TZID=("[^"]+"|[^;:]+)/i`은 unquoted 값에서 `;`/`:`만 종료자로 보므로 OK이지만, `RRULE:...;TZID=...;BYDAY=...` 같은 케이스를 가정한 것이며 실제로 RFC는 RRULE에 TZID 파라미터를 허용하지 않는다. 잘못된 입력이 들어오면 의도치 않은 VTIMEZONE이 생성된다.
- 왜 중요한가: VTIMEZONE이 추가되면 Google이 해당 TZID를 신뢰하게 되어 잘못된 오프셋이 적용된다.

### P2 — 마이너

#### 9. `composeDescription`이 LF만 사용 후 escapeText 의존
- 위치: `src/core/ics.ts:181-182`
- 설명: `'\n'` 결합 후 `escapeText`가 `\n`을 `\n`(리터럴)로 변환하므로 동작은 맞지만, base description에 이미 CRLF가 포함된 경우 `\r`가 제거되며 메시지 라인 구조에 의존한다.

#### 10. DTSTAMP가 모든 이벤트에 동일
- 위치: `src/core/ics.ts:11, 26, 151`
- 설명: 모든 VEVENT가 같은 `DTSTAMP`. RFC 준수상 문제는 없지만 변경 추적이 어렵다. Google import에는 영향 없음.

#### 11. PRODID에 escapeText 적용
- 위치: `src/core/ics.ts:15`
- 설명: PRODID는 TEXT 값이라 허용되지만 디폴트 PRODID에는 escape 대상 문자가 없어 무의미하다.

### Limitations of this review (baseline subagent 본인 자기 boundary 인식)
- `contracts.ts`(특히 `RawTimeTreeEvent.endAt`이 inclusive인지 exclusive인지)와 테스트 파일을 읽지 못해 **P0 #1의 실제 발현 여부**(off-by-one)를 데이터로 확정하지 못했다. 어느 쪽이든 emitter 측에 보정/검증이 없는 것은 사실.
- TimeTree가 실제로 보내는 RRULE/RDATE/EXDATE 문자열의 정확한 형식(특히 `UNTIL` 시간대, RDATE TZID 동반 여부)을 확인할 수 없어 P1 #3, #4는 코드 경로상 가능한 시나리오로 판단했다.
- `docs/specs/v1-export-policy.md` 등 정책 문서를 읽지 않았으므로 EXRULE 유지·DESCRIPTION 미러링 등은 의도된 정책으로 가정해 review 대상에서 제외했다.
- Google Calendar import의 정확한 거부/완화 동작은 외부 검색이 막혀 RFC 5545와 일반적 호환성 지식을 근거로 추론했다.

---

## Gap 분석 (baseline이 design doc의 judgment 영역 대비 누락/적중)

design doc `§3 / §1 reviewer subagent`의 명시 judgment 영역 7개와 비교한다.

| Design doc judgment 영역 | Baseline 결과 | 평가 |
| --- | --- | --- |
| UID 결정성 / ASCII subset | 언급 없음 | **누락**. spec 접근 없이도 잡을 수 있는 영역인데 못 잡음 |
| TZID IANA validity + warning surface | P0 #2 | 적중 (강하게) |
| Warning surface 완전성 (attendee/attachment/alarm/color) | 언급 없음 | **누락**. spec 없이는 무엇이 drop되는지 모름 |
| Spec ↔ code 불일치 (VTIMEZONE 생성) | 언급 없음 | **누락 (예상됨)**. spec 차단으로 구조적으로 발견 불가. baseline이 Limitations에 인지 |
| Additive policy 위반 (CATEGORIES/URL keep+mirror) | 언급 없음 | **누락 (예상됨)**. spec 차단으로 발견 불가 |
| STANDARD-only VTIMEZONE DST limitation surface | P1 #5 | 적중 |
| Recurrence subset 강제 | 부분 (P1 #3, #4) | **부분 적중**. UNTIL/TZID는 잡았지만 "허용 subset 외 RRULE은 fail해야 한다" 정책 자체는 모름 |

추가로, baseline이 잡은 design doc에 명시되지 않은 finding:
- P0 #1 — all-day DTEND off-by-one (conformance test §2의 invariant "all-day DTEND = start+1일"이 커버)
- P1 #6 — `event.url`에 제어문자/개행 위험 (conformance test 추가 invariant 후보)
- P1 #7 — TZNAME으로 offset 문자열 사용
- P1 #8 — `collectTzids` 정규식 과매칭

## subagent 정의에 반영해야 할 must-check (#22 GREEN 단계 입력)

baseline이 **누락한** 영역과 **존재하지만 spec 없이는 도달 불가능한** 영역을 명시적으로 박는다:

1. `NORMALIZATION_WARNING_VALUES` enum의 각 warning이 코드에서 emit되는지 매핑 확인 — `participant-omitted`, `attachment-omitted`, `comment-omitted`, `label-color-approximation` 누락 검출
2. UID가 `RawTimeTreeEvent.id`에서 deterministic하게 파생되는지 + ASCII-only인지 검증
3. `docs/specs/google-calendar-import-field-compat.md`의 "intentional exclusion" 표와 코드의 drop 지점이 일치하는지 cross-check
4. `docs/specs/ics-normalization-contract.md`의 V1 writer 결정과 코드 동작 cross-check (특히 "VTIMEZONE은 v1에서 생성하지 않는다" 문구 vs `createVtimezoneLines` 실재)
5. `composeDescription`의 `라벨:` / `링크:` mirror가 동일 정보를 `CATEGORIES` / `URL` line에도 동시에 emit하는지 (additive policy 위반 검출)
6. recurrence subset 정책: `RRULE:FREQ=DAILY`, `FREQ=WEEKLY+BYDAY`, `FREQ=MONTHLY` 외 입력 시 fail 경로 존재 여부

baseline이 이미 잘 잡는 영역(TZID validity, DTEND off-by-one 등)은 subagent 정의에서도 유지하되, conformance test가 같은 영역을 강제하므로 subagent는 "현재 코드 경로상 가능한 회귀"에 집중하도록 framing한다.
