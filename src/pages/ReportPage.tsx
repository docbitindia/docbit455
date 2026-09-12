import React, { useMemo } from 'react';
import { FileOutput, UploadCloud, ArrowLeft } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ReportGeneratorModal } from '../components/ReportGeneratorModal';
import { useDocumentEditor } from '../hooks/useDocumentEditor';
import { getEditingSession, setPendingFile } from '../state/editorSession';
import { buildSchema } from '../engine/headerDetection';
import { navigate } from '../router/useRoute';
import { usePageMeta } from '../hooks/usePageMeta';
import { PAGE_META } from '../seo/pageMeta';

export function ReportPage() {
  usePageMeta(PAGE_META['/report'] ?? PAGE_META['/workspace']);
  const stored = useMemo(() => getEditingSession(), []);
  const editor = useDocumentEditor(stored ? { document: stored.document, baseline: stored.baseline } : {});
  const { raw, config, report, reportProcessing, update } = editor;


  const schema = useMemo(() => raw ? buildSchema(raw, config.headerRowIndex) : null, [raw, config.headerRowIndex]);

  if (!raw || !schema) {
    return <AppShell>
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-3xl items-center px-5 py-10 sm:px-8">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><FileOutput size={22}/></div>
          <p className="mt-6 text-[11px] font-bold uppercase tracking-[.16em] text-blue-600">DocBit Reports</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-slate-950">Generate a professional PDF report</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">Select a file to start a report, or return to Workspace and open a file first. Report generation is separate from normal Excel, CSV and JSON export.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()} className="btn-primary"><UploadCloud size={16}/>Choose Excel, CSV or JSON</button>
            <button type="button" onClick={() => navigate('/workspace')} className="btn-secondary"><ArrowLeft size={16}/>Back to Workspace</button>
          </div>
          <input className="hidden" type="file" accept=".csv,.json,.xlsx,.xls" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; setPendingFile(file); navigate('/analyzing'); }} />
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {['Excel (.xlsx / .xls)', 'CSV', 'JSON'].map((item) => <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-600">{item}</div>)}
          </div>
        </section>
      </div>
    </AppShell>;
  }

  return <AppShell>
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 px-4 py-5 sm:px-7 sm:py-7">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-blue-600">Report Studio</p><h1 className="mt-1 truncate text-xl font-semibold tracking-[-.025em] text-slate-950">{raw.meta.fileName}</h1><p className="mt-1 text-xs text-slate-500">Configure the report from the current prepared data view.</p></div>
          <button type="button" onClick={() => navigate('/workspace')} className="btn-secondary shrink-0"><ArrowLeft size={15}/>Workspace</button>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-blue-900"><b>{report.stats.finalRowCount.toLocaleString()}</b> rows · <b>{report.stats.selectedColumnCount}</b> columns · {reportProcessing ? 'Updating report preview…' : 'Preview is ready'}</div>
      </div>
    </div>
    <ReportGeneratorModal open onClose={() => navigate('/workspace')} raw={raw} schema={schema} report={report} config={config} update={update} />
  </AppShell>;
}
