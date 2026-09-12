import type { RawDataset } from '../types/dataset';
import { parseExcelFile } from './excel';
import { parseCsvFile } from './csv';
import { parseJsonFile } from './json';
import { AdapterError } from './errors';
export { AdapterError };

export async function parseFile(file: File, options?: { sheetName?: string; onProgress?: (progress:number)=>void; signal?: AbortSignal }): Promise<RawDataset> {
  if (!file || file.size === 0) throw new AdapterError('This file is empty.');
  const name = file.name.toLowerCase();
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';
  if (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm') return parseExcelFile(file, options?.sheetName, options?.onProgress, options?.signal);
  if (ext === '.csv') return parseCsvFile(file, options?.onProgress, options?.signal);
  if (ext === '.json') return parseJsonFile(file, options?.onProgress, options?.signal);
  throw new AdapterError('Unsupported file type. DocBit supports Excel (.xlsx, .xls), CSV (.csv), and JSON (.json).');
}
