import type { CellValue, ColumnSchema, DataQualityIssue } from '../types/dataset';
import { makeId } from '../utils/id';

const MAX_SCAN = 20000;

export function detectAdditionalIssues(
  dataRows: CellValue[][],
  columns: ColumnSchema[],
  expectedColumnCount: number
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const scanLimit = Math.min(dataRows.length, MAX_SCAN);

  let inconsistentRowCount = 0;
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (let i = 0; i < scanLimit; i++) {
    const row = dataRows[i];
    if (row.length !== expectedColumnCount) inconsistentRowCount += 1;
    const sig = row.map((c) => (c === null || c === undefined ? '' : String(c))).join('\u0001');
    if (sig.trim().length > 0) {
      if (seen.has(sig)) duplicateCount += 1;
      else seen.add(sig);
    }
  }

  if (inconsistentRowCount > 0) {
    issues.push({
      id: makeId('q'),
      severity: 'warning',
      message: `${inconsistentRowCount} row${inconsistentRowCount > 1 ? 's have' : ' has'} a different number of values than the header row.`
    });
  }

  if (duplicateCount > 0) {
    issues.push({
      id: makeId('q'),
      severity: 'info',
      message: `${duplicateCount} row${duplicateCount > 1 ? 's appear' : ' appears'} to be an exact duplicate of another row.`
    });
  }

  for (const col of columns) {
    if (col.sampledCount > 0 && col.emptyCount === col.sampledCount) {
      issues.push({
        id: makeId('q'),
        severity: 'info',
        message: `"${col.originalName}" has no values in the sampled rows.`,
        columnKey: col.key
      });
    } else if (col.dataType === 'mixed') {
      issues.push({
        id: makeId('q'),
        severity: 'warning',
        message: `"${col.originalName}" contains mixed data types — some values may not sort or calculate as expected.`,
        columnKey: col.key
      });
    }
  }

  return issues;
}


export interface DataProfile {
  rowCount: number;
  columnCount: number;
  duplicateRowCount: number;
  emptyCellCount: number;
  nonEmptyCellCount: number;
  completenessPercent: number;
}

export function profileData(dataRows: CellValue[][], columnCount: number): DataProfile {
  let emptyCellCount = 0;
  let nonEmptyCellCount = 0;
  const signatures = new Set<string>();
  let duplicateRowCount = 0;
  for (const row of dataRows) {
    for (let i = 0; i < columnCount; i++) {
      const value = row[i] ?? null;
      if (value === null || String(value).trim() === '') emptyCellCount++;
      else nonEmptyCellCount++;
    }
    const signature = row.map((v) => v == null ? '' : String(v)).join('\u0001');
    if (signature && signatures.has(signature)) duplicateRowCount++;
    else if (signature) signatures.add(signature);
  }
  const total = emptyCellCount + nonEmptyCellCount;
  return { rowCount: dataRows.length, columnCount, duplicateRowCount, emptyCellCount, nonEmptyCellCount, completenessPercent: total ? (nonEmptyCellCount / total) * 100 : 100 };
}
