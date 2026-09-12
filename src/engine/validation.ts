import type { CellValue, DataType } from '../types/dataset';
import { toDate, toNumber } from '../utils/format';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateValue(value: CellValue, type: DataType): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (type === 'number' && toNumber(text) === null) return `Invalid number: ${text}`;
  if (type === 'date' && !toDate(text)) return `Invalid date: ${text}`;
  if (type === 'boolean') {
    const key = text.toLowerCase();
    if (!['true','false','yes','no','y','n','1','0','pass','fail','passed','failed','on','off'].includes(key)) return `Invalid Boolean: ${text}`;
  }
  if (type === 'url') {
    try { const url = new URL(text); if (!/^https?:$/i.test(url.protocol)) return `Invalid HTTP(S) URL: ${text}`; }
    catch { return `Invalid HTTP(S) URL: ${text}`; }
  }
  return null;
}

export function validateColumn(values: CellValue[], type: DataType): ValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const error = validateValue(value, type);
    if (error && !seen.has(error)) { seen.add(error); errors.push(`${error} at row ${index + 1}`); }
  });
  return { ok: errors.length === 0, errors, warnings: [] };
}
