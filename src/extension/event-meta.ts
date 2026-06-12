import type { NormalizedCalendarEvent } from '../core/normalize.js';

/**
 * 대시보드 이벤트 한 줄에 덧붙일 참가자·첨부 개수 메타 문자열.
 * 내용(이름·바이너리)은 #81에서 boundary 밖으로 빠졌고, 여기선 *개수*만 표시한다.
 * 없으면 빈 문자열 — 호출자가 비었으면 separator를 붙이지 않는다.
 */
export function formatEventMeta(event: NormalizedCalendarEvent): string {
  const parts: string[] = [];
  if (event.participantCount && event.participantCount > 0) parts.push(`참가자 ${event.participantCount}`);
  if (event.attachmentCount && event.attachmentCount > 0) parts.push(`첨부 ${event.attachmentCount}`);
  return parts.join(' · ');
}
