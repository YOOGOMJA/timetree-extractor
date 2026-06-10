# Documents

결론: `docs/`는 Codex/OMX와 사람이 모두 빠르게 읽을 수 있도록, product context와 검증 계획과 decision을 분리한다.

## 읽는 순서

| 순서 | 문서 | 목적 |
| --- | --- | --- |
| 1 | `product-context.md` | 왜 이 도구가 필요한지와 v1 범위 이해 |
| 2 | `research/timetree-policy-and-web-research.md` | TimeTree 정책, Web version, export/API 제약 조사 |
| 3 | `research/timetree-web-data-surface.md` | 구현 전에 반드시 확인할 data surface 조사 |
| 4 | `research/timetree-network-page-state-research.md` | DOM 실패 이후 제한된 network/page-state 조사 |
| 5 | `research/timetree-ics-preview-smoke.md` | 실제 cache에서 ICS preview까지 연결한 smoke 결과 |
| 6 | `research/google-calendar-import-field-research.md` | Google Calendar 파일 import가 반영/무시하는 field 조사 |
| 7 | `specs/privacy-and-local-only-boundary.md` | 구현 가능한 local-only/privacy boundary |
| 8 | `specs/timetree-extraction-contract.md` | TimeTree raw extraction contract와 fixture gate |
| 9 | `specs/ics-normalization-contract.md` | `ICS` 전 단계 normalization contract |
| 10 | `specs/chrome-extension-boundary.md` | Chrome extension을 고려한 code boundary와 금지선 |
| 11 | `specs/passive-network-observer-plan.md` | 실제 page 검증 이후 passive observer 구현 계획 |
| 12 | `specs/passive-network-observer-test-spec.md` | passive observer TDD test gate |
| 13 | `specs/v1-export-policy.md` | v1 export 포함/제외 field와 warning 정책 |
| 14 | `specs/google-calendar-import-field-compat.md` | `ICS` output을 Google Calendar 파일 import에 맞추는 field 호환 정책 |
| 15 | `specs/ics-emit-cross-cutting-checks.md` | `ICS` writer review의 cross-cutting 정책(인코딩·folding·UID·file size) |
| 16 | `specs/cli-harness-plan.md` | local CLI harness 구현 계획 |
| 17 | `specs/dom-only-validation-spec.md` | 첫 milestone의 실행 spec과 pass/fail 기준 |
| 18 | `decisions/0001-local-first-v1.md` | Google Calendar 연동이 아니라 local export로 시작하는 이유 |
| 19 | `decisions/0002-implementation-go-no-go.md` | 구현 여부와 허용 범위 결정 |
| 20 | `decisions/0003-sqlite-engine-boundary.md` | SQLite engine과 reader port 결정 |
| 21 | `architecture-notes.md` | 검증 후 가능한 browser extension 구조 |
| 22 | `research/recurrence-id-smoke-runbook.md` | RECURRENCE-ID override(#14)의 실데이터 smoke 검증 절차 (#59) |

## 문서 작성 규칙

- 결론을 먼저 쓴다.
- 확인된 사실, 추론, 미검증 항목을 구분한다.
- 사람용 설명은 한국어로 쓴다.
- `browser extension`, `content script`, `JSON`, `ICS`, `schema`, `DOM`, `API`, `MVP`처럼 통용되는 technical term은 English로 둔다.
- 약어가 통용되지 않으면 full term을 사용한다.

## 문서 갱신 규칙

- 문서를 추가/이동/삭제하면 **같은 commit/PR에서** 연관 문서를 함께 갱신한다: `docs/README.md`의 읽는 순서 표(등록/삭제 반영)와, 상호 참조하는 상위·하위 문서의 cross-link.
- 링크 대상이 사라지거나 이름이 바뀌면 죽은 링크를 남기지 않는다.
- 한 문서의 결론이 다른 문서의 전제를 바꾸면, 영향받는 문서에 최소 한 줄로 반영하거나 명시적으로 "변경 없음"을 판단한다.

## 보관 기준

- 오래 유지할 제품 방향과 decision은 `docs/`에 둔다.
- 실행 중 상태, log, session state는 `.omx/`에 두고 commit하지 않는다.
