import { listTimeTreeCalendars } from '../browser/timetree-calendars.js';
import { extractCalendarEvents } from '../browser/timetree-events-extractor.js';
import type { PageFetchJson } from '../browser/timetree-page-extractor.js';
import type {
  ExtensionRequest,
  FetchCalendarsResponse,
  FetchEventsResponse,
} from './message-protocol.js';

export const TIMETREE_OBSERVER_MESSAGE_TYPE = 'TIMETREE_EXPORTER_OBSERVED_PAYLOAD';

export type ObserverMessageEvent = {
  origin: string;
  data: unknown;
};

export type TimeTreeObserverMessageHandlerOptions = {
  onObserved: (payload: unknown) => void;
  onIssue?: (issue: string) => void;
};

function buildPageFetchJson(): PageFetchJson {
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
  return async (path: string) => {
    const response = await window.fetch(path, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'x-timetreea': 'web/2.1.0/en',
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
    });
    return response.json() as Promise<unknown>;
  };
}

export async function handleExtensionMessage(
  request: ExtensionRequest,
  fetchJson: PageFetchJson,
): Promise<FetchCalendarsResponse | FetchEventsResponse | false> {
  if (request.type === 'FETCH_CALENDARS') {
    const result = await listTimeTreeCalendars({ fetchJson });
    if (result.ok) return { type: 'FETCH_CALENDARS', ok: true, calendars: result.calendars };
    return { type: 'FETCH_CALENDARS', ok: false, issues: result.issues };
  }
  if (request.type === 'FETCH_EVENTS') {
    const result = await extractCalendarEvents({ calendarId: request.calendarId, since: 0, fetchJson });
    if (result.ok) return { type: 'FETCH_EVENTS', ok: true, events: result.events };
    return { type: 'FETCH_EVENTS', ok: false, issues: result.issues };
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request: ExtensionRequest, _sender, sendResponse) => {
    const fetchJson = buildPageFetchJson();
    handleExtensionMessage(request, fetchJson).then(sendResponse);
    return true;
  });
}

export function createTimeTreeObserverMessageHandler(
  options: TimeTreeObserverMessageHandlerOptions,
): (event: ObserverMessageEvent) => void {
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

const CREDENTIAL_LIKE_KEYS = new Set([
  'headers',
  'cookie',
  'authorization',
  'csrf',
  'token',
  'access_token',
]);

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
