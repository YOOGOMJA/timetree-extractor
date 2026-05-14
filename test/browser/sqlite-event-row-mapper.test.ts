import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRawTimeTreeEvent } from '../../src/core/contracts.js';
import { mapSqliteEventRowToRawTimeTreeEvent } from '../../src/browser/sqlite-event-row-mapper.js';

test('maps SQLite events row into the stable raw TimeTree event contract', () => {
  const raw = mapSqliteEventRowToRawTimeTreeEvent({
    id: 'event-1',
    calendar_id: 123,
    title: 'Dinner',
    all_day: 0,
    start_at: 1_767_000_000_000,
    start_timezone: 'Asia/Seoul',
    end_at: 1_767_003_600_000,
    end_timezone: 'Asia/Seoul',
    label_id: 10,
    location: 'Seoul',
    url: null,
    note: 'memo',
    recurrences: Uint8Array.from([]),
    recurring_uuid: null,
    updated_at: 1_767_000_000_001,
    created_at: 1_767_000_000_002,
    deactivated_at: null,
  });

  assert.deepEqual(raw, {
    id: 'event-1',
    calendarId: 123,
    title: 'Dinner',
    allDay: false,
    startAt: 1_767_000_000_000,
    startTimezone: 'Asia/Seoul',
    endAt: 1_767_003_600_000,
    endTimezone: 'Asia/Seoul',
    labelId: 10,
    location: 'Seoul',
    url: null,
    note: 'memo',
    recurrences: [],
    recurringUuid: null,
    alerts: [],
    attendees: [],
    attachment: null,
    files: [],
    updatedAt: 1_767_000_000_001,
    createdAt: 1_767_000_000_002,
    deactivatedAt: null,
    extractionWarnings: ['internal-api-surface'],
  });
  assert.equal(validateRawTimeTreeEvent(raw).ok, true);
});

test('marks binary recurrence and privacy-sensitive SQLite JSONB fields without leaking them', () => {
  const raw = mapSqliteEventRowToRawTimeTreeEvent({
    id: 'event-2',
    calendar_id: 123,
    title: 'Recurring',
    all_day: 1,
    start_at: 1_767_000_000_000,
    start_timezone: 'Asia/Seoul',
    end_at: 1_767_086_400_000,
    end_timezone: 'Asia/Seoul',
    recurrences: Uint8Array.from([1, 2, 3]),
    attendees: Uint8Array.from([1, 2]),
    alerts: Uint8Array.from([1, 2]),
    attachment: Uint8Array.from([1]),
    files: Uint8Array.from([1, 2]),
  });

  assert.deepEqual(raw.recurrences, []);
  assert.deepEqual(raw.attendees, []);
  assert.deepEqual(raw.alerts, []);
  assert.equal(raw.attachment, null);
  assert.deepEqual(raw.files, []);
  assert.deepEqual(raw.extractionWarnings, [
    'internal-api-surface',
    'recurrence-not-normalized',
    'shared-calendar-personal-data',
    'unsupported-attachment',
  ]);
  assert.equal(validateRawTimeTreeEvent(raw).ok, true);
});


test('decodes SQLite JSONB text recurrence arrays into raw recurrence strings', () => {
  const raw = mapSqliteEventRowToRawTimeTreeEvent({
    id: 'event-3',
    calendar_id: 123,
    title: 'Recurring',
    all_day: 0,
    start_at: 1_767_000_000_000,
    start_timezone: 'Asia/Seoul',
    end_at: 1_767_003_600_000,
    end_timezone: 'Asia/Seoul',
    recurrences: '["RRULE:FREQ=WEEKLY;BYDAY=MO"]',
  });

  assert.deepEqual(raw.recurrences, ['RRULE:FREQ=WEEKLY;BYDAY=MO']);
  assert.deepEqual(raw.extractionWarnings, ['internal-api-surface']);
  assert.equal(validateRawTimeTreeEvent(raw).ok, true);
});

test('warns on decoded privacy JSON without carrying private arrays forward', () => {
  const raw = mapSqliteEventRowToRawTimeTreeEvent({
    id: 'event-4',
    calendar_id: 123,
    title: 'Private metadata',
    all_day: 0,
    start_at: 1_767_000_000_000,
    start_timezone: 'Asia/Seoul',
    end_at: 1_767_003_600_000,
    end_timezone: 'Asia/Seoul',
    recurrences: '[]',
    attendees: '[1,2]',
    attachment: '{}',
    files: '[]',
  });

  assert.deepEqual(raw.attendees, []);
  assert.equal(raw.attachment, null);
  assert.deepEqual(raw.files, []);
  assert.deepEqual(raw.extractionWarnings, ['internal-api-surface', 'shared-calendar-personal-data']);
});
