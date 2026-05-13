# TimeTree Web Data Surface Research

결론: **DOM only first pass는 fail이다.** TimeTree Web DOM에서 `calendar name`, `event title`, `event identifier`, `start/end time`, `recurrence`, 일부 `label`, 일부 `author`, `created/updated activity`는 확인 가능했다. 하지만 P0 field인 `timezone`이 DOM에 명시적으로 노출되지 않았고, `all-day 여부`도 explicit boolean이 아니라 DOM 구조와 time text 유무로 추론해야 한다. 따라서 이 milestone은 같은 pass 안에서 network observation으로 확장하지 않고 종료한다.

## Prerequisite research

이 조사는 `docs/research/timetree-policy-and-web-research.md`를 전제로 한다. 2026-05-13 기준 공식 TimeTree calendar export와 공개 developer API는 확인되지 않았으므로, 첫 pass는 official API integration이 아니라 사용자가 로그인한 Web 화면의 DOM data surface 확인이다.

## 검증한 가정

TimeTree Web에서 사용자가 접근 가능한 일정 목록과 상세 정보를 local browser extension이 `JSON` backup과 `ICS` export에 충분한 수준으로 수집할 수 있다.

## 조사 환경

- 확인일: 2026-05-13
- Browser access: `agent-browser`를 통한 로그인된 TimeTree Web 화면 조작
- Evidence boundary: DOM only
- Network response observation: 하지 않음
- Credential/session token 확인 또는 저장: 하지 않음
- 대상 calendar: 실제 shared calendar로 보이는 개인 calendar
- Privacy handling: 문서에는 event title 원문을 일반화하거나 sample label로 대체한다.

## 조사 대상 화면

- monthly view
- weekly view
- event detail surface
- calendar selection/sidebar 영역
- next month / next week navigation

## 확인한 sample

| Sample | 유형 | 확인 목적 | 원문 기록 정책 |
| --- | --- | --- | --- |
| Sample A | 반복 all-day event로 보이는 household event | date-only detail, recurrence, label, activity 확인 | title 비공개 |
| Sample B | timed event | start/end date-time, author avatar, label, activity 확인 | title 비공개 |
| Monthly view | calendar grid | event title/time 노출과 month navigation 확인 | title 비공개 |
| Weekly view | all-day row와 timed row | all-day/timed DOM 분리와 timed event cell 확인 | title 비공개 |

## 확인한 field

| Field | Priority | 접근 가능 여부 | 근거 | 메모 |
| --- | --- | --- | --- | --- |
| calendar name | P0 | accessible | Page title과 sidebar calendar button에 calendar name 노출 | `document.title`에도 calendar name이 포함됨 |
| event identifier | P1 | accessible | Event detail URL path에 event identifier 포함 | DOM text는 아니지만 현재 page URL에서 확인 가능 |
| title | P0 | accessible | Event detail `h1[data-test-id="event-title"]`; monthly/weekly event button text | DOM에 직접 노출됨 |
| start time and end time | P0 | accessible for timed events / partial for all-day events | Timed event detail에 `event-date-time-start`, `event-date-time-end` 노출 | All-day로 보이는 event는 date-only text만 표시됨 |
| all-day 여부 | P0 | uncertain / inferable | Weekly view에 `allday-event-cell-YYYY-MM-DD`, timed event에는 `timed-event-*`; detail은 time text 유무로 구분 가능 | Explicit `allDay=true` 같은 field는 DOM에서 확인하지 못함 |
| timezone | P0 | inaccessible | Timed event detail에 local-looking time text만 있고 timezone label/offset이 없음 | P0 fail 원인 |
| recurrence rule | P0/P1 | accessible as human text | Detail에 `Weekly Sunday, Tuesday, Thursday` 형태 text 노출 | Machine-readable RRULE은 DOM에서 확인하지 못함 |
| memo 또는 description | P1 | not observed | 확인한 sample detail에서 memo/description 본문은 보이지 않음 | memo가 있는 event를 별도 확인해야 함 |
| location | P1 | not observed | 확인한 sample detail에서 location text는 보이지 않음 | location 있는 event를 별도 확인해야 함 |
| label 또는 color | P1 | label accessible / color uncertain | Detail에 label text 노출 | Color는 class/computed style만으로 의미 mapping 불명확 |
| author | P1 | partial | Timed event detail에 `aria-label="avatar of ..."` 형태가 보임 | Text author로는 제한적이고 privacy-sensitive |
| participants | P2 | uncertain | `Join`, member/sidebar UI는 보이나 event participant list는 sample에서 확인하지 못함 | 별도 event 필요 |
| comments | P2 | UI accessible / content not observed | Comment textbox, Send button 노출 | 기존 comment content는 sample에서 확인하지 못함 |
| attachments | P2 | UI accessible / content not observed | `Add Image` button, file input 노출 | 기존 attachment list는 sample에서 확인하지 못함 |
| reminders | P2 | activity partial | Activity list에 `Reminder updated` text 확인 | 실제 reminder schedule은 DOM에서 확인하지 못함 |
| created time and updated time | P2 | partial | Activity list에 `Event created`, `Member updated`와 date 노출 | Exact timestamp/time-of-day는 보이지 않음 |
| original URL | P1 | accessible | Current location URL | Event URL 보존 가능 |

