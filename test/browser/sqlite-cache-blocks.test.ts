import assert from 'node:assert/strict';
import test from 'node:test';

import { reconstructSqliteCacheBytes } from '../../src/browser/sqlite-cache-blocks.js';

test('reconstructs negative-offset TimeTree SQLite blocks relative to file end', () => {
  const result = reconstructSqliteCacheBytes({
    fileSize: 12,
    blocks: [
      { path: '/timetree', offset: -4, data: Uint8Array.from([9, 10, 11, 12]) },
      { path: '/timetree', offset: -12, data: Uint8Array.from([1, 2, 3, 4]) },
      { path: '/timetree', offset: -8, data: Uint8Array.from([5, 6, 7, 8]) },
    ],
    path: '/timetree',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual([...result.bytes], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('filters blocks by path before reconstructing the SQLite snapshot', () => {
  const result = reconstructSqliteCacheBytes({
    fileSize: 4,
    blocks: [
      { path: '/other', offset: 0, data: Uint8Array.from([99, 99, 99, 99]) },
      { path: '/timetree', offset: 0, data: Uint8Array.from([1, 2, 3, 4]) },
    ],
    path: '/timetree',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual([...result.bytes], [1, 2, 3, 4]);
});

test('fails closed when a block extends outside the SQLite file boundary', () => {
  const result = reconstructSqliteCacheBytes({
    fileSize: 4,
    blocks: [{ path: '/timetree', offset: 2, data: Uint8Array.from([1, 2, 3]) }],
    path: '/timetree',
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, ['blocks[0] exceeds file boundary']);
});
