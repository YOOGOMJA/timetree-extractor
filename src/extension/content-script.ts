import { extractVisibleTimeTreeEvents, type ExtractVisibleTimeTreeEventsResult } from '../browser/index.js';

export type ContentScriptExtractionInput = {
  calendarId: number;
  since?: number;
};

export async function extractFromCurrentTimeTreePage(input: ContentScriptExtractionInput): Promise<ExtractVisibleTimeTreeEventsResult> {
  return extractVisibleTimeTreeEvents({
    locationHref: window.location.href,
    calendarId: input.calendarId,
    since: input.since,
    fetchJson: async (path) => {
      const response = await window.fetch(path, { method: 'GET', credentials: 'same-origin' });
      return response.json() as Promise<unknown>;
    },
  });
}
