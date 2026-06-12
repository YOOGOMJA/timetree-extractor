import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelHue, labelChipColors } from '../../src/extension/label-color.js';

test('labelHue: 같은 이름은 같은 hue(결정적)', () => {
  assert.equal(labelHue('업무'), labelHue('업무'));
});

test('labelHue: 0..359 범위', () => {
  for (const n of ['업무', '가족', '약속', 'A', '', '아주 긴 라벨 이름']) {
    const h = labelHue(n);
    assert.ok(Number.isInteger(h) && h >= 0 && h < 360, `${n} → ${h}`);
  }
});

test('labelHue: 다른 이름은 (대체로) 다른 hue', () => {
  const hs = new Set(['업무', '가족', '약속', '여행', '운동'].map(labelHue));
  assert.ok(hs.size >= 4); // 충돌 일부 허용하되 분포 확인
});

test('labelChipColors: hsl 문자열 bg/fg 반환, 빈 문자열 안전', () => {
  const c = labelChipColors('업무');
  assert.match(c.bg, /^hsl\(/);
  assert.match(c.fg, /^hsl\(/);
  const e = labelChipColors('');
  assert.match(e.bg, /^hsl\(/);
});
