import { GlobalSelect } from './GlobalSelect';
import React, {

  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Plus, Copy, Clipboard, Trash2, Rows3, Columns3, X, Upload, Scissors } from 'lucide-react';
import { FileTypeIcon, fileTypeFromName } from './FileTypeIcon';

import type { CellValue, DataType } from '../types/dataset';
import type { BooleanMapping, ConversionEvaluation } from '../engine/typeConversion';
import type {
  ProcessedReport,
  ReportRow
} from '../types/processed';
import type { ExtractSettings, ReportConfig, ColumnDisplaySettings } from '../types/report';

import { displayCell, toDate, toNumber } from '../utils/format';
import { usePinchZoom } from '../hooks/usePinchZoom';
import { defaultColumnSettings } from '../engine/config';
import { useToast } from '../hooks/useToast';
import { Modal } from './Modal';
import { parseFile } from '../adapters';

interface Props {
  report: ProcessedReport;
  reportProcessing?: boolean;
  design: ExtractSettings;
  config: ReportConfig;
  update: (updater: (prev: ReportConfig) => ReportConfig) => void;
  hasRawDataset: boolean;
  columnRawIndex: Record<string, number>;

  onEditCell: (
    sourceIndex: number,
    columnIndex: number,
    newValue: CellValue
  ) => void;

  onRemoveRows: (sourceIndexes: number[]) => void;
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
  onEvaluateTypeChange: (columnKey: string, targetType: DataType) => ConversionEvaluation | null;
  onCommitTypeChange: (columnKey: string, targetType: DataType, mappings?: BooleanMapping[]) => { ok: boolean; error?: string };
  onApplyColumnChanges: (columnKey: string, displayName: string, settings: ColumnDisplaySettings, targetType: DataType, mappings?: BooleanMapping[], visible?: boolean) => { ok: boolean; error?: string };
  onImportColumnData: (columnKey: string, values: CellValue[], mode: 'fill-empty' | 'replace-all') => { ok: boolean; error?: string };
  onValidateColumnImport: (columnKey: string, values: CellValue[], mode: 'fill-empty' | 'replace-all') => { ok: boolean; error?: string; plan?: { inputCount: number; emptyAvailable: number; existingReplaced: number } };
  onGetColumnImportTargets: (columnKey: string, mode: 'fill-empty' | 'replace-all') => number[];
}


// DocBit brand blue
const DOCBIT_BLUE = '#2563EB';
const DOCBIT_BLUE_DARK = '#1D4ED8';
const INSERT_GUTTER_WIDTH = 28;

function ColumnInsertCell({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th
      aria-label={label}
      className="relative w-7 min-w-[28px] border-x border-blue-500/60 bg-blue-700 p-0 align-middle"
      style={{ width: INSERT_GUTTER_WIDTH, minWidth: INSERT_GUTTER_WIDTH }}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="focus-ring absolute left-1/2 top-1/2 z-30 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-blue-200 bg-white text-blue-700 shadow-sm transition-transform hover:scale-105 hover:bg-blue-50 active:scale-95"
      >
        <Plus className="h-4 w-4" strokeWidth={2.2} />
      </button>
    </th>
  );
}

function ColumnInsertBodyCell() {
  return (
    <td
      aria-hidden="true"
      className="w-7 min-w-[28px] border-x border-ink-100 bg-paper-50/40 p-0"
      style={{ width: INSERT_GUTTER_WIDTH, minWidth: INSERT_GUTTER_WIDTH }}
    />
  );
}

function TableEndSpacer({ header = false }: { header?: boolean }) {
  const Tag = header ? 'th' : 'td';
  return (
    <Tag
      aria-hidden="true"
      className="p-0 border-0 bg-transparent"
      style={{ width: 88, minWidth: 88 }}
    />
  );
}

function ToolbarPortal({ targetId, children }: { targetId: string; children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById(targetId));
  }, [targetId]);
  return target ? createPortal(children, target) : null;
}

