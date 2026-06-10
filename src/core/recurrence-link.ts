import type { NormalizedCalendarEvent, NormalizedDateTime, NormalizedRecurrence } from './normalize.js';

// EXDATE 라인에서 비교용 슬롯 키를 추출한다.
// 'EXDATE:20260708T000000Z' → { date:'2026-07-08', epochMs:<utc> }
// 'EXDATE;VALUE=DATE:20260708' → { date:'2026-07-08', epochMs:null }
function exdateSlot(line: string): { date: string; epochMs: number | null } | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const value = line.slice(colon + 1).split(',')[0]?.trim() ?? '';
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(value);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const epochMs =
    match[4] != null && match[7] === 'Z'
      ? Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6])
      : null;
  return { date, epochMs };
}

// override.start가 EXDATE 슬롯과 같은 occurrence인지(미이동) 판정.
function startMatchesSlot(start: NormalizedDateTime, slot: { date: string; epochMs: number | null }): boolean {
  if (start.kind === 'date') return start.date === slot.date;
  return slot.epochMs != null && start.epochMs === slot.epochMs;
}

// 수정된 반복 instance를 master와 동일 UID + RECURRENCE-ID로 묶는다.
//
// 실데이터 모델: override의 recurrenceGroupId(=raw recurring_uuid)가 master의 source.eventId를
// 가리킨다(공유 그룹키 아님). master는 RRULE에 EXDATE:<수정일>을 가진다. 미이동 override
// (override.start가 master EXDATE 슬롯과 일치)는 master UID + RECURRENCE-ID로 링크하고 그
// EXDATE를 master에서 제거한다(EXDATE+RECURRENCE-ID 한 날짜 동시 emit 충돌 방지). 이동/매칭
// 실패/ master 부재는 독립 이벤트로 둔다(master EXDATE가 슬롯을 비워두므로 비파손). master
// 부재만 recurrence-override-orphaned warning. 반드시 export 최종 set(range filter 이후) 위에서 호출.
export function linkRecurringOverrides(events: NormalizedCalendarEvent[]): NormalizedCalendarEvent[] {
  const mastersById = new Map<string, NormalizedCalendarEvent>();
  for (const event of events) {
    if (event.recurrence != null && event.recurrenceGroupId == null) {
      mastersById.set(event.source.eventId, event);
    }
  }

  const overrideLink = new Map<string, { uid: string; recurrenceId: NormalizedDateTime } | 'orphan'>();
  const claimedExdate = new Map<string, Set<string>>(); // masterEventId → claim된 EXDATE 라인

  for (const event of events) {
    if (event.recurrenceGroupId == null) continue;
    const master = mastersById.get(event.recurrenceGroupId);
    if (master == null) {
      overrideLink.set(event.source.eventId, 'orphan');
      continue;
    }
    const claimed = claimedExdate.get(master.source.eventId) ?? new Set<string>();
    const matched = (master.recurrence?.exdate ?? []).find((line) => {
      if (claimed.has(line)) return false;
      const slot = exdateSlot(line);
      return slot != null && master.start.kind === event.start.kind && startMatchesSlot(event.start, slot);
    });
    if (matched == null) continue; // 이동/매칭 실패 → 독립 유지
    claimed.add(matched);
    claimedExdate.set(master.source.eventId, claimed);
    overrideLink.set(event.source.eventId, { uid: master.uid, recurrenceId: event.start });
  }

  return events.map((event) => {
    if (event.recurrenceGroupId != null) {
      const link = overrideLink.get(event.source.eventId);
      if (link === 'orphan') {
        return { ...event, warnings: [...event.warnings, 'recurrence-override-orphaned' as const] };
      }
      if (link != null) {
        return { ...event, uid: link.uid, recurrenceId: link.recurrenceId };
      }
      return event;
    }
    const claimed = claimedExdate.get(event.source.eventId);
    if (claimed != null && claimed.size > 0 && event.recurrence?.exdate != null) {
      const remaining = event.recurrence.exdate.filter((line) => !claimed.has(line));
      const recurrence: NormalizedRecurrence = { ...event.recurrence };
      if (remaining.length > 0) recurrence.exdate = remaining;
      else delete recurrence.exdate;
      return { ...event, recurrence };
    }
    return event;
  });
}
