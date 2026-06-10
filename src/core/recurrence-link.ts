import { toUtcDate, type NormalizedCalendarEvent, type NormalizedDateTime } from './normalize.js';

// originalStartAt(원래 occurrence)을 master.start의 VALUE/TZID 특성으로 구성한다.
// RECURRENCE-ID는 master DTSTART와 종류·timezone이 일치해야 RRULE 원래 슬롯과 매칭된다.
export function buildRecurrenceId(originalStartAt: number, masterStart: NormalizedDateTime): NormalizedDateTime {
  if (masterStart.kind === 'date') return { kind: 'date', date: toUtcDate(originalStartAt) };
  return { kind: 'date-time', epochMs: originalStartAt, timezone: masterStart.timezone };
}

// 수정된 반복 instance를 master와 동일 UID + recurrenceId로 묶는다. master 부재/애매 시
// 단발 uid 유지 + recurrence-override-orphaned warning으로 fallback(data-loss 0).
// 반드시 export될 최종 set(range filter 이후) 위에서 호출한다.
export function linkRecurringOverrides(events: NormalizedCalendarEvent[]): NormalizedCalendarEvent[] {
  const groups = new Map<string, NormalizedCalendarEvent[]>();
  for (const event of events) {
    if (event.recurrenceGroupId == null) continue;
    const list = groups.get(event.recurrenceGroupId) ?? [];
    list.push(event);
    groups.set(event.recurrenceGroupId, list);
  }

  return events.map((event) => {
    if (event.recurrenceGroupId == null || event.originalStartAt == null) return event;
    const group = groups.get(event.recurrenceGroupId) ?? [];
    const masters = group.filter((e) => e.recurrence != null && e.originalStartAt == null);
    if (masters.length !== 1) {
      return { ...event, warnings: [...event.warnings, 'recurrence-override-orphaned' as const] };
    }
    const master = masters[0];
    return { ...event, uid: master.uid, recurrenceId: buildRecurrenceId(event.originalStartAt, master.start) };
  });
}
