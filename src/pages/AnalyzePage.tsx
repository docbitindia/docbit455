import React, { useEffect, useRef, useState } from 'react';
import { parseFile, AdapterError } from '../adapters';
import { guessHeaderRow, buildSchema } from '../engine/headerDetection';
import { createDefaultConfig } from '../engine/config';
import { AnalysisSequence } from '../components/AnalysisSequence';
import { DatasetSummary } from '../components/DatasetSummary';
import { useToast } from '../hooks/useToast';
import { usePageMeta } from '../hooks/usePageMeta';
import { PAGE_META } from '../seo/pageMeta';
import { navigate } from '../router/useRoute';
import { useHistory } from '../hooks/useReportHistory';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import type { DocumentState } from '../types/document';
import { setEditingSession, takePendingFile, clearEditingSession } from '../state/editorSession';
import { recordFileHistory } from '../state/history';

const EMPTY: DocumentState = {
  raw: { id: 'empty', meta: { fileName: '', fileType: 'csv', fileSize: 0, importedAt: '' }, rows: [], columnCount: 0 },
  config: { revision: 0, headerRowIndex: 0, excludedRanges: [], columns: [], filterGroup: { id: 'fg', logic: 'AND', conditions: [] }, sorts: [], group: { columnKey: null, aggregates: [] }, calculations: [], design: { fileName: 'extracted_data', showSummary: true, density: 'comfortable', branding: { logoUrl: 'https://res.cloudinary.com/dlesei0kn/image/upload/v1787478477/file_000000005a44820885c9d29411b18ee4_rsbyqc.png', title: 'DocBit Data Report', subtitle: 'Prepared data overview', phone: '', email: '', link: '', theme: '#2563EB', bottomText: 'Generated with DocBit', iconUrls: ['/file-icons/excel.svg', '/file-icons/csv.svg', '/file-icons/json.svg'] } } }
};

export function AnalyzePage() {
  usePageMeta(PAGE_META['/analyzing']);
  const toast = useToast();
  const session = useHistory<DocumentState>(EMPTY);
  const [fileName, setFileName] = useState('');
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<'loading' | 'summary' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [schema, setSchema] = useState<ReturnType<typeof buildSchema> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [started, setStarted] = useState(false);
  const [preparingEditor, setPreparingEditor] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageLabel, setStageLabel] = useState('Preparing file');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (started) return;
    setStarted(true);
    clearEditingSession();
    const pending = takePendingFile();
    if (!pending) {
      navigate('/');
      return;
    }
    setFile(pending);
    setFileName(pending.name);
    const controller = new AbortController();
    abortRef.current = controller;
    const run = async () => {
      const tick = (n: number) => new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(() => { setStep(n); resolve(); }, 100)));
      try {
        await tick(0);
        setStageLabel('Reading file');
        const dataset = await parseFile(pending, { onProgress: (value) => setProgress(value), signal: controller.signal });
        if (controller.signal.aborted) throw new AdapterError('Processing cancelled.');
        setProgress(100);
        await tick(1);
        setStageLabel('Detecting structure');
        const headerRowIndex = guessHeaderRow(dataset.rows);
        await tick(2);
        setStageLabel('Analyzing columns');
        const builtSchema = buildSchema(dataset, headerRowIndex);
        await tick(3);
        setStageLabel('Checking data quality');
        await tick(4);
        setStageLabel('Preparing editor');
        await tick(5);
        const config = createDefaultConfig(builtSchema, dataset.meta.fileName);
        session.replaceAll({ raw: dataset, config });
        setSchema(builtSchema);
        recordFileHistory({ fileName: pending.name, fileSize: pending.size, fileType: dataset.meta.fileType }, 'opened');
        setStage('summary');
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof AdapterError ? err.message : "We couldn't read this file. It may be corrupted or unsupported.";
        setError(message);
        setStage('error');
        toast.push(message, 'error');
      }
    };
    void run();
  }, [started, session.replaceAll, toast]);

  const continueToEditing = () => {
    if (!schema || !file || preparingEditor) return;
    setPreparingEditor(true);
    // Persist immediately, then yield twice so the preparation overlay paints
    // before the editor mounts. No arbitrary timeout is used.
    setEditingSession(session.state, session.state, file);
    const base = file.name.replace(/\.[^.]+$/, '').trim() || 'untitled';
    requestAnimationFrame(() => requestAnimationFrame(() => navigate(`/editing/${encodeURIComponent(base)}`)));
  };

  if (stage === 'error') {
    return <div className="min-h-screen bg-paper-50"><div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-5"><div className="w-full rounded-2xl border border-rose-200 bg-white p-6 shadow-panel"><h1 className="text-lg font-semibold text-ink-900">Unable to analyze file</h1><p className="mt-2 text-sm text-ink-600/70">{error}</p><button type="button" onClick={() => navigate('/')} className="mt-5 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white">Start over</button></div></div></div>;
  }

  return <div className="min-h-screen bg-paper-50">
    {preparingEditor && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-5 backdrop-blur-sm animate-fade-in" role="status" aria-live="polite">
        <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/95 p-7 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-600" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">Finalizing workspace</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Preparing your editor…</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Your data is ready. We’re setting up the editing surface and keeping the transition smooth.</p>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/3 animate-[db-progress_0.9s_ease-in-out_infinite] rounded-full bg-blue-600" /></div>
        </div>
      </div>
    )}
    <header className="flex items-center justify-between border-b border-[#e1e4df] bg-white px-3 py-2.5 sm:px-5">
      <button type="button" onClick={() => navigate('/')} className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-700 hover:bg-white"><ArrowLeft size={16}/> Back</button>
      <button type="button" onClick={() => { abortRef.current?.abort(); navigate('/'); }} className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-700 hover:bg-white"><RotateCcw size={15}/> Replace</button>
    </header>
    <main className="px-5 py-14 sm:px-8 sm:py-20">
    {stage === 'loading' && <div className="flex flex-col items-center justify-center gap-4"><AnalysisSequence fileName={fileName} activeIndex={step} /><div className="w-full max-w-md"><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600 transition-[width] duration-200" style={{width:`${Math.max(2,progress)}%`}}/></div><div className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>{stageLabel}</span><span>{progress}%</span></div><button type="button" onClick={() => { abortRef.current?.abort(); navigate('/'); }} className="focus-ring mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel processing</button></div></div>}
    {stage === 'summary' && schema && <div className="flex justify-center"><DatasetSummary raw={session.state.raw} schema={schema} onContinue={continueToEditing} /></div>}
  </main></div>;
}
