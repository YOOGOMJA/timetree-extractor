import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractVisibleTimeTreeEvents,
  mapApiEventToRawTimeTreeEvent,
  parseTimeTreeCalendarAlias,
} from '../../src/browser/timetree-page-extractor.js';

test('parses calendar alias from TimeTree calendar URLs only', () => {
  assert.equal(parseTimeTreeCalendarAlias('https://timetreeapp.com/calendars/abc123/monthly'), 'abc123');
  assert.equal(parseTimeTreeCalendarAlias('https://timetreeapp.com/calendars/abc123/events/event-1'), 'abc123');
  assert.equal(parseTimeTreeCalendarAlias('https://example.com/calendars/abc123/monthly'), null);
});

test('maps snake_case TimeTree API event payload to raw contract shape', () => {
  const raw = mapApiEventToRawTimeTreeEvent({
    id: 'event-1',
    calendar_id: 1,
    title: 'Synthetic event',
    all_day: false,
    start_at: 1777900000000,
    start_timezone: 'Asia/Seoul',
    end_at: 1777903600000,
    end_timezone: 'Asia/Seoul',
    label_id: 10,
    location: 'Synthetic location',
    url: 'https://example.test',
    note: 'Synthetic note',
    recurrences: ['RRULE:FREQ=DAILY'],
    recurring_uuid: 'recurring-1',
    alerts: [],
    attendees: [{ id: 'synthetic-attendee' }],
    attachment: { kind: 'synthetic' },
    files: [{ uuid: 'synthetic-file' }],
    updated_at: 1777900000001,
    created_at: 1777800000001,
    deactivated_at: null,
  });

  assert.equal(raw.id, 'event-1');
  assert.equal(raw.allDay, false);
  assert.equal(raw.startTimezone, 'Asia/Seoul');
  assert.deepEqual(raw.extractionWarnings, [
    'internal-api-surface',
    'shared-calendar-personal-data',
    'unsupported-attachment',
  ]);
});

test('treats null updated_at and created_at the same as missing', () => {
  const raw = mapApiEventToRawTimeTreeEvent({
    id: 'event-null-ts',
    calendar_id: 1,
    title: 't',
    all_day: true,
    start_at: 0,
    start_timezone: null,
    end_at: 0,
    end_timezone: null,
    recurrences: [],
    alerts: [],
    attendees: [],
    attachment: null,
    files: [],
    updated_at: null,
    created_at: null,
  });
  assert.equal(raw.updatedAt, undefined);
  assert.equal(raw.createdAt, undefined);
});

test('extracts via injected page fetch without exposing credentials or headers', async () => {
  const requested: string[] = [];
  const result = await extractVisibleTimeTreeEvents({
    locationHref: 'https://timetreeapp.com/calendars/alias123/monthly',
    calendarId: 1,
    since: 123,
    fetchJson: async (path) => {
      requested.push(path);
      return {
        events: [{
          id: 'event-1',
          calendar_id: 1,
          title: 'Synthetic event',
          all_day: true,
          start_at: 1777852800000,
          start_timezone: null,
          end_at: 1777939200000,
          end_timezone: null,
          recurrences: [],
          alerts: [],
          attendees: [],
          attachment: null,
          files: [],
        }],
        chunk: false,
        since: 123,
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.calendarAlias, 'alias123');
  assert.equal(requested[0], '/api/v1/calendar/1/events?since=123');
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].allDay, true);
  assert.equal(result.events[0].extractionWarnings.includes('internal-api-surface'), true);
});

test('reports invalid page payload shape instead of treating it as empty events', async () => {
  const result = await extractVisibleTimeTreeEvents({
    locationHref: 'https://timetreeapp.com/calendars/alias123/monthly',
    calendarId: 1,
    fetchJson: async () => ({ events: 'not-an-array', chunk: false, since: 0 }),
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /events must be an array/);
});

test('reports malformed recurrence values instead of dropping them silently', async () => {
  const result = await extractVisibleTimeTreeEvents({
    locationHref: 'https://timetreeapp.com/calendars/alias123/monthly',
    calendarId: 1,
    fetchJson: async () => ({
      events: [{
        id: 'event-1',
        calendar_id: 1,
        title: 'Synthetic event',
        all_day: true,
        start_at: 1777852800000,
        start_timezone: null,
        end_at: 1777939200000,
        end_timezone: null,
        recurrences: [123],
        alerts: [],
        attendees: [],
        attachment: null,
        files: [],
      }],
      chunk: false,
      since: 0,
    }),
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /recurrences\[0\] must be a string/);
});

test('refuses extraction outside TimeTree origin', async () => {
  const result = await extractVisibleTimeTreeEvents({
    locationHref: 'https://example.com/calendars/alias123/monthly',
    calendarId: 1,
    fetchJson: async () => ({ events: [] }),
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /TimeTree origin/);
});

test('extractVisibleTimeTreeEvents follows pagination internally', async () => {
  let call = 0;
  const result = await extractVisibleTimeTreeEvents({
    locationHref: 'https://timetreeapp.com/calendars/alias123/monthly',
    calendarId: 1,
    fetchJson: async () => {
      call++;
      if (call === 1) {
        return {
          events: [{
            id: 'event-1', calendar_id: 1, title: 't', all_day: true,
            start_at: 0, start_timezone: null, end_at: 0, end_timezone: null,
            recurrences: [], alerts: [], attendees: [], attachment: null, files: [],
          }],
          chunk: true, since: 100,
        };
      }
      return {
        events: [{
          id: 'event-2', calendar_id: 1, title: 't', all_day: true,
          start_at: 0, start_timezone: null, end_at: 0, end_timezone: null,
          recurrences: [], alerts: [], attendees: [], attachment: null, files: [],
        }],
        chunk: false, since: 200,
      };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.events.length, 2);
});
