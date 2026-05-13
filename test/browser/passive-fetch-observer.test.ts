import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installPassiveFetchObserver, type FetchLike } from '../../src/browser/passive-fetch-observer.js';

class FakeResponse {
  public cloneCalls = 0;

  constructor(private readonly payload: unknown, private readonly options: { jsonReject?: boolean } = {}) {}

  clone(): FakeResponse {
    this.cloneCalls += 1;
    return new FakeResponse(this.payload, this.options);
  }

  async json(): Promise<unknown> {
    if (this.options.jsonReject) throw new Error('invalid json');
    return this.payload;
  }
}

test('returns the original fetch response to the application', async () => {
  const response = new FakeResponse({ events: [] });
  const observed: unknown[] = [];
  const fetch: FetchLike = async () => response;
  const wrapped = installPassiveFetchObserver(fetch, { onObserved: (payload) => observed.push(payload) });

  const actual = await wrapped.fetch('https://timetreeapp.com/api/v1/calendar/123/events?since=1');

  assert.equal(actual, response);
  assert.equal(response.cloneCalls, 1);
  assert.equal(observed.length, 1);
});

test('observes matching JSON response through clone', async () => {
  const observed: unknown[] = [];
  const wrapped = installPassiveFetchObserver(async () => new FakeResponse({ events: [] }), {
    onObserved: (payload) => observed.push(payload),
  });

  await wrapped.fetch('/api/v1/calendar/123/events?since=1');

  assert.deepEqual(observed, [{ endpoint: { ok: true, kind: 'events', calendarId: 123 }, payload: { events: [] } }]);
});

test('does not observe non-matching requests', async () => {
  const observed: unknown[] = [];
  const wrapped = installPassiveFetchObserver(async () => new FakeResponse({ id: 1 }), {
    onObserved: (payload) => observed.push(payload),
  });

  await wrapped.fetch('/api/v1/user');
  await wrapped.fetch('https://frontend.assets.timetreeapp.com/assets/main.js');

  assert.equal(observed.length, 0);
});

test('does not break application fetch when observer JSON parsing fails', async () => {
  const issues: string[] = [];
  const response = new FakeResponse({}, { jsonReject: true });
  const wrapped = installPassiveFetchObserver(async () => response, {
    onObserved: () => assert.fail('should not observe invalid JSON'),
    onIssue: (issue) => issues.push(issue),
  });

  const actual = await wrapped.fetch('/api/v1/calendar/123/events?since=1');

  assert.equal(actual, response);
  assert.match(issues.join('\n'), /parse observed response/);
});

test('uninstall restores original fetch on a target object', () => {
  const original: FetchLike = async () => new FakeResponse({ events: [] });
  const target = { fetch: original };
  const wrapped = installPassiveFetchObserver(target.fetch, { onObserved: () => undefined, target });

  assert.notEqual(target.fetch, original);
  wrapped.uninstall();
  assert.equal(target.fetch, original);
});
