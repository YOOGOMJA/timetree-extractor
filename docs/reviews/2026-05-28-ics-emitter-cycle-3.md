# ICS emitter review — 2026-05-28 (cycle 3)

Summary: **P0 0건 / P1 0건 / P2 4건 (all CARRIED-OVER cosmetic)**

대상: `src/core/ics.ts`, `src/core/normalize.ts`, `src/core/contracts.ts`.
기준: 2026-05-28 cycle 2 (`docs/reviews/2026-05-28-ics-emitter.md`) + #42 / #43 적용 후. `npm test` 통과 가정으로 진입.

## P0

없음.

## P1

없음.

## P2

이전 cycle에서 P2로 분류된 cosmetic 항목들이 여전히 남아있으나, 모두 이슈 없이 가까운 변경 시 함께 정리 권장.

### Unused warning enum `reminder-unsupported` (CARRIED-OVER → #41 deferred에 종속)
- 위치: `src/core/normalize.ts:10`
- 설명: #41(alerts → reminders normalize wiring)이 deferred되어 있어 enum도 그대로 보존. wiring 결정 시점에 사용처 정해지거나 enum에서 제거.
- **Actionable**: #41 처리 시 동반. 별도 이슈 불요.

### `collectTzids` 정규식 과다 매칭 (CARRIED-OVER)
- 위치: `src/core/ics.ts:57`
- 설명: `/TZID=("[^"]+"|[^;:]+)/i`. 호출 대상이 `recurrenceLines` 결과로 좁혀져 있어 현재는 안전.
- **Actionable**: 코스메틱. 이슈 불요.

### `composeDescription` LF 처리 의도 미주석 (CARRIED-OVER)
- 위치: `src/core/ics.ts:183-185`
- 설명: `\n` join이 `escapeText`에서 `\\n`으로 escape되어 결과는 valid.
- **Actionable**: 코스메틱. 이슈 불요.

### `DTSTAMP` deterministic 의미 doc 부재 (CARRIED-OVER)
- 위치: `src/core/ics.ts:11`
- 설명: `options.now` 1회 산출 후 모든 VEVENT 재사용 — deterministic export. 의도 doc 없음.
- **Actionable**: 코스메틱. 이슈 불요.

## Resolved by cycle 2 (확인됨)

### #42 — `source.originalUrl` 제거 (RESOLVED)
- 검증: `grep -rn "originalUrl" src/ docs/specs/` 결과 0건. `contracts.ts` raw type에도 부재(애초에 raw에 원본 URL이 없으니 dead field였다는 cycle-2 판단 일치). `NormalizedCalendarEvent.source`(`normalize.ts:44-48`)는 `provider` / `eventId` / `calendarId`만 보유. spec(`ics-normalization-contract.md`)에서도 미언급으로 정합.

### #43 — UTC fallback이 RFC 5545 canonical `Z` form으로 emit (RESOLVED)
- 검증: `ics.ts:196-198`의 `isUtcZone`이 `'UTC' | 'Etc/UTC'`를 매칭. `formatDateTimeLine`(`ics.ts:192`)이 UTC zone일 때 `${name}:${formatUtcDateTime(...)}` 즉 `Z` 접미사 form으로 emit하며, `TZID=UTC` parameter는 붙지 않는다. `collectTzids`(`ics.ts:41-42`)는 UTC zone에 대해 VTIMEZONE 컴포넌트도 생성하지 않는다 — RFC 5545 special-case와 일치, redundant 블록 제거.
- residual risk: `Etc/UTC`도 isUtcZone에 포함되므로 사용자가 명시적으로 `Etc/UTC`를 지정했더라도 `Z` form으로 normalize됨. 시각 보존되고 정상 동작하지만 "사용자 입력을 형태 그대로 emit"이 아닌 점은 의도된 trade-off로 판단(canonical form 우선). 추가 finding 없음.

## Must-check 7항목 — 본 cycle 결과

1. **Spec ↔ code 불일치**: `ics-normalization-contract.md:107`이 STANDARD-only VTIMEZONE emit을 명문화(#32). UTC zone 제외 정책은 spec에 미명시이나 RFC 5545 §3.3.5 정합 — spec 보강 권장이나 P2 미만 cosmetic.
2. **Warning surface 완전성**: `NORMALIZATION_WARNING_VALUES`(`normalize.ts:3-12`) = 8종. `reminder-unsupported` 1종만 emit 경로 없음(#41 deferred에 종속). 그 외 7종은 모두 emit 경로 grep으로 확인.
3. **UID 결정성 & ASCII**: `normalize.ts:89`의 `timetree:${calendarId}:${sanitizeUidId(id)}` deterministic. `sanitizeUidId`(`normalize.ts:142-155`) UTF-8 byte를 ASCII printable + percent-encoding. 동일 raw → 동일 UID 보장.
4. **Additive policy**: `ics.ts:163`이 `CATEGORIES:` line emit, `ics.ts:180`의 `composeDescription`이 `라벨:` mirror — keep+mirror 정합. URL도 `ics.ts:162` + `ics.ts:181` 동일.
5. **Recurrence subset enforcement**: `isSupportedRRule`(`normalize.ts:243-253`)이 `DAILY` / `WEEKLY+BYDAY` / `MONTHLY -BYSETPOS`만 허용, 그 외는 event-level fail(`normalize.ts:69-77`). silent emit 없음.
6. **TimeZone 안전성**: `resolveTimezone`(`normalize.ts:125-128`)이 invalid는 UTC로 fallback + `timezone-not-iana` warning. `isValidIanaTimezone`은 offset/GMT prefix도 reject.
7. **v1-export-policy intentional exclusion**: `attendees` → `participant-omitted`, `attachment` / `files` → `attachment-omitted` (`normalize.ts:178-186`). per-event color/conference 필드 자체가 raw에 없음. spec 준수.

## 검토하지 못한 영역

- `test/fixtures.ts` 직접 미열람 (의무 영역 아님).
- Google Calendar가 UTC zone `Z` form을 100% 받아들이는지는 외부 web 차단으로 추론 confidence: high (RFC 5545 canonical이라 거부 가능성 낮음).

## Cycle 결론

신규 actionable finding **0건**. 잔존 항목은 (a) deferred된 #41 + 그에 종속된 `reminder-unsupported` enum, (b) cycle-2 P2 carryover 4건(전부 코스메틱)뿐. #41은 TimeTree alert object의 실제 shape가 결정되지 않아 본 자율 사이클 범위 밖으로 명시 deferred 상태.

자율 사이클 종료 조건 — **actionable이 0인지** 판단: **YES, 0이다.** (deferred #41은 의도된 보류이며 cosmetic P2 carryover는 actionable 이슈가 아니다.)
