import React, { useEffect, useMemo, useState } from 'react';
import type { CellValue, RawDataset } from '../types/dataset';
import type { ReportConfig, ReportSection, RowRange } from '../types/report';
import type { ProcessedReport } from '../types/processed';
import { buildSchema } from '../engine/headerDetection';
import { makeId } from '../utils/id';
import { TopBar } from './TopBar';
import { Editing } from './editing';
import { SideNav } from './SideNav';
import { MobileNav, type MobileSection } from './MobileNav';
import { formatFileSize } from '../utils/format';
import { GeneralPanel } from './panels/GeneralPanel';
import { ColumnsPanel } from './panels/ColumnsPanel';
import { FilterPanel } from './panels/FilterPanel';
import { SortPanel } from './panels/SortPanel';
import { GroupPanel } from './panels/GroupPanel';
import { CalculatePanel } from './panels/CalculatePanel';
import { ExportPanel } from './panels/ExportPanel';
import { ReportPanel } from './panels/ReportPanel';
import type { NavCounts } from './navItems';
import type { DataType } from '../types/dataset';
import type { BooleanMapping, ConversionEvaluation } from '../engine/typeConversion';
import { NAV_ITEMS } from './navItems';

interface Props {
  raw: RawDataset;
  config: ReportConfig;
  report: ProcessedReport;
  reportProcessing?: boolean;
  update: (updater: (prev: ReportConfig) => ReportConfig) => void;
  onHeaderRowChange: (index: number) => void;
  onSwitchSheet: (sheetName: string) => void;
  onBack: () => void;
  onReset: () => void;
  canReset: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onEvaluateTypeChange: (columnKey: string, targetType: DataType) => ConversionEvaluation | null;
  onCommitTypeChange: (columnKey: string, targetType: DataType, mappings?: BooleanMapping[]) => { ok: boolean; error?: string };
  onApplyColumnChanges: (columnKey: string, displayName: string, settings: import('../types/report').ColumnDisplaySettings, targetType: DataType, mappings?: BooleanMapping[], visible?: boolean) => { ok: boolean; error?: string };
  onImportColumnData: (columnKey: string, values: CellValue[], mode: 'fill-empty' | 'replace-all') => { ok: boolean; error?: string };
  onValidateColumnImport: (columnKey: string, values: CellValue[], mode: 'fill-empty' | 'replace-all') => { ok: boolean; error?: string; plan?: { inputCount: number; emptyAvailable: number; existingReplaced: number } };
  onGetColumnImportTargets: (columnKey: string, mode: 'fill-empty' | 'replace-all') => number[];
  onEditCell: (
    sourceIndex: number,
    columnIndex: number,
    newValue: CellValue
  ) => void;
  onRemoveRows: (ranges: RowRange[]) => void;
  onAddRow: () => void;
  onAddColumn: (afterColumnKey?: string | null, options?: { name: string; type: DataType; values?: CellValue[] }) => void;
  onDeleteColumn: (columnKey: string) => void;
  onCopyCell: (sourceIndex: number, columnKey: string) => void;
  onPasteCell: (sourceIndex: number, columnKey: string, mode?: 'replace' | 'insert-before' | 'insert-after') => void;
  onAddCell: (sourceIndex: number, columnKey: string, position?: 'before' | 'after') => void;
  onDeleteCell: (sourceIndex: number, columnKey: string) => void;
  onInsertCellBoundary: (sourceIndex: number, columnKey: string, direction: 'top' | 'bottom') => void;
  hasCopiedCell: boolean;
  onCopyRows: () => void;
  onCutRows: () => void;
  onPasteRows: () => void;
  onImportRows: (text: string) => { ok: boolean; error?: string; count?: number };
  embedded?: boolean;
  backOnRight?: boolean;
}

