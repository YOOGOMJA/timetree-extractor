import assert from 'node:assert/strict';
import test from 'node:test';

import initSqlJs from 'sql.js';
import { createSqlJsOpenDatabase } from '../../src/browser/sqljs-adapter.js';
import { readTimeTreeSqliteEvents } from '../../src/browser/sqlite-event-reader.js';

test('opens sql.js database bytes through the SQLite reader port', async () => {
  const SQL = await initSqlJs();
  const seed = new SQL.Database();
  seed.run(`
    CREATE TABLE events (
      id TEXT,
      primary_id TEXT,
      calendar_id INTEGER,
      uuid TEXT,
      category INTEGER,
      type INTEGER,
      title TEXT,
      all_day INTEGER,
      start_at INTEGER,
      start_timezone TEXT,
      end_at INTEGER,
      end_timezone TEXT,
      label_id INTEGER,
      location TEXT,
      url TEXT,
      note TEXT,
      attendees BLOB,
      recurrences BLOB,
      recurring_uuid TEXT,
      alerts BLOB,
      attachment BLOB,
      files BLOB,
      deactivated_at INTEGER,
      updated_at INTEGER,
      created_at INTEGER,
      recur_start_at INTEGER,
      recur_end_at INTEGER
    )
  `);
  seed.run(
    `INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, jsonb(?), jsonb(?), ?, jsonb(?), jsonb(?), jsonb(?), ?, ?, ?, ?, ?)`,
    [
      'event-1', 'primary-1', 123, 'uuid-1', 0, 0, 'Dinner', 0,
      1_767_000_000_000, 'Asia/Seoul', 1_767_003_600_000, 'Asia/Seoul',
      null, null, null, null,
      '[]', JSON.stringify(['RRULE:FREQ=WEEKLY;BYDAY=MO']), null, '[]', '{}', '[]',
      null, 1_767_000_000_001, 1_767_000_000_002, 0, 0,
    ],
  );
  const bytes = seed.export();
  seed.close();

  const result = readTimeTreeSqliteEvents({
    bytes,
    openDatabase: createSqlJsOpenDatabase(SQL),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.title, 'Dinner');
  assert.deepEqual(result.events[0]?.recurrences, ['RRULE:FREQ=WEEKLY;BYDAY=MO']);
});
