# Decision 0001: v1은 local-first backup 도구로 제한한다

결론: v1은 Google Calendar 직접 연동이나 지속 sync가 아니라, TimeTree data를 local에서 `JSON`과 `ICS`로 export하는 개인용 backup 도구로 제한한다.

## 배경

TimeTree API는 종료되었고, 공유 calendar data는 개인정보와 정책 risk가 있다. 초기 단계에서 Google Calendar OAuth, sync, 중복 처리, 실패 복구까지 포함하면 검증해야 할 범위가 너무 넓어진다.

## 선택한 방향

- 사용자가 TimeTree Web에 직접 login한다.
- 도구는 사용자가 접근 가능한 화면 또는 data surface만 다룬다.
- data는 server로 보내지 않고 local에서 처리한다.
- output은 원본 보존용 `JSON`과 migration용 `ICS`로 제한한다.

## 버린 대안

### Google Calendar OAuth 직접 연동부터 구현

권한, 개인정보, 중복 처리, 실패 복구, 사용자 지원 부담이 크다. 초기 검증 단계에는 부적합하다.

### 예약 backup 또는 지속 sync부터 구현

자동 실행과 지속 sync는 정책, 부하, 정확도 risk가 높다.

### 내부 API 기반 완전 자동화부터 구현

TimeTree API 종료 맥락과 충돌할 수 있고, 공개 배포 risk가 크다.

## 결과

이 decision은 구현 범위를 줄이지만, TimeTree Web data surface 조사에 대한 의존도를 높인다. 조사 결과 P0 field 접근이 어렵다면 v1 방향 자체를 재검토한다.

## 재검토 조건

- P0 field를 안정적으로 확보할 수 있다.
- 개인용 backup 도구가 실제 사용 시 충분히 유용하다.
- 정책 검토상 공개 배포 또는 개인 사용 범위가 더 명확해진다.
