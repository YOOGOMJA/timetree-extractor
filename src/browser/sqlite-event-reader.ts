import { validateRawTimeTreeEvent, type RawTimeTreeEvent } from '../core/contracts.js';
import { mapSqliteEventRowToRawTimeTreeEvent } from './sqlite-event-row-mapper.js';

export type SqliteStatementLike = {
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
};

export type SqliteDatabaseLike = {
  prepare(sql: string): SqliteStatementLike;
  close(): void;
};

export type OpenSqliteDatabase = (bytes: Uint8Array) => SqliteDatabaseLike;

export type ReadTimeTreeSqliteEventsInput = {
  bytes: Uint8Array;
  openDatabase: OpenSqliteDatabase;
  maxRows?: number;
};

export type ReadTimeTreeSqliteEventsResult =
  | { ok: true; events: RawTimeTreeEvent[]; issues: [] }
  | { ok: false; events: []; issues: string[] };

const JSON_COLUMNS = new Set(['attendees', 'recurrences', 'alerts', 'attachment', 'files']);

const EVENT_COLUMNS = [
  'id',
  'primary_id',
  'calendar_id',
  'uuid',
  'category',
  'type',
  'title',
  'all_day',
  'start_at',
  'start_timezone',
  'end_at',
  'end_timezone',
  'label_id',
  'location',
  'url',
  'note',
  'attendees',
  'recurrences',
  'recurring_uuid',
  'alerts',
  'attachment',
  'files',
  'deactivated_at',
  'updated_at',
  'created_at',
  'recur_start_at',
  'recur_end_at',
] as const;

export function readTimeTreeSqliteEvents(input: ReadTimeTreeSqliteEventsInput): ReadTimeTreeSqliteEventsResult {
  const maxRows = input.maxRows ?? Number.POSITIVE_INFINITY;
  const events: RawTimeTreeEvent[] = [];
  const issues: string[] = [];

  let database: SqliteDatabaseLike | null = null;
  let statement: SqliteStatementLike | null = null;

  try {
    database = input.openDatabase(input.bytes);
    statement = database.prepare(buildEventsCursorSql());

    let rowIndex = 0;
    while (rowIndex < maxRows && statement.step()) {
      const mapped = mapSqliteEventRowToRawTimeTreeEvent(statement.getAsObject());
      const validation = validateRawTimeTreeEvent(mapped);
      if (validation.ok) {
        events.push(validation.value);
      } else {
        issues.push(...validation.issues.map((issue) => `rows[${rowIndex}].${issue}`));
      }
      rowIndex += 1;
    }
  } catch (error) {
    issues.push(`sqlite reader failed: ${errorMessage(error)}`);
  } finally {
    statement?.free();
    database?.close();
  }

  if (issues.length > 0) return { ok: false, events: [], issues };
  return { ok: true, events, issues: [] };
}

export function buildEventsCursorSql(): string {
  return `SELECT ${EVENT_COLUMNS.map(selectExpression).join(', ')} FROM ${quoteIdentifier('events')}`;
}

function selectExpression(column: string): string {
  if (JSON_COLUMNS.has(column)) return `json(${quoteIdentifier(column)}) AS ${quoteIdentifier(column)}`;
  return quoteIdentifier(column);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
