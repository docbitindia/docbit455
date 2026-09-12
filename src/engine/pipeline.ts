import type { CellValue, RawDataset, DatasetSchema } from '../types/dataset';
import type { ReportConfig } from '../types/report';
import type { ProcessedReport, ReportColumn, ReportGroup, ReportRow } from '../types/processed';
import { buildSchema, buildNormalizedTable } from './headerDetection';
import { rowMatchesFilterGroup, describeCondition } from './filters';
import { sortRows } from './sorting';
import { computeAggregate, aggregateLabel } from './calculations';
import { detectAdditionalIssues, profileData } from './quality';
import { makeId } from '../utils/id';

export function processReport(raw: RawDataset | null, config: ReportConfig): ProcessedReport {
  if (!raw) {
    return emptyReport();
  }
  try {
    return processReportInternal(raw, config);
  } catch (error) {
    // Rendering must never take down the workspace because one optional
    // transformation (for example a malformed saved filter/sort) failed.
    // Fall back to a direct normalized view of the selected schema so the
    // user can inspect the document and recover through Configure/Reset.
    return buildSafeFallbackReport(raw, config, error);
  }
}

function processReportInternal(raw: RawDataset, config: ReportConfig): ProcessedReport {

  const detectedSchema = buildSchema(raw, config.headerRowIndex);
  const configByKey = new Map(config.columns.map((c) => [c.key, c]));
  const schema: DatasetSchema = {
    ...detectedSchema,
    columns: detectedSchema.columns.map((column) => {
      const cc = configByKey.get(column.key);
      return cc ? { ...column, dataType: cc.type } : column;
    })
  };
  const normalized = buildNormalizedTable(raw, schema);
  const columnsByKey = new Map(schema.columns.map((c) => [c.key, c]));

  // Keep one row representation through the pipeline. The previous Map + mapped
  // array duplicated references for every row without adding lookup value.
  const allDataRows = normalized.rows;

  const totalRowsInFile = raw.meta.totalRows ?? raw.rows.length;

  // Apply row exclusions. Ranges are 1-based positions within the raw file.
  const excluded: { sourceIndex: number; raw: CellValue[] }[] = [];
  const included: { sourceIndex: number; raw: CellValue[] }[] = [];
  for (let i = 0; i < allDataRows.length; i++) {
    const sourceIndex = allDataRows[i].sourceIndex;
    const isExcluded = config.excludedRanges.some((r) => sourceIndex >= Math.min(r.start, r.end) && sourceIndex <= Math.max(r.start, r.end));
    const entry = allDataRows[i];
    if (isExcluded) excluded.push(entry);
    else included.push(entry);
  }

  // Skip rows that are entirely empty (do not count as meaningful data or exclusions).
  const manualBlankRows = new Set(raw.manualBlankRows ?? []);
  const meaningful = included.filter((r) =>
    r.raw.some((c) => c !== null && c !== undefined && String(c).trim() !== '') ||
    manualBlankRows.has(r.sourceIndex)
  );

  const qualityInput = raw.meta.isLargeFile ? meaningful.slice(0, 5000) : meaningful;
  const additionalIssues = detectAdditionalIssues(qualityInput.map((r) => r.raw), schema.columns, schema.columns.length);
  const quality = [...schema.quality, ...additionalIssues];

  // Filtering
  const activeConditions = config.filterGroup.conditions;
  const filtered = meaningful.filter((r) => rowMatchesFilterGroup(r.raw, config.filterGroup, columnsByKey));

  const matchDescriptions = activeConditions.length === 0 ? (() => [] as string[]) : (row: CellValue[]): string[] => {
    return activeConditions
      .filter((cond) => {
        const col = columnsByKey.get(cond.columnKey);
        if (!col) return false;
        // Re-evaluate single condition for traceability display.
        const singleGroup = { id: 'x', logic: 'AND' as const, conditions: [cond] };
        return rowMatchesFilterGroup(row, singleGroup, columnsByKey);
      })
      .map((cond) => {
        const col = columnsByKey.get(cond.columnKey);
        return describeCondition(cond, col?.originalName ?? cond.columnKey);
      });
  };

  // Build ordered, visible column list for the report.
  const visibleColumnConfigs = config.columns
    .filter((c) => c.visible)
    .slice()
    .sort((a, b) => a.order - b.order);

  const reportColumns: ReportColumn[] = visibleColumnConfigs
    .map((cc) => {
      const schemaCol = columnsByKey.get(cc.key);
      if (!schemaCol) return null;
      return {
        key: cc.key,
        displayName: cc.displayName || schemaCol.originalName,
        originalName: schemaCol.originalName,
        dataType: schemaCol.dataType,
        settings: cc.settings,
        isCurrency: cc.settings.currencyEnabled
      } as ReportColumn;
    })
    .filter((c): c is ReportColumn => c !== null);

  const columnIndexInValues = (key: string) => reportColumns.findIndex((c) => c.key === key);

  const toValues = (entryRaw: CellValue[]): CellValue[] =>
    reportColumns.map((rc) => {
      const schemaCol = columnsByKey.get(rc.key);
      return schemaCol ? entryRaw[schemaCol.index] ?? null : null;
    });

  // Pair each filtered raw row with its mapped display values, then sort once
  // so the flat preview and the grouped view stay perfectly in sync.
  type Combined = { sourceIndex: number; raw: CellValue[]; values: CellValue[] };
  const combined: Combined[] = filtered.map((f) => ({ sourceIndex: f.sourceIndex, raw: f.raw, values: toValues(f.raw) }));
  const sortedCombined = sortRows(combined, config.sorts, columnsByKey, columnIndexInValues);

  const reportRows: ReportRow[] = sortedCombined.map((c) => ({
    id: `row_${c.sourceIndex}`,
    sourceIndex: c.sourceIndex,
    values: c.values,
    matchedFilters: matchDescriptions(c.raw)
  }));

  // Calculations (over filtered raw rows, independent of column visibility).
  const summaries = config.calculations.map((agg) => {
    const schemaCol = agg.columnKey ? columnsByKey.get(agg.columnKey) : null;
    const isCurrency = agg.columnKey ? (configByKey.get(agg.columnKey)?.settings.currencyEnabled ?? false) : false;
    const label = agg.label || aggregateLabel(agg.fn, schemaCol?.originalName ?? null);
    return computeAggregate(
      { ...agg, label },
      filtered.map((f) => f.raw),
      schemaCol ? schemaCol.index : null,
      configByKey.get(agg.columnKey ?? '')?.settings.currencySymbol ?? '$',
      isCurrency,
      configByKey.get(agg.columnKey ?? '')?.settings.thousandsSeparator ?? true
    );
  });

  // Grouping
  let groups: ReportGroup[] | null = null;
  if (config.group.columnKey) {
    const groupCol = columnsByKey.get(config.group.columnKey);
    if (groupCol) {
      const map = new Map<string, { raw: CellValue[][]; rows: ReportRow[] }>();
      for (let i = 0; i < sortedCombined.length; i++) {
        const entry = sortedCombined[i];
        const rawVal = entry.raw[groupCol.index];
        const label = rawVal === null || rawVal === undefined || String(rawVal).trim() === '' ? '(Empty)' : String(rawVal);
        if (!map.has(label)) map.set(label, { raw: [], rows: [] });
        map.get(label)!.raw.push(entry.raw);
        map.get(label)!.rows.push(reportRows[i]);
      }
      groups = Array.from(map.entries()).map(([label, bucket]) => {
        const groupSummaries = config.group.aggregates.map((agg) => {
          const schemaCol = agg.columnKey ? columnsByKey.get(agg.columnKey) : null;
          const isCurrency = agg.columnKey ? (configByKey.get(agg.columnKey)?.settings.currencyEnabled ?? false) : false;
          const aggLabel = agg.label || aggregateLabel(agg.fn, schemaCol?.originalName ?? null);
          return computeAggregate(
            { ...agg, label: aggLabel },
            bucket.raw,
            schemaCol ? schemaCol.index : null,
            configByKey.get(agg.columnKey ?? '')?.settings.currencySymbol ?? '$',
            isCurrency,
            configByKey.get(agg.columnKey ?? '')?.settings.thousandsSeparator ?? true
          );
        });
        return { key: label, label, rows: bucket.rows, summaries: groupSummaries };
      });
    }
  }

  if (!groups && normalized.structuralGroups.length > 0) {
    const sortedGroupMarkers = [...normalized.structuralGroups].sort((a, b) => a.sourceIndex - b.sourceIndex);
    const structuralBuckets: ReportGroup[] = [];
    for (let i = 0; i < sortedGroupMarkers.length; i++) {
      const marker = sortedGroupMarkers[i];
      const nextSource = sortedGroupMarkers[i + 1]?.sourceIndex ?? Number.POSITIVE_INFINITY;
      const bucketRows = reportRows.filter((row) => row.sourceIndex > marker.sourceIndex && row.sourceIndex < nextSource);
      if (bucketRows.length) {
        structuralBuckets.push({
          key: `structural_${marker.sourceIndex}`,
          label: marker.label,
          rows: bucketRows,
          summaries: []
        });
      }
    }
    if (structuralBuckets.length) groups = structuralBuckets;
  }

  const warnings: string[] = [];
  if (raw.meta.isLargeFile) {
    warnings.push(`Large-file preview: ${raw.rows.length.toLocaleString()} of approximately ${raw.meta.totalRows?.toLocaleString() ?? 'many'} source rows are loaded into the interactive editor.`);
  } else if (raw.rows.length > 50000) {
    warnings.push('This is a large dataset. Some operations may take a moment to complete.');
  }

  return {
    columns: reportColumns,
    rows: reportRows,
    groups,
    summaries,
    stats: {
      totalRowsInFile,
      excludedRowCount: excluded.length,
      dataRowCount: normalized.rows.length - excluded.length,
      filteredRowCount: filtered.length,
      finalRowCount: filtered.length,
      totalColumnCount: schema.columns.length,
      selectedColumnCount: reportColumns.length,
      activeFilterCount: activeConditions.length,
      isGrouped: !!groups,
      isSorted: config.sorts.length > 0
    },
    quality,
    warnings,
    profile: profileData((raw.meta.isLargeFile ? meaningful.slice(0, 5000) : meaningful).map((r) => r.raw), schema.columns.length)
  };
}

