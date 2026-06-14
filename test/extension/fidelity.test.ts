import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyNormalizeFailure, summarizeFidelity } from '../../src/extension/fidelity.js';

test('classifyNormalizeFailure: recurrence 사유는 형식 미지원 (#114)', () => {
  assert.equal(classifyNormalizeFailure(['unsupported recurrence rule (event x): FREQ=SECONDLY']), 'unsupported');
});

test('classifyNormalizeFailure: 그 외는 처리 실패 (#114)', () => {
  assert.equal(classifyNormalizeFailure(['startTimezone is required']), 'failed');
  assert.equal(classifyNormalizeFailure([]), 'failed');
});

test('summarizeFidelity: 0이 아닌 칸만, 순서 고정 (#114)', () => {
  const { segments } = summarizeFidelity({
    totalFetched: 199, exported: 142, rangeExcluded: 42, unsupported: 9, failed: 6, deactivated: 0,
  });
  assert.deepEqual(segments.map((s) => s.key), ['exported', 'rangeExcluded', 'unsupported', 'failed']);
  assert.equal(segments[0].count, 142);
});

test('summarizeFidelity: 합이 totalFetched면 accountedFor=true (no-silent-loss) (#114)', () => {
  const ok = summarizeFidelity({ totalFetched: 199, exported: 142, rangeExcluded: 42, unsupported: 9, failed: 6, deactivated: 0 });
  assert.equal(ok.accountedFor, true);
  const leak = summarizeFidelity({ totalFetched: 200, exported: 142, rangeExcluded: 42, unsupported: 9, failed: 6, deactivated: 0 });
  assert.equal(leak.accountedFor, false);
});
