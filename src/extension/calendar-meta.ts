// 캘린더 공유 여부 배지(#111). TimeTree /api/v2/calendars의 purpose로 개인/공유 구분.
// 'private'(개인)·'memo'(메모)는 나만, 그 외('family' 등)는 다른 참가자와 공유. pure.
import type { RawTimeTreeCalendar } from '../core/contracts.js';

export function isSharedCalendar(purpose: string | null | undefined): boolean {
  if (purpose == null || purpose === '') return false;
  return purpose !== 'private' && purpose !== 'memo';
}

export function calendarBadge(purpose: string | null | undefined): { label: string; shared: boolean } {
  return isSharedCalendar(purpose) ? { label: '공유', shared: true } : { label: '나만', shared: false };
}

// 선택/수집된 캘린더 중 공유 캘린더 개수 — '공유 N개 포함' 요약용.
export function countSharedCalendars(calendars: RawTimeTreeCalendar[]): number {
  return calendars.filter((c) => isSharedCalendar(c.purpose)).length;
}
