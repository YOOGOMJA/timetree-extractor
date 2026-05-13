# TimeTree Exporter

결론: 이 repository는 TimeTree Web에서 사용자가 접근할 수 있는 calendar data를 로컬에서 백업하고, 나중에 다른 calendar로 옮길 수 있게 하는 개인용 export 도구를 검증하기 위한 작업 공간이다.

현재 단계는 구현이 아니라 **TimeTree Web data surface 조사**다. TimeTree Web에서 필요한 field를 안정적으로 얻을 수 있는지 확인하기 전까지 browser extension 구조나 자동화 수준을 확정하지 않는다.

## 목표

- TimeTree Web에서 접근 가능한 일정 data를 확인한다.
- 원본 보존용 `JSON` backup format을 설계한다.
- migration용 `ICS` export 가능성을 검증한다.
- 서버 저장 없이 local-first 방식으로 처리한다.

## 현재 판단

- Notion 문서상 product problem은 정리되어 있다.
- 구현 가능성은 아직 검증되지 않았다.
- 가장 큰 risk는 TimeTree Web에서 제목, 시작/종료, 종일 여부, timezone, calendar name 같은 필수 field를 충분히 얻을 수 있는지다.


## Agent entry point

Codex와 OMX는 `AGENTS.md`를 primary instruction file로 사용한다. 상세 product context와 research plan은 `docs/` 아래 문서를 따른다.

## 문서 읽는 순서

1. `docs/README.md` — 문서 지도
2. `docs/product-context.md` — 제품 배경과 범위
3. `docs/research/timetree-web-data-surface.md` — 선행 조사 계획
4. `docs/decisions/0001-local-first-v1.md` — v1 범위 결정
5. `docs/architecture-notes.md` — 가능한 기술 구조와 보류된 선택지

## 작업 원칙

- 사람용 문서는 한국어로 작성한다.
- 널리 통용되는 technical term은 English로 유지한다.
- 통용되지 않는 줄임말은 피하고 full term을 쓴다.
- 결론을 먼저 쓰고, 근거와 risk를 뒤에 둔다.
- 확인되지 않은 내용을 구현 사실처럼 쓰지 않는다.
