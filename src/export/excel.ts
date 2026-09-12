import * as XLSX from 'xlsx';
import type { ProcessedReport } from '../types/processed';
import type { ExtractSettings } from '../types/report';
import { displayCell } from '../utils/format';
import { downloadBlob, safeFileName } from './download';

// Data export stays focused on the dataset; visual report generation is separate.
export function exportExcel(report: ProcessedReport, design: ExtractSettings): void {
  const aoa: (string | number | boolean | null)[][] = [];

  aoa.push(report.columns.map((c) => c.displayName));

  const pushRow = (values: (string | number | boolean | null)[]) => {
    aoa.push(
      report.columns.map((col, i) => {
        const raw = values[i];
        if (col.dataType === 'number') {
          const numeric = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/,/g, ''));
          if (Number.isFinite(numeric)) return col.settings.percentageEnabled ? numeric / 100 : numeric;
        }
        if (col.dataType === 'date' && raw != null) {
          const parsed = new Date(String(raw));
          if (!Number.isNaN(parsed.getTime())) return parsed as unknown as string;
        }
        if (col.dataType === 'boolean' && typeof raw === 'boolean') return raw;
        return displayCell(raw, col.dataType, col.settings) || null;
      })
    );
  };

  if (report.groups) {
    for (const group of report.groups) {
      aoa.push([`${group.label} (${group.rows.length} records)`]);
      for (const row of group.rows) pushRow(row.values);
      if (design.showSummary) for (const s of group.summaries) aoa.push([s.label, s.displayValue]);
      aoa.push([]);
    }
  } else {
    for (const row of report.rows) pushRow(row.values);
  }

  if (design.showSummary && report.summaries.length > 0) {
    aoa.push([]);
    for (const s of report.summaries) aoa.push([s.label, s.displayValue]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  report.columns.forEach((col, colIndex) => {
    const maxRows = aoa.length;
    for (let rowIndex = 1; rowIndex < maxRows; rowIndex++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
      if (!cell) continue;
      if (col.dataType === 'number') {
        const decimals = Math.max(0, Math.min(10, col.settings.decimalPlaces));
        const base = `${col.settings.thousandsSeparator ? '#,##0' : '0'}${decimals ? '.' + '0'.repeat(decimals) : ''}`;
        const currency = col.settings.currencyEnabled ? `${col.settings.currencySymbol}${base}` : base;
        cell.z = col.settings.percentageEnabled ? `${currency}%` : currency;
      } else if (col.dataType === 'date') {
        cell.z = col.settings.dateFormat === 'DD/MM/YYYY' ? 'dd/mm/yyyy'
          : col.settings.dateFormat === 'MM/DD/YYYY' ? 'mm/dd/yyyy'
          : col.settings.dateFormat === 'YYYY-MM-DD' ? 'yyyy-mm-dd'
          : col.settings.dateFormat === 'DD-MM-YYYY' ? 'dd-mm-yyyy'
          : col.settings.dateFormat === 'MM-DD-YYYY' ? 'mm-dd-yyyy'
          : col.settings.dateFormat === 'DD MMM YYYY, HH:mm' ? 'dd mmm yyyy, hh:mm'
          : 'dd mmm yyyy';
      }
    }
  });
  worksheet['!cols'] = report.columns.map((c) => ({ wch: Math.max(12, Math.min(40, c.displayName.length + 6)) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
  downloadBlob(blob, safeFileName(design.fileName, 'xlsx'));
}
