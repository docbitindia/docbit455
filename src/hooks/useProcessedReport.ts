import { useEffect, useMemo, useRef, useState } from 'react';
import type { RawDataset } from '../types/dataset';
import type { ReportConfig } from '../types/report';
import type { ProcessedReport } from '../types/processed';
import { emptyReport, processReport } from '../engine/pipeline';

const HEAVY_ROW_THRESHOLD = 20000;

export function useProcessedReport(raw: RawDataset, config: ReportConfig): { report: ProcessedReport; processing: boolean } {
  const heavy = Boolean(raw.meta.isLargeFile || raw.rows.length > HEAVY_ROW_THRESHOLD);
  const syncReport = useMemo(() => heavy ? null : processReport(raw, config), [heavy, raw, config]);
  const [asyncReport, setAsyncReport] = useState<ProcessedReport | null>(null);
  const [processing, setProcessing] = useState(false);
  const previousRef = useRef<ProcessedReport | null>(null);

  useEffect(() => {
    if (!heavy) {
      previousRef.current = syncReport;
      setAsyncReport(null);
      setProcessing(false);
      return;
    }
    let alive = true;
    setProcessing(true);
    const worker = new Worker(new URL('../workers/report.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<any>) => {
      if (!alive) return;
      if (event.data?.type === 'complete') {
        previousRef.current = event.data.report;
        setAsyncReport(event.data.report);
        setProcessing(false);
      } else if (event.data?.type === 'error') {
        setProcessing(false);
      }
      worker.terminate();
    };
    worker.onerror = () => { if (alive) setProcessing(false); worker.terminate(); };
    worker.postMessage({ raw, config, revision: config.revision ?? 0 });
    return () => { alive = false; worker.terminate(); };
  }, [heavy, raw, config, syncReport]);

  if (!heavy) return { report: syncReport ?? emptyReport(), processing: false };
  return { report: asyncReport ?? previousRef.current ?? emptyReport(), processing };
}
