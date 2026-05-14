import assert from 'node:assert/strict';
import test from 'node:test';

import { readTimeTreeSqliteCacheEvents } from '../../src/browser/sqlite-cache-reader.js';
import { type SqliteDatabaseLike, type SqliteStatementLike } from '../../src/browser/sqlite-event-reader.js';

class FakeStatement implements SqliteStatementLike {
  private index = -1;
  freed = false;

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
  readonly statement: FakeStatement;
  closed = false;

  constructor(rows: Record<string, unknown>[]) {
    this.statement = new FakeStatement(rows);
  }

  prepare(): SqliteStatementLike {
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
  recurrences: Uint8Array.from([]),
};

test('reconstructs TimeTree SQLite cache blocks and reads mapped events', () => {
  const db = new FakeDatabase([validRow]);
  const openedBytes: number[][] = [];

  const result = readTimeTreeSqliteCacheEvents({
    metadataRecords: [{ name: '/timetree', fileSize: 8 }],
    blockRecords: [
      { path: '/timetree', offset: -4, data: Uint8Array.from([5, 6, 7, 8]) },
      { path: '/timetree', offset: -8, data: Uint8Array.from([1, 2, 3, 4]) },
    ],
    openDatabase: (bytes) => {
      openedBytes.push([...bytes]);
      return db;
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(openedBytes, [[1, 2, 3, 4, 5, 6, 7, 8]]);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.id, 'event-1');
});

test('fails closed when TimeTree SQLite metadata is missing', () => {
  const result = readTimeTreeSqliteCacheEvents({
    metadataRecords: [],
    blockRecords: [],
    openDatabase: () => new FakeDatabase([]),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, ['metadata for /timetree was not found']);
});

test('returns block reconstruction issues before opening SQLite database', () => {
  let opened = false;
  const result = readTimeTreeSqliteCacheEvents({
    metadataRecords: [{ name: '/timetree', fileSize: 4 }],
    blockRecords: [{ path: '/timetree', offset: 2, data: Uint8Array.from([1, 2, 3]) }],
    openDatabase: () => {
      opened = true;
      return new FakeDatabase([]);
    },
  });

  assert.equal(result.ok, false);
  assert.equal(opened, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, ['blocks[0] exceeds file boundary']);
});
