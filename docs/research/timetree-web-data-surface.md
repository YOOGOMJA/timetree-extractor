# TimeTree Web Data Surface Research

결론: 구현 전에 TimeTree Web에서 필수 field를 실제로 얻을 수 있는지 조사해야 한다. 이 조사가 실패하면 browser extension MVP 범위는 재검토해야 한다.

## 검증할 가정

TimeTree Web에서 사용자가 접근 가능한 일정 목록과 상세 정보를 local browser extension이 `JSON` backup과 `ICS` export에 충분한 수준으로 수집할 수 있다.

## 조사 대상 화면

- monthly view
- weekly view
- event detail modal 또는 detail page
- calendar selection 또는 calendar metadata 영역
- 과거와 미래 month navigation 흐름

## 확인할 field

| Field | Priority | 접근 가능 여부 | 근거 | 메모 |
| --- | --- | --- | --- | --- |
| calendar name | P0 | 미확인 |  |  |
| event identifier | P1 | 미확인 |  |  |
| title | P0 | 미확인 |  |  |
| start time and end time | P0 | 미확인 |  |  |
| all-day 여부 | P0 | 미확인 |  |  |
| timezone | P0 | 미확인 |  |  |
| recurrence rule | P0/P1 | 미확인 |  |  |
| memo 또는 description | P1 | 미확인 |  |  |
| location | P1 | 미확인 |  |  |
| label 또는 color | P1 | 미확인 |  |  |
| author | P1 | 미확인 |  |  |
| participants | P2 | 미확인 |  |  |
| comments | P2 | 미확인 |  |  |
| attachments | P2 | 미확인 |  |  |
| reminders | P2 | 미확인 |  |  |
| created time and updated time | P2 | 미확인 |  |  |
| original URL | P1 | 미확인 |  |  |

## 조사 방법

1. TimeTree Web에 사용자가 직접 login한다.
2. 실제 calendar를 열고 monthly view와 weekly view를 확인한다.
3. event detail modal 또는 detail page에서 DOM에 노출되는 field를 기록한다.
4. month navigation 시 data loading 방식과 URL 변화를 기록한다.
5. DOM만으로 가능한 field와 network response 확인이 필요한 field를 분리한다.
6. 1개월, 6개월, 1년 단위로 수집 가능성을 추정한다.
7. 정책 risk가 커지는 접근 방식은 별도로 표시한다.

## 성공 기준

- P0 field를 모두 확보할 수 있다.
- P1 field 중 대부분을 확보할 가능성이 있다.
- 최소 1년 이상의 사용자 지정 기간 backup 가능성이 보인다.
- server 전송 없이 local processing으로 처리할 가능성이 있다.

## 실패 또는 보류 기준

- title과 time 외 field가 거의 접근 불가능하다.
- 긴 기간 수집이 내부 API 대량 호출에 강하게 의존한다.
- recurrence 또는 all-day event가 정확히 복원되지 않는다.
- 정책 risk가 개인용 사용에도 부담스러운 수준이다.

## 조사 결과

아직 조사하지 않았다.
