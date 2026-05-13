import { type ExtractionWarning, type RawTimeTreeEvent } from '../core/contracts.js';

export type SqliteEventRow = Record<string, unknown>;

export function mapSqliteEventRowToRawTimeTreeEvent(row: SqliteEventRow): RawTimeTreeEvent {
  const warnings: ExtractionWarning[] = ['internal-api-surface'];
  const recurrences = readRecurrences(row.recurrences, warnings);

  if (hasBinaryContent(row.attendees)) warnings.push('shared-calendar-personal-data');
  if (hasBinaryContent(row.attachment) || hasBinaryContent(row.files)) warnings.push('unsupported-attachment');

  return {
    id: stringValue(row.id),
    calendarId: numberValue(row.calendar_id),
    title: stringValue(row.title),
    allDay: booleanFromSqlite(row.all_day),
    startAt: numberValue(row.start_at),
    startTimezone: nullableString(row.start_timezone),
    endAt: numberValue(row.end_at),
    endTimezone: nullableString(row.end_timezone),
    labelId: optionalNullableNumber(row.label_id),
    location: optionalNullableString(row.location),
    url: optionalNullableString(row.url),
    note: optionalNullableString(row.note),
    recurrences,
    recurringUuid: optionalNullableString(row.recurring_uuid),
    alerts: [],
    attendees: [],
    attachment: null,
    files: [],
    updatedAt: optionalNumber(row.updated_at),
    createdAt: optionalNumber(row.created_at),
    deactivatedAt: optionalNullableNumber(row.deactivated_at),
    extractionWarnings: unique(warnings),
  };
}

function readRecurrences(value: unknown, warnings: ExtractionWarning[]): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  if (value instanceof Uint8Array && value.byteLength > 0) warnings.push('recurrence-not-normalized');
  return [];
}

function hasBinaryContent(value: unknown): boolean {
  return value instanceof Uint8Array && value.byteLength > 0;
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

function booleanFromSqlite(value: unknown): boolean {
  return value === true || value === 1;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
