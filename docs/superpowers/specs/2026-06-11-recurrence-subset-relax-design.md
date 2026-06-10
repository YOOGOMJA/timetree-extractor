# recurrence subset 완화 설계 (#61)

결론: normalize의 RRULE allowlist를 "BYxxx 패턴 일일이 검사(과도하게 좁음)"에서 **"`FREQ`가 표준 4종(DAILY/WEEKLY/MONTHLY/YEARLY)이면 통과, modifier 무관"**으로 전환한다. 그 외 FREQ·FREQ 누락·unknown prefix만 기존대로 event-level fail. 이로써 실데이터에서 통째로 드롭되던 `RRULE:FREQ=WEEKLY`(BYDAY 없음)와 `RRULE:FREQ=YEARLY`가 보존된다.

- 대상 이슈: #61 (실데이터로 확정 — Claude in Chrome로 개인 캘린더 직접 관찰)
- 관련: #62(#14 재설계, master 드롭이 선행 차단), #27(현재 subset 정책의 출처)
- 상태 구분: **검증됨**(실데이터/RFC) / **가정** / **범위 외**

## 배경 (검증됨)

개인 캘린더(`/api/v1/calendar/101381163/events`)를 브라우저로 직접 읽은 결과, 실제 반복 일정 2건이 둘 다 현재 normalize에서 event-level fail로 드롭된다:

| 실제 이벤트 | recurrences | 현재 결과 |
| --- | --- | --- |
| all-day 주간 반복 | `RRULE:FREQ=WEEKLY` (BYDAY 없음) | 🔴 드롭 |
| all-day 연간 반복(생일/기념일류) | `RRULE:FREQ=YEARLY` | 🔴 드롭 |

