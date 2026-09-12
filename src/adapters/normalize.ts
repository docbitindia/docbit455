import type { CellValue } from '../types/dataset';

/**
 * Normalizes a jagged array-of-arrays into a rectangular CellValue[][] grid.
 * - Converts Date objects to ISO date strings (yyyy-mm-dd) so the rest of the
 *   pipeline can treat dates uniformly regardless of source format.
 * - Pads short rows and trims fully-empty trailing rows/columns.
 */
export function normalizeRows(input: unknown[][]): { rows: CellValue[][]; columnCount: number } {
  let maxCols = 0;
  for (const row of input) {
    if (Array.isArray(row)) maxCols = Math.max(maxCols, row.length);
  }

  const normalized: CellValue[][] = input.map((row) => {
    const safeRow = Array.isArray(row) ? row : [];
    const out: CellValue[] = new Array(maxCols).fill(null);
    for (let i = 0; i < maxCols; i++) {
      out[i] = normalizeCell(safeRow[i]);
    }
    return out;
  });

  // Trim fully-empty trailing rows.
  let lastNonEmpty = normalized.length - 1;
  while (lastNonEmpty >= 0 && normalized[lastNonEmpty].every((c) => c === null)) {
    lastNonEmpty -= 1;
  }
  const rows = normalized.slice(0, lastNonEmpty + 1);

  // Trim fully-empty trailing columns.
  let lastCol = maxCols - 1;
  while (lastCol >= 0 && rows.every((r) => r[lastCol] === null)) {
    lastCol -= 1;
  }
  const columnCount = lastCol + 1;
  const trimmedRows = columnCount < maxCols ? rows.map((r) => r.slice(0, columnCount)) : rows;

  return { rows: trimmedRows, columnCount: Math.max(columnCount, 0) };
}

function normalizeCell(value: unknown): CellValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    const hh = String(value.getHours()).padStart(2, '0');
    const mi = String(value.getMinutes()).padStart(2, '0');
    const ss = String(value.getSeconds()).padStart(2, '0');
    return value.getHours() || value.getMinutes() || value.getSeconds()
      ? `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`
      : `${yyyy}-${mm}-${dd}`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  return String(value);
}
