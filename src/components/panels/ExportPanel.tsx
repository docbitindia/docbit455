import React, { useState } from 'react';
import type {
  DatasetSchema,
  RawDataset
} from '../../types/dataset';
import type { ProcessedReport } from '../../types/processed';
import type {
  ExtractSettings,
  ReportConfig
} from '../../types/report';
import {
  exportCsv,
  exportExcel,
  exportJson,
  validateBeforeExport,
  type ExportFormat
} from '../../export';
import { useToast } from '../../hooks/useToast';
import {
  StepChecklist,
  type ChecklistStep
} from '../StepChecklist';
import { formatFileSize, displayCell } from '../../utils/format';
import { FileTypeIcon } from '../FileTypeIcon';

interface Props {
  raw: RawDataset;
  schema: DatasetSchema;
  report: ProcessedReport;
  config: ReportConfig;
  update: (
    updater: (prev: ReportConfig) => ReportConfig
  ) => void;
}

const FORMATS: {
  id: ExportFormat;
  label: string;
  desc: string;
}[] = [
  {
    id: 'excel',
    label: 'Excel',
    desc: '.xlsx workbook, ready to reopen and adjust'
  },
  {
    id: 'csv',
    label: 'CSV',
    desc: 'Plain comma-separated values'
  },
  {
    id: 'json',
    label: 'JSON',
    desc: 'Structured records for developers'
  }
];

const PREP_STEPS: ChecklistStep[] = [
  {
    id: 'validate',
    label: 'Dataset validated'
  },
  {
    id: 'filters',
    label: 'Filters applied'
  },
  {
    id: 'sort',
    label: 'Sorting applied'
  },
  {
    id: 'calc',
    label: 'Calculations completed'
  },
  {
    id: 'prep',
    label: 'Extraction prepared'
  }
];

