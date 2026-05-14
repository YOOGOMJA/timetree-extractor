import assert from 'node:assert/strict';
import test from 'node:test';

import { readTimeTreeSqliteEvents, type SqliteDatabaseLike, type SqliteStatementLike } from '../../src/browser/sqlite-event-reader.js';

class FakeStatement implements SqliteStatementLike {
  freed = false;
  private index = -1;

  constructor(private readonly rows: Record<string, unknown>[]) {}

  step(): boolean {
    this.index += 1;
    return this.index < this.rows.length;
  }

  getAsObject(): Record<string, unknown> {
    return this.rows[this.index] ?? {};
  }

  free(): void {
    this.freed = true;
  }
}

class FakeDatabase implements SqliteDatabaseLike {
  closed = false;
  preparedSql: string | null = null;
  readonly statement: FakeStatement;

  constructor(rows: Record<string, unknown>[]) {
    this.statement = new FakeStatement(rows);
  }

  prepare(sql: string): SqliteStatementLike {
    this.preparedSql = sql;
    return this.statement;
  }

  close(): void {
    this.closed = true;
  }
}

const validRow = {
  id: 'event-1',
  calendar_id: 123,
  title: 'Dinner',
  all_day: 0,
  start_at: 1_767_000_000_000,
  start_timezone: 'Asia/Seoul',
  end_at: 1_767_003_600_000,
  end_timezone: 'Asia/Seoul',
  label_id: 10,
  location: 'Seoul',
  url: null,
  note: null,
  recurrences: Uint8Array.from([]),
  recurring_uuid: null,
  alerts: Uint8Array.from([]),
  attendees: Uint8Array.from([]),
  attachment: Uint8Array.from([]),
  files: Uint8Array.from([]),
  updated_at: 1_767_000_000_001,
  created_at: 1_767_000_000_002,
  deactivated_at: null,
};

test('reads SQLite events with a cursor scan and maps rows to raw contract', () => {
  const db = new FakeDatabase([validRow]);

  const result = readTimeTreeSqliteEvents({
    bytes: Uint8Array.from([1, 2, 3]),
    openDatabase: (bytes) => {
      assert.deepEqual([...bytes], [1, 2, 3]);
      return db;
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.id, 'event-1');
  assert.equal(result.events[0]?.calendarId, 123);
  assert.match(db.preparedSql ?? '', /FROM "events"/);
  assert.doesNotMatch(db.preparedSql ?? '', /COUNT\s*\(/i);
  assert.equal(db.statement.freed, true);
  assert.equal(db.closed, true);
});

test('fails closed when a SQLite row does not satisfy the raw event contract', () => {
  const db = new FakeDatabase([{ ...validRow, start_timezone: null }]);

  const result = readTimeTreeSqliteEvents({
    bytes: Uint8Array.from([]),
    openDatabase: () => db,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.issues, ['rows[0].startTimezone must be a string']);
  assert.equal(db.statement.freed, true);
  assert.equal(db.closed, true);
});

test('stops scanning at maxRows without treating the limit as an error', () => {
  const db = new FakeDatabase([validRow, { ...validRow, id: 'event-2' }]);

  const result = readTimeTreeSqliteEvents({
    bytes: Uint8Array.from([]),
    openDatabase: () => db,
    maxRows: 1,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.id, 'event-1');
});
