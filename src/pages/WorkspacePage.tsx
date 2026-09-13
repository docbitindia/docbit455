import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Clock3, FileOutput, History, Plus, Sparkles, UploadCloud, FileSpreadsheet, Zap, ShieldCheck, FileText } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Dropzone } from '../components/Dropzone';
import { FileTypeIcon, fileTypeFromName } from '../components/FileTypeIcon';
import { navigate } from '../router/useRoute';
import { setPendingFile, getEditingSession } from '../state/editorSession';
import { listFileHistory, recordFileHistory, type FileHistoryEntry } from '../state/history';
import { usePageMeta } from '../hooks/usePageMeta';
import { PAGE_META } from '../seo/pageMeta';
import { useAuth } from '../context/AuthContext';
import { formatFileSize } from '../utils/format';

const MAX_TECHNICAL_FILE_SIZE = 1024 * 1024 * 1024;

const statusBadge: Record<FileHistoryEntry['status'], { label: string; color: string }> = {
  opened: { label: 'Opened', color: 'bg-slate-100 text-slate-600' },
  edited: { label: 'Edited', color: 'bg-blue-50 text-blue-700' },
  exported: { label: 'Exported', color: 'bg-emerald-50 text-emerald-700' },
  reported: { label: 'Report', color: 'bg-amber-50 text-amber-700' },
};

export function WorkspacePage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<FileHistoryEntry[]>([]);
  const [hasSession, setHasSession] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  usePageMeta(PAGE_META['/workspace']);

  useEffect(() => {
    setHistory(listFileHistory());
    setHasSession(Boolean(getEditingSession()));
  }, []);

  const recent = useMemo(() => history.slice(0, 8), [history]);

  const openFile = useCallback((file: File) => {
    if (!user) { navigate('/auth/login'); return; }
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['csv', 'json', 'xlsx', 'xls'].includes(ext || '')) return;
    recordFileHistory({ fileName: file.name, fileSize: file.size, fileType: ext as FileHistoryEntry['fileType'] });
    setPendingFile(file);
    navigate(`/analyzing/${encodeURIComponent(file.name.replace(/\.[^.]+$/, ''))}`);
  }, [user]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) openFile(file);
  }, [openFile]);

  const firstName = user?.displayName?.split(' ')[0] || 'there';

  return (
    <AppShell>
      <div
        className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-7"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={handleDrop}
      >
        {/* Welcome header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-.03em] text-slate-950 sm:text-[28px]">Welcome back, {firstName}</h1>
            <p className="mt-1 text-sm text-slate-500">Import data, transform it, and export or generate a report — all in your browser.</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <button onClick={() => navigate('/history')} className="btn-secondary" title="View activity history">
              <History size={15} /> History
            </button>
            <button onClick={() => navigate('/report')} className="btn-secondary" title="Generate a PDF report">
              <FileOutput size={15} /> Report
            </button>
          </div>
        </div>

        {/* Primary upload + quick actions */}
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          {/* Upload card */}
          <div className={`rounded-2xl border bg-white p-5 shadow-sm transition-all sm:p-6 ${dragOver ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <UploadCloud size={17} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Upload / Import Data</h2>
                <p className="text-[11px] text-slate-400">Drag and drop or click to browse</p>
              </div>
            </div>
            <Dropzone onFile={openFile} maxFileSize={MAX_TECHNICAL_FILE_SIZE} />
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <FormatChip type="excel" label="Excel .xlsx / .xls" />
              <FormatChip type="csv" label="CSV" />
              <FormatChip type="json" label="JSON" />
              <span className="ml-1 hidden h-4 w-px bg-slate-200 sm:block" />
              <span className="inline-flex items-center gap-1"><ShieldCheck size={12} className="text-emerald-600" /> Files processed locally</span>
            </div>
          </div>

          {/* Quick actions sidebar */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-transform group-hover:scale-105">
                <Plus size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">New file</p>
                <p className="text-[11px] text-slate-400">Upload and start editing</p>
              </div>
              <ArrowUpRight size={16} className="text-slate-300 group-hover:text-blue-500" />
            </button>

            <button
              onClick={() => navigate('/report')}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-transform group-hover:scale-105">
                <FileOutput size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Generate report</p>
                <p className="text-[11px] text-slate-400">{hasSession ? 'Resume from editor session' : 'Upload a file first'}</p>
              </div>
              <ArrowUpRight size={16} className="text-slate-300 group-hover:text-blue-500" />
            </button>

            <button
              onClick={() => navigate('/history')}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600 transition-transform group-hover:scale-105">
                <History size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">History</p>
                <p className="text-[11px] text-slate-400">{history.length} file{history.length === 1 ? '' : 's'} opened</p>
              </div>
              <ArrowUpRight size={16} className="text-slate-300 group-hover:text-blue-500" />
            </button>

            {hasSession && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3.5 text-xs leading-5 text-blue-800">
                <b className="text-blue-900">Editor session active.</b> Your current browser session can be resumed from the editor.
              </div>
            )}
          </div>
        </div>

        {/* Recent files + workflow */}
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
          {/* Recent files */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Clock3 size={15} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">Recent files</h2>
              </div>
              {recent.length > 0 && (
                <button onClick={() => navigate('/history')} className="text-xs font-semibold text-blue-600 hover:text-blue-700">View all</button>
              )}
            </div>
            {recent.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
                  <FileSpreadsheet size={22} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-600">Your recent files will appear here</p>
                <p className="mt-1 text-xs text-slate-400">Upload a file to get started</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recent.map(item => {
                  const badge = statusBadge[item.status];
                  const iconType = item.fileType === 'xlsx' || item.fileType === 'xls' ? 'excel' : item.fileType;
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50/60">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                        <FileTypeIcon type={iconType} size={20} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-800">{item.fileName}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {item.fileType.toUpperCase()} · {formatFileSize(item.fileSize)} · {timeAgo(item.openedAt)}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badge.color}`}>{badge.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Workflow steps */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">How it works</h2>
            </div>
            <ol className="mt-4 space-y-3.5">
              {[
                { icon: UploadCloud, text: 'Upload your source file' },
                { icon: FileSpreadsheet, text: 'Analyze structure and quality' },
                { icon: Sparkles, text: 'Edit, filter, sort or transform' },
                { icon: FileOutput, text: 'Export data or generate a report' },
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                    <step.icon size={14} />
                  </span>
                  <div className="pt-0.5">
                    <span className="text-[10px] font-bold text-slate-300">Step {i + 1}</span>
                    <p className="text-xs leading-5 text-slate-600">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function FormatChip({ type, label }: { type: 'excel' | 'csv' | 'json'; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
      <FileTypeIcon type={type} size={14} />
      {label}
    </span>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
