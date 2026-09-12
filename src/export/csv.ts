import type { ProcessedReport } from '../types/processed';
import type { ExtractSettings } from '../types/report';
import { displayCell } from '../utils/format';
import { downloadBlob, safeFileName } from './download';

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsvString(report: ProcessedReport, design: ExtractSettings): string {
  const lines: string[] = [];
  const header = report.columns.map((c) => escapeCsvValue(c.displayName)).join(',');
  lines.push(header);

  const emitRow = (values: (string | number | boolean | null)[], columns: typeof report.columns) => {
    const line = values
      .map((v, i) => escapeCsvValue(displayCell(v, columns[i].dataType, columns[i].settings)))
      .join(',');
    lines.push(line);
  };

  if (report.groups) {
    for (const group of report.groups) {
      lines.push(escapeCsvValue(`${group.label} (${group.rows.length} records)`));
      for (const row of group.rows) emitRow(row.values, report.columns);
      if (design.showSummary && group.summaries.length) {
        lines.push(group.summaries.map((s) => escapeCsvValue(`${s.label}: ${s.displayValue}`)).join(','));
      }
    }
  } else {
    for (const row of report.rows) emitRow(row.values, report.columns);
  }

  if (design.showSummary && report.summaries.length > 0) {
    lines.push('');
    for (const s of report.summaries) {
      lines.push(`${escapeCsvValue(s.label)},${escapeCsvValue(s.displayValue)}`);
    }
  }

  return lines.join('\r\n');
}

export function exportCsv(report: ProcessedReport, design: ExtractSettings): void {
  const csv = buildCsvString(report, design);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, safeFileName(design.fileName, 'csv'));
}
