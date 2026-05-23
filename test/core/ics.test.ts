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
