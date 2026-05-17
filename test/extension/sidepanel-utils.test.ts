import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml, toIsoDate, errorMessage } from '../../src/extension/sidepanel-utils.js';

// escapeHtml
test('escapeHtml: & < > " 를 엔티티로 변환한다', () => {
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml('"quoted"'), '&quot;quoted&quot;');
});

test('escapeHtml: 특수문자 없는 문자열은 그대로 반환한다', () => {
  assert.equal(escapeHtml('hello world'), 'hello world');
});

test('escapeHtml: 여러 특수문자가 섞인 경우 모두 변환한다', () => {
  assert.equal(escapeHtml('<a href="x&y">'), '&lt;a href=&quot;x&amp;y&quot;&gt;');
});

// toIsoDate
test('toIsoDate: Date를 YYYY-MM-DD 형식으로 반환한다', () => {
  assert.equal(toIsoDate(new Date('2024-03-15T00:00:00.000Z')), '2024-03-15');
});

test('toIsoDate: 길이가 정확히 10자리다', () => {
  const result = toIsoDate(new Date());
  assert.equal(result.length, 10);
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
});

// errorMessage
test('errorMessage: Error 인스턴스는 message를 반환한다', () => {
  assert.equal(errorMessage(new Error('something went wrong')), 'something went wrong');
});

test('errorMessage: 문자열은 그대로 반환한다', () => {
  assert.equal(errorMessage('raw string error'), 'raw string error');
});

test('errorMessage: 숫자는 문자열로 변환한다', () => {
  assert.equal(errorMessage(42), '42');
});

test('errorMessage: null은 "null"을 반환한다', () => {
  assert.equal(errorMessage(null), 'null');
});
