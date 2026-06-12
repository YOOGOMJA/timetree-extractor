import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatEventMeta } from '../../src/extension/event-meta.js';
import type { NormalizedCalendarEvent } from '../../src/core/normalize.js';

const base = { participantCount: undefined, attachmentCount: undefined } as Partial<NormalizedCalendarEvent>;

test('참가자·첨부 둘 다 있으면 중점으로 잇는다', () => {
  assert.equal(formatEventMeta({ ...base, participantCount: 3, attachmentCount: 2 } as NormalizedCalendarEvent), '참가자 3 · 첨부 2');
});

test('참가자만 있으면 참가자만', () => {
  assert.equal(formatEventMeta({ ...base, participantCount: 3 } as NormalizedCalendarEvent), '참가자 3');
});

test('첨부만 있으면 첨부만', () => {
  assert.equal(formatEventMeta({ ...base, attachmentCount: 2 } as NormalizedCalendarEvent), '첨부 2');
});

test('둘 다 없으면 빈 문자열', () => {
  assert.equal(formatEventMeta(base as NormalizedCalendarEvent), '');
});

test('0은 없는 것으로 본다', () => {
  assert.equal(formatEventMeta({ ...base, participantCount: 0, attachmentCount: 0 } as NormalizedCalendarEvent), '');
});
