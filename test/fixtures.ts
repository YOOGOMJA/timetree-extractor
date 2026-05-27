import type { RawTimeTreeCalendar, RawTimeTreeEvent, RawTimeTreeLabel } from '../src/core/contracts.js';

export const calendarFixture: RawTimeTreeCalendar = {
  id: 1,
  aliasCode: 'calendar-alias',
  name: 'Synthetic Calendar',
};

export const labelsFixture: RawTimeTreeLabel[] = [
  { id: 10, calendarId: 1, name: 'Family', color: 3, defaultColor: 3, order: 1 },
];

export const timedEventFixture: RawTimeTreeEvent = {
  id: 'event-timed-1',
  calendarId: 1,
  title: 'Synthetic timed event',
  allDay: false,
  startAt: Date.UTC(2026, 4, 5, 1, 0, 0),
  startTimezone: 'Asia/Seoul',
  endAt: Date.UTC(2026, 4, 5, 2, 0, 0),
  endTimezone: 'Asia/Seoul',
  labelId: 10,
  location: 'Synthetic location',
  url: 'https://example.test/event',
  note: 'Synthetic note',
  recurrences: [],
  alerts: [],
  attendees: [],
  attachment: null,
  files: [],
  updatedAt: Date.UTC(2026, 4, 1, 0, 0, 0),
  createdAt: Date.UTC(2026, 3, 1, 0, 0, 0),
  deactivatedAt: null,
  extractionWarnings: [],
};

export const allDayEventFixture: RawTimeTreeEvent = {
  ...timedEventFixture,
  id: 'event-all-day-1',
  title: 'Synthetic all-day event',
  allDay: true,
  startAt: Date.UTC(2026, 4, 5, 0, 0, 0),
  startTimezone: null,
  endAt: Date.UTC(2026, 4, 6, 0, 0, 0),
  endTimezone: null,
  recurrences: [],
};

export const weeklyRecurringEventFixture: RawTimeTreeEvent = {
  ...timedEventFixture,
  id: 'event-recurring-weekly-1',
  title: 'Synthetic weekly recurring event',
  recurrences: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'],
  recurringUuid: 'recurring-synthetic-1',
};

export const unsupportedRecurringEventFixture: RawTimeTreeEvent = {
  ...timedEventFixture,
  id: 'event-recurring-unsupported-1',
  title: 'Synthetic unsupported recurrence event',
  recurrences: ['RRULE:FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=5'],
};

export const missingTimezoneTimedEventFixture: RawTimeTreeEvent = {
  ...timedEventFixture,
  id: 'event-missing-timezone-1',
  startTimezone: null,
  endTimezone: null,
};

// Mid-January 시각으로 고정한다 — America/New_York이 EST(-0500)인 구간이라
// STANDARD-only VTIMEZONE이 자신 있게 동작하는 윈도(no DST 경계 침범).
export const newYorkTimedEventFixture: RawTimeTreeEvent = {
  ...timedEventFixture,
  id: 'event-new-york-1',
  title: 'Synthetic NYC event',
  startAt: Date.UTC(2026, 0, 15, 14, 0, 0),
  startTimezone: 'America/New_York',
  endAt: Date.UTC(2026, 0, 15, 15, 0, 0),
  endTimezone: 'America/New_York',
};

// 75 octet line folding 검증용. SUMMARY는 한글 다수 + ASCII 결합으로
// UTF-8 byte 길이가 75를 명백히 초과하도록 구성한다. multi-byte continuation
// 경계에서 잘리지 않아야 한다 (foldLine의 isUtf8ContinuationByte 가드).
export const longKoreanSummaryEventFixture: RawTimeTreeEvent = {
  ...timedEventFixture,
  id: 'event-long-korean-summary-1',
  title: '한글로 작성된 매우 긴 일정 제목 — 이 라인은 75 octet 한도를 분명히 넘기며 멀티바이트 경계에서 깨지면 안 된다 (RFC 5545 §3.1)',
};
