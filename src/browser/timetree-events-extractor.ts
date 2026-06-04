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
  const seenIds = new Set<string>();
  let cursor = input.since;
  let pages = 0;

  while (pages < maxPages) {
    const page = await fetchCalendarEventsPage({
      calendarId: input.calendarId,
      fetchJson: input.fetchJson,
      since: cursor,
    });
    if (!page.ok) return { ok: false, issues: page.issues };

    // ?since= 커서는 경계 inclusive라 페이지 끝 이벤트가 다음 페이지 앞에
    // 재등장한다. id 기준 first-seen으로 중복 수집을 막는다 (#52).
    for (const event of page.page.events) {
      if (seenIds.has(event.id)) continue;
      seenIds.add(event.id);
      events.push(event);
    }
    pages += 1;

    if (!page.page.hasMore) {
      return { ok: true, events, lastCursor: page.page.cursor, issues: [] };
    }

    if (cursor !== undefined && page.page.cursor <= cursor) {
      return { ok: false, issues: [`cursor did not advance: stuck at ${page.page.cursor}`] };
    }
    cursor = page.page.cursor;
  }

  return { ok: false, issues: [`maxPages reached (${maxPages}); refusing to continue`] };
}
