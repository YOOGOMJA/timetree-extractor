import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allDayEventFixture,
  calendarFixture,
  labelsFixture,
  missingTimezoneTimedEventFixture,
  timedEventFixture,
  unsupportedRecurringEventFixture,
  weeklyRecurringEventFixture,
} from '../fixtures.js';
import { normalizeRawTimeTreeEvent } from '../../src/core/normalize.js';

test('normalizes a timed event while preserving timezone and source identifiers', () => {
  const result = normalizeRawTimeTreeEvent(timedEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.uid, 'timetree:1:event-timed-1');
  assert.deepEqual(result.value.start, {
    kind: 'date-time',
    epochMs: timedEventFixture.startAt,
    timezone: 'Asia/Seoul',
  });
  assert.deepEqual(result.value.end, {
    kind: 'date-time',
    epochMs: timedEventFixture.endAt,
    timezone: 'Asia/Seoul',
  });
  assert.deepEqual(result.value.labels, ['Family']);
});

test('normalizes an all-day event to date-only boundaries', () => {
  const result = normalizeRawTimeTreeEvent(allDayEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.start, { kind: 'date', date: '2026-05-05' });
  assert.deepEqual(result.value.end, { kind: 'date', date: '2026-05-06' });
});

test('fails timed normalization when timezone is missing', () => {
  const result = normalizeRawTimeTreeEvent(missingTimezoneTimedEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /startTimezone/);
});

test('preserves supported recurrence rules', () => {
  const result = normalizeRawTimeTreeEvent(weeklyRecurringEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.recurrence, {
    rrule: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'],
  });
  assert.equal(result.value.warnings.includes('recurrence-unsupported'), false);
});

test('marks unsupported recurrence without silently dropping the source rule', () => {
  const result = normalizeRawTimeTreeEvent(unsupportedRecurringEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.recurrence, {
    rrule: ['RRULE:FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=5'],
  });
  assert.equal(result.value.warnings.includes('recurrence-unsupported'), true);
});

test('normalizes an empty title to a placeholder with an explicit warning', () => {
  const result = normalizeRawTimeTreeEvent({ ...timedEventFixture, title: '' }, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.title, '(untitled TimeTree event)');
  assert.equal(result.value.warnings.includes('title-empty'), true);
});

test('warns when participant and attachment data are intentionally omitted', () => {
  const result = normalizeRawTimeTreeEvent({
    ...timedEventFixture,
    attendees: [{ id: 'synthetic-attendee' }],
    files: [{ uuid: 'synthetic-file' }],
  }, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.warnings.includes('participant-omitted'), true);
  assert.equal(result.value.warnings.includes('attachment-omitted'), true);
});
