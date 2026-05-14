import { type Database, type SqlJsStatic } from 'sql.js';
import { type OpenSqliteDatabase, type SqliteDatabaseLike } from './sqlite-event-reader.js';

export type SqlJsDatabaseLike = Database & SqliteDatabaseLike;

export function createSqlJsOpenDatabase(SQL: SqlJsStatic): OpenSqliteDatabase {
  return (bytes) => new SQL.Database(bytes) as SqlJsDatabaseLike;
}
