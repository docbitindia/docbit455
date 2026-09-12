import Papa from 'papaparse';
import type { RawDataset } from '../types/dataset';
import { makeId } from '../utils/id';
import { normalizeRows } from './normalize';
import { AdapterError } from './errors';

const LARGE_FILE_THRESHOLD = 16 * 1024 * 1024;
const PREVIEW_ROWS = 100_000;

function finish(file: File, data: unknown[][], totalRows = data.length, truncated = false): RawDataset {
  const { rows, columnCount } = normalizeRows(data.filter(Array.isArray) as any);
  if (!rows.length) throw new AdapterError('This CSV file does not contain any usable rows.');
  return { id: makeId('ds'), meta: { fileName:file.name, fileType:'csv', fileSize:file.size, importedAt:new Date().toISOString(), isLargeFile:truncated, totalRows, previewRows:rows.length }, rows, columnCount, columnIds:Array.from({length:columnCount},(_,i)=>`col_${i}`) };
}

export async function parseCsvFile(file: File, onProgress?: (progress:number)=>void, signal?: AbortSignal): Promise<RawDataset> {
  if (file.size === 0) throw new AdapterError('This file is empty.');
  if (signal?.aborted) throw new AdapterError('Processing cancelled.');
  if (file.size <= LARGE_FILE_THRESHOLD) {
    const text = await file.text().catch(() => { throw new AdapterError("We couldn't read this file from disk. Please try again."); });
    if (!text.trim()) throw new AdapterError('This file is empty.');
    const result = Papa.parse<string[]>(text, { header:false, dynamicTyping:true, skipEmptyLines:false, delimiter:'' });
    const fatal = result.errors?.filter(e => e.type === 'Delimiter' || e.type === 'Quotes') || [];
    if (fatal.length && result.data.length === 0) throw new AdapterError('This CSV file appears to be malformed and could not be read.');
    return finish(file, result.data as unknown[][]);
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new AdapterError('Processing cancelled.')); return; }
    const worker = new Worker(new URL('../workers/csvPreview.worker.ts', import.meta.url), { type:'module' });
    const abort = () => { worker.terminate(); reject(new AdapterError('Processing cancelled.')); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<any>) => {
      if (event.data?.type === 'progress') { onProgress?.(event.data.progress); return; }
      if (event.data?.type === 'error') { signal?.removeEventListener('abort', abort); worker.terminate(); reject(new AdapterError(event.data.message)); return; }
      if (event.data?.type === 'complete') { signal?.removeEventListener('abort', abort); worker.terminate(); try { resolve(finish(file, event.data.result.rows, event.data.result.totalRows, event.data.result.truncated)); } catch (e) { reject(e); } }
    };
    worker.onerror = () => { signal?.removeEventListener('abort', abort); worker.terminate(); reject(new AdapterError('The CSV parser stopped unexpectedly. Please try the file again.')); };
    worker.postMessage({ file, maxRows: PREVIEW_ROWS });
  });
}
