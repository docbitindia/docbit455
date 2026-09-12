import type { CellValue, DataType, RawDataset, DatasetSchema } from '../types/dataset';
import { toDate, toNumber } from '../utils/format';

export type ConversionStatus = 'safe' | 'mapping-required' | 'unsupported';

export interface BooleanMapping {
  source: string;
  target: boolean | null;
}

export interface ConversionEvaluation {
  status: ConversionStatus;
  targetType: DataType;
  mappings: BooleanMapping[];
  unrecognized: string[];
  reason?: string;
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'pass', 'passed', 'on']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'fail', 'failed', 'off']);

function normalizedKey(value: CellValue): string {
  return String(value ?? '').trim().toLowerCase();
}

function meaningfulValues(raw: RawDataset, schema: DatasetSchema, columnKey: string): CellValue[] {
  const column = schema.columns.find((c) => c.key === columnKey);
  if (!column) return [];
  const structural = new Set(schema.structuralGroups.map((g) => g.sourceIndex));
  const values: CellValue[] = [];
  for (let i = schema.dataStartIndex; i < schema.dataEndIndex; i++) {
    const sourceIndex = i + 1;
    if (structural.has(sourceIndex)) continue;
    const value = raw.rows[i]?.[column.index] ?? null;
    if (value === null || String(value).trim() === '') continue;
    values.push(value);
  }
  return values;
}

export function evaluateColumnTypeConversion(
  raw: RawDataset,
  schema: DatasetSchema,
  columnKey: string,
  targetType: DataType
): ConversionEvaluation {
  const column = schema.columns.find((c) => c.key === columnKey);
  if (!column) return { status: 'unsupported', targetType, mappings: [], unrecognized: [], reason: 'Column not found.' };
  if (column.dataType === targetType) return { status: 'safe', targetType, mappings: [], unrecognized: [] };

  const values = meaningfulValues(raw, schema, columnKey);
  const unique = Array.from(new Map(values.map((v) => [normalizedKey(v), v])).values());

  if (targetType === 'boolean') {
    if (unique.length === 0) return { status: 'safe', targetType, mappings: [], unrecognized: [] };

    const obvious: BooleanMapping[] = [];
    const unknown: string[] = [];
    for (const value of unique) {
      if (typeof value === 'boolean') obvious.push({ source: String(value), target: value });
      else {
        const key = normalizedKey(value);
        if (TRUE_WORDS.has(key)) obvious.push({ source: String(value), target: true });
        else if (FALSE_WORDS.has(key)) obvious.push({ source: String(value), target: false });
        else unknown.push(String(value));
      }
    }

    if (unknown.length === 0) {
      const targets = new Set(obvious.map((m) => m.target));
      if (targets.size <= 2) return { status: 'safe', targetType, mappings: obvious, unrecognized: [] };
    }

    // A two-state semantic vocabulary with one or more additional values is
    // ambiguous. It may be convertible, but only with an explicit null/true/false decision.
    if (obvious.length > 0 && unknown.length > 0) {
      return { status: 'mapping-required', targetType, mappings: [...obvious, ...unknown.map((source) => ({ source, target: null }))], unrecognized: unknown };
    }

    // Never invent a boolean meaning for arbitrary categorical text.
    return { status: 'unsupported', targetType, mappings: [], unrecognized: unique.map(String), reason: 'No defensible Boolean mapping was detected.' };
  }

  if (targetType === 'number') {
    const invalid = unique.filter((v) => toNumber(v) === null).map(String);
    return invalid.length ? { status: 'unsupported', targetType, mappings: [], unrecognized: invalid, reason: 'Some values are not valid numbers.' } : { status: 'safe', targetType, mappings: [], unrecognized: [] };
  }

  if (targetType === 'date') {
    const invalid = unique.filter((v) => toDate(v) === null).map(String);
    return invalid.length ? { status: 'unsupported', targetType, mappings: [], unrecognized: invalid, reason: 'Some values are not valid dates.' } : { status: 'safe', targetType, mappings: [], unrecognized: [] };
  }

  if (targetType === 'url') {
    const invalid = unique.filter((v) => {
      try { return !/^https?:\/\//i.test(String(v).trim()) || !new URL(String(v).trim()); } catch { return true; }
    }).map(String);
    return invalid.length ? { status: 'unsupported', targetType, mappings: [], unrecognized: invalid, reason: 'Some values are not valid HTTP(S) URLs.' } : { status: 'safe', targetType, mappings: [], unrecognized: [] };
  }

  // Converting to string/mixed is lossless at the model level.
  return { status: 'safe', targetType, mappings: [], unrecognized: [] };
}

function normalizeDate(value: CellValue): CellValue {
  const date = toDate(value);
  if (!date) return null;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hasTime = date.getHours() || date.getMinutes() || date.getSeconds();
  if (!hasTime) return `${yyyy}-${mm}-${dd}`;
  return `${yyyy}-${mm}-${dd}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

export function convertColumnValues(
  raw: RawDataset,
  schema: DatasetSchema,
  columnKey: string,
  targetType: DataType,
  mappings: BooleanMapping[] = []
): { raw: RawDataset; error?: string } {
  const column = schema.columns.find((c) => c.key === columnKey);
  if (!column) return { raw, error: 'Column not found.' };

  const evaluation = evaluateColumnTypeConversion(raw, schema, columnKey, targetType);
  if (evaluation.status === 'unsupported') {
    return { raw, error: evaluation.reason ?? `Cannot safely convert to ${targetType}.` };
  }
  if (evaluation.status === 'mapping-required' && targetType === 'boolean') {
    const provided = new Map(mappings.map((m) => [normalizedKey(m.source), m.target]));
    const unresolved = evaluation.mappings.filter((m) => !provided.has(normalizedKey(m.source)) || provided.get(normalizedKey(m.source)) === null);
    if (unresolved.length) return { raw, error: `Boolean mapping is incomplete for: ${unresolved.map((m) => m.source).join(', ')}` };
  }

  const booleanMap = new Map<string, boolean | null>(
    (mappings.length ? mappings : evaluation.mappings).map((m) => [normalizedKey(m.source), m.target])
  );

  try {
  const nextRows = raw.rows.map((row, rowIndex) => {
    const sourceIndex = rowIndex + 1;
    const isData = rowIndex >= schema.dataStartIndex && rowIndex < schema.dataEndIndex && !schema.structuralGroups.some((g) => g.sourceIndex === sourceIndex);
    if (!isData) return row;
    const next = [...row];
    const value = row[column.index] ?? null;
    if (value === null || String(value).trim() === '') return next;

    let converted: CellValue;
    if (targetType === 'boolean') {
      const mapped = booleanMap.get(normalizedKey(value));
      if (mapped === undefined || mapped === null) return row;
      converted = mapped;
    } else if (targetType === 'number') converted = toNumber(value);
    else if (targetType === 'date') converted = normalizeDate(value);
    else if (targetType === 'url') converted = String(value).trim();
    else if (targetType === 'string') converted = String(value);
    else converted = value;

    if (converted === null && value !== null && targetType !== 'string' && targetType !== 'mixed') {
      throw new Error(`Value "${String(value)}" could not be converted.`);
    }
    next[column.index] = converted;
    return next;
  });

  return { raw: { ...raw, rows: nextRows } };
  } catch (error) {
    return { raw, error: error instanceof Error ? error.message : 'Conversion failed. No data was changed.' };
  }
}