export function ExportPanel({
  raw,
  schema,
  report,
  config,
  update
}: Props) {
  const [busy, setBusy] =
    useState<ExportFormat | null>(null);

  const [prepIndex, setPrepIndex] =
    useState(-1);

  const toast = useToast();

  const validation =
    validateBeforeExport(
      report,
      config.design
    );

  const design = config.design;

  const setDesign = (
    patch: Partial<ExtractSettings>
  ) => {
    update((prev) => ({
      ...prev,
      design: {
        ...prev.design,
        ...patch
      }
    }));
  };

  const runExport = async (
    format: ExportFormat
  ) => {
    if (!validation.ok) {
      toast.push(
        validation.problems[0],
        'error'
      );
      return;
    }

    setBusy(format);
    setPrepIndex(0);

    try {
      /*
       * Each step represents a stage of the
       * already-computed extraction pipeline.
       */
      for (
        let i = 0;
        i < PREP_STEPS.length;
        i++
      ) {
        setPrepIndex(i);

        await new Promise<void>(
          (resolve) =>
            requestAnimationFrame(() =>
              setTimeout(resolve, 60)
            )
        );
      }

      if (format === 'excel') {
        exportExcel(
          report,
          config.design
        );
      } else if (format === 'csv') {
        exportCsv(
          report,
          config.design
        );
      } else {
        exportJson(
          report,
          config.design
        );
      }

      const label =
        FORMATS.find(
          (f) => f.id === format
        )?.label ?? format;

      toast.push(
        `${label} Exported`,
        'success'
      );
    } catch {
      toast.push(
        "We couldn't generate that export. Please try again.",
        'error'
      );
    } finally {
      setBusy(null);
      setPrepIndex(-1);
    }
  };

  return (
    <>
    <div className="space-y-5">

      {/* ==========================================================
          OVERVIEW
         ========================================================== */}

      <OverviewCard
        raw={raw}
        schema={schema}
        report={report}
      />


      {/* ==========================================================
          VALIDATION
         ========================================================== */}

      {!validation.ok && (
        <div className="rounded-lg border border-rose-500/25 bg-rose-100 px-3.5 py-3">
          <p className="text-xs font-semibold text-rose-500 mb-1">
            Fix these before exporting
          </p>

          <ul className="text-xs text-rose-500/90 space-y-0.5 list-disc list-inside">
            {validation.problems.map(
              (problem) => (
                <li key={problem}>
                  {problem}
                </li>
              )
            )}
          </ul>
        </div>
      )}

      {/* ==========================================================
          EXPORT SETTINGS
         ========================================================== */}

      <section className="rounded-xl border border-ink-200 overflow-hidden">
        <div className="px-3.5 py-3 bg-paper-50 border-b border-ink-100">
          <p className="text-sm font-semibold text-ink-900">
            Export settings
          </p>
        </div>

        <div className="p-3.5 space-y-4">
          <Field label="File name">
            <input
              value={design.fileName}
              onChange={(event) =>
                setDesign({
                  fileName:
                    event.target.value
                })
              }
              placeholder="extracted_data"
              className={[
                'w-full',
                'rounded-md',
                'border',
                'border-ink-200',
                'bg-white',
                'px-2.5 py-2',
                'text-sm',
                'text-ink-900',
                'outline-none',
                'transition-colors',
                'hover:border-ink-300',
                'focus:border-[#2563EB]'
              ].join(' ')}
            />
          </Field>
        </div>
      </section>

      {/* ==========================================================
          PREPARING EXTRACTION
         ========================================================== */}

      {busy && (
        <div
          className={[
            'rounded-lg',
            'border border-[#2563EB]/20',
            'bg-blue-50/60',
            'px-4 py-3.5',
            'animate-fade-in'
          ].join(' ')}
        >
          <p className="text-xs font-semibold text-[#2563EB] mb-2.5">
            Preparing extraction
          </p>

          <StepChecklist
            steps={PREP_STEPS}
            activeIndex={prepIndex}
            complete={false}
          />
        </div>
      )}

      {/* ==========================================================
          EXPORT PREVIEW
         ========================================================== */}

      <section className="rounded-xl border border-ink-200 overflow-hidden">
        <div className="px-3.5 py-3 bg-paper-50 border-b border-ink-100">
          <p className="text-sm font-semibold text-ink-900">Export preview</p>
          <p className="mt-0.5 text-[10.5px] text-ink-600/55">First five records using the committed normalized values and column settings.</p>
        </div>
        <div className="overflow-x-auto thin-scroll">
          <table className="min-w-full text-[11px]">
            <thead className="bg-white sticky top-0"><tr>{report.columns.map((c) => <th key={c.key} className="px-2.5 py-2 text-left font-semibold whitespace-nowrap border-b border-ink-100">{c.displayName}</th>)}</tr></thead>
            <tbody>{report.rows.slice(0, 5).map((row) => <tr key={row.id} className="border-b border-ink-100 last:border-0">{row.values.map((value, i) => <td key={report.columns[i].key} className="px-2.5 py-2 whitespace-nowrap">{displayCell(value, report.columns[i].dataType, report.columns[i].settings) || '—'}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>

      {/* ==========================================================
          EXPORT FORMATS
         ========================================================== */}

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-600/50 mb-2">
          Extract as
        </p>

        <div className="space-y-2">
          {FORMATS.map((format) => (
            <FormatButton
              key={format.id}
              format={format}
              busy={busy}
              disabled={
                !validation.ok ||
                busy !== null
              }
              onClick={() =>
                runExport(format.id)
              }
            />
          ))}
        </div>
      </section>
    </div>
    </>
  );
}

/* ================================================================
   OVERVIEW CARD
   ================================================================ */

function OverviewCard({
  raw,
  schema,
  report
}: {
  raw: RawDataset;
  schema: DatasetSchema;
  report: ProcessedReport;
}) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white overflow-hidden">

      <div className="px-3 py-2 border-b border-ink-100 bg-paper-50 flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink-900 truncate">
            {raw.meta.fileName}
          </p>

          <p className="text-[10.5px] text-ink-600/55">
            {raw.meta.fileType.toUpperCase()}
            {' · '}
            {formatFileSize(
              raw.meta.fileSize
            )}
            {' · '}
            Header row{' '}
            {schema.headerRowIndex + 1}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-ink-100">
        <Stat
          label="Included rows"
          value={report.stats.finalRowCount.toLocaleString()}
        />

        <Stat
          label="Included columns"
          value={`${report.stats.selectedColumnCount}/${report.stats.totalColumnCount}`}
        />

        <Stat
          label="Excluded rows"
          value={report.stats.excludedRowCount.toLocaleString()}
        />

        <Stat
          label="Active filters"
          value={String(
            report.stats.activeFilterCount
          )}
        />
      </div>

      <div className="px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-ink-600/55 border-t border-ink-100">
        <span>
          Rows in file:{' '}
          {raw.rows.length.toLocaleString()}
        </span>

        <span>
          Calculations:{' '}
          {report.summaries.length}
        </span>

        {report.stats.isGrouped && (
          <span>
            Groups:{' '}
            {report.groups?.length ?? 0}
          </span>
        )}
      </div>
    </section>
  );
}

/* ================================================================
   STAT
   ================================================================ */

function Stat({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white px-3 py-2">
      <p className="text-[15px] font-semibold text-ink-900 leading-tight tabular-nums">
        {value}
      </p>

      <p className="text-[10px] text-ink-600/55">
        {label}
      </p>
    </div>
  );
}

/* ================================================================
   FORMAT BUTTON
   ================================================================ */

function FormatButton({
  format,
  busy,
  disabled,
  onClick
}: {
  format: (typeof FORMATS)[number];
  busy: ExportFormat | null;
  disabled: boolean;
  onClick: () => void;
}) {
  const isBusy =
    busy === format.id;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'focus-ring',
        'w-full',
        'flex items-center',
        'justify-between',
        'rounded-lg',
        'px-3.5 py-3',
        'text-left',
        'transition-colors',
        'border',
        'border-ink-200',
        'bg-white',
        'hover:border-[#2563EB]/50',
        'hover:bg-blue-50/40',
        'active:bg-blue-100/60',
        'disabled:opacity-50',
        'disabled:hover:border-ink-200',
        'disabled:hover:bg-white'
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center gap-3">
        <FileTypeIcon type={format.id} size={34} className="shrink-0" />
        <div className="min-w-0">
        <p className="text-sm font-medium text-ink-900">
          {format.label}
        </p>

        <p className="text-xs text-ink-600/60">
          {format.desc}
        </p>
        </div>
      </div>

      {isBusy ? (
        <div
          className={[
            'h-4 w-4',
            'rounded-full',
            'border-2',
            'animate-spin',
            'shrink-0',
            'border-ink-200',
            'border-t-[#2563EB]'
          ].join(' ')}
          aria-label={`Preparing ${format.label} export`}
        />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-ink-600/40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v13"/><path d="m6 11 6 6 6-6"/></svg>
      )}
    </button>
  );
}

/* ================================================================
   FIELD
   ================================================================ */

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="block text-xs font-semibold uppercase tracking-wide text-ink-600/60 mb-1.5">
        {label}
      </span>

      {children}
    </div>
  );
}