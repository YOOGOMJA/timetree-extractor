# ICS emitter review — 2026-05-28 (cycle 2)

Summary: **P0 1건 / P1 2건 / P2 4건**

대상: `src/core/ics.ts`, `src/core/normalize.ts`, `src/core/contracts.ts`.
기준: 2026-05-27 cycle 1 (`docs/reviews/2026-05-27-ics-emitter.md`) + #27/#28/#29/#30/#31/#32 + Codex P2 batch 적용 후.

## P0

### `alerts → VALARM` 경로가 normalize에 미구현 — reminder 전체가 silent drop (NEW)
- 위치: `src/core/normalize.ts:89-109` (NormalizedCalendarEvent 생성 블록, `value.reminders =` 할당 없음), `src/core/ics.ts:274-289` (`createIcsValarmLines`가 항상 빈 배열만 받음)
- 근거 spec: `docs/specs/v1-export-policy.md` §Include — "`alerts` | reminder timing(`minutesBefore`)만 추출해 `VALARM` emit"; `docs/specs/google-calendar-import-field-compat.md` §"alerts → VALARM"
- 설명: `contracts.ts:48`의 `alerts?: unknown[]`은 raw에 존재하나 `normalize.ts`는 alerts를 한 번도 읽지 않는다. 결과적으로 `NormalizedCalendarEvent.reminders`는 영구 `undefined`이고 `ics.ts:275`의 `createIcsValarmLines`는 매번 `return []`로 끝난다. `reminder-unsupported` warning enum이 있지만 emit 경로도 없다. 즉 spec이 "v1 include" 카테고리로 분류한 `alerts`가 **silent drop**되며 사용자는 reminder가 누락된 사실조차 모른다.
- 왜 P0인가: spec이 명시한 v1 include field의 silent data loss. 이전 cycle은 reminder normalize 경로 자체를 검토 영역으로 잡지 못했음(직전 P0가 recurrence였고 reminder는 비-범위로 묵시 처리됨).
- **Tracked**: #41

## P1

### `originalUrl`이 타입에만 있고 normalize에서 미할당 (NEW)
- 위치: `src/core/normalize.ts:48` (타입 선언), `src/core/normalize.ts:95-99` (`source` 객체에 미할당)
- 근거 spec: `docs/specs/ics-normalization-contract.md` §Normalized event — `source.originalUrl?: string`
- 설명: optional 필드라 absence가 contract 위반은 아니지만, 정의되어 있고 호출자가 read해도 항상 undefined인 dead field다. raw에 TimeTree 원본 URL 정보가 없다면 spec에서 제거하는 게 정직하다.
- **Tracked**: #42

### UTC fallback이 `DTSTART;TZID=UTC:...` 형태로 emit됨 (NEW)
- 위치: `src/core/normalize.ts:126-129` (`resolveTimezone`이 fallback으로 'UTC' 반환), `src/core/ics.ts:188`
- 근거 spec: RFC 5545 §3.3.5 — UTC time은 `Z` suffix가 canonical 형식. `docs/specs/google-calendar-import-field-compat.md` §"TZID — valid IANA name 필수"는 IANA fallback 자체는 허용하지만 emit 형식은 침묵.
- 설명: #28로 non-IANA TZID는 UTC로 fallback되는데, 그 결과가 `DTSTART;TZID=UTC:YYYYMMDDTHHMMSS`로 나간다 (Etc/UTC도 IANA 등록명이라 valid는 함). 다만 RFC 5545 canonical form은 `DTSTART:YYYYMMDDTHHMMSSZ`이고, strict parser는 UTC zone에 대해 `Z` form만 받기도 한다(Google 동작은 추론 confidence: med). VTIMEZONE 블록도 `TZID:UTC`로 emit되는데 이는 redundant/atypical하다.
- **Tracked**: #43

## P2