export function Editing({
  report,
  reportProcessing = false,
  design,
  config,
  update,
  hasRawDataset,
  columnRawIndex,
  onEditCell,
  onRemoveRows,
  onEvaluateTypeChange,
  onCommitTypeChange,
  onApplyColumnChanges,
  onImportColumnData,
  onValidateColumnImport,
  onGetColumnImportTargets,
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
  onImportRows
}: Props) {

  const toast = useToast();
  const [searchQuery, setSearchQuery] =
    useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [inspectRow, setInspectRow] =
    useState<{
      row: ReportRow;
      displayIndex: number;
    } | null>(null);

  const [selected, setSelected] =
    useState<Set<number>>(new Set());

  const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
  type AddColumnTarget = { kind: 'start' } | { kind: 'after'; columnKey: string } | { kind: 'end' };
  const [addColumnTarget, setAddColumnTarget] = useState<AddColumnTarget | null>(null);
  const [cellModal, setCellModal] = useState<{ sourceIndex: number; columnKey: string } | null>(null);
  const [cellActionOpen, setCellActionOpen] = useState<{ sourceIndex: number; columnKey: string } | null>(null);
  const [cellChoice, setCellChoice] = useState<'add' | 'paste' | 'delete' | 'delete-confirm' | null>(null);

  useEffect(() => {
    if (activeColumnMenu && !report.columns.some((c) => c.key === activeColumnMenu)) setActiveColumnMenu(null);
  }, [activeColumnMenu, report.columns]);

  useEffect(() => {
    if (!activeColumnMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-column-menu], [data-column-menu-trigger]')) return;
      setActiveColumnMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveColumnMenu(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeColumnMenu]);
  const [selectedCell, setSelectedCell] = useState<{ sourceIndex: number; colKey: string } | null>(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  const [editing, setEditing] =
    useState<{
      sourceIndex: number;
      colKey: string;
    } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!selectedCell || editing || activeColumnMenu) return;
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'Home') { event.preventDefault(); tableViewportRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        if (event.key === 'End') { event.preventDefault(); const v=tableViewportRef.current; if(v) v.scrollTo({ top: v.scrollHeight, behavior: 'smooth' }); return; }
      }
      if (event.key === 'PageDown' || event.key === 'PageUp') {
        const v=tableViewportRef.current;
        if(v){ event.preventDefault(); v.scrollBy({ top: (event.key==='PageDown'?1:-1)*v.clientHeight*0.85, behavior:'smooth' }); }
        return;
      }
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','Tab','Delete','Backspace','F2'].includes(event.key)) return;
      const rowList = report.groups ? report.groups.flatMap((g) => g.rows) : report.rows;
      const ri = rowList.findIndex((r) => r.sourceIndex === selectedCell.sourceIndex);
      const ci = report.columns.findIndex((c) => c.key === selectedCell.colKey);
      if (ri < 0 || ci < 0) return;
      if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); setEditing(selectedCell); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); const rawIndex = columnRawIndex[selectedCell.colKey]; if (rawIndex !== undefined) onEditCell(selectedCell.sourceIndex, rawIndex, null); return; }
      let nr = ri, nc = ci;
      if (event.key === 'ArrowLeft') nc--; if (event.key === 'ArrowRight' || event.key === 'Tab') nc++; if (event.key === 'ArrowUp') nr--; if (event.key === 'ArrowDown' || event.key === 'Enter') nr++;
      nr = Math.max(0, Math.min(rowList.length - 1, nr)); nc = Math.max(0, Math.min(report.columns.length - 1, nc));
      event.preventDefault(); setSelectedCell({ sourceIndex: rowList[nr].sourceIndex, colKey: report.columns[nc].key });
    };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [selectedCell, editing, activeColumnMenu, report.groups, report.rows, report.columns, columnRawIndex, onEditCell]);

  const {
    ref: zoomRef,
    zoom,
    resetZoom,
    zoomIn,
    zoomOut,
    minZoom,
    maxZoom
  } = usePinchZoom<HTMLDivElement>();

  /*
   * ================================================================
   * SEARCH
   * ================================================================
   */

  const normalizedQuery =
    deferredSearchQuery.trim().toLowerCase();

  const rowMatchesQuery = useCallback(
    (row: ReportRow) => {
      if (!normalizedQuery) {
        return true;
      }

      return row.values.some(
        (value, index) => {
          const column =
            report.columns[index];

          if (!column) {
            return false;
          }

          const displayText =
            displayCell(
              value,
              column.dataType,
              column.settings
            ).toLowerCase();

          if (
            displayText.includes(
              normalizedQuery
            )
          ) {
            return true;
          }

          if (
            value !== null &&
            value !== undefined
          ) {
            if (
              String(value)
                .toLowerCase()
                .includes(
                  normalizedQuery
                )
            ) {
              return true;
            }
          }

          return false;
        }
      );
    },
    [
      normalizedQuery,
      report.columns,
      design
    ]
  );

  /*
   * Reset pagination when search changes.
   */

  /*
   * ================================================================
   * FILTERED GROUPS
   * ================================================================
   */

  const filteredGroups = useMemo(() => {
    const groups = report.groups && report.groups.length > 0 ? report.groups : null;
    if (!groups) {
      return null;
    }

    if (!normalizedQuery) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        rows: group.rows.filter(
          rowMatchesQuery
        )
      }))
      .filter(
        (group) =>
          group.rows.length > 0
      );
  }, [
    report.groups,
    normalizedQuery,
    rowMatchesQuery
  ]);

  /*
   * ================================================================
   * FLAT ROWS
   * ================================================================
   */

  const hasGroups = !!(report.groups && report.groups.length > 0);
  const largeGroupedView = hasGroups && report.rows.length > 20000;
  const flatRows = (hasGroups && !largeGroupedView)
    ? null
    : normalizedQuery
      ? report.rows.filter(rowMatchesQuery)
      : report.rows;

  const flatRowsSafe = flatRows ?? [];
  const groupsForRender = largeGroupedView ? null : filteredGroups;

  const searchHasNoMatches =
    !!normalizedQuery &&
    (hasGroups
      ? (filteredGroups?.length ?? 0) ===
        0
      : (flatRows?.length ?? 0) === 0);

  /*
   * ================================================================
   * DISPLAY INDEX
   * ================================================================
   */

  const displayIndexById = useMemo(() => {
    const map =
      new Map<string, number>();

    let counter = 0;

    if (report.groups) {
      for (const group of report.groups) {
        for (const row of group.rows) {
          counter += 1;

          map.set(
            row.id,
            counter
          );
        }
      }
    } else {
      for (const row of report.rows) {
        counter += 1;

        map.set(
          row.id,
          counter
        );
      }
    }

    return map;
  }, [
    report.groups,
    report.rows
  ]);

  /*
   * ================================================================
   * VISIBLE ROW SELECTION
   * ================================================================
   */

  const allVisibleSourceIndexes =
    useMemo(() => {
      if (filteredGroups) {
        return filteredGroups.flatMap(
          (group) =>
            group.rows.map(
              (row) =>
                row.sourceIndex
            )
        );
      }

      return (flatRows ?? []).map((row) => row.sourceIndex);
    }, [
      filteredGroups,
      flatRows
    ]);

  const toggleRow = (
    sourceIndex: number
  ) => {
    setSelected((prev) => {
      const next = new Set(prev);

      if (next.has(sourceIndex)) {
        next.delete(sourceIndex);
      } else {
        next.add(sourceIndex);
      }

      return next;
    });
  };

  useEffect(() => {
    (window as any).__docbitSelectedRows = Array.from(selected);
    return () => { if ((window as any).__docbitSelectedRows) delete (window as any).__docbitSelectedRows; };
  }, [selected]);

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const allSelected =
        allVisibleSourceIndexes.length >
          0 &&
        allVisibleSourceIndexes.every(
          (index) =>
            prev.has(index)
        );

      if (allSelected) {
        const next = new Set(prev);

        allVisibleSourceIndexes.forEach(
          (index) =>
            next.delete(index)
        );

        return next;
      }

      return new Set([
        ...prev,
        ...allVisibleSourceIndexes
      ]);
    });
  };

  const removeSelected = () => {
    if (selected.size === 0) {
      return;
    }

    onRemoveRows(
      Array.from(selected)
    );

    setSelected(new Set());
  };

  const deleteSelectedRows = () => { removeSelected(); toast.push('Selected rows deleted.', 'success'); };
  const copySelectedCell = () => { if (selectedCell) { onCopyCell(selectedCell.sourceIndex, selectedCell.colKey); toast.push('Cell copied.', 'success'); } };
  const pasteSelectedCell = () => { if (selectedCell) { onPasteCell(selectedCell.sourceIndex, selectedCell.colKey); } };

  const density = design.density === 'compact' ? 'py-1.5' : 'py-2.5';

  // Render the complete dataset as requested for Excel-style editing.
  // Zoom is applied with a composited transform rather than CSS zoom so
  // pinch/trackpad gestures do not trigger a full table relayout on every frame.

  /*
   * ================================================================
   * EMPTY STATES
   * ================================================================
   */

  if (!hasRawDataset) {
    return null;
  }

  if (reportProcessing) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center p-6 bg-gradient-to-b from-white to-slate-50/80">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-[0_18px_60px_rgba(15,23,42,.08)]">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <div className="relative h-9 w-9">
              <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-blue-100 border-t-blue-600" />
              <div className="absolute inset-[9px] rounded-full bg-blue-600/15 animate-pulse" />
            </div>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Live data pipeline</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Refreshing your data view…</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Applying filters, sorting and data-quality calculations in the background. Your interface stays responsive while the result is prepared.</p>
          <div className="mt-6 grid grid-cols-3 gap-2 text-left">
            {['Process rows','Build view','Refresh editor'].map((label, i) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${i === 0 ? 'animate-pulse bg-blue-600' : 'bg-slate-300'}`} /><span className="text-[10px] font-semibold text-slate-600">{label}</span></div>
              </div>
            ))}
          </div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-1/2 animate-[db-progress_1.1s_ease-in-out_infinite] rounded-full bg-blue-600" /></div>
        </div>
      </div>
    );
  }

  if (report.columns.length === 0) {
    return (
      <EmptyState
        title="No columns selected"
        description="Choose at least one column in the Columns panel to build your extraction."
      />
    );
  }

  if (report.stats.finalRowCount === 0) {
    return (
      <EmptyState
        title="No rows match your current setup"
        description="Your filters or row selection excluded every row. Adjust them to see results."
      />
    );
  }

  const allVisibleSelected =
    allVisibleSourceIndexes.length >
      0 &&
    allVisibleSourceIndexes.every(
      (index) =>
        selected.has(index)
    );

  // Insertion gutters are real table columns. This keeps the header controls,
  // data cells, and scroll geometry perfectly aligned at every zoom level.
  const tableColumnCount = report.columns.length * 2 + 3; // combined row selector/index + start gutter + column pairs + end swipe spacer
  const ROW_HEIGHT = 44;
  const HEADER_HEIGHT = 68;
  const OVERSCAN = 24;
  const tableWidth = Math.max(640, report.columns.reduce((sum, c) => sum + c.settings.width, 0) + (report.columns.length + 1) * INSERT_GUTTER_WIDTH + 92);
  // Keep the outer scroll geometry proportional to the visible table.
  const zoomedRowHeight = ROW_HEIGHT * zoom;
  const zoomedTableHeight = (HEADER_HEIGHT + flatRowsSafe.length * ROW_HEIGHT) * zoom;
  const zoomedTableWidth = tableWidth * zoom;
  const viewportHeight = tableViewportRef.current?.clientHeight || 720;
  const visibleCount = Math.ceil(viewportHeight / Math.max(1, zoomedRowHeight)) + OVERSCAN * 2;
  const dataScrollTop = Math.max(0, tableScrollTop - HEADER_HEIGHT * zoom);
  const virtualStart = Math.max(0, Math.floor(dataScrollTop / Math.max(1, zoomedRowHeight)) - OVERSCAN);
  const virtualEnd = Math.min(flatRowsSafe.length, virtualStart + visibleCount);
  const virtualRows = flatRowsSafe.slice(virtualStart, virtualEnd);

  return (
    <div className="flex flex-col h-full">
      <ToolbarPortal targetId="table-toolbar-search">
        <div className="relative w-[min(260px,55vw)]">
          <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-600/40">⌕</span>
          <input
            type="text"
            role="searchbox"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search rows"
            placeholder="Search rows..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            className="h-8 w-full appearance-none rounded-md border border-ink-200 bg-white pl-7 pr-7 text-xs text-ink-900 placeholder:text-ink-600/40 focus:outline-none focus:border-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              title="Clear search"
              className="focus-ring absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full text-ink-500 hover:bg-paper-100 hover:text-ink-900"
            >
              <X className="mx-auto h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </ToolbarPortal>
      <ToolbarPortal targetId="table-toolbar-zoom">
        <div className="flex items-center gap-0.5 rounded-full bg-ink-900 text-paper-50 text-[11px] font-mono px-1 py-0.5 shadow-sm" role="group" aria-label="Table zoom controls">
          <button type="button" onClick={zoomOut} disabled={zoom <= minZoom} aria-label="Zoom out" title="Zoom out" className="focus-ring h-6 w-6 rounded-full flex items-center justify-center hover:bg-white/15 disabled:opacity-30">−</button>
          <button type="button" onClick={resetZoom} title="Reset zoom to 100%" className="focus-ring min-w-[3rem] px-1 py-1 rounded-full text-center hover:bg-white/15">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={zoomIn} disabled={zoom >= maxZoom} aria-label="Zoom in" title="Zoom in" className="focus-ring h-6 w-6 rounded-full flex items-center justify-center hover:bg-white/15 disabled:opacity-30">+</button>
        </div>
      </ToolbarPortal>

      {/* ==========================================================
          NO SEARCH RESULTS
         ========================================================== */}

      {searchHasNoMatches ? (
        <EmptyState
          title="No rows match your search"
          description={`No cell contains "${searchQuery.trim()}". Try a different search or clear it to see all rows.`}
        />
      ) : (
        <>
          {/* ========================================================
              SELECTED ROW ACTION BAR
             ======================================================== */}

          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2 bg-ink-900 text-paper-50 text-xs animate-fade-in shrink-0">
              <span>
                {selected.size} row
                {selected.size === 1
                  ? ''
                  : 's'}{' '}
                selected
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      new Set()
                    )
                  }
                  className="focus-ring rounded-md px-2.5 py-1 text-paper-50/70 hover:text-paper-50 hover:bg-white/10"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={
                    removeSelected
                  }
                  className="focus-ring rounded-md px-3 py-1 bg-rose-500 text-white font-medium hover:bg-rose-500/90 active:scale-[0.98] transition-all"
                >
                  Remove selected
                </button>
              </div>
            </div>
          )}

          {/* ========================================================
              TABLE
             ======================================================== */}

          {largeGroupedView && (
            <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-2 text-[11px] text-amber-900/80">
              Grouping is kept in the report calculations, while the grid switches to a flat virtualized view above 20,000 rows so scrolling stays responsive.
            </div>
          )}

          <div
            ref={(node) => { tableViewportRef.current = node; zoomRef(node); }}
            className="relative flex-1 min-h-0 overflow-auto thin-scroll overscroll-contain workspace-table-canvas"
            onScroll={(event) => {
              const node = event.currentTarget;
              if (scrollRafRef.current !== null) return;
              scrollRafRef.current = requestAnimationFrame(() => {
                scrollRafRef.current = null;
                setTableScrollTop(node.scrollTop);
              });
            }}
            style={{
              touchAction: 'pan-x pan-y',
              WebkitOverflowScrolling: 'touch'
            }}
            onPointerDown={() => {
              const active = document.activeElement;
              if (active instanceof HTMLInputElement && active.type === 'text') active.blur();
            }}
          >
            <FastRowNavigator viewportRef={tableViewportRef} rowCount={flatRowsSafe.length} rowHeight={ROW_HEIGHT} zoom={zoom} />
            <div data-zoom-layer className="relative align-top" style={{ width: zoomedTableWidth, height: zoomedTableHeight }}>
            <table
              className="absolute left-0 top-0 border-separate border-spacing-0 text-sm"
              style={{
                width: tableWidth,
                minWidth: tableWidth,
                tableLayout: 'fixed',
                // CSS zoom participates in layout, unlike transform: scale().
                // This keeps sticky headers, hit targets and scroll geometry aligned.
                zoom,
                willChange: 'zoom'
              }}
            >
              {/* ====================================================
                  HEADER
                 ==================================================== */}

              <thead
                className="sticky top-0 z-10 text-white"
                style={{
                  backgroundColor:
                    DOCBIT_BLUE
                }}
              >
                <tr>
                  {/* Combined row selector + S.No column. The header intentionally
                      contains only the select-all checkbox; row numbers are shown
                      in the same column for a tighter, clearer grid. */}
                  <th
                    className="z-20 h-[68px] border-b border-r px-2"
                    style={{ backgroundColor: DOCBIT_BLUE, borderColor: DOCBIT_BLUE_DARK, width: 92, minWidth: 92 }}
                  >
                    <div className="grid h-full grid-cols-[40px_1fr] items-center">
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          aria-label="Select all visible rows"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          className="focus-ring h-4 w-4 shrink-0 accent-blue-600"
                        />
                      </div>
                      <div aria-hidden="true" />
                    </div>
                  </th>

                  <ColumnInsertCell label="Add column at start" onClick={() => setAddColumnTarget({ kind: 'start' })} />
                  {report.columns.map((col) => (
                    <React.Fragment key={col.key}>
                      <HeaderCell
                        column={col}
                        config={config}
                        update={update}
                        active={activeColumnMenu === col.key}
                        onToggle={() => setActiveColumnMenu((current) => current === col.key ? null : col.key)}
                        onClose={() => setActiveColumnMenu(null)}
                        onEvaluateTypeChange={onEvaluateTypeChange}
                        onCommitTypeChange={onCommitTypeChange}
                        onApplyColumnChanges={onApplyColumnChanges}
                        onImportColumnData={onImportColumnData}
                        onValidateColumnImport={onValidateColumnImport}
                        onGetColumnImportTargets={onGetColumnImportTargets}
                        onAddColumn={onAddColumn}
                        onDeleteColumn={onDeleteColumn}
                      />
                      <ColumnInsertCell label={`Add column after ${col.displayName}`} onClick={() => setAddColumnTarget({ kind: 'after', columnKey: col.key })} />
                    </React.Fragment>
                  ))}
                  <TableEndSpacer header />
                </tr>
              </thead>

              {/* ====================================================
                  BODY
                 ==================================================== */}

              <tbody>
                {groupsForRender ? (
                  groupsForRender.map(
                    (group) => (
                      <React.Fragment
                        key={group.key}
                      >
                        {/* Group header */}
                        <tr className="bg-blue-50/80">
                          <td
                            colSpan={tableColumnCount}
                            className="px-3 py-2 text-xs font-semibold text-blue-700"
                          >
                            {
                              group.label
                            }{' '}
                            ·{' '}
                            {
                              group
                                .rows
                                .length
                            }{' '}
                            record
                            {group.rows
                              .length ===
                            1
                              ? ''
                              : 's'}

                            {group
                              .summaries
                              .length >
                              0 && (
                              <span className="ml-3 font-normal text-ink-600/70 font-mono">
                                {group.summaries
                                  .map(
                                    (
                                      summary
                                    ) =>
                                      `${summary.label}: ${summary.displayValue}`
                                  )
                                  .join(
                                    '   ·   '
                                  )}
                              </span>
                            )}
                          </td>
                        </tr>

                        {group.rows.map(
                          (row) => (
                            <Row
                              key={
                                row.id
                              }
                              row={row}
                              displayIndex={
                                displayIndexById.get(
                                  row.id
                                ) ?? 0
                              }
                              report={
                                report
                              }
                              design={
                                design
                              }
                              density={
                                density
                              }
                              selected={selected.has(
                                row.sourceIndex
                              )}
                              onToggleSelect={() =>
                                toggleRow(
                                  row.sourceIndex
                                )
                              }
                              onInspect={() =>
                                setInspectRow(
                                  {
                                    row,
                                    displayIndex:
                                      displayIndexById.get(
                                        row.id
                                      ) ??
                                      0
                                  }
                                )
                              }
                              columnRawIndex={
                                columnRawIndex
                              }
                              editing={editing}
                              selectedCell={selectedCell}
                              onStartEdit={(colKey, edit = false) => {
                                setSelectedCell({ sourceIndex: row.sourceIndex, colKey });
                                setEditing(edit ? { sourceIndex: row.sourceIndex, colKey } : null);
                              }}
                              onCommitEdit={
                                onEditCell
                              }
                              onCancelEdit={() =>
                                setEditing(
                                  null
                                )
                              }
                              onAddRow={onAddRow}
                              onCopyCell={onCopyCell}
                              onPasteCell={onPasteCell}
                              onAddCell={onAddCell}
                              onDeleteCell={onDeleteCell}
                              onInsertCellBoundary={onInsertCellBoundary}
                              onOpenCellMenu={(sourceIndex, columnKey) => setCellActionOpen((current) => current?.sourceIndex === sourceIndex && current?.columnKey === columnKey ? null : { sourceIndex, columnKey })}
                              onOpenCellModal={(sourceIndex, columnKey, choice) => { setCellChoice(choice); setCellModal({ sourceIndex, columnKey }); setCellActionOpen(null); }}
                              cellActionOpen={cellActionOpen}
                              hasCopiedCell={hasCopiedCell}
                            />
                          )
                        )}
                      </React.Fragment>
                    )
                  )
                ) : (
                  <>
                    {virtualStart > 0 && <tr aria-hidden="true"><td colSpan={tableColumnCount} className="p-0 border-0" style={{height: virtualStart * ROW_HEIGHT}} /></tr>}
                    {virtualRows.map(
                    (row) => (
                      <Row
                        key={row.id}
                        row={row}
                        displayIndex={
                          displayIndexById.get(
                            row.id
                          ) ?? 0
                        }
                        report={report}
                        design={design}
                        density={density}
                        selected={selected.has(
                          row.sourceIndex
                        )}
                        onToggleSelect={() =>
                          toggleRow(
                            row.sourceIndex
                          )
                        }
                        onInspect={() =>
                          setInspectRow(
                            {
                              row,
                              displayIndex:
                                displayIndexById.get(
                                  row.id
                                ) ??
                                0
                            }
                          )
                        }
                        columnRawIndex={
                          columnRawIndex
                        }
                        editing={editing}
                        selectedCell={selectedCell}
                        onStartEdit={(colKey, edit = false) => {
                          setSelectedCell({ sourceIndex: row.sourceIndex, colKey });
                          setEditing(edit ? { sourceIndex: row.sourceIndex, colKey } : null);
                        }}
                        onCommitEdit={
                          onEditCell
                        }
                        onCancelEdit={() =>
                          setEditing(
                            null
                          )
                        }
                        onAddRow={onAddRow}
                        onCopyCell={onCopyCell}
                        onPasteCell={onPasteCell}
                        onAddCell={onAddCell}
                        onDeleteCell={onDeleteCell}
                        onInsertCellBoundary={onInsertCellBoundary}
                        onOpenCellMenu={(sourceIndex, columnKey) => setCellActionOpen((current) => current?.sourceIndex === sourceIndex && current?.columnKey === columnKey ? null : { sourceIndex, columnKey })}
                        onOpenCellModal={(sourceIndex, columnKey, choice) => { setCellChoice(choice); setCellModal({ sourceIndex, columnKey }); setCellActionOpen(null); }}
                        cellActionOpen={cellActionOpen}
                        hasCopiedCell={hasCopiedCell}
                      />
                    )
                  )}
                  {virtualEnd < flatRowsSafe.length && <tr aria-hidden="true"><td colSpan={tableColumnCount} className="p-0 border-0" style={{height: (flatRowsSafe.length - virtualEnd) * ROW_HEIGHT}} /></tr>}
                  </>
                )}

                {/* Add-row control lives in the same selector/S.No column.
                    The generous bottom hit area also gives touch users a little
                    extra scroll room after the final record. */}
                <tr className="border-t border-ink-100 bg-paper-50/70">
                  <td style={{ width: 92, minWidth: 92 }} className="px-2 py-4 border-r border-ink-100">
                    <button
                      type="button"
                      onClick={onAddRow}
                      className="focus-ring mx-auto flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 shadow-sm hover:bg-blue-50 active:scale-95"
                      aria-label="Add new row"
                      title="Add new row"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.4} />
                    </button>
                  </td>
                  <td colSpan={tableColumnCount - 1} className="h-16" aria-hidden="true" />
                </tr>
                <tr aria-hidden="true">
                  <td colSpan={tableColumnCount} className="p-0 border-0" style={{ height: 'calc(120px + var(--safe-bottom))' }} />
                </tr>
              </tbody>

              {/* ====================================================
                  SUMMARY FOOTER
                 ==================================================== */}

              {report.summaries
                .length > 0 && (
                <tfoot className="sticky bottom-0 bg-paper-100 border-t-2 border-ink-900">
                  <tr>
                    <td
                      className="px-3 py-2"
                      colSpan={1}
                    />

                    <td
                      colSpan={tableColumnCount - 1}
                      className="px-3 py-2"
                    >
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-mono text-ink-900">
                        {report.summaries.map(
                          (summary) => (
                            <span
                              key={
                                summary.id
                              }
                            >
                              <span className="text-ink-600/60">
                                {
                                  summary.label
                                }
                                :
                              </span>{' '}

                              <span className="font-semibold">
                                {
                                  summary.displayValue
                                }
                              </span>
                            </span>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            </div>

          </div>

          {/* ========================================================
              ROW INSPECTOR
             ======================================================== */}

          {inspectRow && (
            <RowInspector
              row={
                inspectRow.row
              }
              displayIndex={
                inspectRow.displayIndex
              }
              report={report}
              onClose={() =>
                setInspectRow(
                  null
                )
              }
            />
          )}

          <AddColumnModal open={addColumnTarget !== null} onClose={() => setAddColumnTarget(null)} onApply={(name, type, values) => { const anchor = addColumnTarget; const afterColumnKey = anchor?.kind === 'after' ? anchor.columnKey : anchor?.kind === 'start' ? null : undefined; onAddColumn(afterColumnKey, { name, type, values }); setAddColumnTarget(null); }} />

          {cellModal && (
            <Modal open title={cellChoice === 'delete' ? 'Delete cell' : cellChoice === 'delete-confirm' ? 'Confirm cell deletion' : 'Cell actions'} description={cellChoice === 'delete' ? 'Choose what should happen to the selected cell.' : cellChoice === 'delete-confirm' ? 'This action will remove the cell and compact this column.' : 'Choose an action for the selected cell.'} onClose={() => { setCellModal(null); setCellChoice(null); setCellActionOpen(null); }} size="lg">
              {cellChoice === 'paste' ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <button type="button" onClick={() => { onPasteCell(cellModal!.sourceIndex, cellModal!.columnKey, 'replace'); setCellModal(null); setCellActionOpen(null); setCellChoice(null); }} className="rounded-xl border border-ink-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50/50">
                    <div className="flex items-center gap-3"><Clipboard className="h-5 w-5 text-blue-600"/><div><div className="text-sm font-semibold">Paste here</div><div className="mt-1 text-[11px] text-ink-600/70">Replace only the selected cell value.</div></div></div>
                  </button>
                  <button type="button" onClick={() => { onPasteCell(cellModal!.sourceIndex, cellModal!.columnKey, 'insert-before'); setCellModal(null); setCellActionOpen(null); setCellChoice(null); }} className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 text-left hover:bg-blue-50">
                    <div className="flex items-center gap-3"><Plus className="h-5 w-5 text-blue-600"/><div><div className="text-sm font-semibold">Insert before & paste</div><div className="mt-1 text-[11px] text-ink-600/70">Insert a cell before the selected cell and paste into it.</div></div></div>
                  </button>
                  <button type="button" onClick={() => { onPasteCell(cellModal!.sourceIndex, cellModal!.columnKey, 'insert-after'); setCellModal(null); setCellActionOpen(null); setCellChoice(null); }} className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 text-left hover:bg-blue-50">
                    <div className="flex items-center gap-3"><Plus className="h-5 w-5 text-blue-600"/><div><div className="text-sm font-semibold">Insert after & paste</div><div className="mt-1 text-[11px] text-ink-600/70">Insert a cell after the selected cell and paste into it.</div></div></div>
                  </button>
                </div>
              ) : cellChoice === 'delete' ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => setCellChoice('delete-confirm')} className="rounded-xl border border-red-200 bg-red-50/40 p-4 text-left hover:bg-red-50">
                    <div className="flex items-center gap-3"><Trash2 className="h-5 w-5 text-red-600"/><div><div className="text-sm font-semibold">Delete cell</div><div className="mt-1 text-[11px] text-ink-600/70">Remove this cell and move all values below it up one position.</div></div></div>
                  </button>
                  <button type="button" onClick={() => { onEditCell(cellModal.sourceIndex, columnRawIndex[cellModal.columnKey], null); setCellModal(null); setCellChoice(null); setCellActionOpen(null); }} className="rounded-xl border border-ink-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50/50">
                    <div className="flex items-center gap-3"><Trash2 className="h-5 w-5 text-ink-600"/><div><div className="text-sm font-semibold">Empty cell</div><div className="mt-1 text-[11px] text-ink-600/70">Keep the cell in place and remove only its value.</div></div></div>
                  </button>
                </div>
              ) : cellChoice === 'delete-confirm' ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="text-sm font-semibold text-red-800">Delete this cell?</div>
                  <div className="mt-1 text-xs text-red-700">The selected cell will be removed. Values below it in this column will move up one position. Other columns will not change.</div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => setCellChoice('delete')} className="modal-cancel-button-lg">Cancel</button>
                    <button type="button" onClick={() => { onDeleteCell(cellModal.sourceIndex, cellModal.columnKey); setCellModal(null); setCellActionOpen(null); setCellChoice(null); }} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white">Delete cell</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => setCellChoice('add')} className="rounded-xl border border-ink-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50/50">
                      <div className="flex items-center gap-3"><Plus className="h-5 w-5 text-blue-600"/><div><div className="text-sm font-semibold">Add cell</div><div className="mt-1 text-[11px] text-ink-600/60">Insert a blank cell before or after.</div></div></div>
                    </button>
                    <button type="button" onClick={() => setCellChoice('delete')} className="rounded-xl border border-red-200 p-4 text-left hover:bg-red-50">
                      <div className="flex items-center gap-3"><Trash2 className="h-5 w-5 text-red-600"/><div><div className="text-sm font-semibold">Delete cell</div><div className="mt-1 text-[11px] text-ink-600/60">Remove the cell or only empty its value.</div></div></div>
                    </button>
                  </div>
                  {cellChoice === 'add' && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => { onAddCell(cellModal.sourceIndex, cellModal.columnKey, 'before'); setCellModal(null); setCellActionOpen(null); setCellChoice(null); }} className="rounded-xl border border-blue-200 p-3 text-left hover:bg-blue-50"><div className="text-sm font-semibold">Insert before</div><div className="mt-1 text-[11px] text-ink-600/60">Blank cell before selected.</div></button>
                      <button type="button" onClick={() => { onAddCell(cellModal.sourceIndex, cellModal.columnKey, 'after'); setCellModal(null); setCellActionOpen(null); setCellChoice(null); }} className="rounded-xl border border-blue-200 p-3 text-left hover:bg-blue-50"><div className="text-sm font-semibold">Insert after</div><div className="mt-1 text-[11px] text-ink-600/60">Blank cell after selected.</div></button>
                    </div>
                  )}
                </>
              )}
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

/* ================================================================
   COLUMN HEADER + CONTEXTUAL SETTINGS
   ================================================================ */

function HeaderCell({
  column,
  config,
  update,
  active,
  onToggle,
  onClose,
  onEvaluateTypeChange,
  onCommitTypeChange,
  onApplyColumnChanges,
  onImportColumnData,
  onValidateColumnImport,
  onGetColumnImportTargets,
  onAddColumn,
  onDeleteColumn
}: {
  column: ProcessedReport['columns'][number];
  config: ReportConfig;
  update: (updater: (prev: ReportConfig) => ReportConfig) => void;
  active: boolean;
  onToggle: () => void;
  onClose: () => void;
  onEvaluateTypeChange: (columnKey: string, targetType: DataType) => ConversionEvaluation | null;
  onCommitTypeChange: (columnKey: string, targetType: DataType, mappings?: BooleanMapping[]) => { ok: boolean; error?: string };
  onApplyColumnChanges: (columnKey: string, displayName: string, settings: ColumnDisplaySettings, targetType: DataType, mappings?: BooleanMapping[], visible?: boolean) => { ok: boolean; error?: string };
  onImportColumnData: (columnKey: string, values: CellValue[], mode: 'fill-empty' | 'replace-all') => { ok: boolean; error?: string };
  onValidateColumnImport: (columnKey: string, values: CellValue[], mode: 'fill-empty' | 'replace-all') => { ok: boolean; error?: string; plan?: { inputCount: number; emptyAvailable: number; existingReplaced: number } };
  onGetColumnImportTargets: (columnKey: string, mode: 'fill-empty' | 'replace-all') => number[];
  onAddColumn: (afterColumnKey?: string | null, options?: { name: string; type: DataType; values?: CellValue[] }) => void;
  onDeleteColumn: (columnKey: string) => void;
}) {
  const open = active;
  const [draft, setDraft] = useState<ColumnDisplaySettings>(() => ({ ...column.settings }));
  const [draftName, setDraftName] = useState(column.displayName);
  const [draftType, setDraftType] = useState<DataType>(column.dataType);
  const [draftBooleanMappings, setDraftBooleanMappings] = useState<BooleanMapping[]>([]);
  const [draftVisible, setDraftVisible] = useState(column.visible ?? true);
  const [draftDirty, setDraftDirty] = useState(false);
  const toast = useToast();
  const [conversion, setConversion] = useState<{ type: DataType; evaluation: ConversionEvaluation } | null>(null);
  const [menuView, setMenuView] = useState<'settings' | 'import'>('settings');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importValues, setImportValues] = useState<CellValue[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importModePolicy, setImportModePolicy] = useState<'fill-empty' | 'replace-all'>('fill-empty');
  const [importSource, setImportSource] = useState<'upload' | 'paste'>('upload');
  const [importText, setImportText] = useState('');
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!draftDirty) {
      setDraft(column.settings);
      setDraftName(column.displayName);
      setDraftType(column.dataType);
      setDraftVisible(column.visible ?? true);
    }
  }, [column.key, column.settings, column.displayName, column.dataType, column.visible, draftDirty]);

  const patchDraft = (patch: Partial<ColumnDisplaySettings>) => { setDraft((prev) => ({ ...prev, ...patch })); setDraftDirty(true); };
  const patchDraftName = (name: string) => { setDraftName(name); setDraftDirty(true); };

  const cancelDraft = () => {
    setDraft({ ...column.settings });
    setDraftName(column.displayName);
    setDraftType(column.dataType);
    setDraftBooleanMappings([]);
    setDraftVisible(column.visible ?? true);
    setDraftDirty(false);
    setConversion(null);
    setMenuView('settings');
    onClose();
  };

  const parsePastedValues = (text: string): CellValue[] => text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(v => v.trim()).filter((v, i, arr) => !(v === '' && i === arr.length - 1));
  const getImportValues = () => importSource === 'paste' ? parsePastedValues(importText) : importValues;
  const handlePasteInput = (text: string) => { setImportText(text); setImportSource('paste'); setImportError(null); };
  const handleImportFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!/\.(xlsx|xls|csv|json)$/.test(name)) { setImportError('Choose an Excel, CSV, or JSON file.'); return; }
    try {
      const dataset = await parseFile(file);
      const values = dataset.rows.map((row) => row?.[0] ?? null);
      if (!values.length) { setImportError('The uploaded file does not contain any column values.'); return; }
      setImportFile(file); setImportValues(values); setImportText(''); setImportSource('upload'); setImportError(null);
    } catch (error) { setImportError(error instanceof Error ? error.message : 'The file could not be read. No data was changed.'); }
  };
  const commitImport = () => {
    const values = getImportValues();
    const applied = onImportColumnData(column.key, values, importModePolicy);
    if (!applied.ok) { toast.push(applied.error ?? 'Column data could not be applied. No data was changed.', 'error'); return; }
    setImportFile(null); setImportValues([]); setImportText(''); setImportError(null); setImportConfirmOpen(false); setMenuView('settings');
    toast.push(`${values.length} value${values.length === 1 ? '' : 's'} imported.`, 'success');
  };
  const applyImport = () => {
    const values = getImportValues();
    if (!values.length) { const message = 'Add at least one value by uploading a file or pasting values.'; setImportError(message); toast.push(message, 'warning'); return; }
    const result = onValidateColumnImport(column.key, values, importModePolicy);
    if (!result.ok || !result.plan) { const message = result.error ?? 'Column data validation failed. No data was changed.'; setImportError(message); toast.push(message, 'error'); return; }
    setImportError(null);
    if (importModePolicy === 'replace-all') { setImportConfirmOpen(true); return; }
    commitImport();
  };

  const applyDraft = () => {
    if (draftName.trim() === '') { toast.push('Column name cannot be empty.', 'error'); return; }
    const result = onApplyColumnChanges(column.key, draftName.trim(), draft, draftType, draftBooleanMappings, draftVisible);
    if (!result.ok) { toast.push(result.error ?? 'Could not apply column changes. No data was changed.', 'error'); return; }
    setDraftDirty(false);
    setConversion(null);
    onClose();
    toast.push(`${draftName.trim()} changes applied.`, 'success');
  };

  const requestTypeChange = (type: DataType) => {
    if (type === draftType) return;
    const evaluation = onEvaluateTypeChange(column.key, type);
    if (!evaluation) return;
    if (evaluation.status === 'unsupported') {
      toast.push(`${evaluation.reason ?? 'This conversion is unsafe.'} No data was changed.`, 'error');
      setDraftType(column.dataType);
      return;
    }
    if (evaluation.status === 'safe') {
      setDraftType(type);
      setDraftBooleanMappings(evaluation.mappings);
      setDraftDirty(true);
      return;
    }
    setConversion({ type, evaluation });
  };

  const commitBooleanMapping = (mappings: BooleanMapping[]) => {
    setDraftBooleanMappings(mappings);
    setDraftType('boolean');
    setDraftDirty(true);
    setConversion(null);
  };

  const setSort = (direction: 'asc' | 'desc') => {
    update((prev) => ({
      ...prev,
      sorts: [{ id: `sort_${column.key}`, columnKey: column.key, direction }]
    }));
    onClose();
  };

  const setQuickFilter = (value: string) => {
    update((prev) => {
      const without = prev.filterGroup.conditions.filter((condition) => condition.columnKey !== column.key);
      if (!value.trim()) return { ...prev, filterGroup: { ...prev.filterGroup, conditions: without } };
      return {
        ...prev,
        filterGroup: {
          ...prev.filterGroup,
          conditions: [...without, { id: `filter_${column.key}`, columnKey: column.key, operator: 'contains', value, value2: '' }]
        }
      };
    });
  };

  const moveColumn = (delta: -1 | 1) => {
    update((prev) => {
      const list = [...prev.columns].sort((a, b) => a.order - b.order);
      const index = list.findIndex((c) => c.key === column.key);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return prev;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...prev, columns: list.map((c, i) => ({ ...c, order: i })) };
    });
  };

  const resetFormatting = () => {
    const base = {
      ...draft,
      numberFormat: 'standard' as const,
      decimalPlaces: 2,
      thousandsSeparator: true,
      decimalSeparator: 'dot' as const,
      currencyEnabled: false,
      percentageEnabled: false,
      currencySymbol: '$',
      currencyCode: 'USD',
      negativeDisplay: 'minus' as const,
      dateFormat: 'DD MMM YYYY' as const,
      customDateFormat: '',
      alignment: 'left' as const,
      width: 150,
      wrapping: 'truncate' as const,
      trimWhitespace: true,
      textCase: 'none' as const,
      urlDisplay: 'full' as const,
      openLinks: true,
      openInNewTab: true,
      validateUrl: true,
      booleanStyle: 'text' as const,
      trueLabel: 'Yes',
      falseLabel: 'No',
      nullDisplay: ''
    };
    patchDraft(base);
  };

  const typeOptions = ['string', 'number', 'date', 'boolean', 'url', 'mixed'] as const;

  return (
    <th
      className={`relative h-[68px] border-b border-r px-3 py-2.5 text-left font-medium align-middle transition-colors ${open ? 'bg-blue-700' : 'bg-blue-600'}`}
      style={{ backgroundColor: DOCBIT_BLUE, borderColor: DOCBIT_BLUE_DARK, width: column.settings.width, minWidth: column.settings.width }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-5 text-white" title={column.displayName}>{column.displayName}</div>
          <div className="mt-1 inline-flex max-w-full items-center rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-mono font-medium uppercase tracking-wide text-white/80">{column.dataType}</div>
        </div>
        <button
          type="button"
                    data-column-menu-trigger
          aria-label={`Settings for ${column.displayName}`}
          aria-expanded={open}
          onClick={(event) => { event.stopPropagation(); onToggle(); }}
          className="focus-ring h-9 w-9 shrink-0 rounded-lg border border-white/20 bg-white/5 text-white/90 hover:bg-white/15 hover:text-white flex items-center justify-center text-base leading-none" title={`Open options for ${column.displayName}`}
        >
          ⋮
        </button>

      </div>

      {open && (
        <Modal
          open
          title={column.displayName}
          description={`${column.dataType.toUpperCase()} · Column options`}
          onClose={onClose}
          size="md"
          footer={menuView === 'import' ? (
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => { setImportFile(null); setImportValues([]); setImportText(''); setImportError(null); setImportSource('upload'); setMenuView('settings'); }} className="modal-cancel-button">Cancel</button>
              <button type="button" disabled={!getImportValues().length} onClick={applyImport} className="focus-ring rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{importModePolicy === 'replace-all' ? 'Apply replacement' : 'Apply import'}</button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setDeleteConfirmOpen(true)} className="focus-ring mr-auto inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete column</button>
              <button type="button" onClick={cancelDraft} className="modal-cancel-button">Cancel</button>
              <button type="button" disabled={draftName.trim() === '' || !draftDirty} onClick={applyDraft} className="focus-ring rounded-md bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Apply</button>
            </div>
          )}
        >
          <div className="mb-3 grid grid-cols-2 rounded-lg bg-paper-100 p-0.5">
            <button type="button" onClick={() => setMenuView('settings')} className={`rounded-md px-2 py-1.5 text-[11px] font-medium ${menuView === 'settings' ? 'bg-white shadow-sm text-blue-600' : 'text-ink-600'}`}>Column options</button>
            <button type="button" onClick={() => setMenuView('import')} className={`rounded-md px-2 py-1.5 text-[11px] font-medium ${menuView === 'import' ? 'bg-white shadow-sm text-blue-600' : 'text-ink-600'}`}>Column data</button>
          </div>

          {menuView === 'import' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-ink-200 bg-paper-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="text-xs font-semibold text-ink-900">Column data</div><div className="mt-0.5 text-[10px] text-ink-600/65">Load values in order, then apply them to this column.</div></div>
                  <div className="flex shrink-0 gap-1 rounded-lg bg-paper-100 p-1">
                    <button type="button" onClick={() => { setImportSource('upload'); setImportError(null); }} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${importSource === 'upload' ? 'bg-white text-blue-600 shadow-sm' : 'text-ink-600'}`}><Upload className="mr-1 inline h-3 w-3"/>Upload</button>
                    <button type="button" onClick={() => { setImportSource('paste'); setImportError(null); }} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${importSource === 'paste' ? 'bg-white text-blue-600 shadow-sm' : 'text-ink-600'}`}><Clipboard className="mr-1 inline h-3 w-3"/>Paste values</button>
                  </div>
                </div>
                {importSource === 'upload' ? (
                  <div className="mt-3">
                    {importFile ? (
                      <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-white p-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><FileTypeIcon type={fileTypeFromName(importFile.name)} size={22}/></div>
                        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-ink-900">{importFile.name}</p><p className="text-[10px] text-ink-600/60">{importValues.length.toLocaleString()} values loaded.</p></div>
                        <button type="button" onClick={() => { setImportFile(null); setImportValues([]); setImportError(null); }} className="text-[10px] font-semibold text-red-600">Remove</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-ink-300 bg-white p-3"><div><p className="text-xs font-semibold text-ink-900">Upload values</p><p className="mt-1 text-[10px] leading-4 text-ink-600/60">Excel, CSV, or JSON. The first column is read top-to-bottom.</p></div><label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-2 text-[11px] font-semibold text-white"><Upload className="h-3.5 w-3.5"/> Upload<input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv,.json" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) await handleImportFile(file); e.target.value=''; }} /></label></div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-ink-200 bg-white p-3">
                    <label className="block text-xs font-semibold text-ink-900">Paste values</label>
                    <p className="mt-1 text-[10px] leading-4 text-ink-600/60">One value per line. Press Enter for the next row. Multi-line lists are mapped automatically.</p>
                    <textarea value={importText} onChange={(e) => handlePasteInput(e.target.value)} rows={6} className={menuInput + ' mt-2 resize-none font-mono'} placeholder={'Example 1\nExample 2\nExample 3\nExample 4'} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setImportModePolicy('fill-empty')} className={`rounded-xl border p-3 text-left ${importModePolicy === 'fill-empty' ? 'border-blue-300 bg-blue-50/60' : 'border-ink-200 bg-white'}`}><div className="text-xs font-semibold">Fill empty cells only</div><div className="mt-1 text-[10px] leading-4 text-ink-600/65">Existing values stay untouched. Values are assigned to empty rows from top to bottom.</div></button>
                <button type="button" onClick={() => setImportModePolicy('replace-all')} className={`rounded-xl border p-3 text-left ${importModePolicy === 'replace-all' ? 'border-red-300 bg-red-50' : 'border-ink-200 bg-white'}`}><div className="text-xs font-semibold text-red-800">Replace all cells</div><div className="mt-1 text-[10px] leading-4 text-red-700/80">Every applicable data row is replaced. This is destructive but undoable.</div></button>
              </div>

              {(() => {
                const values = getImportValues();
                const targetRows = onGetColumnImportTargets(column.key, importModePolicy);
                const extra = Math.max(0, values.length - targetRows.length);
                const missing = Math.max(0, targetRows.length - values.length);
                return <div className="rounded-xl border border-ink-200 bg-paper-50 p-3">
                  <div className="flex items-center justify-between gap-2"><div className="text-[10px] font-semibold uppercase tracking-wide text-ink-600/70">{importModePolicy === 'fill-empty' ? 'Empty cell rows' : 'All data rows'}</div><div className="text-[10px] font-mono text-ink-600/60">{values.length} values · {targetRows.length} rows</div></div>
                  <div className="mt-2 max-h-48 overflow-auto pr-1">
                    {targetRows.length === 0 ? <div className="py-5 text-center text-[11px] text-ink-600/60">No applicable rows are available.</div> : targetRows.map((rowNumber, i) => <div key={rowNumber} className="flex min-h-7 items-center gap-3 py-1"><span className="w-12 shrink-0 text-right font-mono text-[10px] font-semibold text-ink-500">{rowNumber}</span><span className="min-w-0 flex-1 truncate text-[11px] text-ink-900">{values[i] === undefined ? <span className="text-ink-300">Waiting for a value</span> : String(values[i]).trim() || <span className="text-ink-300">Empty value</span>}</span></div>)}
                  </div>
                  {extra > 0 && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-[10px] font-medium text-red-700">Cannot apply: {extra} extra value{extra === 1 ? '' : 's'} have no target row. Reduce the values or add more applicable rows.</p>}
                  {missing > 0 && importModePolicy === 'replace-all' && <p className="mt-2 rounded-lg bg-[#f7f8f6] px-2.5 py-2 text-[10px] font-medium text-[#475569]">Replace all needs {missing} more value{missing === 1 ? '' : 's'} to cover every data row.</p>}
                  {importModePolicy === 'fill-empty' && values.length <= targetRows.length && values.length > 0 && <p className="mt-2 text-[10px] text-ink-600/60">The first {values.length} empty row{values.length === 1 ? '' : 's'} will be filled. Other empty cells remain unchanged.</p>}
                </div>;
              })()}
              {importError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">{importError}</div>}
            </div>
          ) : (
          <>
          <div className="flex-1 overflow-y-auto thin-scroll px-3 pb-3">
          <MenuField label="Rename">
            <input value={draftName} onChange={(e) => patchDraftName(e.target.value)} className={menuInput} />
          </MenuField>

          <MenuField label="Change type">
            <GlobalSelect value={draftType} onChange={(value) => requestTypeChange(value as DataType)} className={menuInput}>
              {typeOptions.map((type) => <option key={type} value={type}>{type.toUpperCase()}</option>)}
            </GlobalSelect>
          </MenuField>

          {draftType === 'number' && (
            <>
              <MenuField label="Number format">
                <div className="grid grid-cols-2 gap-1.5">
                  <MenuButton active={draft.numberFormat === 'standard'} onClick={() => patchDraft({ numberFormat: 'standard' })}>1,000.00</MenuButton>
                  <MenuButton active={draft.numberFormat === 'plain'} onClick={() => patchDraft({ numberFormat: 'plain', thousandsSeparator: false })}>1000.00</MenuButton>
                </div>
              </MenuField>
              <MenuField label="Decimal places">
                <input type="number" min={0} max={10} value={draft.decimalPlaces} onChange={(e) => patchDraft({ decimalPlaces: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} className={menuInput} />
              </MenuField>
              <MenuField label="Currency">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={draft.currencyEnabled} onChange={(e) => patchDraft({ currencyEnabled: e.target.checked })} />
                  <input value={draft.currencySymbol} maxLength={4} onChange={(e) => patchDraft({ currencySymbol: e.target.value })} className={menuInput + ' w-20'} />
                  <input value={draft.currencyCode} maxLength={5} onChange={(e) => patchDraft({ currencyCode: e.target.value.toUpperCase() })} className={menuInput + ' w-20'} />
                </div>
              </MenuField>
              <MenuField label="Separators">
                <div className="grid grid-cols-2 gap-1.5">
                  <MenuButton active={draft.thousandsSeparator} onClick={() => patchDraft({ thousandsSeparator: true })}>1,000</MenuButton>
                  <MenuButton active={!draft.thousandsSeparator} onClick={() => patchDraft({ thousandsSeparator: false })}>1000</MenuButton>
                </div>
              </MenuField>
              <MenuField label="Decimal separator">
                <GlobalSelect value={draft.decimalSeparator} onChange={(value) => patchDraft({ decimalSeparator: value as ColumnDisplaySettings['decimalSeparator'] })} className={menuInput}>
                  <option value="dot">1,000.00</option><option value="comma">1.000,00</option>
                </GlobalSelect>
              </MenuField>
              <MenuField label="Percentage">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={draft.percentageEnabled} onChange={(e) => patchDraft({ percentageEnabled: e.target.checked })} /> Display as percentage
                </label>
              </MenuField>
              <MenuField label="Negative numbers">
                <GlobalSelect value={draft.negativeDisplay} onChange={(value) => patchDraft({ negativeDisplay: value as ColumnDisplaySettings['negativeDisplay'] })} className={menuInput}>
                  <option value="minus">-1,000.00</option><option value="parentheses">(1,000.00)</option>
                </GlobalSelect>
              </MenuField>
            </>
          )}

          {draftType === 'date' && (
            <>
              <MenuField label="Date format">
                <GlobalSelect value={draft.dateFormat} onChange={(value) => patchDraft({ dateFormat: value as ColumnDisplaySettings['dateFormat'] })} className={menuInput}>
                  <option value="DD MMM YYYY">17 Aug 2026</option>
                  <option value="DD/MM/YYYY">17/08/2026</option>
                  <option value="MM/DD/YYYY">08/17/2026</option>
                  <option value="YYYY-MM-DD">2026-08-17</option>
                  <option value="DD-MM-YYYY">17-08-2026</option>
                  <option value="MM-DD-YYYY">08-17-2026</option>
                  <option value="DD MMM YYYY, HH:mm">17 Aug 2026, 10:30</option>
                  <option value="custom">Custom…</option>
                </GlobalSelect>
              </MenuField>
              {draft.dateFormat === 'custom' && (
                <MenuField label="Custom format">
                  <input value={draft.customDateFormat} placeholder="DD/MM/YYYY HH:mm" onChange={(e) => patchDraft({ customDateFormat: e.target.value })} className={menuInput} />
                </MenuField>
              )}
            </>
          )}

          {draftType === 'string' && (
            <>
              <MenuField label="Text">
                <GlobalSelect value={draft.textCase} onChange={(value) => patchDraft({ textCase: value as ColumnDisplaySettings['textCase'] })} className={menuInput}>
                  <option value="none">Original case</option><option value="upper">UPPERCASE</option><option value="lower">lowercase</option><option value="title">Title Case</option>
                </GlobalSelect>
              </MenuField>
              <MenuField label="Trim whitespace">
                <input type="checkbox" checked={draft.trimWhitespace} onChange={(e) => patchDraft({ trimWhitespace: e.target.checked })} />
              </MenuField>
            </>
          )}

          {draftType === 'url' && (
            <>
              <MenuField label="Display">
                <GlobalSelect value={draft.urlDisplay} onChange={(value) => patchDraft({ urlDisplay: value as ColumnDisplaySettings['urlDisplay'] })} className={menuInput}>
                  <option value="full">Full URL</option><option value="compact">Compact</option><option value="domain">Domain</option>
                </GlobalSelect>
              </MenuField>
              <MenuField label="Links">
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.openLinks} onChange={(e) => patchDraft({ openLinks: e.target.checked })} /> Open links</label>
                <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.openInNewTab} onChange={(e) => patchDraft({ openInNewTab: e.target.checked })} /> New tab</label>
                <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.validateUrl} onChange={(e) => patchDraft({ validateUrl: e.target.checked })} /> Validate URL</label>
              </MenuField>
            </>
          )}

          {draftType === 'boolean' && (
            <MenuField label="Display">
              <GlobalSelect value={draft.booleanStyle} onChange={(value) => patchDraft({ booleanStyle: value as ColumnDisplaySettings['booleanStyle'] })} className={menuInput}>
                <option value="text">Text</option><option value="checkbox">Checkbox</option>
              </GlobalSelect>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <input value={draft.trueLabel} onChange={(e) => patchDraft({ trueLabel: e.target.value })} className={menuInput} placeholder="True" />
                <input value={draft.falseLabel} onChange={(e) => patchDraft({ falseLabel: e.target.value })} className={menuInput} placeholder="False" />
              </div>
            </MenuField>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <MenuField label="Alignment"><GlobalSelect value={draft.alignment} onChange={(value) => patchDraft({ alignment: value as ColumnDisplaySettings['alignment'] })} className={menuInput}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></GlobalSelect></MenuField>
            <MenuField label="Width"><input type="number" min={72} max={640} value={draft.width} onChange={(e) => patchDraft({ width: Math.max(72, Math.min(640, Number(e.target.value) || 150)) })} className={menuInput} /></MenuField>
          </div>
          <MenuField label="Wrapping">
            <GlobalSelect value={draft.wrapping} onChange={(value) => patchDraft({ wrapping: value as ColumnDisplaySettings['wrapping'] })} className={menuInput}>
              <option value="truncate">Truncate</option><option value="wrap">Wrap</option>
            </GlobalSelect>
          </MenuField>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <MenuButton onClick={resetFormatting}>Reset formatting</MenuButton>
            <MenuButton active={!draftVisible} onClick={() => { setDraftVisible(false); setDraftDirty(true); }}>Hide column</MenuButton>
          </div>

          </div>
          </>
          )}
        </Modal>
      )}

      {importConfirmOpen && (
        <Modal open title="Replace column data" description={`This will replace existing values in ${column.displayName}.`} onClose={() => setImportConfirmOpen(false)} size="sm" footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setImportConfirmOpen(false)} className="modal-cancel-button">Cancel</button><button type="button" onClick={commitImport} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Replace all</button></div>}>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">Existing values in this column will be overwritten. Other columns will not be changed.</div>
        </Modal>
      )}
      {deleteConfirmOpen && (
        <Modal open title="Delete column" description={`Delete ${column.displayName} and its values?`} onClose={() => setDeleteConfirmOpen(false)} size="sm" footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setDeleteConfirmOpen(false)} className="modal-cancel-button">Cancel</button><button type="button" onClick={() => { setDeleteConfirmOpen(false); onDeleteColumn(column.key); onClose(); }} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">Delete</button></div>}>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">This permanently removes the column values from the current document and can be undone with Undo.</div>
        </Modal>
      )}

      {conversion && (
        <BooleanConversionDialog
          evaluation={conversion.evaluation}
          onCancel={() => setConversion(null)}
          onApply={commitBooleanMapping}
        />
      )}
    </th>
  );
}

function AddColumnModal({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (name: string, type: DataType, values: CellValue[]) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<DataType>('string');
  useEffect(() => { if (open) { setName(''); setType('string'); } }, [open]);
  return <Modal open={open} title="Add column" description="Create an empty column. Add data later from Column data in the ⋮ menu." onClose={onClose} footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="modal-cancel-button">Cancel</button><button type="button" disabled={!name.trim()} onClick={() => onApply(name.trim(), type, [])} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Create column</button></div>}>
    <div className="space-y-3"><label className="block text-xs font-medium">Column name<input value={name} onChange={e => setName(e.target.value)} className={menuInput+" mt-1"} placeholder="New column" autoFocus /></label><label className="block text-xs font-medium">Type<GlobalSelect value={type} onChange={value => setType(value as DataType)} className={menuInput+" mt-1"}>{['string','number','date','boolean','url','mixed'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}</GlobalSelect></label><div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-[11px] text-blue-900/75">The new column starts empty. Use the Column data option in the ⋮ menu to import or paste values.</div></div>
  </Modal>;
}

const menuInput = 'w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#2563EB]';

function MenuField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-2.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-600/60">{label}<div className="mt-1 text-sm font-normal">{children}</div></label>;
}

function MenuButton({ active = false, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`focus-ring rounded-md border px-2 py-1.5 text-xs ${active ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]' : 'border-ink-200 hover:bg-paper-100'}`}>{children}</button>;
}

