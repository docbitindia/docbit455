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
  const [stageLabel, setStageLabel] = useState('Reading file');
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef(0);

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
    startTimeRef.current = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 100);

    const run = async () => {
      try {
        setStageLabel('Reading file');
        const dataset = await parseFile(pending, { onProgress: (value) => setProgress(value), signal: controller.signal });
        if (controller.signal.aborted) throw new AdapterError('Processing cancelled.');
        setProgress(100);
        setStep(1);
        setStageLabel('Detecting structure');
        const headerRowIndex = guessHeaderRow(dataset.rows);
        setStep(2);
        setStageLabel('Analyzing columns');
        const builtSchema = buildSchema(dataset, headerRowIndex);
        setStep(3);
        setStageLabel('Checking data quality');
        setStep(4);
        setStageLabel('Preparing editor');
        const config = createDefaultConfig(builtSchema, dataset.meta.fileName);
        session.replaceAll({ raw: dataset, config });
        setSchema(builtSchema);
        recordFileHistory({ fileName: pending.name, fileSize: pending.size, fileType: dataset.meta.fileType }, 'opened');
        setStage('summary');
        clearInterval(timer);
      } catch (err) {
        clearInterval(timer);
        if (controller.signal.aborted) return;
        const message = err instanceof AdapterError ? err.message : "We couldn't read this file. It may be corrupted or unsupported.";
        setError(message);
        setStage('error');
        toast.push(message, 'error');
      }
    };
    void run();
    return () => clearInterval(timer);
  }, [started, session.replaceAll, toast]);

  const continueToEditing = () => {
    if (!schema || !file || preparingEditor) return;
    setPreparingEditor(true);
    setEditingSession(session.state, session.state, file);
    const base = file.name.replace(/\.[^.]+$/, '').trim() || 'untitled';
    requestAnimationFrame(() => requestAnimationFrame(() => navigate(`/editing/${encodeURIComponent(base)}`)));
  };

  if (stage === 'error') {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-5">
          <div className="w-full rounded-2xl border border-rose-200 bg-white p-6 shadow-lg">
            <h1 className="text-lg font-semibold text-slate-900">Unable to analyze file</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => navigate('/workspace')} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Back to workspace</button>
              <button type="button" onClick={() => { setStage('loading'); setError(null); setStarted(false); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Try again</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {preparingEditor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-5 backdrop-blur-sm animate-fade-in" role="status" aria-live="polite">
          <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/95 p-7 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-600" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">Finalizing workspace</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Preparing your editor…</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Your data is ready. Setting up the editing surface now.</p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-2/3 animate-[db-progress_0.9s_ease-in-out_infinite] rounded-full bg-blue-600" />
            </div>
          </div>
        </div>
      )}

      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <button type="button" onClick={() => navigate('/workspace')} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <ArrowLeft size={16} /> Back
        </button>
        <button type="button" onClick={() => { abortRef.current?.abort(); navigate('/workspace'); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RotateCcw size={15} /> Replace file
        </button>
      </header>

      <main className="px-5 py-12 sm:px-8 sm:py-16">
        {stage === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-6">
            <AnalysisSequence fileName={fileName} activeIndex={step} />
            <div className="w-full max-w-md">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-blue-600 transition-[width] duration-200" style={{ width: `${Math.max(2, progress)}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>{stageLabel}</span>
                <span>{progress}% · {(elapsed / 1000).toFixed(1)}s</span>
              </div>
              <button type="button" onClick={() => { abortRef.current?.abort(); navigate('/workspace'); }} className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Cancel processing
              </button>
            </div>
          </div>
        )}
        {stage === 'summary' && schema && (
          <div className="flex justify-center">
            <DatasetSummary raw={session.state.raw} schema={schema} onContinue={continueToEditing} />
          </div>
        )}
      </main>
    </div>
  );
}
