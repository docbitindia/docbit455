import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, Clock3, FileText, Trash2, UploadCloud } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { usePageMeta } from '../hooks/usePageMeta';
import { PAGE_META } from '../seo/pageMeta';
import { clearFileHistory, listFileHistory, type FileHistoryEntry } from '../state/history';
import { formatFileSize } from '../utils/format';
import { navigate } from '../router/useRoute';
import { FileTypeIcon } from '../components/FileTypeIcon';

const statusConfig: Record<FileHistoryEntry['status'], { label: string; color: string }> = {
  opened: { label: 'Opened', color: 'bg-slate-100 text-slate-600' },
  edited: { label: 'Edited', color: 'bg-blue-50 text-blue-700' },
  exported: { label: 'Exported', color: 'bg-emerald-50 text-emerald-700' },
  reported: { label: 'Report', color: 'bg-amber-50 text-amber-700' },
};

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

export function HistoryPage() {
  usePageMeta(PAGE_META['/history']);
  const [items, setItems] = useState<FileHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<'all' | 'opened' | 'edited' | 'exported' | 'reported'>('all');

  useEffect(() => {
    setItems(listFileHistory());
    setLoaded(true);
  }, []);

  const filtered = useMemo(() => filter === 'all' ? items : items.filter(i => i.status === filter), [items, filter]);
  const counts = useMemo(() => ({
    all: items.length,
    edited: items.filter(i => i.status === 'edited').length,
    exported: items.filter(i => i.status === 'exported').length,
    reported: items.filter(i => i.status === 'reported').length,
  }), [items]);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-600">
              <Activity size={15} />
              <p className="text-xs font-semibold">Activity</p>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-.03em] text-slate-950">History</h1>
            <p className="mt-2 text-sm text-slate-500">A lightweight record of files and report activity in this browser.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/workspace')} className="btn-secondary">
              <UploadCloud size={15} /> Upload
            </button>
            {items.length > 0 && (
              <button className="btn-secondary text-rose-600 hover:bg-rose-50" onClick={() => { clearFileHistory(); setItems([]); }}>
                <Trash2 size={15} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        {loaded && items.length > 0 && (
          <div className="mt-5 flex gap-1.5">
            {([
              { key: 'all', label: 'All', count: counts.all },
              { key: 'edited', label: 'Edited', count: counts.edited },
              { key: 'exported', label: 'Exported', count: counts.exported },
              { key: 'reported', label: 'Reports', count: counts.reported },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filter === tab.key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                {tab.label} <span className="ml-1 opacity-60">{tab.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!loaded ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
              <p className="mt-3 text-xs text-slate-400">Loading history…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
                <Clock3 size={22} className="text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No activity yet</p>
              <p className="mt-1 text-xs text-slate-400">Open a file from Workspace to start building your activity trail.</p>
              <button onClick={() => navigate('/workspace')} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                Go to workspace <ArrowUpRight size={13} />
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate-500">No items match this filter.</p>
              <button onClick={() => setFilter('all')} className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700">Show all</button>
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px_140px] border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400 sm:grid">
                <span>File</span>
                <span>Type</span>
                <span>Activity</span>
                <span>Time</span>
              </div>
              <div className="divide-y divide-slate-50">
                {filtered.map(item => {
                  const badge = statusConfig[item.status];
                  const iconType = item.fileType === 'xlsx' || item.fileType === 'xls' ? 'excel' : item.fileType;
                  return (
                    <div key={item.id} className="grid gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/50 sm:grid-cols-[minmax(0,1fr)_120px_120px_140px] sm:items-center sm:px-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                          <FileTypeIcon type={iconType} size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{item.fileName}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">{formatFileSize(item.fileSize)}</p>
                        </div>
                      </div>
                      <span className="hidden text-[11px] font-medium uppercase text-slate-500 sm:block">{item.fileType}</span>
                      <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold ${badge.color}`}>{badge.label}</span>
                      <span className="text-[10px] text-slate-400" title={new Date(item.openedAt).toLocaleString()}>{timeAgo(item.openedAt)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <p className="mt-3 text-[10px] leading-5 text-slate-400">History is local to this browser. Source files are not stored in the cloud.</p>
      </div>
    </AppShell>
  );
}
