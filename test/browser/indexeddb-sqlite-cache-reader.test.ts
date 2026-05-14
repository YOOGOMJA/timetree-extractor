import assert from 'node:assert/strict';
import test from 'node:test';

import { readTimeTreeSqliteCacheEventsFromIndexedDb } from '../../src/browser/indexeddb-sqlite-cache-reader.js';
import { type SqliteDatabaseLike, type SqliteStatementLike } from '../../src/browser/sqlite-event-reader.js';

class FakeRequest<T> {
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public readonly result: T, public readonly error: Error | null = null) {}

  succeed(): void {
    queueMicrotask(() => this.onsuccess?.());
  }

  fail(): void {
    queueMicrotask(() => this.onerror?.());
  }
}

class FakeObjectStore<T> {
  constructor(private readonly records: T[]) {}

  getAll(): FakeRequest<T[]> {
    const request = new FakeRequest(this.records);
    request.succeed();
    return request;
  }
}

class FakeTransaction {
  constructor(private readonly stores: Record<string, FakeObjectStore<unknown>>) {}

  objectStore(name: string): FakeObjectStore<unknown> {
    return this.stores[name] ?? new FakeObjectStore([]);
  }
}

class FakeIdbDatabase {
  closed = false;

  constructor(private readonly stores: Record<string, FakeObjectStore<unknown>>) {}

  transaction(storeNames: string[], mode: string): FakeTransaction {
    assert.deepEqual(storeNames, ['metadata', 'blocks']);
    assert.equal(mode, 'readonly');
    return new FakeTransaction(this.stores);
  }

  close(): void {
    this.closed = true;
  }
}

class FakeIndexedDbFactory {
  constructor(private readonly database: FakeIdbDatabase) {}

  open(name: string): FakeRequest<FakeIdbDatabase> {
    assert.equal(name, 'timetree-sqlite');
    const request = new FakeRequest(this.database);
    request.succeed();
    return request;
  }
}

class FakeStatement implements SqliteStatementLike {
  private index = -1;
  constructor(private readonly rows: Record<string, unknown>[]) {}
  step(): boolean { this.index += 1; return this.index < this.rows.length; }
  getAsObject(): Record<string, unknown> { return this.rows[this.index] ?? {}; }
  free(): void {}
}

class FakeSqliteDatabase implements SqliteDatabaseLike {
  constructor(private readonly rows: Record<string, unknown>[]) {}
  prepare(): SqliteStatementLike { return new FakeStatement(this.rows); }
  close(): void {}
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

test('reads TimeTree SQLite metadata and blocks from IndexedDB in readonly mode', async () => {
  const idbDatabase = new FakeIdbDatabase({
    metadata: new FakeObjectStore([{ name: '/timetree', fileSize: 4 }]),
    blocks: new FakeObjectStore([{ path: '/timetree', offset: 0, data: Uint8Array.from([1, 2, 3, 4]) }]),
  });
  const indexedDB = new FakeIndexedDbFactory(idbDatabase);

  const result = await readTimeTreeSqliteCacheEventsFromIndexedDb({
    indexedDB: indexedDB as unknown as IDBFactory,
    openDatabase: () => new FakeSqliteDatabase([validRow]),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.id, 'event-1');
  assert.equal(idbDatabase.closed, true);
});
