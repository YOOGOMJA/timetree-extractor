import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createExportPreview } from '../../src/cli/export-preview.js';
import {
  allDayEventFixture,
  calendarFixture,
  labelsFixture,
  timedEventFixture,
  weeklyRecurringEventFixture,
} from '../fixtures.js';

test('counts raw inputs, normalized outputs, and ICS structure', () => {
  const summary = createExportPreview({
    rawEvents: [timedEventFixture, allDayEventFixture, weeklyRecurringEventFixture],
    context: { calendar: calendarFixture, labels: labelsFixture },
    now: new Date(Date.UTC(2026, 4, 14, 0, 0, 0)),
  });

  assert.equal(summary.eventCount, 3);
  assert.equal(summary.normalizedCount, 3);
  assert.equal(summary.veventCount, 3);
  assert.ok(summary.icsLineCount > 20);
  assert.equal(summary.hasDtStart, true);
  assert.equal(summary.hasDtEnd, true);
  assert.equal(summary.hasRRule, true);
});

test('aggregates normalization warnings by name', () => {
  const summary = createExportPreview({
    rawEvents: [
      { ...timedEventFixture, title: '' },
      { ...timedEventFixture, id: 'attach-1', attachment: { uuid: 'x' } },
      { ...timedEventFixture, id: 'attach-2', files: [{ uuid: 'y' }] },
    ],
    context: { calendar: calendarFixture, labels: labelsFixture },
  });

  assert.equal(summary.warningCounts['title-empty'], 1);
  assert.equal(summary.warningCounts['attachment-omitted'], 2);
});

test('reports normalization failures without dropping the eventCount', () => {
  const summary = createExportPreview({
    rawEvents: [
      timedEventFixture,
      { ...timedEventFixture, id: 'broken', startTimezone: null, allDay: false },
    ],
    context: { calendar: calendarFixture, labels: labelsFixture },
  });

  assert.equal(summary.eventCount, 2);
  assert.equal(summary.normalizedCount, 1);
  assert.equal(summary.veventCount, 1);
});

test('summary does not leak raw event values', () => {
  const summary = createExportPreview({
    rawEvents: [
      {
        ...timedEventFixture,
        title: 'SECRET-TITLE-7af3',
        note: 'SECRET-NOTE-9b21',
        location: 'SECRET-LOCATION-2c80',
        url: 'https://secret.test/SECRET-URL-3df1',
        attendees: [{ id: 'SECRET-ATTENDEE-44e2' }],
      },
    ],
    context: { calendar: calendarFixture, labels: labelsFixture },
  });

  const serialized = JSON.stringify(summary);
  for (const needle of [
    'SECRET-TITLE-7af3',
    'SECRET-NOTE-9b21',
    'SECRET-LOCATION-2c80',
    'SECRET-URL-3df1',
    'SECRET-ATTENDEE-44e2',
  ]) {
    assert.equal(serialized.includes(needle), false, `summary leaked raw value: ${needle}`);
  }
});
