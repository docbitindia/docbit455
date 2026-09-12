import type { CellValue, ColumnSchema } from '../types/dataset';
import type { SortRule } from '../types/report';
import { toDate, toNumber } from '../utils/format';

export function compareValues(a: CellValue, b: CellValue, dataType: string): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // empty values sort last
  if (bEmpty) return -1;

  if (dataType === 'number') {
    const an = toNumber(a) ?? 0;
    const bn = toNumber(b) ?? 0;
    return an - bn;
  }
  if (dataType === 'date') {
    const ad = toDate(a);
    const bd = toDate(b);
    if (ad && bd) return ad.getTime() - bd.getTime();
  }
  if (dataType === 'boolean') {
    return (a ? 1 : 0) - (b ? 1 : 0);
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortRows<T extends { values: CellValue[] }>(
  rows: T[],
  sorts: SortRule[],
  columnsByKey: Map<string, ColumnSchema>,
  columnIndexInValues: (key: string) => number
): T[] {
  if (sorts.length === 0) return rows;
  const withOriginalIndex = rows.map((r, i) => ({ r, i }));
  withOriginalIndex.sort((x, y) => {
    for (const rule of sorts) {
      const col = columnsByKey.get(rule.columnKey);
      if (!col) continue;
      const idx = columnIndexInValues(rule.columnKey);
      const av = x.r.values[idx];
      const bv = y.r.values[idx];
      const cmp = compareValues(av, bv, col.dataType);
      if (cmp !== 0) return rule.direction === 'asc' ? cmp : -cmp;
    }
    return x.i - y.i; // stable fallback
  });
  return withOriginalIndex.map((w) => w.r);
}
