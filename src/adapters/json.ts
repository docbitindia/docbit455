import type { CellValue, RawDataset } from '../types/dataset';
import { makeId } from '../utils/id';
import { normalizeRows } from './normalize';
import { AdapterError } from './errors';

const LARGE_FILE_THRESHOLD = 16 * 1024 * 1024;
const PREVIEW_ROWS = 100_000;

function finish(file: File, records: unknown[], totalRows: number, truncated: boolean): RawDataset {
  const aoa = jsonRecordsToRows(records);
  const { rows, columnCount } = normalizeRows(aoa);
  if (!rows.length) throw new AdapterError('This JSON file does not contain any usable records.');
  return { id:makeId('ds'), meta:{fileName:file.name,fileType:'json',fileSize:file.size,importedAt:new Date().toISOString(),isLargeFile:truncated,totalRows,previewRows:rows.length}, rows, columnCount, columnIds:Array.from({length:columnCount},(_,i)=>`col_${i}`) };
}

export async function parseJsonFile(file: File, onProgress?: (progress:number)=>void, signal?: AbortSignal): Promise<RawDataset> {
  if (file.size === 0) throw new AdapterError('This file is empty.');
  if (signal?.aborted) throw new AdapterError('Processing cancelled.');
  if (file.size <= LARGE_FILE_THRESHOLD) {
    const text = await file.text().catch(() => { throw new AdapterError("We couldn't read this file from disk. Please try again."); });
    if (!text.trim()) throw new AdapterError('This file is empty.');
    let parsed: unknown; try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new AdapterError('This JSON file is not valid. Please check the file structure and try again.'); }
    const records = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? (() => { const values=Object.values(parsed as Record<string,unknown>); const arr=values.find(Array.isArray); return Array.isArray(arr)?arr:[parsed]; })() : [];
    if (!records.length) throw new AdapterError('This JSON file does not contain a list of records that can be edited.');
    return finish(file, records, records.length, false);
  }
  return new Promise((resolve,reject)=>{
    if (signal?.aborted) { reject(new AdapterError('Processing cancelled.')); return; }
    const worker = new Worker(new URL('../workers/jsonPreview.worker.ts', import.meta.url), {type:'module'});
    const abort = () => { worker.terminate(); reject(new AdapterError('Processing cancelled.')); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event:MessageEvent<any>) => { if(event.data?.type==='progress'){ onProgress?.(event.data.progress); return; } if(event.data?.type==='error'){signal?.removeEventListener('abort',abort);worker.terminate();reject(new AdapterError(event.data.message));} else if(event.data?.type==='complete'){signal?.removeEventListener('abort',abort);worker.terminate();try{resolve(finish(file,event.data.result.rows,event.data.result.totalRows,event.data.result.truncated));}catch(e){reject(e);}} };
    worker.onerror=()=>{signal?.removeEventListener('abort',abort);worker.terminate();reject(new AdapterError('The JSON parser stopped unexpectedly. Please try the file again.'));};
    worker.postMessage({file,maxRows:PREVIEW_ROWS});
  });
}

function jsonRecordsToRows(records: unknown[]): CellValue[][] {
  const objectRecords = records.filter((record): record is Record<string, unknown> => !!record && typeof record === 'object' && !Array.isArray(record));
  if (objectRecords.length === records.length) {
    const keys: string[] = []; const seen = new Set<string>();
    for (const record of objectRecords) for (const key of Object.keys(record)) if (!seen.has(key)) { seen.add(key); keys.push(key); }
    return [keys, ...objectRecords.map(record => keys.map(key => toCellValue(record[key])))];
  }
  return [['value'], ...records.map(value => [toCellValue(value)])];
}
function toCellValue(value: unknown): CellValue { if(value===null||value===undefined)return null; if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value; return JSON.stringify(value); }
