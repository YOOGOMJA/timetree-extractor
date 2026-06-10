import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeVirtualWindow } from '../../src/extension/virtual-window.js';

const ROW = 48;
const VIEW = 480; // 10행

test('상단(scrollTop=0): start 0, padTop 0', () => {
  const w = computeVirtualWindow(0, VIEW, ROW, 1000, 4);
  assert.equal(w.start, 0);
  assert.equal(w.padTop, 0);
  assert.equal(w.end, 14); // 10 보임 + overscan 4 (상단이라 위 overscan 없음)
  assert.equal(w.padBottom, (1000 - 14) * ROW);
});

test('중간 스크롤: overscan만큼 위로 확장, padTop/padBottom 합 = (count-window)*row', () => {
  const w = computeVirtualWindow(100 * ROW, VIEW, ROW, 1000, 4);
  assert.equal(w.start, 96); // floor(100) - 4
  assert.equal(w.padTop, 96 * ROW);
  assert.equal(w.padBottom, (1000 - w.end) * ROW);
  assert.ok(w.end > w.start);
});

test('하단 끝: end는 count로 클램프, padBottom 0', () => {
  const w = computeVirtualWindow(1000 * ROW, VIEW, ROW, 1000, 4);
  assert.equal(w.end, 1000);
  assert.equal(w.padBottom, 0);
});

test('count가 viewport보다 작으면 전부 렌더', () => {
  const w = computeVirtualWindow(0, VIEW, ROW, 3, 4);
  assert.equal(w.start, 0);
  assert.equal(w.end, 3);
  assert.equal(w.padTop, 0);
  assert.equal(w.padBottom, 0);
});

test('count 0: 빈 윈도', () => {
  const w = computeVirtualWindow(0, VIEW, ROW, 0, 4);
  assert.deepEqual(w, { start: 0, end: 0, padTop: 0, padBottom: 0 });
});
