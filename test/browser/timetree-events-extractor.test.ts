import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCalendarEvents } from '../../src/browser/timetree-events-extractor.js';

function makeEvent(id: string) {
  return {
    id, calendar_id: 1, title: 't', all_day: true,
    start_at: 0, start_timezone: null, end_at: 0, end_timezone: null,
    recurrences: [], alerts: [], attendees: [], attachment: null, files: [],
  };
}

test('returns events from single page when chunk is false', async () => {
  const result = await extractCalendarEvents({
    calendarId: 1,
    fetchJson: async () => ({ events: [makeEvent('a')], chunk: false, since: 1 }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1);
  assert.equal(result.lastCursor, 1);
});

test('follows cursor through multiple chunks until hasMore is false', async () => {
  const calls: string[] = [];
  const result = await extractCalendarEvents({
    calendarId: 1,
    fetchJson: async (path) => {
      calls.push(path);
      if (calls.length === 1) return { events: [makeEvent('a')], chunk: true, since: 10 };
      if (calls.length === 2) return { events: [makeEvent('b')], chunk: true, since: 20 };
      return { events: [makeEvent('c')], chunk: false, since: 30 };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.events.length, 3);
  assert.equal(result.lastCursor, 30);
  assert.equal(calls[0], '/api/v1/calendar/1/events');
  assert.equal(calls[1], '/api/v1/calendar/1/events?since=10');
  assert.equal(calls[2], '/api/v1/calendar/1/events?since=20');
});

test('respects maxPages safety bound and reports when bound is hit', async () => {
  const result = await extractCalendarEvents({
    calendarId: 1,
    maxPages: 2,
    fetchJson: async () => ({ events: [makeEvent('a')], chunk: true, since: 99 }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /maxPages/);
});

test('aborts when cursor does not advance (server stuck)', async () => {
  const result = await extractCalendarEvents({
    calendarId: 1,
    fetchJson: async () => ({ events: [makeEvent('a')], chunk: true, since: 5 }),
  });
  // Even with chunk: true, cursor stays at 5 → should abort instead of looping
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /cursor did not advance/);
});

test('propagates per-page errors immediately without further pagination', async () => {
  let calls = 0;
  const result = await extractCalendarEvents({
    calendarId: 1,
    fetchJson: async () => {
      calls++;
      return { events: 'broken', chunk: false, since: 0 };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.match(result.issues.join('\n'), /events must be an array/);
});

test('honors since as starting cursor', async () => {
  const calls: string[] = [];
  await extractCalendarEvents({
    calendarId: 1,
    since: 42,
    fetchJson: async (path) => {
      calls.push(path);
      return { events: [], chunk: false, since: 42 };
    },
  });
  assert.equal(calls[0], '/api/v1/calendar/1/events?since=42');
});
