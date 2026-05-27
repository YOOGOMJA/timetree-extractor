# ICS Emitter Review 도구 설계

결론: `src/core/ics.ts` 직렬화 경계가 Google Calendar `.ics` file import와 정합하는지 반복적으로 확인하기 위한 **review 도구 2종**을 만든다 — (1) 판단 영역을 다루는 reviewer subagent, (2) 기계 검증 가능한 항목을 잡는 conformance test. skill은 만들지 않는다.

## 범위와 비-범위

대상은 `NormalizedCalendarEvent → ICS string` 직렬화 경계 한 곳이다 — `src/core/ics.ts`(262 line) + `src/core/normalize.ts`(209 line)의 일부. data source layer(`src/browser/`)와 UI layer(`src/extension/`)는 범위 밖이다.

다음은 의도적으로 범위에서 제외한다.

- CI/PR 자동 실행. 1차에서는 모두 수동 호출.
- ICS file 자체에 대한 fixture 검증. 사용자가 "구조 리뷰"로 명시했다.
- 사용자 전역 skill 승격. 1차에서 재사용 단위는 검증되지 않았다.
- 첨부 binary, attendee, conferencing field 검토. v1 export policy에서 제외 결정됨.

## 참고하는 기존 문서

이 review 도구는 새 spec을 만들지 않고 기존 결정을 검증한다.

- `docs/specs/google-calendar-import-field-compat.md` — additive policy, IANA TZID 요구, EXRULE 보존 결정, intentional exclusion 표. **review 기준의 1순위 source**.
- `docs/specs/ics-normalization-contract.md` — `NormalizedCalendarEvent` shape, mapping rule, `NormalizationWarning` enum, 허용된 recurrence subset, V1 writer 결정. **invariant source**.
- `docs/specs/v1-export-policy.md` — 무엇을 export 대상으로 포함/제외하는지의 raw-side 정책.
- `docs/research/google-calendar-import-field-research.md` — Google file import 동작의 evidence.

이 문서는 위 문서를 **다시 쓰지 않는다.** 다만 위 문서가 침묵하는 cross-cutting 영역(인코딩, line folding, file size, UID 안정성 등)을 보완 reference로 함께 정리한다.

## 산출물 3종

```
.claude/agents/ics-emitter-reviewer.md      # 판단 영역 reviewer subagent 정의
test/core/ics-emit.conformance.test.ts      # 기계 검증 conformance test
docs/specs/ics-emit-cross-cutting-checks.md # cross-cutting reference (기존 spec 보완)
```

`docs/reviews/YYYY-MM-DD-ics-emitter.md`(리뷰 결과)는 호출 시점에 생성되며, 산출물 자체는 아니다.

## 1. Reviewer subagent — 판단 영역만

`.claude/agents/ics-emitter-reviewer.md`. 단일 thorough reviewer 1개. 카테고리별 병렬 fan-out은 surface(2 file, ~470 line)가 좁아 오버헤드만 늘므로 채택하지 않는다.

이 subagent가 다루는 영역은 **judgment가 필요한 항목으로 한정**한다.

| 영역 | 판단의 본질 |
| --- | --- |
| UID 결정성 | `uid`가 source `id`로부터 deterministic하게 파생되는가, 재export 시 동일한가, ASCII subset인가 |
| TZID resolution | `valid IANA?` 검사가 normalize에 있는가, fallback `+0000`이 silent하지 않은가 (`timezone-not-iana` warning과 함께 표면화되는가) |
| Warning surface 완전성 | drop되는 field(attendee, attachment, alarm, color)가 `NORMALIZATION_WARNING_VALUES`에 모두 매핑되는가, silent drop이 있는가 |
| Spec ↔ code 불일치 | `ics-normalization-contract.md`의 "V1에서 VTIMEZONE 생성하지 않는다" vs 실제 `createVtimezoneLines` 구현 같은 명시적 모순 |
| Additive policy 위반 | `CATEGORIES`/`URL` 같이 google이 무시해도 표준 client가 읽는 line을 임의로 제거한 경우 |
| DST 경계 limitation 노출 | STANDARD-only VTIMEZONE이 export 범위가 DST 경계를 넘을 때 silent하게 1시간 어긋남 — 사용자에게 surface되는가 |
| Recurrence subset 강제 | 허용 subset 밖의 RRULE을 받았을 때 fail vs silent emit 동작이 spec과 일치하는가 |

각 finding은 P0/P1/P2 등급 + `file:line` 위치를 포함한다.

이 subagent는 다음을 **하지 않는다**.

- CRLF/UTF-8/line folding의 정적 검사 — conformance test가 한다.
- output size 1MB 초과 검사 — conformance test가 한다.
- RRULE syntax 자체의 wellformedness 검사 — conformance test가 한다.

## 2. Conformance test — 기계 검증 영역

`test/core/ics-emit.conformance.test.ts`. node `node:test`로 실행 가능한 단일 file. fixture는 `test/fixtures/ics-emit-conformance/` 아래에 둔다.

다음 invariant를 매번 fail-fast로 확인한다.

