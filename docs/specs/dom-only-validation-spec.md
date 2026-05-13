# DOM Only Validation Spec

결론: 첫 실행 단계는 **policy-aware DOM only TimeTree Web data surface validation**이다. TimeTree는 2026-05-13 기준 일반 calendar export와 공개 developer API를 제공하지 않으므로, 이 validation은 official API integration이 아니라 사용자가 직접 로그인한 Web 화면에서 보이는 DOM data surface 확인이다.

## 근거 문서

- `docs/research/timetree-policy-and-web-research.md`
- `docs/research/timetree-web-data-surface.md`
- `.omx/specs/deep-interview-project-sequencing.md`

## 목표

첫 milestone이 끝나면 다음 중 하나를 명확히 판정한다.

1. DOM only로 P0 field를 확보할 수 있어 raw/normalized event contract 설계로 진행한다.
2. DOM only로는 부족하므로 첫 milestone을 실패로 닫고, network observation 또는 project 보류 여부를 별도 decision으로 검토한다.

## In scope

- TimeTree Web 화면과 DOM에 노출되는 field 조사
- Monthly view, weekly view, event detail surface 확인
- P0/P1/P2 field 접근 가능성 표 작성
- DOM selector 또는 DOM structure 관찰 기록
- 접근 가능한 sample raw data shape 문서화
- shared calendar data가 다른 참가자의 personal information을 포함할 가능성 기록
- 실패 또는 gap 기록

## Out of scope

- UI 구현
- ICS export 구현
- Browser extension scaffold
- Network response observation
- Private endpoint reverse engineering
- 내부 API 대량 호출 자동화
- Login automation
- Credential 또는 session token 저장
- Server-side collection 또는 storage
- Public distribution 또는 SaaS화
- Production 수준 architecture 확정

## Decision boundaries

Codex/OMX가 확인 없이 결정해도 되는 것:

- 조사 문서의 table structure 개선
- DOM field 기록 format
- sample raw event contract draft 작성
- docs update 범위

반드시 다시 확인해야 하는 것:

- Network observation으로 scope 확장
- Browser extension scaffold 생성
- TimeTree login automation 또는 credential 저장
- ICS export 구현 시작
- UI 구현 시작
- 새 dependency 추가
- Public distribution 또는 SaaS 방향 전환
- Shared calendar warning 또는 consent UX 생략

## P0 field

- calendar name
- event title
- start time and end time
- all-day 여부
- timezone

## Acceptance criteria

DOM only validation은 다음을 만족해야 완료된다.

- `docs/research/timetree-policy-and-web-research.md`를 prerequisite context로 참조한다.
- P0 field 각각에 대해 accessible / inaccessible / uncertain 중 하나로 표시한다.
- 각 field 판정에는 evidence note를 남긴다.
- 최소 하나의 event detail surface를 확인한다.
- monthly 또는 weekly navigation behavior를 기록한다.
- observed DOM에 shared calendar participant data 또는 other personal information이 나타나는지 기록한다.
- 결과에 DOM only extraction pass/fail을 명시한다.
- fail인 경우 같은 milestone 안에서 network observation으로 확장하지 않는다.
- `docs/research/timetree-web-data-surface.md`를 결과로 갱신한다.

## Pass / fail rule

Pass:

- 모든 P0 field를 DOM only로 확인할 수 있다.
- 확인된 field로 raw event contract draft를 만들 수 있다.
- Policy/privacy constraints를 위반하지 않는 next step이 존재한다.

Fail:

- P0 field 중 하나 이상이 DOM only로 확인되지 않는다.
- Timezone 또는 all-day 여부가 inference에만 의존한다.
- 필수 data가 network response 또는 private endpoint 없이는 확인되지 않는다.
- shared calendar 개인정보 risk를 통제할 수 없는 surface만 확인된다.

## 다음 단계

Pass일 때:

1. raw event contract draft 작성
2. normalized event schema 작성
3. fixture 기반 parser/normalizer test 계획 수립

Fail일 때:

1. DOM only milestone 종료
2. 별도 decision으로 network observation 허용 여부 검토
3. 허용하지 않으면 project 방향을 manual backup assistant 또는 보류로 재검토
