import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installInjectedTimeTreeObserver } from '../../src/extension/injected-observer.js';

type PostMessageCall = { data: unknown; targetOrigin: string };

type FakeResponse = {
  clone(): { json(): Promise<unknown> };
};

function makeResponse(payload: unknown): FakeResponse {
  return { clone: () => ({ json: async () => payload }) };
}

function makeFakeWindow(initialFetch: (url: string) => Promise<FakeResponse>) {
  const posts: PostMessageCall[] = [];
  const win = {
    fetch: initialFetch as unknown as Window['fetch'],
    postMessage: (data: unknown, targetOrigin: string) => {
      posts.push({ data, targetOrigin });
    },
  } as unknown as Window;
  return { win, posts };
}

test('injected-observer: events endpoint에서만 postMessage가 호출된다', async () => {
  const { win, posts } = makeFakeWindow(async () => makeResponse({ events: [] }));
  installInjectedTimeTreeObserver(win);

  await win.fetch('https://timetreeapp.com/api/v1/calendar/123/events');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  assert.equal(posts.length, 1);
});

test('injected-observer: calendars endpoint는 postMessage하지 않는다', async () => {
  const { win, posts } = makeFakeWindow(async () => makeResponse({ calendars: [] }));
  installInjectedTimeTreeObserver(win);

  await win.fetch('https://timetreeapp.com/api/v2/calendars');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  assert.equal(posts.length, 0);
});

test('injected-observer: labels endpoint도 postMessage하지 않는다', async () => {
  const { win, posts } = makeFakeWindow(async () => makeResponse({ labels: [] }));
  installInjectedTimeTreeObserver(win);

  await win.fetch('https://timetreeapp.com/api/v1/calendar/123/labels');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  assert.equal(posts.length, 0);
});

test('injected-observer: targetOrigin은 항상 https://timetreeapp.com이다 (와일드카드 금지)', async () => {
  const { win, posts } = makeFakeWindow(async () => makeResponse({ events: [] }));
  installInjectedTimeTreeObserver(win);

  await win.fetch('https://timetreeapp.com/api/v1/calendar/123/events');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  assert.ok(posts.length > 0);
  for (const post of posts) {
    assert.equal(post.targetOrigin, 'https://timetreeapp.com');
    assert.notEqual(post.targetOrigin, '*');
  }
});

test('injected-observer: 송신 payload에 credential-like 키가 없다', async () => {
  const { win, posts } = makeFakeWindow(async () => makeResponse({ events: [{ id: 'e1' }] }));
  installInjectedTimeTreeObserver(win);

  await win.fetch('https://timetreeapp.com/api/v1/calendar/123/events');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const flat = JSON.stringify(posts);
  for (const forbidden of ['cookie', 'authorization', 'csrf', 'token', 'access_token']) {
    assert.equal(flat.toLowerCase().includes(`"${forbidden}"`), false, `${forbidden}가 송신 payload에 포함됨`);
  }
});

test('injected-observer: 송신 data는 type과 payload만 포함한다', async () => {
  const { win, posts } = makeFakeWindow(async () => makeResponse({ events: [] }));
  installInjectedTimeTreeObserver(win);

  await win.fetch('https://timetreeapp.com/api/v1/calendar/123/events');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  assert.equal(posts.length, 1);
  const data = posts[0].data as Record<string, unknown>;
  assert.equal(data.type, 'TIMETREE_EXPORTER_OBSERVED_PAYLOAD');
  assert.ok('payload' in data);
  const payload = data.payload as Record<string, unknown>;
  assert.ok('endpoint' in payload);
  assert.ok('summary' in payload);
});

test('injected-observer: uninstall 호출 시 원본 fetch가 복원된다', async () => {
  const originalFetch = async () => makeResponse({ events: [] });
  const { win, posts } = makeFakeWindow(originalFetch);
  const fetchBefore = win.fetch;

  const uninstall = installInjectedTimeTreeObserver(win);
  const fetchDuring = win.fetch;
  assert.notEqual(fetchDuring, fetchBefore);

  uninstall();
  assert.equal(win.fetch, fetchBefore);

  await win.fetch('https://timetreeapp.com/api/v1/calendar/123/events');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(posts.length, 0);
});
