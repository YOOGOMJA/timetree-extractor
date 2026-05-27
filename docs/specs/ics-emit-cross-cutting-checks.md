# ICS emit cross-cutting checks

결론: `ICS` writer를 검토할 때 기존 mapping spec(`google-calendar-import-field-compat.md`)·normalization contract(`ics-normalization-contract.md`)·export policy(`v1-export-policy.md`)가 침묵하는 cross-cutting 영역을 한곳에 모은다. 이 문서는 review 도구(`docs/superpowers/specs/2026-05-27-ics-emitter-review-design.md`)와 향후 PR review가 참조한다.

범위: byte/encoding 수준의 wire format, file 단위 한도, 식별자 안정성, 그리고 기존 spec과 code 사이에 알려진 불일치. **field-level mapping(어떤 raw → 어떤 ICS property)은 본 문서가 다루지 않는다** — `google-calendar-import-field-compat.md`로 간다.

## 참고 문서

- `docs/specs/google-calendar-import-field-compat.md` — Google file import가 반영/무시하는 field 정책.
- `docs/specs/ics-normalization-contract.md` — `NormalizedCalendarEvent` shape, mapping rule, V1 writer 결정.
- `docs/specs/v1-export-policy.md` — raw-side 포함/제외 field와 warning policy.
- `docs/research/google-calendar-import-field-research.md` — field 호환 evidence.

## Cross-cutting check 항목

### 1. CRLF 줄바꿈

RFC 5545 §3.1은 모든 content line이 CRLF(`\r\n`)로 끝나야 한다고 규정한다. lone LF는 적합하지 않다.

