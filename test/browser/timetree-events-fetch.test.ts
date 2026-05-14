import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchCalendarEventsPage } from '../../src/browser/timetree-events-fetch.js';

test('returns single page when chunk flag is false', async () => {
  const result = await fetchCalendarEventsPage({
    calendarId: 1,
    fetchJson: async () => ({
      events: [{
        id: 'event-1', calendar_id: 1, title: 'a', all_day: true,
        start_at: 0, start_timezone: null, end_at: 0, end_timezone: null,
        recurrences: [], alerts: [], attendees: [], attachment: null, files: [],
      }],
      chunk: false,
      since: 1234,
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.page.hasMore, false);
  assert.equal(result.page.cursor, 1234);
  assert.equal(result.page.events.length, 1);
  assert.equal(result.page.events[0].id, 'event-1');
});

test('reports cursor and hasMore when chunk flag is true', async () => {
  const result = await fetchCalendarEventsPage({
    calendarId: 1,
    fetchJson: async () => ({ events: [], chunk: true, since: 5678 }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.page.hasMore, true);
  assert.equal(result.page.cursor, 5678);
});

test('passes since cursor in the request path', async () => {
  const requested: string[] = [];
  await fetchCalendarEventsPage({
    calendarId: 42,
    since: 999,
    fetchJson: async (path) => {
      requested.push(path);
      return { events: [], chunk: false, since: 999 };
    },
  });
  assert.equal(requested[0], '/api/v1/calendar/42/events?since=999');
});

test('omits since query when not provided', async () => {
  const requested: string[] = [];
  await fetchCalendarEventsPage({
    calendarId: 7,
    fetchJson: async (path) => {
      requested.push(path);
      return { events: [], chunk: false, since: 0 };
    },
  });
  assert.equal(requested[0], '/api/v1/calendar/7/events');
});

test('reports invalid envelope when chunk or since are missing or wrong type', async () => {
  const result = await fetchCalendarEventsPage({
    calendarId: 1,
    fetchJson: async () => ({ events: [] }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /chunk must be a boolean/);
});

test('reports invalid events array', async () => {
  const result = await fetchCalendarEventsPage({
    calendarId: 1,
    fetchJson: async () => ({ events: 'not-an-array', chunk: false, since: 0 }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /events must be an array/);
});

test('per-event mapping failures are reported as issues, not silent drop', async () => {
  const result = await fetchCalendarEventsPage({
    calendarId: 1,
    fetchJson: async () => ({
      events: [{ id: 'broken' /* missing required fields */ }],
      chunk: false, since: 0,
    }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /events\[0\]\./);
});