## DOM observations

### Event detail

확인된 stable-looking markers:

- `data-test-id="event-detail"`
- `data-test-id="event-title"`
- `data-test-id="event-date-time-start"` for timed event
- `data-test-id="event-date-time-end"` for timed event
- `data-test-id="event-activity-list"`
- `data-test-id="event-detail-activity-list"`

Timed event detail에서 확인한 구조:

```text
Event details
[title]
[weekday, month day year]
[start time]
[weekday, month day year]
[end time]
[label]
[created date]
Event created
```

All-day로 보이는 recurring event detail에서 확인한 구조:

```text
Event details
[title]
[weekday, month day, year]
Weekly Sunday, Tuesday, Thursday
[label]
[activity dates]
Event created
Reminder updated
Member updated
```

### Monthly view

- `data-test-id="monthly-calendar"` 확인
- Event button text에 title이 노출됨
- Timed event는 monthly cell 안에 time text가 함께 표시되는 경우가 있음
- `+N` overflow button이 있어 monthly view만으로는 하루의 모든 event를 펼쳐야 할 수 있음
- Next month button으로 June 2026 이동 가능했고, URL은 `/monthly`를 유지하면서 pagination text가 바뀜

### Weekly view

- `data-test-id="weekly-calendar-root"` 확인
- All-day row가 DOM text에 `All-day`로 노출됨
- All-day events는 `data-test-id="allday-event-cell-YYYY-MM-DD"` 형태로 확인됨
- Timed events는 `data-test-id="timed-event-*"` 형태로 확인됨
- Timed event cell에는 title과 time range가 같이 표시됨
- Next week navigation은 URL을 `/weekly/YYYY-MM-DD` 형태로 바꿈

### Calendar metadata

- Sidebar button에 calendar name이 노출됨
- Page title에도 calendar name이 포함됨
- 여러 calendar가 sidebar에 함께 보임

## Policy and privacy constraints

- Evidence source는 DOM only다.
- Network response observation은 첫 pass에서 제외했다.
- Private endpoint reverse engineering은 하지 않았다.
- Credential 또는 session token을 저장하지 않았다.
- Server-side collection이나 storage를 만들지 않았다.
- Shared calendar data에는 다른 참가자의 personal information이 포함될 수 있다. 실제 DOM에서도 avatar aria label에 person name이 노출될 수 있음을 확인했다.
- 이 조사는 법률 자문이 아니라 product/policy risk 검토를 반영한 technical validation이다.

## 성공 기준 평가

| 기준 | 평가 | 이유 |
| --- | --- | --- |
| P0 field를 모두 확보할 수 있다 | fail | timezone이 DOM에서 확인되지 않음 |
| P1 field 중 대부분을 확보할 가능성이 있다 | partial | event identifier, original URL, recurrence text, label, partial author/activity는 가능하지만 memo/location은 sample에서 미확인 |
| 최소 1년 이상의 사용자 지정 기간 backup 가능성이 보인다 | fail / not proven | monthly/weekly navigation은 가능하지만 full-range 수집은 overflow 처리와 UI navigation에 의존함 |
| server 전송 없이 local processing 가능성이 있다 | partial | DOM read 자체는 local 가능하지만 timezone gap이 남음 |

## 실패 판정

DOM only extraction은 **fail**로 판정한다.

Fail reason:

- P0 field인 timezone이 DOM detail에서 명시적으로 확인되지 않았다.
- all-day 여부가 explicit field가 아니라 DOM structure와 time text 유무에 의존한다.
- 1년 이상 backup 가능성은 month/week navigation과 overflow expansion에 의존하며, DOM only로 안정성을 증명하지 못했다.

## 다음 decision 필요

같은 milestone 안에서 network observation으로 확장하지 않는다. 다음 중 하나를 별도 decision으로 선택해야 한다.

1. **Network observation 허용 여부 검토**
   - Timezone, all-day, recurrence, memo/location의 machine-readable source를 확인할 수 있는지 검토
   - Policy risk가 커지므로 별도 decision 필요
2. **DOM only 기반 limited exporter로 축소**
   - Timezone은 user-selected default timezone으로 처리
   - all-day는 heuristic으로 처리
   - Data loss warning을 강하게 표시
3. **Manual backup assistant로 방향 전환**
   - 자동 export가 아니라 사용자가 event를 수동 확인하면서 구조화하도록 돕는 도구
4. **보류**
   - P0 field gap이 product value를 훼손한다고 판단하면 구현 보류

## Raw event contract draft 가능성

DOM only pass는 fail이지만, limited raw event draft는 만들 수 있다.

```ts
type DomObservedEvent = {
  source: 'timetree-web-dom';
  calendarName: string;
  eventUrl: string;
  eventIdFromUrl?: string;
  title: string;
  dateText: string;
  startText?: string;
  endText?: string;
  recurrenceText?: string;
  labelText?: string;
  authorDisplayText?: string;
  activityText?: string[];
  inferredAllDay?: boolean;
  timezone: null;
  extractionWarnings: string[];
};
```

이 contract는 backup 원본 보존용 draft로는 가능하지만, reliable `ICS` migration contract로는 부족하다.
