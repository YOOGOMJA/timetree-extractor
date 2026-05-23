import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleExtensionMessage } from '../../src/extension/content-script.js';

const noopFetch = async (_path: string): Promise<unknown> => ({});

function makeFetchJson(response: unknown) {
  return async (_path: string): Promise<unknown> => response;
}

test('FETCH_CALENDARS: 성공 시 ok:true와 캘린더 목록을 반환한다', async () => {
  const fetchJson = makeFetchJson({
    calendars: [{ id: 1, alias_code: 'a', name: 'Work' }],
  });

  const res = await handleExtensionMessage({ type: 'FETCH_CALENDARS' }, fetchJson);
  assert.ok(res !== false);
  assert.equal(res.type, 'FETCH_CALENDARS');
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.calendars.length, 1);
    assert.equal(res.calendars[0]?.name, 'Work');
  }
});

test('FETCH_CALENDARS: API 응답이 올바르지 않으면 ok:false를 반환한다', async () => {
  const fetchJson = makeFetchJson({ unexpected: true });

  const res = await handleExtensionMessage({ type: 'FETCH_CALENDARS' }, fetchJson);
  assert.ok(res !== false);
  assert.equal(res.type, 'FETCH_CALENDARS');
  assert.ok(!res.ok);
  if (!res.ok) {
    assert.ok(res.issues.length > 0);
  }
});

test('FETCH_EVENTS: 성공 시 ok:true와 이벤트 목록을 반환한다', async () => {
  const event = {
    id: 'evt-1',
    calendar_id: 42,
    title: 'Meeting',
    all_day: false,
    start_at: 1700000000000,
    start_timezone: 'Asia/Seoul',
    end_at: 1700003600000,
    end_timezone: 'Asia/Seoul',
    recurrences: [],
    alerts: [],
    attendees: [],
    attachment: null,
    files: [],
  };
  const fetchJson = makeFetchJson({ events: [event], chunk: false, since: 1700000000000 });

  const res = await handleExtensionMessage({ type: 'FETCH_EVENTS', calendarId: 42 }, fetchJson);
  assert.ok(res !== false);
  assert.equal(res.type, 'FETCH_EVENTS');
  assert.ok(res.ok);
  if (res.ok) {
    assert.ok(res.events.length > 0);
  }
});

test('FETCH_EVENTS: calendarId를 API 경로에 포함시킨다', async () => {
  const requestedPaths: string[] = [];
  const fetchJson = async (path: string): Promise<unknown> => {
    requestedPaths.push(path);
    return { events: [], chunk: false, since: 0 };
  };

  const res = await handleExtensionMessage({ type: 'FETCH_EVENTS', calendarId: 99 }, fetchJson);
  assert.ok(res !== false);
  assert.ok(res.ok);
  assert.ok(requestedPaths.some((p) => p.includes('99')));
});

test('FETCH_LABELS: 성공 시 ok:true와 라벨 목록을 반환한다', async () => {
  const fetchJson = makeFetchJson({
    labels: [
      { id: 1, calendar_id: 42, name: 'Work', color: 1, default_color: 1, order: 0 },
      { id: 2, calendar_id: 42, name: 'Personal', color: 2, default_color: 2, order: 1 },
    ],
  });

  const res = await handleExtensionMessage({ type: 'FETCH_LABELS', calendarId: 42 }, fetchJson);
  assert.ok(res !== false);
  assert.equal(res.type, 'FETCH_LABELS');
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.labels.length, 2);
    assert.equal(res.labels[0]?.name, 'Work');
  }
});

test('FETCH_LABELS: calendarId를 API 경로에 포함시킨다', async () => {
  const requestedPaths: string[] = [];
  const fetchJson = async (path: string): Promise<unknown> => {
    requestedPaths.push(path);
    return { labels: [] };
  };

  const res = await handleExtensionMessage({ type: 'FETCH_LABELS', calendarId: 77 }, fetchJson);
  assert.ok(res !== false);
  assert.ok(res.ok);
  assert.ok(requestedPaths.some((p) => p === '/api/v1/calendar/77/labels'));
});

test('FETCH_LABELS: API 응답이 올바르지 않으면 ok:false를 반환한다', async () => {
  const fetchJson = makeFetchJson({ unexpected: true });

  const res = await handleExtensionMessage({ type: 'FETCH_LABELS', calendarId: 1 }, fetchJson);
  assert.ok(res !== false);
  assert.equal(res.type, 'FETCH_LABELS');
  assert.ok(!res.ok);
  if (!res.ok) {
    assert.ok(res.issues.length > 0);
  }
});

test('알 수 없는 메시지 타입은 false를 반환한다', async () => {
  const res = await handleExtensionMessage(
    { type: 'UNKNOWN' } as unknown as Parameters<typeof handleExtensionMessage>[0],
    noopFetch,
  );
  assert.equal(res, false);
});
