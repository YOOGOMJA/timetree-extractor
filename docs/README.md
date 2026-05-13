# Documents

결론: `docs/`는 Codex/OMX와 사람이 모두 빠르게 읽을 수 있도록, product context와 검증 계획과 decision을 분리한다.

## 읽는 순서

| 순서 | 문서 | 목적 |
| --- | --- | --- |
| 1 | `product-context.md` | 왜 이 도구가 필요한지와 v1 범위 이해 |
| 2 | `research/timetree-policy-and-web-research.md` | TimeTree 정책, Web version, export/API 제약 조사 |
| 3 | `research/timetree-web-data-surface.md` | 구현 전에 반드시 확인할 data surface 조사 |
| 4 | `specs/dom-only-validation-spec.md` | 첫 milestone의 실행 spec과 pass/fail 기준 |
| 5 | `decisions/0001-local-first-v1.md` | Google Calendar 연동이 아니라 local export로 시작하는 이유 |
| 6 | `architecture-notes.md` | 검증 후 가능한 browser extension 구조 |

## 문서 작성 규칙

- 결론을 먼저 쓴다.
- 확인된 사실, 추론, 미검증 항목을 구분한다.
- 사람용 설명은 한국어로 쓴다.
- `browser extension`, `content script`, `JSON`, `ICS`, `schema`, `DOM`, `API`, `MVP`처럼 통용되는 technical term은 English로 둔다.
- 약어가 통용되지 않으면 full term을 사용한다.

## 보관 기준

- 오래 유지할 제품 방향과 decision은 `docs/`에 둔다.
- 실행 중 상태, log, session state는 `.omx/`에 두고 commit하지 않는다.