원인: `src/core/normalize.ts:343` `isSupportedRRule`이 WEEKLY에 `BYDAY`를 필수로 요구하고 YEARLY를 무조건 거부한다(#27). 그러나 bare `FREQ=WEEKLY`(= DTSTART 요일 매주)와 `FREQ=YEARLY`는 RFC 5545 valid이고 Google Calendar가 정상 처리한다(`google-calendar-import-field-research.md`: 표준 RRULE은 master 연결 series로 전개). 즉 #27의 좁은 allowlist는 "위험해서"가 아니라 "보수적으로" 막은 것이다.

## 데이터 모델 (검증됨)

- TimeTree `recurrences`는 calendar rule string array(`RRULE:`/`RDATE`/`EXRULE:`/`EXDATE`).
- 수정된 반복 instance가 있으면 master의 `recurrences`에 `EXDATE:<수정일>T000000Z`가 추가된다(실데이터 확인). EXDATE는 현재도 그대로 보존·emit된다(`normalizeRecurrences`가 gating 없이 `push(... 'exdate' ...)`).

## 아키텍처 / 컴포넌트

### 1. `isSupportedRRule` 재작성 (핵심, 단일 함수)

`src/core/normalize.ts`의 `isSupportedRRule`을 FREQ-allowlist로 교체한다.

```ts
const SUPPORTED_FREQ = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

function isSupportedRRule(rule: string): boolean {
  if (!rule.startsWith('RRULE:')) return false;
  const m = /(?:^|;)FREQ=([A-Z]+)/i.exec(rule.slice('RRULE:'.length));
  if (!m) return false;                       // FREQ 없음 → fail
  return SUPPORTED_FREQ.has(m[1].toUpperCase());
}
```

- WEEKLY의 `BYDAY 필수` 규칙 제거, YEARLY 추가, MONTHLY의 `BYSETPOS 거부` 제거(Google honor).
- `RRULE:FREQ=` 뒤 FREQ 토큰만 검사. INTERVAL/COUNT/UNTIL/BYDAY/BYMONTH/BYMONTHDAY/BYSETPOS/WKST 등 modifier는 무관하게 통과.
- SECONDLY/MINUTELY/HOURLY·미지 FREQ·FREQ 누락 → false → 기존 경로대로 `recurrence-unsupported` + event-level fail.

### 2. RRULE pass-through 유지

`normalizeRecurrences`·`formatRuleLine`의 나머지 흐름은 무변경. 통과된 RRULE 문자열은 그대로 emit. EXRULE 정책(보존 + warning)도 무변경.

### 3. UNTIL UTC 형식 보정 (residual 처리)

`google-calendar-import-field-research.md`: "`UNTIL`은 DTSTART가 zoned/UTC면 UTC(`Z`)여야 함. 불일치 시 파일 깨질 수 있음." 지금까지 YEARLY 등이 드롭돼 UNTIL-bearing RRULE이 emit된 적이 없으나, 완화 후 처음 emit될 수 있다.

방침:
- **구현 중 브라우저로 TimeTree가 보내는 실제 UNTIL 형식을 캡처**해 확인한다(예: 종료일 있는 반복 일정 생성 → API의 `recurrences` 관찰). 자가검증이라 사용자 관여 불필요.
- TimeTree가 이미 UTC `Z` 형식으로 보내면 → 추가 작업 없음(pass-through로 충분), 그 사실을 spec/research에 1줄 기록.
- 비-UTC(local/floating) 형식으로 보내면 → emit 단계(`formatRuleLine` 또는 전용 helper)에서 `UNTIL` 값만 UTC `Z`로 정규화. all-day(DATE) DTSTART면 `UNTIL`은 DATE 형식 유지.
- 관찰 결과가 애매하거나 정규화가 비대해지면 → UNTIL 정규화를 **별도 follow-up 이슈로 분리**하고, #61은 FREQ-allowlist까지만 ship(단, 그 경우 UNTIL 포함 이벤트의 잠재 위험을 이슈에 명시).

## 에러 처리 / 안전망

- "모르는 것은 silent emit하지 않고 fail" 원칙 유지 — 미지원 FREQ·unknown prefix는 그대로 event-level fail + `recurrence-unsupported` warning.
- data-loss 방향만 바뀜: 과거엔 valid한 표준 반복을 드롭(data-loss) → 이제 보존.

## 테스트 매트릭스

- `RRULE:FREQ=WEEKLY` (BYDAY 없음) → ok, RRULE emit (회귀 핵심)
- `RRULE:FREQ=YEARLY` → ok, RRULE emit
- `RRULE:FREQ=WEEKLY;BYDAY=MO` → ok (기존 케이스 무회귀)
- `RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO` (last Monday) → ok (이전엔 fail이었음)
- `RRULE:FREQ=DAILY;INTERVAL=2` → ok
- master `recurrences: ['RRULE:FREQ=WEEKLY','EXDATE:20260708T000000Z']` (실데이터 형태) → ok, RRULE+EXDATE emit
- `RRULE:FREQ=SECONDLY` → fail + warning
- `RRULE:INTERVAL=2` (FREQ 없음) → fail + warning
- `WEIRD:FOO` (unknown prefix) → fail + warning (기존 무회귀)
- UNTIL 케이스: 실데이터 관찰 후 결정된 동작에 대한 테스트(§3 분기에 따름)

## 범위 외 (YAGNI)

- RRULE 완전 파싱/재직렬화 (1안 채택, 2안 기각)
- SECONDLY/MINUTELY/HOURLY 지원 (TimeTree 캘린더에서 비현실적, Google import 불안정 가능)
- #14 override 링크 로직 (별도 #62)
- #14가 의존하던 `recur_start_at` — 본 이슈와 무관

## 문서 동반 갱신

- `docs/specs/ics-normalization-contract.md` §"Initial recurrence subset" — 새 FREQ-allowlist 정책으로 갱신.
- `docs/specs/v1-export-policy.md` §"Recurrence policy" — 지원 목록 갱신(WEEKLY BYDAY 필수/YEARLY 제외 문구 제거).
- `docs/specs/google-calendar-import-field-compat.md` — 필요 시 subset 문구 동기화.
- UNTIL 관찰 결과를 `google-calendar-import-field-research.md`에 1줄 반영.
