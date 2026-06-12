// 수집된 정규화 이벤트를 대시보드용으로 집계한다 (#75). pure — DOM/스토리지 의존 없음.
import type { NormalizedCalendarEvent } from '../core/normalize.js';

export type CalendarCount = { name: string; count: number };
export type LabelCount = { name: string; count: number };
export type WarningGroup = { code: string; events: { title: string; calendarName: string }[] };

function tallyDesc(pairs: Iterable<string>): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const name of pairs) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function aggregateByCalendar(events: NormalizedCalendarEvent[]): CalendarCount[] {
  return tallyDesc(events.map((e) => e.calendarName));
}

export function aggregateByLabel(events: NormalizedCalendarEvent[]): LabelCount[] {
  const labels: string[] = [];
  for (const e of events) for (const label of e.labels ?? []) labels.push(label);
  return tallyDesc(labels);
}

// 경고 code별로 영향받은 이벤트(title·calendarName)를 묶는다. 등장 순서(첫 발생) 유지.
export function groupWarnings(events: NormalizedCalendarEvent[]): WarningGroup[] {
  const byCode = new Map<string, WarningGroup>();
  for (const e of events) {
    for (const code of e.warnings) {
      let group = byCode.get(code);
      if (!group) {
        group = { code, events: [] };
        byCode.set(code, group);
      }
      group.events.push({ title: e.title, calendarName: e.calendarName });
    }
  }
  return [...byCode.values()];
}
