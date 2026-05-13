# TimeTree Policy and Web Research

결론: DOM 검증보다 먼저 TimeTree의 현재 공식 기능, 정책, Web version 제약을 확인하는 것이 맞다. 2026-05-13 기준 TimeTree는 일반 calendar export와 공개 developer API를 제공하지 않으며, 개인용 local backup 도구는 가능성을 검토할 수 있지만 공식적으로 허가된 export API 경로는 확인되지 않는다.

> 이 문서는 제품/정책 리스크 검토용 research note다. 법률 자문이 아니며, 공개 배포 또는 SaaS화를 검토할 때는 별도 법무 검토가 필요하다.

## 확인일

- 2026-05-13

## 핵심 판단

- TimeTree는 shared calendar 중심의 calendar sharing service다.
- 공식 Connect App / API 기능은 2023-12-22 종료되었다.
- 일반 사용자 calendar를 `JSON` 또는 `ICS`로 export하는 공식 기능은 확인되지 않는다.
- TimeTree 약관은 사용자가 자신의 data를 자기 책임으로 backup해야 한다고 설명한다.
- Shared Calendar Guidelines는 shared calendar information이 API 또는 backup을 통해 외부 service에서 사용될 수 있음을 전제로 하지만, 이것이 DOM scraping, private endpoint 호출, 자동화 export를 명시적으로 허가한다는 의미는 아니다.
- Web version은 calendar 조회, 생성, 검색, memo, album, member list, activity, setting 등을 제공하지만, Google Calendar 같은 external calendar 표시는 Web에 없다.

## 확인된 사실

### 서비스 개요

TimeTree는 여러 사람과 일정을 공유하는 calendar sharing app이다. 공식 사이트와 Help 문서 기준으로 shared calendar, calendar list, member invitation, search, memo, album, activity, notices 같은 기능을 제공한다.

Sources:

- TimeTree official site: https://timetreeapp.com/intl/en
- Company information: https://timetreeapp.com/intl/en/corporate
- Web version help: https://support.timetreeapp.com/hc/en-us/articles/360000238862-Want-to-use-it-on-PC-or-tablet-as-well-Web-version
- Web functions: https://support.timetreeapp.com/hc/en-us/articles/206212261-I-want-to-know-TimeTree-Web-functions

### Web version 기능과 제약

공식 Help 기준 Web에서 가능한 기능:

- calendar list 확장
- calendar detail 보기와 새 calendar 추가
- today navigation
- monthly / weekly view
- keyword search와 additional search options
- event creation
- profile, account, appearance settings
- first day of week, 24-hour time, public holiday settings
- memo 보기와 생성
- album
- member list 표시와 invite
- activity
- notices
- calendar settings
- 표시할 calendar 선택과 해제

Web에서 아직 제공되지 않는 기능:

- selected calendar list view
- Google Calendar 같은 external calendar 표시

Source:

- https://support.timetreeapp.com/hc/en-us/articles/206212261-I-want-to-know-TimeTree-Web-functions

### Export / import / sync

공식 Help 기준 일반 TimeTree events는 export할 수 없다. External calendar 사용은 모바일 앱에서 external calendar를 표시하거나 TimeTree shared calendar로 가져오는 방향이 중심이다. TimeTree events가 external calendar로 자동 반영되는 흐름은 공식적으로 확인되지 않는다.

Sources:

- External calendars in TimeTree: https://support.timetreeapp.com/hc/en-us/articles/360000629341-I-want-to-use-another-calendar-such-as-Google-Calendar
- Share other calendars: https://support.timetreeapp.com/hc/en-us/articles/360000639742-I-want-to-share-other-calendars-in-TimeTree
- Multiple calendars: https://support.timetreeapp.com/hc/en-us/articles/115000030881-View-multiple-calendars-at-the-same-time

### API / developer integration

TimeTree Connect App, 즉 API function은 2023-12-22 종료되었다. 공지 기준 Amazon Alexa는 계속 연동 가능하지만, developers가 만든 applications는 더 이상 동작하지 않는 대상으로 분류되어 있다.

Source:

- https://timetreeapp.com/intl/en/newsroom/2023-12-14/connect-app-api-202312

### Terms / Acceptable Use Policy

TimeTree AUP에서 확인되는 project-relevant points:

