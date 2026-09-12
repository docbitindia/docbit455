import type { ProcessedReport } from '../types/processed';
import type { ExtractSettings } from '../types/report';
import { downloadBlob, safeFileName } from './download';

// Plain, structured data — no report metadata, no branding, just the
// extracted records exactly as configured.
export function buildJsonPayload(report: ProcessedReport, design: ExtractSettings): unknown {
  const rowsToObjects = (rows: typeof report.rows) =>
    rows.map((row) => {
      const obj: Record<string, unknown> = {};
      report.columns.forEach((col, i) => {
        obj[col.displayName] = row.values[i];
      });
      return obj;
    });

  const payload: Record<string, unknown> = {
    columns: report.columns.map((c) => c.displayName),
    recordCount: report.stats.finalRowCount
  };

  if (report.groups) {
    payload.groups = report.groups.map((g) => ({
      group: g.label,
      count: g.rows.length,
      summaries: Object.fromEntries(g.summaries.map((s) => [s.label, s.value])),
      records: rowsToObjects(g.rows)
    }));
  } else {
    payload.records = rowsToObjects(report.rows);
  }

  if (design.showSummary && report.summaries.length > 0) {
    payload.summaries = Object.fromEntries(report.summaries.map((s) => [s.label, s.value]));
  }

  return payload;
}

export function exportJson(report: ProcessedReport, design: ExtractSettings): void {
  const payload = buildJsonPayload(report, design);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, safeFileName(design.fileName, 'json'));
}
