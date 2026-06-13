# Privacy and Local-only Boundary

> **갱신(0006)**: 이 문서의 "browser extension store 공개 금지"는 [decisions/0006](../decisions/0006-public-distribution-track.md)에서 supersede됐다 — 공개 스토어 배포를 목표로 전환(게이팅 통과 전제). 단, **server 전송·credential/token 저장·SaaS·background sync 금지와 data minimization 원칙은 그대로 유효**하며, 공개 처리방침 초안은 `docs/legal/privacy-policy.md`에 있다(#95).

결론: 구현은 **local-only personal export research prototype**으로만 허용한다. TimeTree Web 내부 data surface를 사용할 수는 있지만, 공식 공개 API가 아니므로 credential/session/token 저장, server 전송, public SaaS, 지속 polling은 v1 범위에서 금지한다.

## Decision

| 항목 | 결정 |
| --- | --- |
| 구현 허용 범위 | local-only research prototype |
| 실행 주체 | 사용자가 직접 로그인한 browser session |
| data 처리 위치 | 사용자 local machine |
| 저장 허용 | redacted fixture, user-selected export file |
| 저장 금지 | credential, cookie, session token, CSRF header, HAR, raw private response dump |
| 배포 범위 | private/local development only |
| 금지 방향 | SaaS, hosted collector, background sync, public scraping tool |

## 근거

- TimeTree Connect App/API는 2023-12-22 종료되었다.
- TimeTree Help 기준 일반 event export는 확인되지 않고, external calendar는 TimeTree로 import/display하는 방향이 중심이다.
- TimeTree AUP는 user backup 책임을 언급하지만, 내부 Web API 자동 export를 명시적으로 허가하지 않는다.
- TimeTree AUP는 third-party rights/privacy 침해, excessive network/system burden, illegal access를 금지한다.
- Privacy Policy는 calendar title/date-time/participants/notes/labels/media files 등을 user information으로 다룬다.
- Shared calendar에는 다른 참가자의 personal information이 포함될 수 있다.

## 허용하는 행위

- 사용자가 이미 로그인한 TimeTree Web 화면에서 read-only로 data surface를 관찰한다.
- 동일 origin page context 안에서 현재 session을 이용해 필요한 field presence를 검증한다.
- 실제 개인 값은 저장하지 않고 schema/type/count 중심으로 fixture를 만든다.
- 사용자가 명시적으로 선택한 calendar와 date range만 export한다.
- export 결과를 사용자의 local file로만 저장한다.
- export 전에 shared calendar warning과 data handling notice를 표시한다.

## 금지하는 행위

- TimeTree credential 입력/저장 자동화
- cookie/session token/CSRF header 저장
- HAR file 저장
- TimeTree data를 외부 server로 전송
- background polling 또는 scheduled sync
- 여러 calendar/date range를 자동 대량 crawling
- account 간 data aggregation
- public SaaS, browser extension store 공개, hosted API 제공
- rate limit 우회를 목적으로 한 retry/backoff 구현
- undocumented endpoint를 안정적인 public contract처럼 문서화

## Required user-facing warning

구현 시 export 시작 전에 다음 취지의 warning이 필요하다.

```text
이 도구는 공식 TimeTree export 기능이 아닙니다. 현재 로그인된 browser session에서 사용자가 접근 가능한 calendar data를 local file로 저장합니다. Shared calendar에는 다른 참가자의 이름, 일정, memo, comment, image 등 personal information이 포함될 수 있습니다. Export file은 사용자의 책임으로 보관해야 하며, 외부로 전송하지 않습니다.
```

## Data minimization

기본 export는 다음 원칙을 따른다.

- 필수 calendar migration field만 우선 저장한다.
- comments, files, images, participants는 default off로 둔다.
- attachment binary download는 v1에서 제외한다.
- activity log는 migration에 필요하지 않으면 제외한다.
- raw response 전체 저장 대신 normalized raw event shape만 저장한다.

## Review gate

다음 조건 중 하나라도 필요해지면 구현을 중지하고 별도 decision을 만든다.

- session/cookie/token 저장이 필요하다.
- request header를 file에 저장해야 한다.
- server component가 필요하다.
- public distribution을 원한다.
- event values가 아닌 full raw response dump가 필요하다.
- shared calendar participant/comment/file export를 default로 켜고 싶다.

## 결론

구현은 가능하지만, 제품이 아니라 **local-only research prototype**으로 제한해야 한다. 이 boundary를 넘는 순간 policy/privacy risk가 급격히 커지므로 v1 구현 decision은 자동으로 no-go가 된다.