function BooleanConversionDialog({
  evaluation,
  onCancel,
  onApply
}: {
  evaluation: ConversionEvaluation;
  onCancel: () => void;
  onApply: (mappings: BooleanMapping[]) => void;
}) {
  const [mappings, setMappings] = useState<BooleanMapping[]>(evaluation.mappings.map((m) => ({ ...m })));
  const invalid = mappings.some((m) => m.target === null);
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20 p-4" role="dialog" aria-modal="true" aria-label="Review Boolean conversion">
      <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-4 shadow-panel">
        <h3 className="text-sm font-semibold text-ink-900">Review Boolean conversion</h3>
        <p className="mt-1 text-xs text-ink-600">The column contains values that need an explicit mapping before conversion.</p>
        <div className="mt-3 space-y-2">
          {mappings.map((mapping, index) => (
            <div key={`${mapping.source}-${index}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <span className="truncate rounded-md bg-paper-50 px-2 py-1.5 text-xs" title={mapping.source}>{mapping.source}</span>
              <span className="text-xs text-ink-600/50">→</span>
              <GlobalSelect value={mapping.target === null ? '' : mapping.target ? 'true' : 'false'} onChange={(value) => setMappings((prev) => prev.map((m, i) => i === index ? { ...m, target: value === '' ? null : value === 'true' } : m))} className={menuInput}>
                <option value="">Unmapped / empty</option>
                <option value="true">True</option>
                <option value="false">False</option>
              </GlobalSelect>
            </div>
          ))}
        </div>
        {invalid && <p className="mt-3 text-xs font-medium text-red-600">Every non-empty source value must be mapped to True or False.</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="modal-cancel-button">Cancel</button>
          <button type="button" disabled={invalid} onClick={() => onApply(mappings)} className="focus-ring rounded-md bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Convert</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   ROW
   ================================================================ */

function RowBase({
  row,
  displayIndex,
  report,
  design,
  density,
  selected,
  onToggleSelect,
  onInspect,
  columnRawIndex,
  editing,
  selectedCell,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onAddRow,
  onCopyCell,
  onPasteCell,
  onAddCell,
  onDeleteCell,
  onInsertCellBoundary,
  onOpenCellMenu,
  onOpenCellModal,
  cellActionOpen,
  hasCopiedCell
}: {
  row: ReportRow;
  displayIndex: number;
  report: ProcessedReport;
  design: ExtractSettings;
  density: string;
  selected: boolean;
  onToggleSelect: () => void;
  onInspect: () => void;
  columnRawIndex: Record<
    string,
    number
  >;

  editing: { sourceIndex: number; colKey: string } | null;
  selectedCell: { sourceIndex: number; colKey: string } | null;

  onStartEdit: (colKey: string, edit?: boolean) => void;

  onCommitEdit: (
    sourceIndex: number,
    columnIndex: number,
    newValue: CellValue
  ) => void;

  onCancelEdit: () => void;
  onAddRow: () => void;
  onCopyCell: (sourceIndex: number, columnKey: string) => void;
  onPasteCell: (sourceIndex: number, columnKey: string, mode?: 'replace' | 'insert-before' | 'insert-after') => void;
  onAddCell: (sourceIndex: number, columnKey: string, position?: 'before' | 'after') => void;
  onOpenCellMenu: (sourceIndex: number, columnKey: string) => void;
  onOpenCellModal: (sourceIndex: number, columnKey: string, choice: 'add' | 'paste' | 'delete') => void;
  cellActionOpen: { sourceIndex: number; columnKey: string } | null;
  hasCopiedCell: boolean;
}) {
  const holdTimer = useRef<number | null>(null);
  const startHold = (sourceIndex: number, columnKey: string) => { holdTimer.current = window.setTimeout(() => onOpenCellMenu(sourceIndex, columnKey), 500); };
  const clearHold = () => { if (holdTimer.current !== null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; } };
  return (
    <tr
      className={[
        'border-b border-ink-100 group',
        selected
          ? 'bg-blue-50'
          : 'hover:bg-paper-100/70'
      ].join(' ')}
    >
      {/* Combined checkbox + S.No column. Keeping both in one physical
          table column keeps the selector/index aligned with the grid while
          the horizontal table scrolls. */}
      <td
        className={`px-2 ${density} align-top border-r border-ink-100`}
        style={{ width: 92, minWidth: 92 }}
      >
        <div className="grid grid-cols-[40px_1fr] items-center">
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              aria-label={`Select row ${displayIndex}`}
              checked={selected}
              onChange={onToggleSelect}
              className="focus-ring h-4 w-4 shrink-0 accent-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={onInspect}
            className="focus-ring min-w-5 text-center font-mono text-[11px] text-ink-600/50 hover:text-blue-600"
            title="Why is this row included?"
          >
            {displayIndex}
          </button>
        </div>
      </td>

      {/* ==========================================================
          DATA CELLS
         ========================================================== */}

      <ColumnInsertBodyCell />

      {row.values.map(
        (value, index) => {
          const column =
            report.columns[index];
          if (!column) return null;

          const isEditing =
            editing &&
            editing.sourceIndex ===
              row.sourceIndex &&
            editing.colKey ===
              column.key;

          const text =
            displayCell(
              value,
              column.dataType,
              column.settings
            );

          if (isEditing) {
            return (
              <React.Fragment key={`edit-${column.key}`}>
              <EditableCell
                key={column.key}
                value={value}
                displayText={text}
                dataType={column.dataType}
                percentageEnabled={column.settings.percentageEnabled}
                onCommit={(
                  newValue
                ) => {
                  const colIndex =
                    columnRawIndex[
                      column.key
                    ];

                  if (
                    colIndex !==
                    undefined
                  ) {
                    onCommitEdit(
                      row.sourceIndex,
                      colIndex,
                      newValue
                    );
                  }

                  onCancelEdit();
                }}
                onCancel={
                  onCancelEdit
                }
                density={density}
              />
              <ColumnInsertBodyCell />
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={column.key}>
            <td
              key={column.key}
              style={{
                width: column.settings.width,
                minWidth: column.settings.width,
                textAlign: column.settings.alignment,
                whiteSpace: column.settings.wrapping === 'wrap' ? 'normal' : 'nowrap',
                overflowWrap: column.settings.wrapping === 'wrap' ? 'anywhere' : 'normal'
              }}
              className={[
                `px-3 ${density}`,
                'align-top',
                'max-w-[640px]',
                column.settings.wrapping === 'truncate' ? 'truncate' : '',
                'cursor-cell',
                'relative',
                'hover:bg-blue-50',
                selectedCell?.sourceIndex === row.sourceIndex && selectedCell?.colKey === column.key ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''
              ].join(' ')}
              title={text ? `${text} · single click selects · double click edits` : 'single click selects · double click edits'}
              onClick={() => onStartEdit(column.key, false)}
              onDoubleClick={() => onStartEdit(column.key, true)}
              onContextMenu={(e) => { e.preventDefault(); onOpenCellMenu(row.sourceIndex, column.key); }}
              onPointerDown={() => startHold(row.sourceIndex, column.key)}
              onPointerUp={clearHold}
              onPointerLeave={clearHold}
              onPointerCancel={clearHold}
            >
              {selectedCell?.sourceIndex === row.sourceIndex && selectedCell?.colKey === column.key && (
                <>
                  {cellActionOpen?.sourceIndex === row.sourceIndex && cellActionOpen?.columnKey === column.key ? (
                    <div className="absolute inset-0 z-20 grid grid-cols-4 overflow-hidden rounded-[inherit] bg-white/98 backdrop-blur-[2px]" role="group" aria-label="Cell quick actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" title="Delete cell" aria-label="Delete cell" onClick={() => { onOpenCellModal(row.sourceIndex, column.key, 'delete'); }} className="focus-ring flex min-w-0 items-center justify-center border-r border-ink-200 text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"><Trash2 className="h-4 w-4"/></button>
                      <button type="button" title="Copy cell" aria-label="Copy cell" onClick={() => { onCopyCell(row.sourceIndex, column.key); onOpenCellMenu(row.sourceIndex, column.key); }} className="focus-ring flex min-w-0 items-center justify-center border-r border-ink-200 text-ink-700 transition-colors hover:bg-paper-100 active:bg-paper-200"><Copy className="h-4 w-4"/></button>
                      <button type="button" title={hasCopiedCell ? 'Paste cell' : 'Paste unavailable until a cell is copied'} aria-label="Paste cell" disabled={!hasCopiedCell} onClick={() => { onOpenCellModal(row.sourceIndex, column.key, 'paste'); }} className="focus-ring flex min-w-0 items-center justify-center border-r border-ink-200 text-blue-600 transition-colors hover:bg-blue-50 active:bg-blue-100 disabled:cursor-not-allowed disabled:text-ink-300"><Clipboard className="h-4 w-4"/></button>
                      <button type="button" title="Close cell actions" aria-label="Close cell actions" onClick={() => onOpenCellMenu(row.sourceIndex, column.key)} className="focus-ring flex min-w-0 items-center justify-center text-ink-600 transition-colors hover:bg-paper-100 active:bg-paper-200"><X className="h-4 w-4"/></button>
                    </div>
                  ) : (
                    <button type="button" aria-label="Open cell actions" title="Cell actions" onClick={(e) => { e.stopPropagation(); onOpenCellMenu(row.sourceIndex, column.key); }} onPointerDown={(e) => { e.stopPropagation(); }} className="focus-ring absolute right-1 top-1 z-20 flex h-7 w-7 items-center justify-center rounded-md bg-white/95 text-ink-600 shadow-sm ring-1 ring-ink-200 transition-colors hover:bg-white hover:text-ink-900 active:bg-paper-100">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  )}
                  {selectedCell?.sourceIndex === row.sourceIndex && selectedCell?.colKey === column.key && !isEditing && !(cellActionOpen?.sourceIndex === row.sourceIndex && cellActionOpen?.columnKey === column.key) && (
                    <>
                      <button
                        type="button"
                        aria-label="Insert empty cell before selected cell"
                        title="Insert empty cell before selected cell"
                        onClick={(e) => { e.stopPropagation(); onInsertCellBoundary(row.sourceIndex, column.key, 'top'); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="cell-insert-boundary cell-insert-before focus-ring absolute left-1/2 z-40 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-md border border-blue-300 bg-white text-blue-700 shadow-sm transition-transform hover:scale-105 hover:bg-blue-50 active:scale-95"
                      >
                        <Plus className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        aria-label="Insert empty cell after selected cell"
                        title="Insert empty cell after selected cell"
                        onClick={(e) => { e.stopPropagation(); onInsertCellBoundary(row.sourceIndex, column.key, 'bottom'); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="cell-insert-boundary cell-insert-after focus-ring absolute left-1/2 z-40 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-md border border-blue-300 bg-white text-blue-700 shadow-sm transition-transform hover:scale-105 hover:bg-blue-50 active:scale-95"
                      >
                        <Plus className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </>
                  )}
                </>
              )}
              {text === '' ? (
                <span className="text-ink-200">—</span>
              ) : column.dataType === 'url' && column.settings.openLinks && (!column.settings.validateUrl || (() => { try { new URL(String(value)); return true; } catch { return false; } })()) ? (
                <a
                  href={String(value)}
                  target={column.settings.openInNewTab ? '_blank' : undefined}
                  rel={column.settings.openInNewTab ? 'noreferrer' : undefined}
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 underline decoration-blue-200 underline-offset-2 hover:decoration-blue-500"
                >
                  {text}
                </a>
              ) : text}
            </td>
            <ColumnInsertBodyCell />
            </React.Fragment>
          );
        }
      )}
      <TableEndSpacer />

    </tr>
  );
}

/* ================================================================
   EDITABLE CELL
   ================================================================ */

function EditableCell({
  value,
  displayText,
  dataType,
  percentageEnabled,
  onCommit,
  onCancel,
  density
}: {
  value: CellValue;
  displayText: string;
  dataType: import('../types/dataset').DataType;
  percentageEnabled: boolean;
  onCommit: (
    value: CellValue
  ) => void;
  onCancel: () => void;
  density: string;
}) {
  const toast = useToast();
  /*
   * Initialize the draft from the formatted display text (what the user
   * actually saw before clicking to edit) rather than the raw underlying
   * value. This matters a lot for dates (raw value might be an ISO
   * string or an Excel serial number) and currency-formatted numbers —
   * without this, editing a cell would show a confusing raw value
   * instead of what was on screen.
   */
  const [draft, setDraft] =
    useState(displayText);

  const commit = () => {
    const trimmed =
      draft.trim();

    if (trimmed === '') {
      onCommit(null);
      return;
    }

    /*
     * Type-aware commit: decide how to parse the typed text based on the
     * COLUMN's data type, not the previous cell's JS `typeof`. Using
     * `typeof value` broke as soon as the cell being edited was empty
     * (null) — typing a number or a date into an empty cell in a
     * numeric/date column silently saved it as a plain string, which
     * then behaved incorrectly in sorts, filters, and calculations.
     */
    if (dataType === 'number') {
      const percentageText = trimmed.endsWith('%') ? trimmed.slice(0, -1).trim() : trimmed;
      const parsed = toNumber(percentageText);
      if (parsed !== null && (!trimmed.endsWith('%') || percentageEnabled)) { onCommit(parsed); return; }
      toast.push('Invalid number. No data was changed.', 'error');
      onCancel();
      return;
    }

    if (dataType === 'boolean') {
      const lower =
        trimmed.toLowerCase();

      if (
        ['true', 'yes', 'y', '1'].includes(
          lower
        )
      ) {
        onCommit(true);
        return;
      }

      if (
        ['false', 'no', 'n', '0'].includes(
          lower
        )
      ) {
        onCommit(false);
        return;
      }

      toast.push('Invalid Boolean value. Use True/False, Yes/No, or 1/0.', 'error');
      onCancel();
      return;
    }

    if (dataType === 'date') {
      const parsed =
        toDate(trimmed);

      if (parsed) {
        // Store as a stable ISO date string, matching how dates are
        // normalized everywhere else in the pipeline (see
        // adapters/normalize.ts), regardless of what format the user
        // typed it in.
        const yyyy =
          parsed.getFullYear();

        const mm = String(
          parsed.getMonth() + 1
        ).padStart(2, '0');

        const dd = String(
          parsed.getDate()
        ).padStart(2, '0');
        const hh = String(parsed.getHours()).padStart(2, '0');
        const mi = String(parsed.getMinutes()).padStart(2, '0');
        const ss = String(parsed.getSeconds()).padStart(2, '0');
        onCommit(
          parsed.getHours() || parsed.getMinutes() || parsed.getSeconds()
            ? `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`
            : `${yyyy}-${mm}-${dd}`
        );

        return;
      }

      toast.push('Invalid date. No data was changed.', 'error');
      onCancel();
      return;
    }

    if (dataType === 'url') {
      try {
        const parsed = new URL(trimmed);
        if (!/^https?:$/i.test(parsed.protocol)) throw new Error('protocol');
        onCommit(trimmed);
      } catch {
        toast.push('Invalid HTTP(S) URL. No data was changed.', 'error');
        onCancel();
      }
      return;
    }
    onCommit(trimmed);
  };

  return (
    <td
      className={[
        /*
         * Keep the cell itself borderless.
         *
         * The input owns the single visible
         * active/editing border.
         */
        `px-1.5 ${density}`,
        'align-top',
        'bg-blue-50'
      ].join(' ')}
    >
      {/*
       * IMPORTANT:
       *
       * Previously this had:
       *
       * focus-ring
       * border border-blue-500
       *
       * The custom focus-ring plus the border
       * produced the dual-border appearance.
       *
       * Now the input uses exactly one border.
       */}
      <input
        autoFocus
        type="text"
        value={draft}
        aria-label="Edit cell value"
        onChange={(event) =>
          setDraft(
            event.target.value
          )
        }
        onBlur={commit}
        onKeyDown={(event) => {
          if (
            event.key ===
            'Enter'
          ) {
            event.preventDefault();

            commit();
          } else if (
            event.key ===
            'Escape'
          ) {
            event.preventDefault();

            onCancel();
          }
        }}
        className={[
          'w-full',
          'min-w-[80px]',
          'box-border',
          'rounded',
          'border',
          'border-blue-500',
          'bg-white',
          'px-1.5',
          'py-1',
          'text-sm',
          'text-ink-900',
          'transition-colors',

          // Single focus treatment.
          'focus:outline-none',
          'focus:ring-0',
          'focus:border-blue-600'
        ].join(' ')}
      />
    </td>
  );
}

/**
 * Zoom controls update frequently, but zoom itself does not change any row
 * data. Keep the expensive cell tree out of those React renders. Function
 * props are intentionally ignored here because the row's meaningful inputs
 * (data, selection, editing/menu state and design) are compared below.
 */
const Row = React.memo(RowBase, (prev, next) => (
  prev.row === next.row &&
  prev.displayIndex === next.displayIndex &&
  prev.report === next.report &&
  prev.design === next.design &&
  prev.density === next.density &&
  prev.selected === next.selected &&
  prev.editing === next.editing &&
  prev.selectedCell === next.selectedCell &&
  prev.cellActionOpen === next.cellActionOpen &&
  prev.hasCopiedCell === next.hasCopiedCell &&
  prev.columnRawIndex === next.columnRawIndex
));

/* ================================================================
   ROW INSPECTOR
   ================================================================ */

function RowInspector({
  row,
  displayIndex,
  report,
  onClose
}: {
  row: ReportRow;
  displayIndex: number;
  report: ProcessedReport;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-950/40 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-panel p-5 animate-sheet-up sm:animate-fade-in"
        style={{
          paddingBottom:
            'calc(var(--safe-bottom) + 20px)'
        }}
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg text-ink-900">
            Row {displayIndex}
          </h3>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close row inspector"
            title="Close"
            className="focus-ring h-7 w-7 rounded-full hover:bg-paper-100 flex items-center justify-center text-ink-600"
          >
            ✕
          </button>
        </div>

        {row.matchedFilters
          .length > 0 ? (
          <div className="mb-4">
            <p className="text-xs font-medium text-ink-600/70 mb-1.5">
              Why is this row included?
            </p>

            <ul className="space-y-1">
              {row.matchedFilters.map(
                (match) => (
                  <li
                    key={match}
                    className="text-sm text-ink-900 flex items-start gap-1.5"
                  >
                    <span className="text-blue-600 mt-0.5">
                      ✓
                    </span>

                    <span>
                      {match}
                    </span>
                  </li>
                )
              )}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-ink-600/70 mb-4">
            No filters are active —
            every row from the
            selected range is included.
          </p>
        )}

        <div className="border-t border-ink-100 pt-3 max-h-64 overflow-auto thin-scroll">
          {report.columns.map(
            (column, index) => (
              <div
                key={column.key}
                className="flex justify-between gap-4 py-1 text-sm"
              >
                <span className="text-ink-600/60">
                  {
                    column.displayName
                  }
                </span>

                <span className="text-ink-900 font-medium text-right">
                  {String(
                    row.values[index] ??
                      '—'
                  )}
                </span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   EMPTY STATE
   ================================================================ */


function FastRowNavigator({
  viewportRef,
  rowCount,
  rowHeight,
  zoom
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  rowCount: number;
  rowHeight: number;
  zoom: number;
}) {
  const [metrics, setMetrics] = useState({ top: 0, thumb: 84, track: 0, currentRow: 1 });
  const dragging = useRef<{ startY: number; startTop: number } | null>(null);
  const raf = useRef<number | null>(null);

  const refresh = useCallback(() => {
    const v = viewportRef.current;
    if (!v) return;
    const visible = v.clientHeight;
    const track = Math.max(1, visible - 20);
    const maxScroll = Math.max(1, v.scrollHeight - visible);
    const ratio = Math.max(0, Math.min(1, v.scrollTop / maxScroll));
    const thumb = Math.max(72, Math.min(track * 0.34, (visible * visible) / Math.max(visible, v.scrollHeight) * track));
    const maxTop = Math.max(1, track - thumb);
    const dataTop = Math.max(0, v.scrollTop - 68 * zoom);
    const row = Math.min(rowCount, Math.max(1, Math.floor(dataTop / Math.max(1, rowHeight * zoom)) + 1));
    setMetrics({ top: ratio * maxTop, thumb, track, currentRow: row });
  }, [viewportRef, rowCount, rowHeight, zoom]);

  useEffect(() => {
    refresh();
    const v = viewportRef.current;
    if (!v) return;
    const onScroll = () => {
      if (raf.current !== null) return;
      raf.current = requestAnimationFrame(() => { raf.current = null; refresh(); });
    };
    v.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(refresh);
    ro.observe(v);
    return () => {
      v.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [refresh]);

  const scrollToRatio = useCallback((ratio: number) => {
    const v = viewportRef.current;
    if (!v) return;
    v.scrollTop = Math.max(0, Math.min(1, ratio)) * Math.max(0, v.scrollHeight - v.clientHeight);
  }, [viewportRef]);

  const scrollToRow = useCallback((row: number) => {
    const v = viewportRef.current;
    if (!v || rowCount < 1) return;
    const safe = Math.max(1, Math.min(rowCount, Math.round(row)));
    v.scrollTo({ top: (safe - 1) * rowHeight * zoom, behavior: 'smooth' });
  }, [viewportRef, rowCount, rowHeight, zoom]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    const ratio = Math.max(0, Math.min(1, (d.startTop + event.clientY - d.startY) / Math.max(1, metrics.track - metrics.thumb)));
    scrollToRatio(ratio);
  }, [metrics.track, metrics.thumb, scrollToRatio]);

  const stopDrag = useCallback(() => {
    dragging.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDrag);
  }, [onPointerMove]);

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragging.current = { startY: event.clientY, startTop: metrics.top };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
  };

  const onTrack = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    scrollToRatio((event.clientY - rect.top) / rect.height);
  };

  if (rowCount < 40) return null;

  return (
    <div
      className="fast-row-nav"
      role="scrollbar"
      aria-label={`Fast row navigator, ${rowCount.toLocaleString()} rows`}
      aria-valuemin={1}
      aria-valuemax={Math.max(1, rowCount)}
      aria-valuenow={metrics.currentRow}
      onPointerDown={onTrack}
    >
      <button type="button" className="fast-row-nav-btn" aria-label="Jump to top" title="Top" onPointerDown={(e) => e.stopPropagation()} onClick={() => scrollToRow(1)}>↑</button>
      <div className="fast-row-nav-track">
        <div className="fast-row-nav-progress" style={{ height: metrics.top + metrics.thumb }} />
        <div
          className="fast-row-nav-thumb"
          style={{ top: metrics.top, height: metrics.thumb }}
          onPointerDown={startDrag}
          title={`Drag to navigate rows · currently ${metrics.currentRow.toLocaleString()}`}
        >
          <span className="fast-row-nav-grip" aria-hidden="true" />
        </div>
      </div>
      <div className="fast-row-nav-label" aria-hidden="true">{metrics.currentRow.toLocaleString()}</div>
      <button type="button" className="fast-row-nav-btn" aria-label="Jump to bottom" title="Bottom" onPointerDown={(e) => e.stopPropagation()} onClick={() => scrollToRow(rowCount)}>↓</button>
    </div>
  );
}

function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="h-11 w-11 rounded-full bg-paper-100 flex items-center justify-center text-ink-600/40 mb-4">
        ◻
      </div>

      <h3 className="text-ink-900 font-medium mb-1">
        {title}
      </h3>

      <p className="text-sm text-ink-600/60 max-w-xs">
        {description}
      </p>
    </div>
  );
}