| Invariant | 검증 방법 |
| --- | --- |
| 전체 output이 CRLF 줄바꿈만 사용 | 결과 string에 lone `\n`(앞에 `\r` 없는) 없음 |
| 모든 content line이 75 octet 이하 | `\r\n` split 후 각 줄을 `TextEncoder.encode().byteLength`로 검사. 첫 줄 외에는 leading space(folding continuation) 허용 |
| UTF-8 multi-byte char가 byte 경계에서 깨지지 않음 | folded line을 다시 join → `JSON.parse(JSON.stringify(line))` 또는 `TextDecoder({ fatal: true })`로 strict decode |
| `BEGIN:VCALENDAR` 첫 줄, `END:VCALENDAR` 끝줄, 둘 다 정확히 1회 | regex count |
| `VEVENT` 개수 == input event 개수 | count match |
| 모든 `DTSTART;VALUE=DATE` event는 같은 event의 `DTEND;VALUE=DATE`가 `DTSTART + 1일`(exclusive)임 | date parse + compare |
| `RRULE` line에 `COUNT=`와 `UNTIL=`가 동시에 등장하지 않음 | regex |
| `UID:` value는 ASCII printable subset (`[\x20-\x7E]+`) | regex |
| 출력 byte size <= 900_000(1MB safety margin) | `Buffer.byteLength(output, 'utf8')` |
| `VTIMEZONE` 블록이 emit되는 모든 `TZID`에 대해 정확히 1회 등장 | TZID set vs VTIMEZONE TZID set match |

각 invariant는 독립 test로 작성한다. 어느 하나가 fail해도 다른 invariant 결과를 볼 수 있어야 한다.

Fixture는 다음을 포함한다.

- single event, all-day
- single event, timed with `Asia/Seoul`
- single event, timed with `America/New_York`(DST 경계 미포함)
- recurrence: `FREQ=WEEKLY;BYDAY=MO`
- 한글 `SUMMARY`(75 octet 초과 + multi-byte 경계)
- 라벨 + URL 동반(additive mirror policy 검증)

## 3. Cross-cutting reference

`docs/specs/ics-emit-cross-cutting-checks.md`. 기존 spec이 다루지 않는 cross-cutting 영역만 모은다 — 단 reviewer subagent가 자기 prompt 안에서 직접 인용할 수 있도록 짧게.

수록 내용:

- CRLF / UTF-8 / line folding 요구사항의 출처(RFC 5545 §3.1)와 위반 시 Google Calendar 동작.
- RRULE COUNT+UNTIL 동시 사용 금지(RFC 5545)와 Google import 동작.
- UID 안정성(ASCII subset, deterministic) 권장 이유 — 재import 시 dedup.
- 1MB file size cliff(Google file import의 비공식 한도).
- VTIMEZONE 생성 여부에 대한 현재 implementation의 trade-off — 현재 code가 STANDARD-only로 emit하는 것과 spec 문구의 불일치를 명시.

이 reference는 본 review 도구가 끝나도 별도 의미를 갖는다(향후 다른 PR review에서도 인용 가능).

## 4. 호출 흐름

수동 호출. 사용자가 다음을 입력하면 실행된다.

```
review ICS emitter
```

main agent는 다음을 순차로 한다.

1. `npm run build && node --test dist/test/core/ics-emit.conformance.test.js`로 conformance test 실행 (전체는 `npm test`). fail이면 그 결과를 1차 report로 사용하고 subagent를 띄울지 사용자에게 묻는다.
2. 통과하면 `.claude/agents/ics-emitter-reviewer.md` subagent를 띄워 판단 영역 review.
3. 두 결과를 `docs/reviews/YYYY-MM-DD-ics-emitter.md`로 합치고, 대화창에는 5줄 이내 요약을 출력한다.

대화창 요약 예시:

```
Conformance: 10 pass / 0 fail
Judgment:    P0 1건 · P1 2건 · P2 1건
- src/core/ics.ts:80 — VTIMEZONE 생성이 ics-normalization-contract.md와 모순 (P0)
- src/core/normalize.ts:?? — 'timezone-not-iana' warning 미구현 (P1)
- 전체 리포트: docs/reviews/2026-05-27-ics-emitter.md
```

## 5. RED phase(skill TDD 차용)

subagent 정의를 작성하기 전에 한 번, **naive subagent**(이 design doc도, reference도 못 본 상태)에게 같은 작업을 시켜 결과를 기록한다.

```
prompt: "src/core/ics.ts와 src/core/normalize.ts를 Google Calendar의 .ics file import 호환성 관점에서 리뷰해줘. P0/P1/P2 등급 finding을 file:line과 함께 알려줘."
```

이 baseline에서 무엇을 빠뜨리는지, 무엇을 잘못 잡는지 기록하고, 그 gap이 subagent 정의(`.claude/agents/ics-emitter-reviewer.md`)의 명시적 must-check가 된다. baseline 없이 정의를 쓰면 우리가 가르쳐야 할 것을 추측하게 된다.

## 6. 의도적으로 미루는 결정

- **`docs/reviews/`의 git 추적 여부.** 1차에서는 그냥 commit해서 history로 남긴다. 노이즈가 커지면 `.gitignore`로 옮긴다.
- **conformance test가 `npm test`에 자동 포함되는지.** 1차에서는 `test/core/` 아래라 자동 포함된다. fixture가 늘어 시간 오버헤드가 커지면 별도 npm script로 분리한다.
- **subagent 정의 file format.** Claude Code의 `.claude/agents/<name>.md` 컨벤션을 따른다 — frontmatter(`name`, `description`, `tools`) + body. 정의 작성은 RED phase 이후로 미룬다.

## 7. 성공 기준

- 첫 호출에서 spec ↔ code 불일치(VTIMEZONE 생성)와 conformance invariant 위반(만약 있다면) 둘 다 surface된다.
- 같은 input으로 두 번째 호출 시 같은 finding 집합이 나온다(determinism — conformance test는 당연, judgment subagent는 fixture 변경 없을 시 동일 P0/P1/P2 개수).
- subagent 정의를 수정하지 않고 새 PR diff에 대해서도 의미 있는 review를 낸다(generality 최소 검증).
