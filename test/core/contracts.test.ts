import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allDayEventFixture,
  missingTimezoneTimedEventFixture,
  timedEventFixture,
  weeklyRecurringEventFixture,
} from '../fixtures.js';
import { validateRawTimeTreeEvent, validateRawTimeTreeLabel } from '../../src/core/contracts.js';

test('accepts a valid timed raw TimeTree event contract', () => {
  const result = validateRawTimeTreeEvent(timedEventFixture);

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.value.id, 'event-timed-1');
});

test('accepts an all-day event without timezone values', () => {
  const result = validateRawTimeTreeEvent(allDayEventFixture);

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test('rejects a timed event when timezone values are missing', () => {
  const result = validateRawTimeTreeEvent(missingTimezoneTimedEventFixture);

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /startTimezone/);
  assert.match(result.issues.join('\n'), /endTimezone/);
});

test('requires recurrence values to be strings', () => {
  const result = validateRawTimeTreeEvent({
    ...weeklyRecurringEventFixture,
    recurrences: ['RRULE:FREQ=WEEKLY;BYDAY=MO', 123],
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /recurrences\[1\]/);
});

test('captures optional recurStartAt/recurEndAt for modified recurring instances', () => {
  const result = validateRawTimeTreeEvent({
    ...weeklyRecurringEventFixture,
    recurStartAt: 1_767_000_000_000,
    recurEndAt: 1_767_003_600_000,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.value.recurStartAt, 1_767_000_000_000);
  assert.equal(result.value.recurEndAt, 1_767_003_600_000);
});

test('rejects a non-number recurStartAt', () => {
  const result = validateRawTimeTreeEvent({
    ...weeklyRecurringEventFixture,
    recurStartAt: 'nope',
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /recurStartAt/);
});

test('accepts label metadata used for event label normalization', () => {
  const result = validateRawTimeTreeLabel({
    id: 10,
    calendarId: 1,
    name: 'Family',
    color: 3,
    defaultColor: 3,
    order: 1,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});