### Unused warning enum 1종 (`reminder-unsupported`) (CARRIED-OVER → P0 결합)
- 위치: `src/core/normalize.ts:10`
- 설명: 이전 cycle은 `comment-omitted` / `label-color-approximation` 두 미사용을 지적했고 #31에서 제거됐다. 그러나 `reminder-unsupported`는 enum에 남아있고 emit 경로 없다. 위 P0 (#41)이 해결되면 함께 정리된다 — 별도 finding 아님.
- **Actionable**: P0 #41과 결합. 별도 이슈 불요.

### `collectTzids` 정규식 과다 매칭 (CARRIED-OVER)
- 위치: `src/core/ics.ts:55`
- 설명: `/TZID=("[^"]+"|[^;:]+)/i`가 호출 대상이 `recurrenceLines` 결과로 좁혀져 있어 현재는 안전. 미래에 다른 line이 흘러들면 false-positive TZID 추출 가능.
- **Actionable**: 코스메틱/하드닝. 이슈 만들지 말고 가까운 RRULE/RDATE 관련 변경 때 같이 고치는 게 적절.

### `composeDescription` LF 처리 의도 미주석 (CARRIED-OVER)
- 위치: `src/core/ics.ts:181-183`
- 설명: `\n` join이 `escapeText`에서 `\\n`으로 변환되므로 결과는 valid. 의도가 코드만 봐선 명확하지 않다.
- **Actionable**: 코스메틱. 이슈 불요.

### `DTSTAMP` deterministic 의미 doc 부재 (CARRIED-OVER)
- 위치: `src/core/ics.ts:11`
- 설명: `options.now` 1회 산출 후 모든 VEVENT 재사용 — RFC 5545 valid + deterministic export 이점이 있는 의도된 결정인데 doc 없음.
- **Actionable**: 코스메틱. 이슈 불요.

## Resolved by previous cycle (확인됨)

- **2026-05-27 P0 (recurrence subset 미강제, unsupported도 silent emit)**: #27에서 `isSupportedRRule`이 `WEEKLY+BYDAY` 강제, `MONTHLY+BYSETPOS` 거부, unsupported는 event-level fail. EXRULE만 의도적 preserve. **RESOLVED**.
- **2026-05-27 P1 (`comment-omitted` / `label-color-approximation` 미emit enum)**: #31에서 둘 다 enum에서 제거. **RESOLVED**.
- **2026-05-27 P1 (invalid TZID이 ICS로 통과)**: #28에서 `resolveTimezone`이 non-IANA를 'UTC'로 fallback. **RESOLVED** (단 위 P1 신규 #43 참조).
- **2026-05-27 P1 (UID ASCII 부재)**: #29에서 `sanitizeUidId` UTF-8 percent-encoding. **RESOLVED**.
- **2026-05-27 P1 (`event.url` 검증 없이 emit)**: #30에서 `normalizeUrl`. **RESOLVED**.
- **2026-05-27 P1 (VTIMEZONE spec ↔ code 불일치)**: #32에서 spec 문구를 STANDARD-only emit으로 갱신. **RESOLVED**.

## 검토하지 못한 영역

- `test/fixtures.ts` 내용은 직접 미확인 — 의무 영역 아님.
- Google Calendar의 실제 `TZID=UTC` 처리 동작은 web 차단으로 추론 confidence: med.
- `recurringUuid → RECURRENCE-ID` (#14)는 별도 이슈로 명시되어 범위 밖.

## Cycle 결론

직전 cycle의 P0 1건 + P1 5건 모두 해소 확인. 신규 P0 1건은 `alerts → reminders` normalize wiring 누락 (#41) — TimeTree alert object의 실제 shape이 결정되어야 안전하게 구현 가능하므로 이번 자율 사이클에서는 deferred. P1 신규 2건(#42 originalUrl, #43 UTC Z form)은 본 사이클에서 구현. P2 carryover 4건은 코스메틱이라 별도 이슈 불요.
