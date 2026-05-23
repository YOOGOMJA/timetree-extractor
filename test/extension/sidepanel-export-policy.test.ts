import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDateRange } from '../../src/extension/sidepanel-export-policy.js';

test('parseDateRange: from이 빈 문자열이면 null', () => {
  assert.equal(parseDateRange('', '2026-01-31'), null);
});

test('parseDateRange: to가 빈 문자열이면 null', () => {
  assert.equal(parseDateRange('2026-01-01', ''), null);
});

test('parseDateRange: from > to이면 null', () => {
  assert.equal(parseDateRange('2026-12-31', '2026-01-01'), null);
});

test('parseDateRange: 유효한 입력은 fromMs와 toMs를 반환한다', () => {
  const result = parseDateRange('2026-01-01', '2026-01-31');
  assert.ok(result);
  assert.equal(result.fromMs, new Date('2026-01-01T00:00:00').getTime());
  assert.equal(result.toMs, new Date('2026-01-31T00:00:00').getTime() + 86_400_000 - 1);
});

test('parseDateRange: 같은 날짜는 그날의 day-end까지 범위가 된다', () => {
  const result = parseDateRange('2026-01-15', '2026-01-15');
  assert.ok(result);
  assert.equal(result.toMs - result.fromMs, 86_400_000 - 1);
});

test('parseDateRange: invalid 날짜 문자열은 null', () => {
  assert.equal(parseDateRange('not-a-date', '2026-01-01'), null);
});
