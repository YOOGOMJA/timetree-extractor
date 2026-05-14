import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listTimeTreeCalendars, mapApiCalendarToRawCalendar } from '../../src/browser/timetree-calendars.js';

test('maps snake_case API calendar to RawTimeTreeCalendar', () => {
  const raw = mapApiCalendarToRawCalendar({
    id: 99,
    alias_code: 'abc',
    name: 'Family',
    updated_at: 1700000000000,
    created_at: 1600000000000,
  });
  assert.equal(raw.id, 99);
  assert.equal(raw.aliasCode, 'abc');
  assert.equal(raw.name, 'Family');
  assert.equal(raw.updatedAt, 1700000000000);
  assert.equal(raw.createdAt, 1600000000000);
});

test('lists calendars via injected fetch', async () => {
  const requested: string[] = [];
  const result = await listTimeTreeCalendars({
    fetchJson: async (path) => {
      requested.push(path);
      return { calendars: [
        { id: 1, alias_code: 'one', name: 'A' },
        { id: 2, alias_code: 'two', name: 'B' },
      ]};
    },
  });
  assert.equal(result.ok, true);
  assert.equal(requested[0], '/api/v2/calendars');
  assert.equal(result.calendars.length, 2);
  assert.equal(result.calendars[0].aliasCode, 'one');
});

test('reports invalid calendar payload shape', async () => {
  const result = await listTimeTreeCalendars({
    fetchJson: async () => ({ unexpected: [] }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /calendars must be an array/);
});

test('treats null timestamps the same as missing (does not produce NaN)', () => {
  const raw = mapApiCalendarToRawCalendar({
    id: 99,
    alias_code: 'abc',
    name: 'Family',
    updated_at: null,
    created_at: null,
  });
  assert.equal(raw.updatedAt, undefined);
  assert.equal(raw.createdAt, undefined);
});

test('reports per-calendar validation failures with index prefix', async () => {
  const result = await listTimeTreeCalendars({
    fetchJson: async () => ({ calendars: [{ id: 'not-a-number', alias_code: 'a', name: 'x' }] }),
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /calendars\[0\]\./);
});
