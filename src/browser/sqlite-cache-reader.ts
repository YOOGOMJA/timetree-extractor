import { reconstructSqliteCacheBytes, type SqliteCacheBlock } from './sqlite-cache-blocks.js';
import { readTimeTreeSqliteEvents, type OpenSqliteDatabase, type ReadTimeTreeSqliteEventsResult } from './sqlite-event-reader.js';

export type TimeTreeSqliteMetadataRecord = {
  name?: string;
  fileSize?: number;
};

export type TimeTreeSqliteBlockRecord = SqliteCacheBlock;

export type ReadTimeTreeSqliteCacheEventsInput = {
  metadataRecords: TimeTreeSqliteMetadataRecord[];
  blockRecords: TimeTreeSqliteBlockRecord[];
  openDatabase: OpenSqliteDatabase;
  path?: string;
  maxRows?: number;
};

const DEFAULT_TIMETREE_SQLITE_PATH = '/timetree';

export function readTimeTreeSqliteCacheEvents(input: ReadTimeTreeSqliteCacheEventsInput): ReadTimeTreeSqliteEventsResult {
  const path = input.path ?? DEFAULT_TIMETREE_SQLITE_PATH;
  const metadata = input.metadataRecords.find((record) => record.name === path);

  if (!metadata || typeof metadata.fileSize !== 'number') {
    return { ok: false, events: [], issues: [`metadata for ${path} was not found`] };
  }

  const bytesResult = reconstructSqliteCacheBytes({
    fileSize: metadata.fileSize,
    blocks: input.blockRecords,
    path,
  });
  if (!bytesResult.ok) return { ok: false, events: [], issues: bytesResult.issues };

  return readTimeTreeSqliteEvents({
    bytes: bytesResult.bytes,
    openDatabase: input.openDatabase,
    maxRows: input.maxRows,
  });
}