- 사용자는 service 이용과 결과에 대해 자기 책임을 진다.
- 사용자가 제공하는 content나 information이 제3자 권리나 privacy를 침해하지 않아야 한다.
- TimeTree는 등록 data/content가 삭제되지 않는다고 보증하지 않으며, 사용자는 자기 책임으로 data를 backup해야 한다.
- 금지행위에는 laws/regulations 위반, third-party rights/privacy 침해, network/system에 과도한 부담을 주는 행위, illegal access, 기타 회사가 부적절하다고 판단하는 행위가 포함된다.
- 서비스 및 software의 intellectual property rights는 회사 또는 권리자에게 있다.
- 준거법은 일본법이며 1심 관할은 Tokyo District Court다.

Source:

- https://timetreeapp.com/intl/en/terms/service

### Privacy Policy / shared calendar data

Privacy Policy는 user information, calendar data, external service linked calendar information 등을 처리 대상으로 설명한다. 한국 이용자 기준 개인정보가 일본 소재 TimeTree server로 전송·처리된다는 설명도 확인된다.

Shared Calendar Guidelines 기준 shared calendar에서는 event title, date and time, location, participants, notes, comments, images, related data, calendar profile information 등이 다른 참가자에게 접근 가능하다. 또한 shared calendar information을 service features 밖에서 access/export/further process하는 참가자는 GDPR상 independent controller로 행동한다고 설명한다.

Sources:

- Privacy Policy: https://timetreeapp.com/intl/en/terms/privacy?country=other
- Korean Privacy Policy: https://timetreeapp.com/intl/ko/terms/privacy?country=kr
- Shared Calendar Guidelines: https://timetreeapp.com/intl/en/terms/shared-calendar-guidelines
- Shared Calendar Guidelines announcement: https://timetreeapp.com/intl/en/newsroom/2026-04-23/202604023-shared-calendar-guidelines

## 리스크 평가

| 설계 방식 | 정책/법적 리스크 | 판단 |
| --- | --- | --- |
| 사용자가 직접 로그인한 Web 화면에서 보이는 data만 local file로 저장 | 낮음~중간 | 사용자 backup 책임 조항과 어느 정도 정합성이 있으나, DOM scraping/export가 명시 허가된 것은 아니다. |
| shared calendar 전체 export | 중간~높음 | 타인의 event, comments, images, profile data가 포함될 수 있다. |
| private endpoint 호출 또는 reverse engineering | 높음 | 공식 API 종료, illegal access, excessive burden, software rights 조항과 충돌할 수 있다. |
| server/SaaS 형태로 TimeTree data 수집·저장 | 높음 | 개인정보 처리자 또는 controller 책임, consent, deletion, security, privacy policy가 필요하다. |
| credential/session token 저장 | 매우 높음 | account security와 unauthorized access risk가 크다. |
| 대량 crawling 또는 반복 polling | 높음 | network/system burden 금지와 충돌할 수 있다. |

## 프로젝트 방향에 대한 권고

### 해야 할 것

- v1은 개인용 local backup tool로 제한한다.
- 사용자가 명시적으로 실행하는 manual export 흐름으로 둔다.
- server storage를 만들지 않는다.
- credential과 session token을 저장하지 않는다.
- 첫 검증은 visible Web data 또는 DOM only로 제한한다.
- shared calendar data가 타인 정보를 포함할 수 있음을 명확히 경고한다.
- 조사 결과에는 evidence, inference, uncertainty를 분리한다.

### 피해야 할 것

- 공식 API가 있다고 가정하는 설계
- private endpoint reverse engineering을 전제로 한 설계
- 자동 login 또는 credential handling
- 반복 polling이나 large-scale crawling
- 공개 배포 또는 SaaS화를 초기 scope에 포함하는 것

## 다음 research question

DOM only validation 전에 다음을 더 좁히면 좋다.

1. TimeTree Web event detail에서 P0 field가 실제 DOM text로 노출되는가?
2. Monthly / weekly view가 긴 기간 탐색에 충분한가?
3. Timezone은 Web에서 확인 가능한가, 아니면 user/browser timezone inference에 의존해야 하는가?
4. Shared calendar export 경고와 consent UX를 어떤 문구로 둘 것인가?
5. DOM only 실패 시 network observation을 허용할지, 아니면 project를 보류할지 별도 decision이 필요한가?

## Repository implication

현재 `docs/research/timetree-web-data-surface.md`의 첫 milestone은 유지하되, 다음 constraint를 추가하는 것이 적절하다.

- Official API unavailable.
- DOM only first pass.
- No private endpoint automation.
- No credential/session storage.
- Shared calendar data requires explicit warning.
