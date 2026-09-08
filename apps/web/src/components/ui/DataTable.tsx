/**
 * Data table composite (design-05).
 *
 * Sticky header, tabular numerals for money columns,
 * P&L coloring (green positive / red negative),
 * horizontal scroll, sticky first column on mobile.
 */

import { Skeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  /** First column becomes sticky on mobile scroll. */
  sticky?: boolean;
  /** Apply tabular numerals class (for money columns). */
  tabular?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  /** Empty state content when data is empty. */
  emptyMessage?: string;
}

function alignClass(align?: string): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading,
  emptyMessage = 'Nenhum dado disponível',
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-surface p-4">
        <Skeleton variant="table" lines={5} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-surface p-8 text-center text-sm text-tertiary">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="sticky top-0 z-10 border-b border-gray-200 bg-surface">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-tertiary ${alignClass(col.align)} ${
                  col.sticky ? 'sticky left-0 z-20 bg-surface' : ''
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className="border-b border-gray-100 last:border-0"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-3 ${alignClass(col.align)} ${
                    col.tabular ? 'tabular-nums' : ''
                  } ${col.sticky ? 'sticky left-0 z-10 bg-surface' : ''}`}
                >
                  {col.render
                    ? col.render(row)
                    : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