export function Workspace({
  raw,
  config,
  report,
  reportProcessing = false,
  update,
  onHeaderRowChange,
  onSwitchSheet,
  onBack,
  onReset,
  canReset,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onEvaluateTypeChange,
  onCommitTypeChange,
  onApplyColumnChanges,
  onImportColumnData,
  onValidateColumnImport,
  onGetColumnImportTargets,
  onEditCell,
  onRemoveRows,
  onAddRow,
  onAddColumn,
  onDeleteColumn,
  onCopyCell,
  onPasteCell,
  onAddCell,
  onDeleteCell,
  onInsertCellBoundary,
  hasCopiedCell,
  onCopyRows,
  onCutRows,
  onPasteRows,
  onImportRows,
  embedded = false,
  backOnRight = false
}: Props) {
  const [section, setSection] =
    useState<ReportSection>('general');

  const [mobileSection, setMobileSection] =
    useState<MobileSection | null>(null);

  const [navCollapsed, setNavCollapsed] =
    useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try { const saved = Number(localStorage.getItem('docbit.sidebarWidth')); return Number.isFinite(saved) && saved >= 250 && saved <= 440 ? saved : 320; } catch { return 320; }
  });

  useEffect(() => { try { localStorage.setItem('docbit.sidebarWidth', String(sidebarWidth)); } catch { /* storage may be unavailable */ } }, [sidebarWidth]);

  // Workspace owns browser-zoom suppression so page chrome/sidebar never
  // scales with the table. Actual zoom is handled exclusively by Editing.
  useEffect(() => {
    const root = document.documentElement;
    const previousTouchAction = root.style.touchAction;
    root.style.touchAction = 'pan-x pan-y';

    const preventBrowserZoomWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };

    const preventBrowserZoomKeys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '0') {
        event.preventDefault();
      }
    };

    window.addEventListener('wheel', preventBrowserZoomWheel, { passive: false });
    window.addEventListener('keydown', preventBrowserZoomKeys);
    return () => {
      window.removeEventListener('wheel', preventBrowserZoomWheel);
      window.removeEventListener('keydown', preventBrowserZoomKeys);
      root.style.touchAction = previousTouchAction;
    };
  }, []);

  // The panel bar is linked to section selection.
  // Choosing any option always brings the panel
  // bar into view with that option active.
  const selectSection = (
    next: ReportSection
  ) => {
    setSection(next);
    if (navCollapsed) setNavCollapsed(false);
  };

  const schema = useMemo(
    () =>
      buildSchema(
        raw,
        config.headerRowIndex
      ),
    [raw, config.headerRowIndex]
  );

  const columnRawIndex = useMemo(
    () =>
      Object.fromEntries(
        schema.columns.map((c) => [
          c.key,
          c.index
        ])
      ),
    [schema]
  );

  const groupCol =
    config.group.columnKey
      ? schema.columns.find(
          (c) =>
            c.key ===
            config.group.columnKey
        )
      : null;

  const primarySort =
    config.sorts[0];

  const sortCol = primarySort
    ? schema.columns.find(
        (c) =>
          c.key ===
          primarySort.columnKey
      )
    : null;

  const sectionLabel =
    NAV_ITEMS.find(
      (i) => i.id === section
    )?.label ?? 'Panel';

  const counts: NavCounts = {
    filters:
      config.filterGroup.conditions
        .length,

    sorts:
      config.sorts.length,

    columns:
      config.columns.filter(
        (c) => c.visible
      ).length,

    totalColumns:
      config.columns.length,

    calculations:
      config.calculations.length,

    grouped:
      !!config.group.columnKey,

    groupLabel:
      groupCol?.originalName,

    sortLabel: sortCol
      ? `${sortCol.originalName} ${
          primarySort!.direction ===
          'asc'
            ? '↑'
            : '↓'
        }`
      : undefined,

    qualityIssues:
      report.quality.filter(
        (q) =>
          q.severity === 'warning'
      ).length,

    hasNumericColumns:
      schema.columns.some(
        (c) =>
          c.dataType === 'number'
      ),

    hasDateColumns:
      schema.columns.some(
        (c) =>
          c.dataType === 'date'
      )
  };

  const handleRemoveRows = (
    sourceIndexes: number[]
  ) => {
    if (sourceIndexes.length === 0) {
      return;
    }

    const sorted = [
      ...new Set(sourceIndexes)
    ].sort((a, b) => a - b);

    const ranges: RowRange[] = [];

    let start = sorted[0];
    let prev = sorted[0];

    for (
      let i = 1;
      i < sorted.length;
      i++
    ) {
      const n = sorted[i];

      if (n === prev + 1) {
        prev = n;
        continue;
      }

      ranges.push({
        id: makeId('range'),
        start,
        end: prev
      });

      start = n;
      prev = n;
    }

    ranges.push({
      id: makeId('range'),
      start,
      end: prev
    });

    onRemoveRows(ranges);
  };

  const renderPanel = (
    target: ReportSection
  ) => {
    switch (target) {
      case 'general':
        return (
          <GeneralPanel
            raw={raw}
            schema={schema}
            report={report}
            config={config}
            onHeaderRowChange={
              onHeaderRowChange
            }
            onSwitchSheet={
              onSwitchSheet
            }
            update={update}
          />
        );

      case 'columns':
        return (
          <ColumnsPanel
            schema={schema}
            config={config}
            update={update}
            onAddColumn={onAddColumn}
          />
        );

      case 'filter':
        return (
          <FilterPanel
            schema={schema}
            config={config}
            update={update}
          />
        );

      case 'sort':
        return (
          <SortPanel
            schema={schema}
            config={config}
            update={update}
          />
        );

      case 'group':
        return (
          <GroupPanel
            schema={schema}
            config={config}
            update={update}
          />
        );

      case 'calculate':
        return (
          <CalculatePanel
            schema={schema}
            config={config}
            report={report}
            update={update}
          />
        );

      case 'report':
        return <ReportPanel raw={raw} schema={schema} report={report} config={config} update={update} />;

      case 'export':
        return (
          <ExportPanel
            raw={raw}
            schema={schema}
            report={report}
            config={config}
            update={update}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className={`${embedded ? 'h-[760px] max-h-[80vh] min-h-[620px]' : 'h-screen'} flex flex-col`} style={{ ['--docbit-modal-left' as string]: `${navCollapsed ? 56 : sidebarWidth}px` }}>
      <div className="flex-1 flex min-h-0">
        <SideNav active={section} onChange={selectSection} counts={counts} collapsed={navCollapsed} onToggleCollapse={() => setNavCollapsed((v) => !v)} width={sidebarWidth} onWidthChange={setSidebarWidth} sectionLabel={sectionLabel}>
          {renderPanel(section)}
        </SideNav>

        <div className="flex min-w-0 min-h-0 flex-1 flex-col">
          <TopBar onBack={onBack} onReset={onReset} canReset={canReset} onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo} backOnRight={backOnRight} />
          <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-white pb-14 md:pb-0">
            <div className="shrink-0 flex items-center gap-3 border-b border-ink-200 bg-paper-50 px-3.5 sm:px-5 py-2">
              <div id="table-toolbar-search" className="min-w-0 flex-1" />
              <div id="table-toolbar-zoom" className="shrink-0" />
            </div>
            <div className="min-h-0 flex-1 flex flex-col">
              <Editing report={report} reportProcessing={reportProcessing} design={config.design} config={config} update={update} hasRawDataset={!!raw} columnRawIndex={columnRawIndex} onEvaluateTypeChange={onEvaluateTypeChange} onCommitTypeChange={onCommitTypeChange} onApplyColumnChanges={onApplyColumnChanges} onImportColumnData={onImportColumnData} onValidateColumnImport={onValidateColumnImport} onGetColumnImportTargets={onGetColumnImportTargets} onEditCell={onEditCell} onRemoveRows={handleRemoveRows} onAddRow={onAddRow} onAddColumn={onAddColumn} onDeleteColumn={onDeleteColumn} onCopyCell={onCopyCell} onPasteCell={onPasteCell} onAddCell={onAddCell} onDeleteCell={onDeleteCell} onInsertCellBoundary={onInsertCellBoundary} hasCopiedCell={hasCopiedCell} onCopyRows={onCopyRows} onCutRows={onCutRows} onPasteRows={onPasteRows} onImportRows={onImportRows} />
            </div>
          </main>
          {/* PC editor metadata footer is a sibling of the scrollable editor,
              just like TopBar. It therefore stays fixed to the bottom of the
              right content pane and never consumes/breaks the datatable area. */}
          <div className="hidden md:flex h-9 shrink-0 items-center justify-between gap-4 border-t border-ink-200 bg-white px-3 text-[10px] font-mono text-ink-500/80">
            <div className="min-w-0 truncate">{raw.meta.fileName} · {formatFileSize(raw.meta.fileSize)} · Processed in your browser</div>
            <div className="shrink-0">{report.stats.finalRowCount.toLocaleString()} rows · {report.stats.selectedColumnCount.toLocaleString()} columns</div>
          </div>
        </div>
      </div>

      <MobileNav active={mobileSection} onChange={setMobileSection} counts={counts} onReset={onReset} canReset={canReset}>
        {mobileSection ? renderPanel(mobileSection) : null}
      </MobileNav>
    </div>
  );
}