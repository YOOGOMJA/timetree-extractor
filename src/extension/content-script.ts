import { extractVisibleTimeTreeEvents, type ExtractVisibleTimeTreeEventsResult } from '../browser/index.js';

export const TIMETREE_OBSERVER_MESSAGE_TYPE = 'TIMETREE_EXPORTER_OBSERVED_PAYLOAD';

export type ContentScriptExtractionInput = {
  calendarId: number;
  since?: number;
};

export type ObserverMessageEvent = {
  origin: string;
  data: unknown;
};

export type TimeTreeObserverMessageHandlerOptions = {
  onObserved: (payload: unknown) => void;
  onIssue?: (issue: string) => void;
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

export function createTimeTreeObserverMessageHandler(options: TimeTreeObserverMessageHandlerOptions): (event: ObserverMessageEvent) => void {
  return (event) => {
    if (event.origin !== 'https://timetreeapp.com') return;
    if (!isRecord(event.data)) return;
    if (event.data.type !== TIMETREE_OBSERVER_MESSAGE_TYPE) return;

    const payload = event.data.payload;
    if (containsCredentialLikeKey(payload)) {
      options.onIssue?.('credential-like field is not allowed across the content-script boundary');
      return;
    }

    options.onObserved(payload);
  };
}

const CREDENTIAL_LIKE_KEYS = new Set(['headers', 'cookie', 'authorization', 'csrf', 'token', 'access_token']);

function containsCredentialLikeKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentialLikeKey);
  if (!isRecord(value)) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (CREDENTIAL_LIKE_KEYS.has(key.toLowerCase())) return true;
    if (containsCredentialLikeKey(nested)) return true;
  }
  return false;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}