function buildSafeFallbackReport(raw: RawDataset, config: ReportConfig, error: unknown): ProcessedReport {
  const schema = buildSchema(raw, config.headerRowIndex);
  const configByKey = new Map((config.columns ?? []).map((c) => [c.key, c]));
  const visible = schema.columns
    .filter((col) => configByKey.get(col.key)?.visible !== false)
    .map((col) => ({
      key: col.key,
      displayName: configByKey.get(col.key)?.displayName || col.originalName,
      originalName: col.originalName,
      dataType: configByKey.get(col.key)?.type ?? col.dataType,
      settings: configByKey.get(col.key)?.settings ?? ({
        numberFormat: 'standard', decimalPlaces: 2, thousandsSeparator: true, decimalSeparator: 'dot',
        currencyEnabled: false, percentageEnabled: false, currencySymbol: '$', currencyCode: 'USD',
        negativeDisplay: 'minus', dateFormat: 'DD MMM YYYY', customDateFormat: '', alignment: 'left', width: 150,
        wrapping: 'truncate', trimWhitespace: true, textCase: 'none', urlDisplay: 'full', openLinks: true,
        openInNewTab: true, validateUrl: true, booleanStyle: 'text', trueLabel: 'Yes', falseLabel: 'No', nullDisplay: ''
      } as any),
      isCurrency: !!configByKey.get(col.key)?.settings?.currencyEnabled
    } as ReportColumn));
  const groupRows = new Set(schema.structuralGroups.map((g) => g.sourceIndex));
  const rows: ReportRow[] = [];
  for (let i = schema.dataStartIndex; i < schema.dataEndIndex; i++) {
    const sourceIndex = i + 1;
    if (groupRows.has(sourceIndex)) continue;
    const rawRow = raw.rows[i] ?? [];
    rows.push({ id: `row_${sourceIndex}`, sourceIndex, values: visible.map((c) => { const sc = schema.columns.find((x) => x.key === c.key); return sc ? (rawRow[sc.index] ?? null) : null; }), matchedFilters: [] });
  }
  const warning = error instanceof Error ? error.message : 'An optional data transformation failed.';
  return {
    columns: visible, rows, groups: null, summaries: [],
    stats: { totalRowsInFile: raw.rows.length, excludedRowCount: 0, dataRowCount: rows.length, filteredRowCount: rows.length, finalRowCount: rows.length, totalColumnCount: schema.columns.length, selectedColumnCount: visible.length, activeFilterCount: 0, isGrouped: false, isSorted: false },
    quality: [...schema.quality, { id: 'q_render_fallback', severity: 'warning', message: `Some optional processing was skipped: ${warning}` }],
    warnings: [warning],
    profile: profileData(rows.map((r) => r.values), visible.length)
  };
}

export function emptyReport(): ProcessedReport {
  return {
    columns: [],
    rows: [],
    groups: null,
    summaries: [],
    stats: {
      totalRowsInFile: 0,
      excludedRowCount: 0,
      dataRowCount: 0,
      filteredRowCount: 0,
      finalRowCount: 0,
      totalColumnCount: 0,
      selectedColumnCount: 0,
      activeFilterCount: 0,
      isGrouped: false,
      isSorted: false
    },
    quality: [],
    warnings: [],
    profile: profileData([], 0)
  };
}
