import { readTimeTreeSqliteCacheEvents, type ReadTimeTreeSqliteCacheEventsInput, type TimeTreeSqliteBlockRecord, type TimeTreeSqliteMetadataRecord } from './sqlite-cache-reader.js';
import { type ReadTimeTreeSqliteEventsResult } from './sqlite-event-reader.js';

export type ReadTimeTreeSqliteCacheEventsFromIndexedDbInput = Omit<ReadTimeTreeSqliteCacheEventsInput, 'metadataRecords' | 'blockRecords'> & {
  indexedDB?: IDBFactory;
  databaseName?: string;
};

const DEFAULT_DATABASE_NAME = 'timetree-sqlite';
const METADATA_STORE_NAME = 'metadata';
const BLOCKS_STORE_NAME = 'blocks';

export async function readTimeTreeSqliteCacheEventsFromIndexedDb(
  input: ReadTimeTreeSqliteCacheEventsFromIndexedDbInput,
): Promise<ReadTimeTreeSqliteEventsResult> {
  const indexedDbFactory = input.indexedDB ?? globalThis.indexedDB;
  if (!indexedDbFactory) {
    return { ok: false, events: [], issues: ['indexedDB is not available'] };
  }

  let database: IDBDatabase | null = null;
  try {
    database = await openIndexedDb(indexedDbFactory, input.databaseName ?? DEFAULT_DATABASE_NAME);
    const transaction = database.transaction([METADATA_STORE_NAME, BLOCKS_STORE_NAME], 'readonly');
    const [metadataRecords, blockRecords] = await Promise.all([
      getAll<TimeTreeSqliteMetadataRecord>(transaction.objectStore(METADATA_STORE_NAME)),
      getAll<TimeTreeSqliteBlockRecord>(transaction.objectStore(BLOCKS_STORE_NAME)),
    ]);

    return readTimeTreeSqliteCacheEvents({
      metadataRecords,
      blockRecords,
      openDatabase: input.openDatabase,
      path: input.path,
      maxRows: input.maxRows,
    });
  } catch (error) {
    return { ok: false, events: [], issues: [`indexedDB reader failed: ${errorMessage(error)}`] };
  } finally {
    database?.close();
  }
}

function openIndexedDb(indexedDB: IDBFactory, databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`failed to open IndexedDB database: ${databaseName}`));
  });
}

function getAll<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error('failed to read IndexedDB object store'));
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
