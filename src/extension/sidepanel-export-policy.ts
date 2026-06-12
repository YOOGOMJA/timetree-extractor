import type { NormalizedCalendarEvent } from '../core/normalize.js';
import { createIcsCalendar } from '../core/ics.js';
import { toIsoDate } from './sidepanel-utils.js';

export function parseDateRange(
  fromStr: string,
  toStr: string,
): { fromMs: number; toMs: number } | null {
  if (!fromStr || !toStr) return null;
  const fromMs = new Date(`${fromStr}T00:00:00`).getTime();
  const toMs = new Date(`${toStr}T00:00:00`).getTime() + 86_400_000 - 1;
  if (isNaN(fromMs) || isNaN(toMs) || fromMs > toMs) return null;
  return { fromMs, toMs };
}

export type RangeMode =
  | { kind: 'all' }
  | { kind: 'range'; range: { fromMs: number; toMs: number } }
  | { kind: 'invalid' };

// setup의 "전체 기간" 체크 상태 + 날짜 입력값으로 수집 범위를 결정한다(#84).
// 전체(fullMode)면 필터를 적용하지 않는다(kind:'all'). 좁힘 모드에서 날짜가
// 유효하면 range, 아니면 invalid. 순수 함수 — DOM 접근은 호출 측 책임.
export function resolveRangeMode(fullMode: boolean, fromStr: string, toStr: string): RangeMode {
  if (fullMode) return { kind: 'all' };
  const range = parseDateRange(fromStr, toStr);
  return range ? { kind: 'range', range } : { kind: 'invalid' };
}

function getEventStartMs(event: NormalizedCalendarEvent): number {
  return event.start.kind === 'date-time'
    ? event.start.epochMs
    : new Date(`${event.start.date}T00:00:00`).getTime();
}

export function filterEventsByRange(
  events: NormalizedCalendarEvent[],
  range: { fromMs: number; toMs: number },
): NormalizedCalendarEvent[] {
  return events.filter((event) => {
    const startMs = getEventStartMs(event);
    return startMs >= range.fromMs && startMs <= range.toMs;
  });
}

export function aggregateWarnings(
  events: NormalizedCalendarEvent[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    for (const warning of event.warnings) {
      counts[warning] = (counts[warning] ?? 0) + 1;
    }
  }
  return counts;
}

export type ExportDecision =
  | {
      allowed: true;
      content: string;
      filename: string;
      mimeType: string;
    }
  | {
      allowed: false;
      reason: 'no-consent' | 'empty-events';
    };

export function decideExport(input: {
  consent: boolean;
  events: NormalizedCalendarEvent[];
  format: 'ics' | 'json';
  now: Date;
}): ExportDecision {
  if (!input.consent) return { allowed: false, reason: 'no-consent' };
  if (input.events.length === 0) return { allowed: false, reason: 'empty-events' };

  const dateStr = toIsoDate(input.now);
  if (input.format === 'ics') {
    return {
      allowed: true,
      content: createIcsCalendar(input.events, { now: input.now }),
      filename: `timetree-export-${dateStr}.ics`,
      mimeType: 'text/calendar;charset=utf-8',
    };
  }

  return {
    allowed: true,
    content: JSON.stringify(input.events, null, 2),
    filename: `timetree-export-${dateStr}.json`,
    mimeType: 'application/json',
  };
}
