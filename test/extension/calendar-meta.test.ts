import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSharedCalendar, calendarBadge, countSharedCalendars } from '../../src/extension/calendar-meta.js';
import type { RawTimeTreeCalendar } from '../../src/core/contracts.js';

test('isSharedCalendar: private·memo·빈값은 개인 (#111)', () => {
  assert.equal(isSharedCalendar('private'), false);
  assert.equal(isSharedCalendar('memo'), false);
  assert.equal(isSharedCalendar(null), false);
  assert.equal(isSharedCalendar(undefined), false);
  assert.equal(isSharedCalendar(''), false);
});

test('isSharedCalendar: family 등 그 외는 공유 (#111)', () => {
  assert.equal(isSharedCalendar('family'), true);
  assert.equal(isSharedCalendar('couple'), true);
  assert.equal(isSharedCalendar('friends'), true);
});

test('calendarBadge: 공유/나만 라벨 (#111)', () => {
  assert.deepEqual(calendarBadge('family'), { label: '공유', shared: true });
  assert.deepEqual(calendarBadge('private'), { label: '나만', shared: false });
});

test('countSharedCalendars: 공유 개수 (#111)', () => {
  const cals = [
    { id: 1, aliasCode: 'a', name: '개인', purpose: 'private' },
    { id: 2, aliasCode: 'b', name: '가족', purpose: 'family' },
    { id: 3, aliasCode: 'c', name: '동호회', purpose: 'friends' },
  ] as RawTimeTreeCalendar[];
  assert.equal(countSharedCalendars(cals), 2);
});
