import type { CellValue, ColumnSchema, DataQualityIssue, DataType, DatasetSchema, RawDataset, NormalizedTable, StructuralGroup } from '../types/dataset';
import { makeId } from '../utils/id';
import { toDate, toNumber } from '../utils/format';

const SAMPLE_SIZE = 200;

/** Infers the most likely header row within the first N rows of a file.
 *
 * Report-style workbooks and grouped exports frequently place a title or a
 * grouped/merged section label above the real column headers (e.g. a
 * merged "Q1 Sales" cell spanning several columns, unmerged into repeated
 * identical values by the Excel adapter). Naively picking the row with the
 * most non-empty cells can land on that group/title row instead of the
 * real header row beneath it, so the scoring below explicitly rewards
 * uniqueness (real headers are almost always unique per column) and
 * penalizes rows dominated by repeated/merged-looking values. */
export function guessHeaderRow(rows: CellValue[][]): number {
  const limit = Math.min(rows.length, 25);
  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!row || row.every((c) => isEmptyCell(c))) continue;

    const nonEmpty = row.filter((c) => !isEmptyCell(c));
    if (nonEmpty.length < 2) continue;

    const allStrings = nonEmpty.every((c) => typeof c === 'string' || typeof c === 'number');
    const uniqueRatio = new Set(nonEmpty.map((c) => String(c).trim().toLowerCase())).size / nonEmpty.length;
    const looksNumericHeavy = nonEmpty.filter((c) => typeof c === 'number').length / nonEmpty.length;

    const nextRow = rows[i + 1];
    const nextNonEmpty = nextRow?.filter((c) => !isEmptyCell(c)) ?? [];
    const followedByData = nextNonEmpty.length >= Math.max(1, Math.floor(nonEmpty.length * 0.5)) ? 1 : 0;
    const followedByStructuralGroup = nextRow ? isLikelyStructuralGroupRow(nextRow, nonEmpty.length) : false;

    // A real data record tends to contain several values that have strong
    // semantic signals (dates, numbers, URLs, booleans, identifiers, etc.).
    // This is deliberately a penalty rather than a hard rule: some datasets
    // legitimately contain all-text records.
    const dataSignal = dataRecordSignal(nonEmpty);

    let maxConsecutiveRepeat = 1;
    let run = 1;
    for (let c = 1; c < nonEmpty.length; c++) {
      const prev = String(nonEmpty[c - 1]).trim().toLowerCase();
      const curr = String(nonEmpty[c]).trim().toLowerCase();
      if (prev !== '' && prev === curr) {
        run += 1;
        maxConsecutiveRepeat = Math.max(maxConsecutiveRepeat, run);
      } else {
        run = 1;
      }
    }
    const groupedTitlePenalty = maxConsecutiveRepeat >= 3 ? maxConsecutiveRepeat * 4 : 0;

    const widthScore = Math.min(nonEmpty.length, 12) * 1.2;
    let score = widthScore + uniqueRatio * 10 + followedByData * 4 + (followedByStructuralGroup ? 10 : 0);
    score -= looksNumericHeavy * 3;
    score -= groupedTitlePenalty;
    score -= dataSignal * 9;
    // Prefer an earlier equally plausible header. This prevents the first
    // actual record after a group marker from winning merely because its next
    // row also happens to look like a record.
    score -= i * 0.8;

    if (!allStrings) score -= 1;
    if (nonEmpty.length <= 1) score -= 10;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function isLikelyStructuralGroupRow(row: CellValue[], columnCount: number): boolean {
  const nonEmpty = row.filter((c) => !isEmptyCell(c));
  if (nonEmpty.length !== 1) return false;
  const label = String(nonEmpty[0]).trim();
  if (!label) return false;
  if (/\(\s*\d[\d,]*\s+(?:records?|rows?|items?|students?)\s*\)/i.test(label)) return true;
  // A single descriptive label before a wide record is a common grouped-file
  // pattern. Keep this conservative so ordinary single-value data rows aren't
  // classified as groups.
  return columnCount >= 3 && label.length >= 2 && !/^\d+(?:\.\d+)?$/.test(label);
}

