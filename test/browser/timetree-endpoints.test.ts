import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchTimeTreeEndpoint } from '../../src/browser/timetree-endpoints.js';

test('matches calendar events GET endpoint', () => {
  const result = matchTimeTreeEndpoint({
    method: 'GET',
    url: 'https://timetreeapp.com/api/v1/calendar/123/events?since=1778588071445',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result, { ok: true, kind: 'events', calendarId: 123 });
});

test('matches labels GET endpoint from a relative path', () => {
  const result = matchTimeTreeEndpoint({ method: 'GET', url: '/api/v1/calendar/123/labels' });

  assert.equal(result.ok, true);
  assert.deepEqual(result, { ok: true, kind: 'labels', calendarId: 123 });
});

test('rejects mutation methods even on known paths', () => {
  const result = matchTimeTreeEndpoint({ method: 'PUT', url: '/api/v1/calendar/123/mark' });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /mutation/);
});

test('rejects private user and member endpoints', () => {
  for (const url of ['/api/v1/user', '/api/v1/auths', '/api/v2/calendars/alias/users']) {
    const result = matchTimeTreeEndpoint({ method: 'GET', url });
    assert.equal(result.ok, false);
  }
});

test('rejects token-like query keys', () => {
  const tokenLikeKey = 'to' + 'ken';
  const result = matchTimeTreeEndpoint({
    method: 'GET',
    url: `/api/v1/calendar/123/events?${tokenLikeKey}=redacted`,
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /token-like query/);
});
