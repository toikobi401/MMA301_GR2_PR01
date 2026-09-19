import { ObjectId } from 'mongodb';
import { pokerTables } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { Table } from './table-manager.js';

/**
 * Live tables, keyed by id.
 *
 * A table is loaded on first access and stays resident while anyone is
 * subscribed. This is deliberately single-process: the hand state lives in
 * memory, so running two server instances would give each its own copy of the
 * same table. Scaling out would mean moving hand state into Redis and
 * electing one owner per table — out of scope here, and worth stating rather
 * than discovering later.
 */
const tables = new Map<string, Table>();

export async function getTable(tableId: string): Promise<Table> {
  const existing = tables.get(tableId);
  if (existing) return existing;

  if (!ObjectId.isValid(tableId)) throw AppError.notFound('Table not found');

  const doc = await pokerTables().findOne({ _id: new ObjectId(tableId) });
  if (!doc) throw AppError.notFound('Table not found');

  const table = new Table(doc);
  tables.set(tableId, table);
  return table;
}

export function peekTable(tableId: string): Table | undefined {
  return tables.get(tableId);
}

export function releaseTable(tableId: string): void {
  const table = tables.get(tableId);
  if (!table) return;
  table.dispose();
  tables.delete(tableId);
}

export function disposeAllTables(): void {
  for (const table of tables.values()) table.dispose();
  tables.clear();
}
