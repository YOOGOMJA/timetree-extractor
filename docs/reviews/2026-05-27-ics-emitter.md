# ICS emitter review — 2026-05-27 (첫 demo)

본 문서는 `.claude/agents/ics-emitter-reviewer.md`(issue #22)를 새로 정의한 직후, 동일 코드 surface에 대해 subagent를 1회 실행한 **GREEN/REFACTOR 단계 결과**다.

- 대상: `src/core/ics.ts`, `src/core/normalize.ts`, `src/core/contracts.ts`
- 비교 기준: `docs/reviews/2026-05-27-red-baseline-ics-emitter.md` (naive subagent baseline)
- 평가 목적: subagent 정의가 baseline의 누락 영역(UID 결정성/ASCII, warning surface 완전성, spec ↔ code 불일치, additive policy, recurrence subset enforcement)을 메우는지 확인

Summary: **P0 1건 / P1 5건 / P2 3건**

## P0

### Recurrence subset 밖 규칙도 그대로 emit됨 (silent data loss 위험)
- 위치: `src/core/normalize.ts:146-161`, `src/core/ics.ts:194-201`
- 근거 spec: `docs/specs/ics-normalization-contract.md` §"Initial recurrence subset" — "지원하지 않는 recurrence는 `recurrence-unsupported` warning과 함께 해당 event의 `ICS` export를 fail 처리한다."
- 설명: `normalizeRecurrences`는 unsupported RRULE/EXRULE/unknown rule을 만나면 `recurrence-unsupported` warning만 push하고 그 rule을 그대로 `recurrence.rrule[]`/`exrule[]`에 보존한다. `ics.ts`는 이 배열을 그대로 `formatRecurrenceLines`로 emit한다. spec이 요구하는 "event export fail" 경로가 존재하지 않는다. 또 `isSupportedRRule`이 `startsWith('RRULE:FREQ=WEEKLY')`만 보므로 spec이 명시한 `WEEKLY+BYDAY` 제약을 강제하지 않고, `MONTHLY;BYDAY;BYSETPOS=-1` 같은 비기본 패턴도 supported로 분류된다.
- 왜 P0인가: silent data loss. Google file import가 거부할 수 있는 RRULE이 warning만 남기고 ICS에 그대로 들어가, 사용자는 일정이 빠졌는지 모른 채 import한다. EXRULE은 spec(`v1-export-policy.md` "보존")에 의해 의도된 유지가 맞지만, **나머지 unsupported RRULE/unknown rule은 spec 요구사항(fail)과 직접 충돌**한다.

## P1

### Enum 정의는 있지만 emit 경로가 없는 warning 2종
- 위치: `src/core/normalize.ts:3-12`
- 근거 spec: `docs/specs/ics-normalization-contract.md` §"Normalized event" (`NormalizationWarning` union), `docs/specs/v1-export-policy.md` §"Exclude with warning" (`comment-omitted`)
- 설명: `comment-omitted`, `label-color-approximation` 두 값이 `NORMALIZATION_WARNING_VALUES`에는 선언돼 있지만 코드 어디에서도 push되지 않는다. activity/comment는 raw에 들어오지 않으니 `comment-omitted`는 "raw 단계에서 이미 drop된다" 정책상 정상일 수 있으나 spec은 normalize layer에서도 surface하라고 명시한다. `label-color-approximation`은 normalize가 label name만 보고 color는 무시(정상)하므로 emit 자체가 빠진 상태.
- 영향: warning surface 완전성 깨짐. 사용자가 export warning만 보고 "comment/color 누락 사실"을 알 수 없다.

### Invalid TZID가 ICS에 그대로 흘러나감 (RED baseline P0 #2 잔존)
- 위치: `src/core/normalize.ts:115-119`, `src/core/ics.ts:187`
- 근거 spec: `google-calendar-import-field-compat.md` §"TZID — valid IANA name 필수"
- 설명: `collectWarnings`가 non-IANA tz를 발견해도 `timezone-not-iana` warning만 push하고 `normalizeStart/End`는 raw timezone 문자열을 그대로 `NormalizedDateTime.timezone`에 채운다. `formatDateTimeLine`은 `DTSTART;TZID=<invalid>` 형태로 그대로 emit. spec은 "valid IANA name 필수"라고 못박았는데 fallback/fail 경로가 없다.
- 권장: warning과 별도로 normalize 단계에서 (a) event-level fail 또는 (b) `UTC`로 fallback + warning 강화 중 하나의 명시 경로가 필요.

### UID ASCII 보장 부재 — TimeTree `id`에 non-ASCII가 섞이면 `UID` line 깨짐
- 위치: `src/core/normalize.ts:72`, `src/core/ics.ts:150`
- 근거 spec: `docs/specs/ics-emit-cross-cutting-checks.md` §5 (cross-cutting reference)
- 설명: `uid = timetree:${calendarId}:${event.id}`로 deterministic하지만, `event.id`는 `contracts.ts:34`에서 `string` (서버측 식별자, 일반적으로 base62이지만 contract상 ASCII 보장 없음). `escapeText`는 backslash/쉼표/세미콜론만 escape할 뿐 ASCII coerce 없음. conformance test가 fixture 입력에 한해서만 검증하므로 negative case는 reviewer 영역.
- 권장: normalize에서 non-ASCII char를 base16/percent로 sanitize하고 warning 추가, 또는 RFC 5545 §3.8.4.7가 허용하는 ASCII subset으로 정규화.

### `event.url` 유효성 검증 없이 그대로 emit
- 위치: `src/core/normalize.ts:87`, `src/core/ics.ts:160`
- 근거 spec: `ics-normalization-contract.md` §"Mapping rules" — "URL string 검증 후 보존"
- 설명: contract는 "검증 후 보존"이라 적었지만 `if (event.url) value.url = event.url`로 끝. `ics.ts`도 `escapeText` 없이 `URL:${event.url}`. 콜론/줄바꿈/세미콜론이 섞이면 ICS line이 깨진다(escapeText는 다른 line에 모두 적용되는데 URL만 빠짐).
- 권장: `new URL()` 검증 + 실패 시 drop + warning.

### Spec 문구 ↔ 코드 불일치: `VTIMEZONE` "v1에서는 생성하지 않는다"
- 위치: `src/core/ics.ts:20-23, 80-94`, spec `docs/specs/ics-normalization-contract.md:98`
- 설명: spec은 "VTIMEZONE: v1에서는 생성하지 않는다"고 적혀 있으나 코드는 STANDARD-only VTIMEZONE을 emit한다. agent definition 안내(issue #5 / commit `4143355`의 의도된 결정) 그대로 — 코드 결정이 맞고 spec 문구가 stale.
- 권장: `ics-normalization-contract.md` "V1 writer decision"과 `v1-export-policy.md` "ICS writer policy"를 STANDARD-only VTIMEZONE을 기술하도록 동기화.

## P2

### `collectTzids` 정규식 과다 매칭
- 위치: `src/core/ics.ts:55`
- 설명: `/TZID=("[^"]+"|[^;:]+)/i`는 `DESCRIPTION:...TZID=Foo` 같은 본문에도 hit한다. 현재 호출처가 `recurrenceLines`만이라 실위험은 낮지만, future에 line 종류가 늘면 false-positive TZID로 VTIMEZONE이 생성된다. (RED baseline P1과 일치, 미해결.)
- 권장: line이 `RRULE/RDATE/EXRULE/EXDATE`로 시작하는지 확인 후 parameter 영역만 스캔.

### `composeDescription`이 LF만 사용 — `escapeText`가 변환하지만 의도 명시 필요
- 위치: `src/core/ics.ts:181-182`
- 설명: `\n`으로 join하고 `escapeText`가 `\\n`으로 변환하므로 결과 자체는 valid. 다만 의도가 코드만 봐선 명확하지 않다. (RED baseline P2와 일치.)
- 권장: 1줄 주석으로 "LF는 escapeText에서 `\\n`으로 변환됨" 명시.

### `DTSTAMP`가 모든 event에 동일
- 위치: `src/core/ics.ts:11, 26, 151`
- 설명: `options.now ?? new Date()`를 calendar 생성 시점 1번 산출해 모든 VEVENT에 재사용. RFC 5545상 valid하고 deterministic export 관점에서 오히려 바람직하지만, "현재 시각"의 의미와 다르므로 `options.now` 의미를 doc하면 좋다.

## 검토하지 못한 영역

- `test/fixtures.ts` 내용 직접 미확인 (agent 정의가 입력 리스트에는 두었으나 reviewer 본문 의무 항목은 spec ↔ code 매칭이라 우선순위에서 보류).
- Google Calendar의 실제 import 거부 동작은 외부 web 차단으로 추론 confidence: med.
- VALARM(`#13`) / RECURRENCE-ID(`#14`)는 별도 이슈로 명시되어 본 리뷰 범위 밖.

---

## RED baseline 대비 평가 (GREEN/REFACTOR 검증)

subagent 정의가 baseline의 누락 영역을 메웠는지 항목별 평가:

| Baseline gap | 본 리뷰에서 처리 | 평가 |
| --- | --- | --- |
| UID 결정성 / ASCII subset | P1로 명시 — UID ASCII 보장 부재 | ✅ 메움 |
| Warning surface 완전성 | P1로 명시 — `comment-omitted`/`label-color-approximation` 미emit | ✅ 메움 |
| Spec ↔ code 불일치 (VTIMEZONE) | P1로 명시, P0 오탐 회피 | ✅ trap 가이드 준수 |
| Additive policy 위반 검출 | finding 없음 (검사했으나 위반 없음) | ✅ 검사 수행 |
| Recurrence subset enforcement | **P0로 신규 발견** | ✅ 메움 (baseline 완전 누락) |

추가로, baseline이 P0로 분류했던 두 항목을 본 리뷰는 의도된 코드 결정으로 판단하여 finding에서 제외하거나 P1로 강등:
- **All-day DTEND off-by-one**: baseline P0 → 본 리뷰는 fixture가 `endAt = startAt + 1일`(`fixtures.ts:40-50`)로 이미 exclusive인 경우라 코드 자체 결함이 아님을 conformance test 통과로 확인. 본 리뷰 finding에서 제외.
- **VTIMEZONE STANDARD-only DST 한계**: baseline P1 → 본 리뷰는 코드 주석에서 의도된 한계임을 확인하고 finding에서 제외 (별도 issue #5의 후속 작업이 적절).

REFACTOR 결론: agent 정의가 의도한 must-check 7개 영역을 모두 다루며, baseline이 spec 차단으로 도달 불가했던 영역(VTIMEZONE 불일치 인지, warning enum 미사용, recurrence fail 정책 부재)을 채운다. 추가 iteration 불요.
