# Decision 0002: 제한된 contract-first 구현은 진행한다

결론: **구현은 진행한다. 단, 범위는 local-only contract validator와 parser/normalizer prototype으로 제한한다.** Browser extension UI, public distribution, SaaS, background sync, credential/session 저장, attachment export는 no-go다.

## Decision status

| 항목 | 판단 |
| --- | --- |
| Full product implementation | no-go |
| Public extension/store distribution | no-go |
| SaaS/hosted collector | no-go |
| DOM only exporter | no-go |
| Internal API 기반 full exporter | no-go for now |
| Local-only contract validator | go |
| Parser/normalizer prototype | conditional go |
| ICS writer | later, after fixture gate |

## Decision drivers

1. **Data correctness**: `timezone`, `all_day`, `recurrences` 없이는 calendar migration 품질을 보장할 수 없다.
2. **Policy/privacy risk**: TimeTree 공식 API는 종료됐고, 내부 Web surface는 public contract가 아니다.
3. **Implementation reversibility**: UI/product보다 contract validator는 작고 되돌리기 쉽다.
4. **User value**: local backup/export는 여전히 유효한 문제지만, 틀린 `ICS` export는 사용자에게 더 큰 피해가 될 수 있다.

## Evidence

- `docs/research/timetree-policy-and-web-research.md`: 공식 API/export 경로 부재와 policy/privacy risk 정리
- `docs/research/timetree-web-data-surface.md`: DOM only first pass fail
- `docs/research/timetree-network-page-state-research.md`: internal app data model에 P0 field 존재 가능성 확인
- `docs/specs/privacy-and-local-only-boundary.md`: 구현 boundary
- `docs/specs/timetree-extraction-contract.md`: extraction contract gate
- `docs/specs/ics-normalization-contract.md`: normalization/ICS gate

## Chosen path

1. local-only boundary를 먼저 고정한다.
2. redacted/synthetic fixture 기반 `RawTimeTreeEvent` schema validator를 만든다.
3. `RawTimeTreeEvent -> NormalizedCalendarEvent` normalizer를 만든다.
4. P0 fixture가 통과하면 제한된 read-only extractor spike를 검토한다.
5. ICS writer는 normalizer fixture와 timezone/recurrence rule이 안정화된 뒤 시작한다.

## Alternatives considered

### A. 지금 full exporter 구현

거절한다. 내부 API 의존, shared calendar personal data, unsupported recurrence/attachment risk가 아직 크다.

### B. DOM only limited exporter 구현

거절한다. timezone과 all-day를 추론해야 하므로 migration 품질을 보장하기 어렵다.

### C. 프로젝트 보류

거절하지는 않지만 현재 선택하지 않는다. Network/page-state research에서 기술 가능성이 확인됐으므로 작은 contract-first prototype은 비용 대비 가치가 있다.

### D. Google Calendar 직접 연동까지 포함

거절한다. OAuth, duplicate handling, sync conflict, privacy scope가 커져 현재 검증 목적과 맞지 않는다.

## Implementation scope allowed now

허용:

- dependency-free ESM scaffold 생성, TypeScript migration은 별도 검토
- schema validator
- redacted/synthetic fixtures
- unit tests
- normalizer tests
- warning/fail policy
- documentation update

금지:

- 실제 TimeTree credential/session/token 저장
- 실제 user calendar raw dump commit
- background crawling
- mutation API call
- browser extension UI
- public distribution 준비
- Google Calendar OAuth
- attachment binary download

## Acceptance criteria for first implementation milestone

- `RawTimeTreeEvent` schema가 fixture를 validate한다.
- missing `timezone` timed event는 fail 또는 warning policy대로 처리된다.
- `allDay=true` event는 date-only normalized shape로 변환된다.
- timed event는 timezone을 보존한다.
- unsupported recurrence는 silent drop되지 않는다.
- tests가 local에서 재현 가능하다.
- docs에 unsupported feature와 data loss warning이 남는다.

## Stop conditions

다음이 발생하면 구현을 중단한다.

- P0 fixture를 만들 수 없다.
- timezone이 실제 payload에서 안정적으로 확보되지 않는다.
- 구현에 session/token/header 저장이 필요하다.
- 사용자가 public distribution 또는 SaaS를 목표로 바꾼다.
- 내부 API 호출 없이 local fixture 검증을 넘어서기 어렵다.

## Consequences

- 장점: 작고 검증 가능한 구현부터 시작하므로 잘못된 calendar export를 피할 수 있다.
- 단점: 사용자가 바로 쓸 수 있는 exporter는 아직 나오지 않는다.
- 제약: TimeTree 내부 surface가 바뀌면 extractor 단계는 깨질 수 있다.
- 후속: scaffold와 test runner 선택이 필요하다.

## Next implementation recommendation

다음 작업은 **dependency-free contract validator + normalizer fixture tests**다. TypeScript는 dependency 추가 decision 이후 migration한다.

권장 순서:

1. package scaffold와 test runner 선택
2. `RawTimeTreeEvent` / `NormalizedCalendarEvent` contract 작성
3. schema validator 작성
4. fixture 작성
5. normalizer 작성
6. warning/fail policy test 작성

## 결론

구현 여부 판단은 **조건부 go**다. 지금 구현할 것은 exporter product가 아니라, local-only contract validator와 parser/normalizer prototype이다.
