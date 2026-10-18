/**
 * SQL predicate inspection helpers for fake DB captures.
 *
 * Extracts column names and bound literal values from Drizzle SQL/Param/Column
 * nodes captured by the fake in-memory database. This is shared by tests that
 * assert on the generated predicates.
 *
 * Accepts a single predicate node or an array of nodes (for example an
 * `onConflictDoUpdate` conflict target, which is a column array).
 */
import { Column, Param, SQL } from 'drizzle-orm';

export function whereFacts(predicate: unknown): { columns: string[]; values: unknown[] } {
  const columns: string[] = [];
  const values: unknown[] = [];

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'string') {
      values.push(node);
      return;
    }
    if (node instanceof SQL) {
      node.queryChunks.forEach(visit);
      return;
    }
    if (node instanceof Param) {
      values.push(node.value);
      return;
    }
    if (node instanceof Column) {
      columns.push(node.name);
    }
  };

  visit(predicate);
  return { columns, values };
}
