import { type ExtractionWarning, type RawTimeTreeEvent, validateRawTimeTreeEvent } from '../core/contracts.js';

export type PageFetchJson = (path: string) => Promise<unknown>;

export type ExtractVisibleTimeTreeEventsInput = {
  locationHref: string;
  calendarId: number;
  since?: number;
  fetchJson: PageFetchJson;
};

export type ExtractVisibleTimeTreeEventsResult =
  | { ok: true; calendarAlias: string; events: RawTimeTreeEvent[]; issues: [] }
  | { ok: false; calendarAlias?: string; events: []; issues: string[] };

type ApiEvent = Record<string, unknown>;

export function parseTimeTreeCalendarAlias(locationHref: string): string | null {
  let url: URL;
  try {
    url = new URL(locationHref);
  } catch {
    return null;
  }

  if (url.hostname !== 'timetreeapp.com') return null;
  const match = url.pathname.match(/^\/calendars\/([^/]+)/);
  return match?.[1] ?? null;
}

export async function extractVisibleTimeTreeEvents(input: ExtractVisibleTimeTreeEventsInput): Promise<ExtractVisibleTimeTreeEventsResult> {
  const calendarAlias = parseTimeTreeCalendarAlias(input.locationHref);
  if (!calendarAlias) {
    return { ok: false, events: [], issues: ['Extraction must run on a TimeTree origin calendar page'] };
  }

  const sinceQuery = input.since === undefined ? '' : `?since=${encodeURIComponent(String(input.since))}`;
  const payload = await input.fetchJson(`/api/v1/calendar/${input.calendarId}/events${sinceQuery}`);
  const payloadValidation = readEventsArray(payload);
  if (!payloadValidation.ok) {
    return { ok: false, calendarAlias, events: [], issues: payloadValidation.issues };
  }

  const eventsPayload = payloadValidation.events;
  const events: RawTimeTreeEvent[] = [];
  const issues: string[] = [];

  for (const [index, apiEvent] of eventsPayload.entries()) {
    const mapped = mapApiEventToRawTimeTreeEvent(apiEvent);
    const validation = validateRawTimeTreeEvent(mapped);
    if (validation.ok) {
      events.push(validation.value);
    } else {
      issues.push(...validation.issues.map((issue) => `events[${index}].${issue}`));
    }
  }

  if (issues.length > 0) return { ok: false, calendarAlias, events: [], issues };
  return { ok: true, calendarAlias, events, issues: [] };
}

export function mapApiEventToRawTimeTreeEvent(apiEvent: ApiEvent): RawTimeTreeEvent {
  const warnings: ExtractionWarning[] = ['internal-api-surface'];
  const attendees = arrayOrEmpty(apiEvent.attendees);
  const files = arrayOrEmpty(apiEvent.files);
  const attachment = apiEvent.attachment ?? null;

  if (attendees.length > 0) warnings.push('shared-calendar-personal-data');
  if (attachment || files.length > 0) warnings.push('unsupported-attachment');

  return {
    id: stringValue(apiEvent.id),
    calendarId: numberValue(apiEvent.calendar_id),
    title: stringValue(apiEvent.title),
    allDay: booleanFromApi(apiEvent.all_day),
    startAt: numberValue(apiEvent.start_at),
    startTimezone: nullableString(apiEvent.start_timezone),
    endAt: numberValue(apiEvent.end_at),
    endTimezone: nullableString(apiEvent.end_timezone),
    labelId: optionalNullableNumber(apiEvent.label_id),
    location: optionalNullableString(apiEvent.location),
    url: optionalNullableString(apiEvent.url),
    note: optionalNullableString(apiEvent.note),
    recurrences: stringArray(apiEvent.recurrences),
    recurringUuid: optionalNullableString(apiEvent.recurring_uuid),
    alerts: arrayOrEmpty(apiEvent.alerts),
    attendees,
    attachment,
    files,
    updatedAt: optionalNumber(apiEvent.updated_at),
    createdAt: optionalNumber(apiEvent.created_at),
    deactivatedAt: optionalNullableNumber(apiEvent.deactivated_at),
    extractionWarnings: unique(warnings),
  };
}

function readEventsArray(payload: unknown): { ok: true; events: ApiEvent[] } | { ok: false; issues: string[] } {
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    return { ok: false, issues: ['events must be an array'] };
  }

  const issues: string[] = [];
  const events: ApiEvent[] = [];
  payload.events.forEach((event, index) => {
    if (isRecord(event)) {
      events.push(event);
    } else {
      issues.push(`events[${index}] must be an object`);
    }
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true, events };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return nullableString(value);
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return numberValue(value);
}

function optionalNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return numberValue(value);
}

function booleanFromApi(value: unknown): boolean {
  return value === true || value === 1;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
