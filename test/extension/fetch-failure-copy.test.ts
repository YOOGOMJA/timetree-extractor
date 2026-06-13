import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeFetchFailure } from '../../src/extension/fetch-failure-copy.js';

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
