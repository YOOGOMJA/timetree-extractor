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
      { ...timedEventFixture, id: 'attach-1', attachmentCount: 1 },
      { ...timedEventFixture, id: 'attach-2', attachmentCount: 1 },
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

test('master+override raw → vevent 2개, 이벤트 드롭 없음', () => {
  const base = { calendarId: 7, category: 'schedule', allDay: false,
    startTimezone: 'Asia/Seoul', endTimezone: 'Asia/Seoul' };
  const summary = createExportPreview({ rawEvents: [
    { ...base, id: 'm', title: 'M', startAt: 1767000000000, endAt: 1767003600000,
      recurrences: ['RRULE:FREQ=WEEKLY;BYDAY=MO'], recurringUuid: 'g1' },
    { ...base, id: 'o', title: 'O', startAt: 1767607200000, endAt: 1767610800000,
      recurrences: [], recurringUuid: 'g1', recurStartAt: 1767604800000 },
  ]});
  assert.equal(summary.normalizedCount, 2);
  assert.equal(summary.veventCount, 2);
});

test('master 없는 override → recurrence-override-orphaned warning 집계', () => {
  const summary = createExportPreview({ rawEvents: [
    { id: 'o', calendarId: 7, category: 'schedule', allDay: false, title: 'O',
      startAt: 1767607200000, endAt: 1767610800000,
      startTimezone: 'Asia/Seoul', endTimezone: 'Asia/Seoul',
      recurrences: [], recurringUuid: 'g1', recurStartAt: 1767604800000 },
  ]});
  assert.equal(summary.warningCounts['recurrence-override-orphaned'], 1);
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
        // 참가자 *내용*은 더 이상 raw에 실리지 않는다(#81) — 개수만.
        participantCount: 1,
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
  ]) {
    assert.equal(serialized.includes(needle), false, `summary leaked raw value: ${needle}`);
  }
});
