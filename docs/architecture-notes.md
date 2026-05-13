# Architecture Notes

결론: 현재 architecture는 확정하지 않는다. 다만 TimeTree Web data surface 조사가 성공하면 browser extension 중심의 local-first 구조가 가장 단순한 후보가 된다.

## 후보 구조

```text
TimeTree Web
  -> browser extension content script
  -> extractor
  -> normalizer
  -> JSON backup writer
  -> ICS exporter
  -> backup report
```

## 책임 분리 후보

- `content script`: TimeTree Web 화면에서 접근 가능한 data를 읽는다.
- `extractor`: DOM 또는 사용자가 접근 가능한 data surface에서 raw event candidate를 만든다.
- `normalizer`: raw event candidate를 repository 내부 event model로 변환한다.
- `JSON backup writer`: 원본 보존용 backup file을 만든다.
- `ICS exporter`: calendar import 가능한 `ICS` file을 만든다.
- `backup report`: 누락 field, 변환 실패, 경고를 기록한다.

## 우선 test 대상

- normalized event schema
- all-day event 변환
- timezone 보존
- `ICS` export format
- 누락 field report

## 아직 확정하지 않은 것

- browser extension framework
- DOM 기반 추출과 network response 기반 추출의 경계
- 반복 일정 처리 수준
- Google Calendar import compatibility 목표 수준
- 공개 배포 여부

## 구현 전 조건

`docs/research/timetree-web-data-surface.md`의 P0 field 접근 가능성이 확인되어야 한다.
