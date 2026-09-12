import type { CellValue, DatasetSchema, RawDataset } from '../types/dataset';
import { toDate, toNumber } from '../utils/format';

export type ColumnImportMode = 'fill-empty' | 'replace-all';

export interface ColumnImportAssignment {
  sourceIndex: number;
  value: CellValue;
}

export interface ColumnImportPlan {
  mode: ColumnImportMode;
  assignments: ColumnImportAssignment[];
  inputCount: number;
  emptyAvailable: number;
  existingReplaced: number;
}

export function convertColumnValue(value: CellValue, type: string): { value?: CellValue; error?: string } {
  if (value === null || String(value).trim() === '') return { value: null };
  const text = String(value).trim();
  if (type === 'number') {
    const parsed = toNumber(text.endsWith('%') ? text.slice(0, -1).trim() : text);
    return parsed === null ? { error: `Invalid number: ${text}` } : { value: parsed };
  }
  if (type === 'boolean') {
    const key = text.toLowerCase();
    if (['true', 'yes', 'y', '1', 'pass', 'passed', 'on'].includes(key)) return { value: true };
    if (['false', 'no', 'n', '0', 'fail', 'failed', 'off'].includes(key)) return { value: false };
    return { error: `Invalid Boolean: ${text}` };
  }
  if (type === 'date') {
    const date = toDate(text);
    if (!date) return { error: `Invalid date: ${text}` };
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hasTime = date.getHours() || date.getMinutes() || date.getSeconds();
    return { value: hasTime ? `${yyyy}-${mm}-${dd}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}` : `${yyyy}-${mm}-${dd}` };
  }
  if (type === 'url') {
    try {
      const url = new URL(text);
      if (!/^https?:$/i.test(url.protocol)) throw new Error();
      return { value: text };
    } catch {
      return { error: `Invalid HTTP(S) URL: ${text}` };
    }
  }
  return { value: type === 'string' || type === 'mixed' ? text : value };
}

export function prepareColumnImport(
  raw: RawDataset,
  schema: DatasetSchema,
  columnKey: string,
  values: CellValue[],
  mode: ColumnImportMode
): { ok: true; plan: ColumnImportPlan } | { ok: false; error: string } {
  const column = schema.columns.find((c) => c.key === columnKey);
  if (!column) return { ok: false, error: 'Column not found.' };
  const structural = new Set(schema.structuralGroups.map((g) => g.sourceIndex));
  const dataRows: { sourceIndex: number; value: CellValue }[] = [];
  for (let i = schema.dataStartIndex; i < schema.dataEndIndex; i++) {
    const sourceIndex = i + 1;
    if (structural.has(sourceIndex)) continue;
    dataRows.push({ sourceIndex, value: raw.rows[i]?.[column.index] ?? null });
  }
  const emptyRows = dataRows.filter((r) => r.value === null || String(r.value).trim() === '');
  if (mode === 'replace-all' && values.length !== dataRows.length) {
    return { ok: false, error: `Replace all requires exactly ${dataRows.length} values; received ${values.length}. No data was changed.` };
  }
  if (mode === 'fill-empty' && values.length > emptyRows.length) {
    return { ok: false, error: `Fill empty cells only has ${emptyRows.length} empty cells available; received ${values.length} values. No data was changed.` };
  }

  const assignments: ColumnImportAssignment[] = [];
  const targetRows = mode === 'fill-empty' ? emptyRows : dataRows;
  for (let i = 0; i < values.length; i++) {
    const converted = convertColumnValue(values[i], column.dataType);
    if (converted.error) return { ok: false, error: `${converted.error} at imported value ${i + 1}. No data was changed.` };
    assignments.push({ sourceIndex: targetRows[i].sourceIndex, value: converted.value ?? null });
  }
  return {
    ok: true,
    plan: {
      mode,
      assignments,
      inputCount: values.length,
      emptyAvailable: emptyRows.length,
      existingReplaced: mode === 'replace-all' ? assignments.filter((a) => {
        const row = raw.rows[a.sourceIndex - 1];
        return row?.[column.index] !== null && row?.[column.index] !== undefined && String(row?.[column.index]).trim() !== '';
      }).length : 0
    }
  };
}
