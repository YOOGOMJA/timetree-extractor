import { validateRawTimeTreeEvent, type RawTimeTreeEvent } from '../core/contracts.js';
import { mapApiEventToRawTimeTreeEvent, type PageFetchJson } from './timetree-page-extractor.js';

export type FetchCalendarEventsPageInput = {
  calendarId: number;
  since?: number;
  fetchJson: PageFetchJson;
};

export type CalendarEventsPage = {
  events: RawTimeTreeEvent[];
  cursor: number;
  hasMore: boolean;
};

export type FetchCalendarEventsPageResult =
  | { ok: true; page: CalendarEventsPage; issues: [] }
  | { ok: false; page?: undefined; issues: string[] };

export async function fetchCalendarEventsPage(input: FetchCalendarEventsPageInput): Promise<FetchCalendarEventsPageResult> {
  const sinceQuery = input.since === undefined ? '' : `?since=${encodeURIComponent(String(input.since))}`;
  const payload = await input.fetchJson(`/api/v1/calendar/${input.calendarId}/events${sinceQuery}`);

  if (!isRecord(payload)) {
    return { ok: false, issues: ['response payload must be an object'] };
  }
  if (typeof payload.chunk !== 'boolean') {
    return { ok: false, issues: ['chunk must be a boolean'] };
  }
  if (typeof payload.since !== 'number' || !Number.isFinite(payload.since)) {
    return { ok: false, issues: ['since must be a finite number'] };
  }
  if (!Array.isArray(payload.events)) {
    return { ok: false, issues: ['events must be an array'] };
  }

  const events: RawTimeTreeEvent[] = [];
  const issues: string[] = [];
  payload.events.forEach((apiEvent, index) => {
    if (!isRecord(apiEvent)) {
      issues.push(`events[${index}] must be an object`);
      return;
    }
    const mapped = mapApiEventToRawTimeTreeEvent(apiEvent);
    const validation = validateRawTimeTreeEvent(mapped);
    if (!validation.ok) {
      issues.push(...validation.issues.map((issue) => `events[${index}].${issue}`));
      return;
    }
    events.push(validation.value);
  });

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    page: { events, cursor: payload.since, hasMore: payload.chunk },
    issues: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
