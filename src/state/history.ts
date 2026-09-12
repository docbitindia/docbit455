export interface FileHistoryEntry {
  id: string;
  fileName: string;
  fileType: 'csv' | 'json' | 'xlsx' | 'xls' | 'unknown';
  fileSize: number;
  openedAt: string;
  status: 'opened' | 'edited' | 'exported' | 'reported';
}

const KEY = 'docbit_file_history_v3';
const LIMIT = 50;

function read(): FileHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function listFileHistory(): FileHistoryEntry[] { return read(); }

export function recordFileHistory(file: Pick<FileHistoryEntry, 'fileName'|'fileType'|'fileSize'>, status: FileHistoryEntry['status'] = 'opened') {
  if (typeof window === 'undefined') return;
  const now = new Date().toISOString();
  const id = `${file.fileName}:${file.fileSize}`;
  const next: FileHistoryEntry[] = [{ id, ...file, openedAt: now, status }, ...read().filter(x => x.id !== id)].slice(0, LIMIT);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* best effort */ }
}

export function clearFileHistory() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEY); localStorage.removeItem('docbit_file_history_v2'); } catch { /* ignore */ }
}
