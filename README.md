# TimeTree Exporter

결론: 이 repository는 TimeTree Web에서 사용자가 접근할 수 있는 calendar data를 로컬에서 백업하고, 나중에 다른 calendar로 옮길 수 있게 하는 개인용 export 도구를 검증하기 위한 작업 공간이다.

현재 단계는 **TypeScript 기반 contract-first 1차 구현**이다. TimeTree Web 내부 data surface를 바로 product로 만들지 않고, synthetic fixture 기반 `RawTimeTreeEvent` validation, `NormalizedCalendarEvent` 변환, 그리고 Chrome extension을 고려한 page extraction boundary를 먼저 검증한다.

## 목표

- TimeTree Web에서 접근 가능한 일정 data를 확인한다.
- 원본 보존용 `JSON` backup format을 설계한다.
- migration용 `ICS` export 가능성을 검증한다.
- 서버 저장 없이 local-first 방식으로 처리한다.

## 현재 판단

- DOM only exporter는 timezone/all-day gap 때문에 no-go다.
- 제한된 network/page-state research 기준으로 contract-first 구현은 conditional go다.
- 1차 구현은 schema validator, synthetic fixture, normalizer, warning/fail policy test, page extractor boundary로 제한한다.
- 실제 로그인된 page smoke test, `ICS` writer, Chrome extension manifest와 UI는 후속 gate 이후로 미룬다.

## 현재 구현 구조

| 경로 | 역할 |
| --- | --- |
| `src/core/` | TimeTree raw contract validation과 calendar event normalization. `window`, `document`, `fetch`, `chrome` API에 의존하지 않는다. |
| `src/browser/` | TimeTree Web page에서 얻은 payload를 raw contract로 mapping하는 browser boundary. Fetch 구현은 주입받는다. |
| `src/extension/` | Chrome extension content script adapter 초안. 현재는 page extraction boundary를 얇게 연결한다. |
| `test/` | Node built-in test runner 기반 TDD regression tests. |

## Agent entry point

Codex와 OMX는 `AGENTS.md`를 primary instruction file로 사용한다. 상세 product context와 research plan은 `docs/` 아래 문서를 따른다.

## 문서 읽는 순서

1. `docs/README.md` — 문서 지도
2. `docs/product-context.md` — 제품 배경과 범위
3. `docs/research/timetree-web-data-surface.md` — DOM only 조사 결과
4. `docs/research/timetree-network-page-state-research.md` — 제한된 network/page-state 조사 결과
5. `docs/decisions/0002-implementation-go-no-go.md` — 구현 여부와 허용 범위 결정
6. `docs/specs/privacy-and-local-only-boundary.md` — privacy/local-only boundary
7. `docs/specs/timetree-extraction-contract.md` — raw extraction contract
8. `docs/specs/ics-normalization-contract.md` — normalization contract
9. `docs/specs/chrome-extension-boundary.md` — Chrome extension 기준 code boundary
10. `docs/architecture-notes.md` — 가능한 기술 구조와 보류된 선택지

## 작업 원칙

- 사람용 문서는 한국어로 작성한다.
- 널리 통용되는 technical term은 English로 유지한다.
- 통용되지 않는 줄임말은 피하고 full term을 쓴다.
- 결론을 먼저 쓰고, 근거와 risk를 뒤에 둔다.
- 확인되지 않은 내용을 구현 사실처럼 쓰지 않는다.

## 개발 명령

```bash
npm install
npm test
npm run typecheck
npm run build
```

현재 runtime dependency는 없다. TypeScript는 development dependency로만 사용한다.