- 현재 emitter: `src/core/ics.ts:30`에서 `${lines.map(foldLine).join('\r\n')}\r\n`으로 처리한다.
- 위반 시: Google file import는 lone LF를 만나면 첫 line의 `BEGIN:VCALENDAR` parsing부터 실패해 "Could not import events"로 거부한다는 사례가 다수 보고됨.
- 검증 위치: conformance test (#23). 본 reference는 정책 명문화만 담당한다.

### 2. UTF-8, BOM 없음

ICS file의 charset 명시는 RFC 5545에서 직접 규정하지 않지만, Google Calendar는 UTF-8을 기대하며 BOM이 있을 때 첫 line `BEGIN:VCALENDAR`를 인식하지 못해 거부하는 회귀가 외부에 다수 보고됨(반대로 BOM이 있어야만 동작하는 사례도 있어 plaintext 환경별로 변동).

- 현재 emitter: TextEncoder로 byte 변환만 하고 별도 BOM 삽입 코드는 없다. Node가 file로 저장할 때 BOM이 붙지 않는다는 전제는 caller 책임.
- 검증 위치: conformance test (#23). 출력 string의 첫 3 byte가 `EF BB BF`가 아닌지 확인한다.

### 3. Line folding (75 octet)

RFC 5545 §3.1은 모든 content line이 75 octet 이하여야 하며, 초과 시 `CRLF + WSP`로 fold해야 한다고 규정한다. 길이 단위는 character가 아니라 **octet**(byte)이다.

- 현재 emitter: `src/core/ics.ts:236` `foldLine`이 UTF-8 byte 길이로 chunk하고 multi-byte continuation byte를 회피해 경계가 byte 중간을 자르지 않는다. continuation line은 leading space + 74 byte budget.
- 위반 시: 75 octet 초과 line은 일부 strict parser가 거부하거나 잘라낸다. UTF-8 sequence를 중간에서 자르면 한글 등 multi-byte char가 깨진다(mojibake).
- 검증 위치: conformance test (#23). fixture에 75 octet 초과 한글 SUMMARY를 포함시켜 unfold 후 strict UTF-8 decode가 통과하는지 확인한다.

### 4. RRULE — `COUNT`와 `UNTIL` 동시 사용 금지

RFC 5545 §3.3.10은 `RRULE`의 `COUNT`와 `UNTIL` parameter가 상호 배타임을 명시한다. 동시 사용은 표준 위반이며 Google import는 해당 VEVENT를 통째로 누락하는 경우가 보고됨.

- 현재 emitter: `src/core/ics.ts:194-206`은 normalize에서 받은 RRULE 문자열을 그대로 통과시킨다. normalize.ts는 둘의 동시 등장을 검사하지 않는다.
- 검증 위치: conformance test (#23)가 출력에 대해 정규식으로 확인. 별도 normalize 측 가드는 fixture 통과 후 별도 이슈로.

### 5. UID 안정성

`google-calendar-import-field-compat.md`는 `UID`가 emit된다는 mapping만 다룬다. cross-cutting 측면에서 UID는 두 속성을 추가로 만족해야 한다.

- **deterministic**: 같은 raw event를 두 번 export하면 동일 UID여야 한다. 그래야 Google file import의 UID-based dedup이 동작해 재import 시 중복이 생기지 않는다(`add-to-calendar-pro.com` ICS 가이드).
- **ASCII printable**: UID에 non-ASCII가 있으면 일부 parser가 매칭에 실패해 dedup이 무력화되는 사례가 보고됨. ASCII subset `[\x20-\x7E]`로 한정.
- 현재 emitter: `escapeText`로 escape는 하지만 ASCII 여부와 결정성은 검증하지 않는다. normalize.ts에서 UID를 어떻게 만드는지(`source.eventId` 기반인지)는 spec(`ics-normalization-contract.md`)이 "deterministic하게 생성"으로 요구하지만 시행 메커니즘은 없다.
- 검증 위치: conformance test (#23, ASCII check) + reviewer subagent (#22, 결정성 cross-check).

### 6. File size — 1MB cliff

Google Calendar 공식 help는 file import의 단일 file size 한도를 1MB로 명문화한다. 0.1MB 초과해도 "size too large" 같은 명확한 에러 없이 "Imported 0 of 0 events"로 사일런트 실패하는 사례가 다수 보고됨.

- 우리 export는 단일 calendar 단위라 통상 1MB 이하지만, 다년치/수천 건 export 시 위험.
- 검증 위치: conformance test (#23)가 출력 byte size를 900,000 byte(10% safety margin) 이하로 강제. 초과 시 user-facing warning은 별도 이슈로.

### 7. VTIMEZONE 생성 — spec과 code의 불일치

`docs/specs/ics-normalization-contract.md:98`은 "v1에서는 `VTIMEZONE`을 생성하지 않는다"고 적혀 있으나, 현재 `src/core/ics.ts:80-94`의 `createVtimezoneLines`는 emit된 모든 `TZID`에 대해 STANDARD-only VTIMEZONE 블록을 생성한다. 이는 issue #5에서 해결된 정합성 회귀(`fix(core): TZID 참조에 대응하는 VTIMEZONE 블록을 생성한다`, commit `4143355`)의 결과로 보이며, spec 문구가 그 변경을 반영하지 못한 상태다.

- 정합 방향: spec을 code 동작에 맞춰 갱신하는 것이 자연스럽다(VTIMEZONE 생성이 issue #5에서 의도적으로 도입됨). 단, STANDARD-only 한계(DST 경계 1시간 어긋남)는 spec과 code 주석 양쪽에 명시되어야 한다.
- 본 reference에서 이를 명시하는 이유: reviewer subagent (#22)가 "spec 문구만 보고 VTIMEZONE 생성을 P0로 보고하는" 오탐을 피하도록.

## 검증되지 않은 인접 항목

다음은 본 reference 범위를 살짝 벗어나지만 검토 시 함께 인식해야 한다.

| 항목 | 현재 상태 | 추적 위치 |
| --- | --- | --- |
| `TZID`가 IANA가 아닐 때 emitter가 그대로 출력 (`+09:00` 같은 offset이 `DTSTART;TZID=+09:00`로) | warning은 있으나 emit은 그대로 | RED baseline P0 #2 (`docs/reviews/2026-05-27-red-baseline-ics-emitter.md`), conformance test 범위 밖 |
| RRULE `UNTIL`이 zoned datetime일 때 UTC 정규화 | 없음 | RED baseline P1 #3 |
| RDATE/EXDATE에 부모 event의 TZID 자동 부여 | 없음 | RED baseline P1 #4 |
| All-day `DTEND` exclusive 변환 (`endAt`이 inclusive면 +1일) | normalize.ts에서 보정 여부 미상 | conformance test (#23)가 출력 invariant로 강제 |

이들은 reviewer subagent (#22) 또는 conformance test (#23)에서 잡히며, 본 reference는 정책의 출처(왜 그래야 하는가)만 보존한다.

## 미검증 항목

| 항목 | 추론 | confidence |
| --- | --- | --- |
| BOM 유무가 Google import 동작에 결정적 영향 | 외부 보고 다수, 회귀가 양방향(BOM 있어야/없어야)으로 보고됨 | med |
| 1MB 한도가 정확한 cliff인지(예: 900KB, 1.2MB) | 공식 문서는 1MB 명시, 실제는 0.95~1.0MB 부근에서 사일런트 실패 보고 | med |
| 75 octet line folding을 무시한 file이 Google에서 어디까지 허용되는지 | parser strictness가 import 경로에 따라 다르다는 보고 | low |
- 승격 기준: issue #15(Google import smoke)에서 인위적 fixture로 검증되면 confidence를 med→high로 올린다.
