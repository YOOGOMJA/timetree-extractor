import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeWarning } from '../../src/extension/warning-copy.js';
import { NORMALIZATION_WARNING_VALUES } from '../../src/core/normalize.js';

test('describeWarning: closed enum 전 코드가 fallback 아닌 매핑을 갖는다', () => {
  for (const code of NORMALIZATION_WARNING_VALUES) {
    const copy = describeWarning(code);
    assert.notEqual(copy.label, code, `${code} 매핑 누락(label이 코드 그대로)`);
    assert.ok(copy.label.length > 0);
    assert.ok(copy.hint.length > 0, `${code} hint 누락`);
  }
});

test('describeWarning: 미지 코드는 fallback(label=code, hint 빈 문자열)', () => {
  const copy = describeWarning('unknown-future-code');
  assert.equal(copy.label, 'unknown-future-code');
  assert.equal(copy.hint, '');
});
