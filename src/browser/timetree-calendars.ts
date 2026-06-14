import { validateRawTimeTreeCalendar, type RawTimeTreeCalendar } from '../core/contracts.js';
import { type PageFetchJson } from './timetree-page-extractor.js';

export type ListTimeTreeCalendarsInput = {
  fetchJson: PageFetchJson;
};

export type ListTimeTreeCalendarsResult =
  | { ok: true; calendars: RawTimeTreeCalendar[]; issues: [] }
  | { ok: false; calendars?: undefined; issues: string[] };

export async function listTimeTreeCalendars(input: ListTimeTreeCalendarsInput): Promise<ListTimeTreeCalendarsResult> {
  const payload = await input.fetchJson('/api/v2/calendars');
  if (!isRecord(payload) || !Array.isArray(payload.calendars)) {
    return { ok: false, issues: ['calendars must be an array under `calendars` key'] };
  }

  const calendars: RawTimeTreeCalendar[] = [];
  const issues: string[] = [];
  payload.calendars.forEach((apiCalendar, index) => {
    if (!isRecord(apiCalendar)) {
      issues.push(`calendars[${index}] must be an object`);
      return;
    }
    const mapped = mapApiCalendarToRawCalendar(apiCalendar);
    const validation = validateRawTimeTreeCalendar(mapped);
    if (!validation.ok) {
      issues.push(...validation.issues.map((issue) => `calendars[${index}].${issue}`));
      return;
    }
    calendars.push(validation.value);
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, calendars, issues: [] };
}

export function mapApiCalendarToRawCalendar(apiCalendar: Record<string, unknown>): RawTimeTreeCalendar {
  return {
    id: numberValue(apiCalendar.id),
    aliasCode: stringValue(apiCalendar.alias_code),
    name: stringValue(apiCalendar.name),
    purpose: typeof apiCalendar.purpose === 'string' ? apiCalendar.purpose : null,
    updatedAt: optionalNumber(apiCalendar.updated_at),
    createdAt: optionalNumber(apiCalendar.created_at),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  return numberValue(value);
}
