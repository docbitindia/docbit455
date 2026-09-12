import type { RawDataset } from './dataset';
import type { ReportConfig } from './report';

/** The sole editable document state. UI-only state (search, zoom, popovers) is intentionally excluded. */
export interface DocumentState {
  raw: RawDataset;
  config: ReportConfig;
}
