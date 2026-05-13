import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapObservedEventsPayload, summarizeObservedEventsPayload } from '../../src/browser/observed-payload.js';

test('summarizes event payload without private text fields', () => {
  const result = summarizeObservedEventsPayload({
    events: [{
      id: 'event-1',
      calendar_id: 123,
      title: 'Private title',
      all_day: false,
      start_at: 1777900000000,
      start_timezone: 'Asia/Seoul',
      end_at: 1777903600000,
      end_timezone: 'Asia/Seoul',
      note: 'Private note',
      location: 'Private location',
      recurrences: [],
      attendees: [{ name: 'Private person' }],
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.eventCount, 1);
  assert.equal(result.summary.p0FieldTypes.title, 'string');
  assert.equal(JSON.stringify(result).includes('Private'), false);
});

test('maps event payload to raw contract in memory', () => {
  const result = mapObservedEventsPayload({
    events: [{
      id: 'event-1',
      calendar_id: 123,
      title: 'Synthetic title',
      all_day: true,
      start_at: 1777852800000,
      start_timezone: null,
      end_at: 1777939200000,
      end_timezone: null,
      recurrences: [],
      attendees: [],
      attachment: null,
      files: [],
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.events[0].id, 'event-1');
  assert.equal(result.events[0].extractionWarnings.includes('internal-api-surface'), true);
});

test('fails closed when events is missing', () => {
  const result = summarizeObservedEventsPayload({ unexpected: [] });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /events must be an array/);
});

test('keeps unsupported recurrence visible as warning path', () => {
  const result = mapObservedEventsPayload({
    events: [{
      id: 'event-1',
      calendar_id: 123,
      title: 'Synthetic title',
      all_day: true,
      start_at: 1777852800000,
      start_timezone: null,
      end_at: 1777939200000,
      end_timezone: null,
      recurrences: [123],
      attendees: [],
      attachment: null,
      files: [],
    }],
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /recurrences\[0\] must be a string/);
});
