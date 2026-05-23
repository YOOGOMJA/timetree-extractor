import type { NormalizedCalendarEvent } from '../core/normalize.js';

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
