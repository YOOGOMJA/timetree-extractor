# Product Context

결론: TimeTree Exporter는 TimeTree에 쌓인 가족 또는 공유 calendar data를 사용자가 직접 보관하고 이동할 수 있게 하는 local-first backup/export 도구다.

## 문제

TimeTree는 가족 또는 공유 calendar 관리에는 편하지만, TimeTree에 입력한 일정을 외부로 내보내거나 다른 calendar로 migration하는 공식 export 흐름이 부족하다. 일정 data가 오래 쌓일수록 backup과 migration 필요성이 커진다.

## 대상 사용자

- TimeTree에 가족 또는 공유 일정을 오래 쌓아둔 사용자
- Google Calendar 같은 표준 calendar로 migration하고 싶은 사용자
- 서비스 변경, 계정 문제, application 종속성에 대비해 개인 data를 보관하고 싶은 사용자

## v1 범위

v1은 개인용 local backup 도구로 제한한다.

포함한다:

- TimeTree Web에서 사용자가 직접 실행하는 흐름
- calendar name과 backup range 기록
- 원본 보존용 `JSON` backup
- migration용 `ICS` export
- 추출 성공과 누락 field report

제외한다:

- Google Calendar OAuth 직접 연동
- 실시간 sync
- 예약 backup
- server 저장
- 공개 배포 전제
- TimeTree login 대행

## 필수 field

P0 field:

- calendar name
- event title
- start time and end time
- all-day 여부
- timezone

가능하면 보존할 P1 field:

- event identifier
- memo 또는 description
- location
- label 또는 color
- author
- original URL

## 가장 큰 risk

TimeTree Web에서 전체 또는 긴 기간의 일정 상세 data를 안정적이고 정책 risk가 낮은 방식으로 추출할 수 있는지 아직 검증되지 않았다.

## Notion source context

이 문서는 접근 가능한 Notion 문서 `TimeTree Backup Exporter`의 내용을 repository 기준으로 요약한 것이다. Notion 문서는 product context이며, 구현 가능성 검증 결과는 아니다.
