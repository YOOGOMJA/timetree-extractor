import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prependRecord, HISTORY_MAX, type ExportHistoryRecord } from '../../src/extension/export-history.js';

function rec(at: number): ExportHistoryRecord {
  return { at, calendars: ['개인'], fromDate: '2026-06-01', toDate: '2026-07-01', format: 'ics', exportCount: 10, warningCount: 0, filename: `f-${at}.ics` };
}

test('prependRecord: 새 record를 맨 앞에 추가한다', () => {
  const out = prependRecord([rec(1), rec(2)], rec(3));
  assert.equal(out[0].at, 3);
  assert.equal(out.length, 3);
});

test('prependRecord: 상한을 초과하면 가장 오래된 것을 절단한다', () => {
  const existing = Array.from({ length: HISTORY_MAX }, (_, i) => rec(i));
  const out = prependRecord(existing, rec(999));
  assert.equal(out.length, HISTORY_MAX);
  assert.equal(out[0].at, 999);
  assert.equal(out.at(-1)!.at, HISTORY_MAX - 2); // 마지막(가장 오래된) 하나 절단됨
});

test('prependRecord: 입력 배열을 변형하지 않는다', () => {
  const input = [rec(1)];
  const out = prependRecord(input, rec(2));
  assert.equal(input.length, 1);
  assert.notEqual(out, input);
});

test('prependRecord: 커스텀 max', () => {
  const out = prependRecord([rec(1), rec(2)], rec(3), 2);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((r) => r.at), [3, 1]);
});
