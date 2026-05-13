import { validateRawTimeTreeEvent, type RawTimeTreeEvent } from '../core/contracts.js';
import { mapApiEventToRawTimeTreeEvent } from './timetree-page-extractor.js';

export type FieldType = 'array' | 'null' | 'string' | 'number' | 'boolean' | 'object' | 'undefined' | 'function' | 'symbol' | 'bigint';

export type ObservedEventsSummary = {
  eventCount: number;
  firstEventKeyCount: number;
  firstEventKeys: string[];
  p0FieldTypes: Record<string, FieldType>;
  contractShapeLikely: boolean;
};

export type ObservedEventsSummaryResult =
  | { ok: true; summary: ObservedEventsSummary; issues: [] }
  | { ok: false; summary?: undefined; issues: string[] };

export type ObservedEventsMapResult =
  | { ok: true; events: RawTimeTreeEvent[]; issues: [] }
  | { ok: false; events: []; issues: string[] };

const P0_FIELDS = [
  'id',
  'calendar_id',
  'title',
  'all_day',
  'start_at',
  'start_timezone',
  'end_at',
  'end_timezone',
  'recurrences',
] as const;

export function summarizeObservedEventsPayload(payload: unknown): ObservedEventsSummaryResult {
  const eventsResult = readEvents(payload);
  if (!eventsResult.ok) return eventsResult;

  const firstEvent = eventsResult.events[0];
  const firstEventKeys = firstEvent ? Object.keys(firstEvent).sort() : [];
  const p0FieldTypes = Object.fromEntries(
    P0_FIELDS.map((field) => [field, fieldType(firstEvent?.[field])]),
  ) as Record<string, FieldType>;

  return {
    ok: true,
    summary: {
      eventCount: eventsResult.events.length,
      firstEventKeyCount: firstEventKeys.length,
      firstEventKeys,
      p0FieldTypes,
      contractShapeLikely: firstEvent ? isContractShapeLikely(firstEvent) : false,
    },
    issues: [],
  };
}

export function mapObservedEventsPayload(payload: unknown): ObservedEventsMapResult {
  const eventsResult = readEvents(payload);
  if (!eventsResult.ok) return { ok: false, events: [], issues: eventsResult.issues };

  const events: RawTimeTreeEvent[] = [];
  const issues: string[] = [];

  eventsResult.events.forEach((event, index) => {
    const raw = mapApiEventToRawTimeTreeEvent(event);
    const validation = validateRawTimeTreeEvent(raw);
    if (validation.ok) {
      events.push(validation.value);
    } else {
      issues.push(...validation.issues.map((issue) => `events[${index}].${issue}`));
    }
  });

  if (issues.length > 0) return { ok: false, events: [], issues };
  return { ok: true, events, issues: [] };
}

function readEvents(payload: unknown): { ok: true; events: Record<string, unknown>[]; issues: [] } | { ok: false; issues: string[] } {
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    return { ok: false, issues: ['events must be an array'] };
  }

  const events: Record<string, unknown>[] = [];
  const issues: string[] = [];
  payload.events.forEach((event, index) => {
    if (isRecord(event)) {
      events.push(event);
    } else {
      issues.push(`events[${index}] must be an object`);
    }
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true, events, issues: [] };
}

function isContractShapeLikely(event: Record<string, unknown>): boolean {
  return typeof event.id === 'string'
    && typeof event.calendar_id === 'number'
    && typeof event.title === 'string'
    && typeof event.all_day === 'boolean'
    && typeof event.start_at === 'number'
    && typeof event.end_at === 'number'
    && (typeof event.start_timezone === 'string' || event.start_timezone === null)
    && (typeof event.end_timezone === 'string' || event.end_timezone === null)
    && Array.isArray(event.recurrences);
}

function fieldType(value: unknown): FieldType {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}
