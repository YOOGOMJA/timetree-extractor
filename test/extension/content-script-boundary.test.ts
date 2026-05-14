import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTimeTreeObserverMessageHandler } from '../../src/extension/content-script.js';

test('accepts only TimeTree observer message type', () => {
  const accepted: unknown[] = [];
  const handler = createTimeTreeObserverMessageHandler({ onObserved: (payload) => accepted.push(payload) });

  handler({ origin: 'https://timetreeapp.com', data: { type: 'unknown', payload: {} } });

  assert.equal(accepted.length, 0);
});

test('rejects messages from unexpected origin', () => {
  const accepted: unknown[] = [];
  const handler = createTimeTreeObserverMessageHandler({ onObserved: (payload) => accepted.push(payload) });

  handler({ origin: 'https://example.com', data: { type: 'TIMETREE_EXPORTER_OBSERVED_PAYLOAD', payload: {} } });

  assert.equal(accepted.length, 0);
});

test('does not pass headers or credentials across boundary', () => {
  const issues: string[] = [];
  const accepted: unknown[] = [];
  const handler = createTimeTreeObserverMessageHandler({
    onObserved: (payload) => accepted.push(payload),
    onIssue: (issue) => issues.push(issue),
  });

  handler({
    origin: 'https://timetreeapp.com',
    data: {
      type: 'TIMETREE_EXPORTER_OBSERVED_PAYLOAD',
      payload: { summary: {}, headers: {}, cookie: 'redacted', authorization: 'redacted', csrf: 'redacted' },
    },
  });

  assert.equal(accepted.length, 0);
  assert.match(issues.join('\n'), /credential-like/);
});

test('blocks credential-like keys nested inside arrays', () => {
  const issues: string[] = [];
  const accepted: unknown[] = [];
  const handler = createTimeTreeObserverMessageHandler({
    onObserved: (payload) => accepted.push(payload),
    onIssue: (issue) => issues.push(issue),
  });

  handler({
    origin: 'https://timetreeapp.com',
    data: {
      type: 'TIMETREE_EXPORTER_OBSERVED_PAYLOAD',
      payload: { events: [{ id: 'a', headers: { cookie: 'session' } }] },
    },
  });

  assert.equal(accepted.length, 0);
  assert.match(issues.join('\n'), /credential-like/);
});

test('passes sanitized observed payload to registered handler', () => {
  const accepted: unknown[] = [];
  const handler = createTimeTreeObserverMessageHandler({ onObserved: (payload) => accepted.push(payload) });

  handler({
    origin: 'https://timetreeapp.com',
    data: {
      type: 'TIMETREE_EXPORTER_OBSERVED_PAYLOAD',
      payload: { summary: { eventCount: 1, firstEventKeys: ['all_day'] } },
    },
  });

  assert.deepEqual(accepted, [{ summary: { eventCount: 1, firstEventKeys: ['all_day'] } }]);
});
