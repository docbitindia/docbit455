import type { CellValue } from '../types/dataset';

/**
 * Insert one empty logical cell in a single data column.
 *
 * direction='top' means Insert Before: the selected cell and every value below
 * it move down one logical data-row position.
 * direction='bottom' means Insert After: the selected cell stays in place and
 * every value after it moves down one logical data-row position.
 *
 * Structural/header/group rows are never shifted. If the column has no empty
 * capacity at the end, a new raw data row is inserted at dataEndRawIndex so no
 * existing non-empty value is silently discarded.
 */
export function insertBlankCell(
  rows: CellValue[][],
  dataRowIndexes: number[],
  dataPosition: number,
  columnIndex: number,
  direction: 'top' | 'bottom',
  dataEndRawIndex?: number
): { rows: CellValue[][]; discardedValue: CellValue; insertedRawIndex: number; extended: boolean } {
  const next = rows.map((row) => [...row]);
  if (dataPosition < 0 || dataPosition >= dataRowIndexes.length || dataRowIndexes.length === 0) {
    return { rows: next, discardedValue: null, insertedRawIndex: -1, extended: false };
  }

  const ensureCell = (rawIndex: number) => {
    while (next[rawIndex].length <= columnIndex) next[rawIndex].push(null);
  };

  // Both insertion directions move data downward. The only difference is
  // where the new empty slot is placed relative to the selected cell.
  const insertPosition = direction === 'top' ? dataPosition : dataPosition + 1;
  let logicalIndexes = [...dataRowIndexes];
  let extended = false;

  // If there is no spare empty slot at the bottom, grow the data area by one
  // row instead of silently deleting the last value.
  const lastRawIndex = logicalIndexes[logicalIndexes.length - 1];
  ensureCell(lastRawIndex);
  const lastValue = next[lastRawIndex][columnIndex] ?? null;
  // A spare empty logical cell at the end is enough capacity for either
  // insertion direction. Grow the data area only when the insertion would
  // exceed the current logical range or the tail contains a real value that
  // would otherwise be displaced and lost.
  if (insertPosition >= logicalIndexes.length || (lastValue !== null && String(lastValue).trim() !== '')) {
    const rawInsertAt = dataEndRawIndex ?? (next.length);
    const width = Math.max(columnIndex + 1, ...next.map((r) => r.length), 0);
    next.splice(rawInsertAt, 0, Array(width).fill(null));
    logicalIndexes = logicalIndexes.map((i) => i >= rawInsertAt ? i + 1 : i);
    logicalIndexes.push(rawInsertAt);
    extended = true;
  }

  // Shift from the end toward the insertion point so values are never
  // overwritten. The selected cell is included for Insert Before; for Insert
  // After, values after the selected cell are shifted while the selected cell
  // remains exactly where it was.
  for (let p = logicalIndexes.length - 1; p > insertPosition; p -= 1) {
    const toRaw = logicalIndexes[p];
    const fromRaw = logicalIndexes[p - 1];
    ensureCell(toRaw);
    ensureCell(fromRaw);
    next[toRaw][columnIndex] = next[fromRaw][columnIndex] ?? null;
  }

  const insertedRawIndex = logicalIndexes[insertPosition];
  ensureCell(insertedRawIndex);
  next[insertedRawIndex][columnIndex] = null;

  return { rows: next, discardedValue: null, insertedRawIndex, extended };
}