function dataRecordSignal(values: CellValue[]): number {
  let signals = 0;
  for (const value of values) {
    const text = String(value).trim();
    if (!text) continue;
    if (typeof value === 'number' || typeof value === 'boolean') { signals += 1; continue; }
    if (isUrlValue(value) || toDate(value) !== null || toNumber(value) !== null) signals += 1;
    if (/^(?:stu|id)[-_]?\d{2,}$/i.test(text)) signals += 1;
    if (/^https?:\/\//i.test(text)) signals += 1;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) signals += 1;
  }
  return Math.min(signals, 4);
}

function isEmptyCell(c: CellValue): boolean {
  return c === null || c === undefined || String(c).trim() === '';
}

export function buildSchema(raw: RawDataset, headerRowIndex: number): DatasetSchema {
  const rows = raw.rows;
  const clampedHeaderIndex = Math.min(Math.max(headerRowIndex, 0), Math.max(rows.length - 1, 0));
  const headerRow = rows[clampedHeaderIndex] ?? [];
  const dataStartIndex = clampedHeaderIndex + 1;
  const dataEndIndex = rows.length;

  const columnCount = Math.max(raw.columnCount, headerRow.length);
  const usedNames = new Map<string, number>();
  const columns: ColumnSchema[] = [];
  const quality: DataQualityIssue[] = [];

  let emptyHeaderCount = 0;
  let duplicateHeaderCount = 0;

  for (let colIndex = 0; colIndex < columnCount; colIndex++) {
    const rawName = headerRow[colIndex];
    let name = rawName === null || rawName === undefined ? '' : String(rawName).trim();

    if (!name) {
      emptyHeaderCount += 1;
      name = `Column ${colIndex + 1}`;
    }

    const lower = name.toLowerCase();
    if (usedNames.has(lower)) {
      duplicateHeaderCount += 1;
      const count = usedNames.get(lower)! + 1;
      usedNames.set(lower, count);
      name = `${name} (${count})`;
    } else {
      usedNames.set(lower, 1);
    }

    const sample = sampleColumn(rows, colIndex, dataStartIndex, dataEndIndex);
    columns.push({
      key: raw.columnIds?.[colIndex] ?? `col_${colIndex}`,
      index: colIndex,
      originalName: name,
      dataType: sample.dataType,
      emptyCount: sample.emptyCount,
      sampledCount: sample.sampledCount
    });
  }

  if (emptyHeaderCount > 0) {
    quality.push({
      id: makeId('q'),
      severity: 'warning',
      message: `${emptyHeaderCount} column${emptyHeaderCount > 1 ? 's' : ''} had no header name and ${emptyHeaderCount > 1 ? 'were' : 'was'} labeled automatically.`
    });
  }
  if (duplicateHeaderCount > 0) {
    quality.push({
      id: makeId('q'),
      severity: 'warning',
      message: `${duplicateHeaderCount} duplicate header name${duplicateHeaderCount > 1 ? 's were' : ' was'} found and renamed to stay unique.`
    });
  }

  const structuralGroups = detectStructuralGroups(rows, dataStartIndex, dataEndIndex, columnCount);

  const totalDataRows = dataEndIndex - dataStartIndex - structuralGroups.length;
  if (totalDataRows === 0) {
    quality.push({
      id: makeId('q'),
      severity: 'warning',
      message: 'No data rows were found below the selected header row.'
    });
  }

  return { headerRowIndex: clampedHeaderIndex, columns, dataStartIndex, dataEndIndex, structuralGroups, quality };
}

export function buildNormalizedTable(raw: RawDataset, schema: DatasetSchema): NormalizedTable {
  const groupRows = new Set(schema.structuralGroups.map((g) => g.sourceIndex - 1));
  const rows: NormalizedTable['rows'] = [];

  for (let i = schema.dataStartIndex; i < schema.dataEndIndex; i++) {
    if (groupRows.has(i)) continue;
    const rawRow = raw.rows[i] ?? [];
    rows.push({
      sourceIndex: i + 1,
      values: schema.columns.map((column) => rawRow[column.index] ?? null)
    });
  }

  return {
    columns: schema.columns,
    rows,
    structuralGroups: schema.structuralGroups,
    headerRowIndex: schema.headerRowIndex
  };
}

function detectStructuralGroups(
  rows: CellValue[][],
  start: number,
  end: number,
  columnCount: number
): StructuralGroup[] {
  const groups: StructuralGroup[] = [];
  for (let i = start; i < end; i++) {
    const row = rows[i] ?? [];
    const nonEmpty = row
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => !isEmptyCell(value));

    if (nonEmpty.length !== 1) continue;

    const label = String(nonEmpty[0].value).trim();
    if (!label) continue;

    const explicitCount = /\(\s*(\d[\d,]*)\s+(?:records?|rows?|items?|students?)\s*\)/i.exec(label);
    const next = rows[i + 1] ?? [];
    const nextNonEmpty = next.filter((c) => !isEmptyCell(c)).length;

    // A structural group row is deliberately conservative: either it explicitly
    // advertises a record count, or it is a single-cell label immediately before
    // a row that has enough populated fields to look like a real record.
    const looksLikeGroup =
      !!explicitCount ||
      (i + 1 < end && nextNonEmpty >= Math.max(2, Math.min(columnCount, 3)));

    if (looksLikeGroup) {
      groups.push({
        sourceIndex: i + 1,
        label,
        recordCount: explicitCount ? Number(explicitCount[1].replace(/,/g, '')) : undefined
      });
    }
  }
  return groups;
}

function sampleColumn(
  rows: CellValue[][],
  colIndex: number,
  start: number,
  end: number
): { dataType: DataType; emptyCount: number; sampledCount: number } {
  let seen = 0;
  let empty = 0;
  let numberCount = 0;
  let boolCount = 0;
  let dateCount = 0;
  let stringCount = 0;
  let urlCount = 0;

  const limit = Math.min(end, start + SAMPLE_SIZE);
  for (let r = start; r < limit; r++) {
    const cell = rows[r]?.[colIndex] ?? null;
    seen += 1;
    if (isEmptyCell(cell)) {
      empty += 1;
      continue;
    }
    if (typeof cell === 'boolean') {
      boolCount += 1;
    } else if (typeof cell === 'number') {
      numberCount += 1;
    } else if (isUrlValue(cell)) {
      urlCount += 1;
    } else if (toDate(cell) && !/^\d+$/.test(String(cell).trim())) {
      dateCount += 1;
    } else if (toNumber(cell) !== null && String(cell).trim() !== '') {
      numberCount += 1;
    } else {
      stringCount += 1;
    }
  }

  const nonEmpty = seen - empty;
  let dataType: DataType = 'empty';
  if (nonEmpty > 0) {
    const counts: [DataType, number][] = [
      ['number', numberCount],
      ['boolean', boolCount],
      ['date', dateCount],
      ['url', urlCount],
      ['string', stringCount]
    ];
    counts.sort((a, b) => b[1] - a[1]);
    const [topType, topCount] = counts[0];
    dataType = topCount / nonEmpty >= 0.8 ? topType : 'mixed';
  }

  return { dataType, emptyCount: empty, sampledCount: seen };
}

function isUrlValue(value: CellValue): boolean {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value.trim()); return ['http:', 'https:', 'ftp:'].includes(url.protocol); }
  catch { return false; }
}
