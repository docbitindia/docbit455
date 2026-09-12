import { processReport } from '../engine/pipeline';
import type { RawDataset } from '../types/dataset';
import type { ReportConfig } from '../types/report';

self.onmessage = (event: MessageEvent<{ raw: RawDataset; config: ReportConfig; revision: number }>) => {
  const { raw, config, revision } = event.data;
  try {
    const report = processReport(raw, config);
    self.postMessage({ type: 'complete', revision, report });
  } catch (error) {
    self.postMessage({ type: 'error', revision, message: error instanceof Error ? error.message : 'The data view could not be prepared.' });
  }
};
