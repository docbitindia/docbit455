import type { ProcessedReport } from '../types/processed';
import type { ExtractSettings } from '../types/report';
import { validateValue } from '../engine/validation';

export { exportCsv } from './csv';
export { exportJson } from './json';
export { exportExcel } from './excel';

export type ExportFormat = 'excel' | 'csv' | 'json';

export interface ExportValidation {
  ok: boolean;
  problems: string[];
}

/** Final consistency check before an export runs. Never silently exports. */
export function validateBeforeExport(report: ProcessedReport, _design: ExtractSettings): ExportValidation {
  const problems: string[] = [];

  if (report.columns.length === 0) {
    problems.push('No columns are selected. Choose at least one column before exporting.');
  }
  if (report.stats.finalRowCount === 0) {
    problems.push('No rows match the current filters. Adjust your filters or row selection.');
  }
  for (let r = 0; r < report.rows.length; r++) {
    const row = report.rows[r];
    report.columns.forEach((col, c) => {
      const error = validateValue(row.values[c], col.dataType);
      if (error) problems.push(`Row ${r + 1}, ${col.displayName}: ${error}`);
    });
    if (problems.length >= 10) return { ok: false, problems: [...problems, 'Additional validation errors omitted.'] };
  }
  if (report.groups) {
    const rowSum = report.groups.reduce((sum, g) => sum + g.rows.length, 0);
    if (rowSum !== report.stats.finalRowCount) {
      problems.push('Grouped row counts do not match the filtered dataset. Please reset and try again.');
    }
  }

  return { ok: problems.length === 0, problems };
}
