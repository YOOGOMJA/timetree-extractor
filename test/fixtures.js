export const calendarFixture = {
  id: 1,
  aliasCode: 'calendar-alias',
  name: 'Synthetic Calendar',
};

export const labelsFixture = [
  { id: 10, calendarId: 1, name: 'Family', color: 3, defaultColor: 3, order: 1 },
];

export const timedEventFixture = {
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

export const allDayEventFixture = {
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

export const weeklyRecurringEventFixture = {
  ...timedEventFixture,
  id: 'event-recurring-weekly-1',
  title: 'Synthetic weekly recurring event',
  recurrences: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'],
  recurringUuid: 'recurring-synthetic-1',
};

export const unsupportedRecurringEventFixture = {
  ...timedEventFixture,
  id: 'event-recurring-unsupported-1',
  title: 'Synthetic unsupported recurrence event',
  recurrences: ['RRULE:FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=5'],
};

export const missingTimezoneTimedEventFixture = {
  ...timedEventFixture,
  id: 'event-missing-timezone-1',
  startTimezone: null,
  endTimezone: null,
};
