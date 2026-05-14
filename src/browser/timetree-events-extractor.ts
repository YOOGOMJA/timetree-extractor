import { type RawTimeTreeEvent } from '../core/contracts.js';
import { fetchCalendarEventsPage, type FetchCalendarEventsPageInput } from './timetree-events-fetch.js';

const DEFAULT_MAX_PAGES = 50;

export type ExtractCalendarEventsInput = Omit<FetchCalendarEventsPageInput, 'since'> & {
  since?: number;
  maxPages?: number;
};

export type ExtractCalendarEventsResult =
  | { ok: true; events: RawTimeTreeEvent[]; lastCursor: number; issues: [] }
  | { ok: false; events?: undefined; lastCursor?: number; issues: string[] };

export async function extractCalendarEvents(input: ExtractCalendarEventsInput): Promise<ExtractCalendarEventsResult> {
  const maxPages = input.maxPages ?? DEFAULT_MAX_PAGES;
  const events: RawTimeTreeEvent[] = [];
  let cursor = input.since;
  let pages = 0;

  while (pages < maxPages) {
    const page = await fetchCalendarEventsPage({
      calendarId: input.calendarId,
      fetchJson: input.fetchJson,
      since: cursor,
    });
    if (!page.ok) return { ok: false, issues: page.issues };

    events.push(...page.page.events);
    pages += 1;

    if (!page.page.hasMore) {
      return { ok: true, events, lastCursor: page.page.cursor, issues: [] };
    }

    if (pages >= maxPages) {
      return { ok: false, issues: [`maxPages reached (${maxPages}); refusing to continue`] };
    }

    if (cursor !== undefined && page.page.cursor <= cursor) {
      return { ok: false, issues: [`cursor did not advance: stuck at ${page.page.cursor}`] };
    }
    cursor = page.page.cursor;
  }

  return { ok: false, issues: [`maxPages reached (${maxPages}); refusing to continue`] };
}
