import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeFetchFailure, classifyFetchIssues } from '../../src/extension/fetch-failure-copy.js';

test('classifyFetchIssues: 비-auth HTTP 상태는 transient (#92, #113)', () => {
  assert.equal(classifyFetchIssues(['HTTP 500: /api/v1/calendar']), 'transient');
  assert.equal(classifyFetchIssues(['HTTP 503: /api/v1/calendar']), 'transient');
});

test('classifyFetchIssues: 네트워크 실패는 transient (#92)', () => {
  assert.equal(classifyFetchIssues(['Failed to fetch']), 'transient');
  assert.equal(classifyFetchIssues(['Load failed']), 'transient');
});

test('classifyFetchIssues: shape/validation 위반은 contract (#92)', () => {
  assert.equal(classifyFetchIssues(['events must be an array']), 'contract');
  assert.equal(classifyFetchIssues(['events[0].startTimezone must be a string']), 'contract');
});

test('classifyFetchIssues: 빈 issues는 contract로 안전측 (#92)', () => {
  assert.equal(classifyFetchIssues([]), 'contract');
});

test('contract: 형식 변경 안내 + issues를 detail에 담는다 (#92)', () => {
  const out = describeFetchFailure('contract', ['events must be an array']);
  assert.match(out.title, /형식이 바뀐/);
  assert.match(out.title, /가져올 수 없/);
  assert.match(out.detail, /events must be an array/);
});

test('contract: issues 없으면 detail은 빈 문자열 (#92)', () => {
  assert.equal(describeFetchFailure('contract').detail, '');
});

test('transient: 접근 실패 안내 (#92)', () => {
  const out = describeFetchFailure('transient', ['HTTP 401: /api/v1/...']);
  assert.match(out.title, /접근하지 못했/);
  assert.match(out.detail, /HTTP 401/);
});

test('classifyFetchIssues: HTTP 401/403은 auth (#113)', () => {
  assert.equal(classifyFetchIssues(['HTTP 401: /api/v1/calendar']), 'auth');
  assert.equal(classifyFetchIssues(['HTTP 403: /api/v1/calendar']), 'auth');
});

test('describeFetchFailure: auth는 로그인 만료 안내 (#113)', () => {
  assert.match(describeFetchFailure('auth').title, /로그인이 풀렸/);
});
