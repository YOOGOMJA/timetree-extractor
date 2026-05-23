import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRawTimeTreeEvent } from '../../src/core/normalize.js';
import { createIcsCalendar } from '../../src/core/ics.js';
import { allDayEventFixture, calendarFixture, labelsFixture, timedEventFixture, weeklyRecurringEventFixture } from '../fixtures.js';

function normalized(rawEvent: unknown) {
  const result = normalizeRawTimeTreeEvent(rawEvent, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true);
  return result.value;
}

test('writes a timed event with TZID based DTSTART and DTEND', () => {
  const ics = createIcsCalendar([normalized(timedEventFixture)], {
    prodId: '-//timetree-exporter//test//EN',
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-\/\/timetree-exporter\/\/test\/\/EN\r\n/u);
  assert.match(ics, /BEGIN:VEVENT\r\n/);
  assert.match(ics, /UID:timetree:1:event-timed-1\r\n/);
  assert.match(ics, /DTSTAMP:20260101T000000Z\r\n/);
  assert.match(ics, /SUMMARY:Synthetic timed event\r\n/);
  assert.match(ics, /DTSTART;TZID=Asia\/Seoul:20260505T100000\r\n/);
  assert.match(ics, /DTEND;TZID=Asia\/Seoul:20260505T110000\r\n/);
  assert.match(ics, /LOCATION:Synthetic location\r\n/);
  assert.match(ics, /DESCRIPTION:Synthetic note\r\n/);
  assert.match(ics, /URL:https:\/\/example.test\/event\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test('writes an all-day event with VALUE=DATE boundaries', () => {
  const ics = createIcsCalendar([normalized(allDayEventFixture)], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.match(ics, /DTSTART;VALUE=DATE:20260505\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20260506\r\n/);
});

test('preserves normalized recurrence lines without duplicating property names', () => {
  const ics = createIcsCalendar([normalized(weeklyRecurringEventFixture)], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE\r\n/);
  assert.doesNotMatch(ics, /RRULE:RRULE:/);
});

test('does not duplicate property name for RDATE lines with parameters', () => {
  const event = normalized({
    ...timedEventFixture,
    id: 'event-rdate-with-params',
    recurrences: ['RDATE;TZID="UTC";VALUE=DATE:20260905,20270825'],
    recurringUuid: 'recurring-rdate-1',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.doesNotMatch(ics, /RDATE:RDATE/);
  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /RDATE;TZID="UTC";VALUE=DATE:20260905,20270825\r\n/);
});

test('does not duplicate property name for EXDATE lines with parameters', () => {
  const event = normalized({
    ...timedEventFixture,
    id: 'event-exdate-with-params',
    recurrences: ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE;TZID="UTC";VALUE=DATE:20260907'],
    recurringUuid: 'recurring-exdate-1',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.doesNotMatch(ics, /EXDATE:EXDATE/);
  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /EXDATE;TZID="UTC";VALUE=DATE:20260907\r\n/);
});

test('preserves URL property without TEXT escaping', () => {
  const event = normalized({
    ...timedEventFixture,
    url: 'https://example.test/path;key=a,b',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.match(ics, /URL:https:\/\/example.test\/path;key=a,b\r\n/);
});

test('folds long unicode lines at UTF-8 octet boundaries without breaking code points', () => {
  const event = normalized({
    ...timedEventFixture,
    note: '한글'.repeat(40),
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  for (const line of ics.split('\r\n')) {
    assert.ok(new TextEncoder().encode(line).byteLength <= 75, `line exceeds 75 octets without folding: ${line}`);
  }

  const unfolded = ics.replaceAll('\r\n ', '');
  assert.ok(unfolded.includes('한글'.repeat(40)), 'multi-byte content survives folding after unfold');
});

test('escapes ICS text values', () => {
  const event = normalized({
    ...timedEventFixture,
    title: 'Comma, semicolon; slash\\ newline\ntext',
    note: 'Line 1\nLine 2',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.match(ics, /SUMMARY:Comma\\, semicolon\\; slash\\\\ newline\\ntext\r\n/);
  assert.match(ics, /DESCRIPTION:Line 1\\nLine 2\r\n/);
});

test('emits a VTIMEZONE block for Asia/Seoul when a timed event uses it', () => {
  const ics = createIcsCalendar([normalized(timedEventFixture)], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /BEGIN:VTIMEZONE\r\nTZID:Asia\/Seoul\r\n/);
  assert.match(unfolded, /BEGIN:STANDARD\r\n[\s\S]*?TZOFFSETFROM:\+0900\r\n/);
  assert.match(unfolded, /BEGIN:STANDARD\r\n[\s\S]*?TZOFFSETTO:\+0900\r\n/);
  assert.match(unfolded, /TZNAME:KST\r\n/);
  assert.match(unfolded, /END:STANDARD\r\nEND:VTIMEZONE\r\n/);
});

test('places every VTIMEZONE block before the first VEVENT', () => {
  const ics = createIcsCalendar([normalized(timedEventFixture)], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const firstVtimezone = ics.indexOf('BEGIN:VTIMEZONE');
  const firstVevent = ics.indexOf('BEGIN:VEVENT');
  assert.notStrictEqual(firstVtimezone, -1, 'expected a VTIMEZONE block');
  assert.notStrictEqual(firstVevent, -1, 'expected a VEVENT block');
  assert.ok(firstVtimezone < firstVevent, 'VTIMEZONE must precede VEVENT');
});

test('emits only one VTIMEZONE block when many events share a single TZID', () => {
  const ics = createIcsCalendar(
    [
      normalized({ ...timedEventFixture, id: 'event-shared-tz-1' }),
      normalized({ ...timedEventFixture, id: 'event-shared-tz-2' }),
      normalized({ ...timedEventFixture, id: 'event-shared-tz-3' }),
    ],
    { now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)) },
  );

  const matches = ics.match(/BEGIN:VTIMEZONE/g) ?? [];
  assert.equal(matches.length, 1, 'expected exactly one VTIMEZONE for a shared TZID');
});

test('emits no VTIMEZONE block when only all-day events are exported', () => {
  const ics = createIcsCalendar([normalized(allDayEventFixture)], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.doesNotMatch(ics, /BEGIN:VTIMEZONE/);
});

test('emits a VTIMEZONE for a TZID referenced only inside a recurrence line', () => {
  const event = normalized({
    ...allDayEventFixture,
    id: 'event-rdate-utc-only',
    recurrences: ['RDATE;TZID="UTC";VALUE=DATE:20260905,20270825'],
    recurringUuid: 'recurring-utc-rdate-1',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /BEGIN:VTIMEZONE\r\nTZID:UTC\r\n/);
  assert.match(unfolded, /TZOFFSETFROM:\+0000\r\n/);
  assert.match(unfolded, /TZOFFSETTO:\+0000\r\n/);
});

test('derives America/New_York VTIMEZONE offset from event time (January is EST -0500, July is EDT -0400)', () => {
  const januaryEvent = normalized({
    ...timedEventFixture,
    id: 'event-ny-january-1',
    startTimezone: 'America/New_York',
    endTimezone: 'America/New_York',
    startAt: Date.UTC(2026, 0, 15, 17, 0, 0),
    endAt: Date.UTC(2026, 0, 15, 18, 0, 0),
  });
  const julyEvent = normalized({
    ...timedEventFixture,
    id: 'event-ny-july-1',
    startTimezone: 'America/New_York',
    endTimezone: 'America/New_York',
    startAt: Date.UTC(2026, 6, 15, 17, 0, 0),
    endAt: Date.UTC(2026, 6, 15, 18, 0, 0),
  });

  const januaryIcs = createIcsCalendar([januaryEvent], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });
  const julyIcs = createIcsCalendar([julyEvent], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const januaryUnfolded = januaryIcs.replaceAll('\r\n ', '');
  const julyUnfolded = julyIcs.replaceAll('\r\n ', '');

  assert.match(januaryUnfolded, /TZID:America\/New_York\r\n/);
  assert.match(januaryUnfolded, /TZOFFSETFROM:-0500\r\n/);
  assert.match(januaryUnfolded, /TZOFFSETTO:-0500\r\n/);

  assert.match(julyUnfolded, /TZID:America\/New_York\r\n/);
  assert.match(julyUnfolded, /TZOFFSETFROM:-0400\r\n/);
  assert.match(julyUnfolded, /TZOFFSETTO:-0400\r\n/);
});

test('emits two VTIMEZONE blocks for a mixed Asia/Seoul + UTC calendar', () => {
  const seoulEvent = normalized(timedEventFixture);
  const utcEvent = normalized({
    ...timedEventFixture,
    id: 'event-mixed-utc-1',
    startTimezone: 'UTC',
    endTimezone: 'UTC',
  });

  const ics = createIcsCalendar([seoulEvent, utcEvent], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const matches = ics.match(/BEGIN:VTIMEZONE/g) ?? [];
  assert.equal(matches.length, 2, 'expected one VTIMEZONE block per unique TZID');
  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /TZID:Asia\/Seoul\r\n/);
  assert.match(unfolded, /TZID:UTC\r\n/);
});
