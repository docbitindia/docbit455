import type { RawDataset } from '../types/dataset';
import { makeId } from '../utils/id';
import { AdapterError } from './errors';

export async function parseExcelFile(
  file: File,
  preferredSheet?: string,
  onProgress?: (progress:number)=>void,
  signal?: AbortSignal
): Promise<RawDataset> {
  if (file.size === 0) throw new AdapterError('This file is empty.');
  if (file.size > 200 * 1024 * 1024) {
    throw new AdapterError('This Excel workbook is too large for safe browser processing. Convert it to CSV for incremental large-file processing, or use a server-side workbook processor.');
  }
  return new Promise((resolve,reject)=>{
    if (signal?.aborted) { reject(new AdapterError('Processing cancelled.')); return; }
    const worker = new Worker(new URL('../workers/excelPreview.worker.ts', import.meta.url), { type:'module' });
    const abort=()=>{worker.terminate();reject(new AdapterError('Processing cancelled.'));};
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=(event:MessageEvent<any>)=>{
      const d=event.data;
      if(d?.type==='progress'){onProgress?.(d.progress);return;}
      signal?.removeEventListener('abort',abort);
      if(d?.type==='error'){worker.terminate();reject(new AdapterError(d.message));return;}
      if(d?.type==='complete'){
        worker.terminate();
        resolve({
          id:makeId('ds'),
          meta:{fileName:file.name,fileType:file.name.toLowerCase().endsWith('.xls')&&!file.name.toLowerCase().endsWith('.xlsm')?'xls':'xlsx',fileSize:file.size,sheetName:d.result.sheetName,sheetNames:d.result.sheetNames,importedAt:new Date().toISOString()},
          rows:d.result.rows,columnCount:d.result.columnCount,
          columnIds:Array.from({length:d.result.columnCount},(_,i)=>`col_${i}`)
        });
      }
    };
    worker.onerror=()=>{signal?.removeEventListener('abort',abort);worker.terminate();reject(new AdapterError('The Excel parser stopped unexpectedly. Please try the file again.'));};
    worker.postMessage({file,preferredSheet});
  });
}
