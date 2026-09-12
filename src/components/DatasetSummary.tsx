import React from 'react';
import type {
  DatasetSchema,
  RawDataset
} from '../types/dataset';
import { formatFileSize } from '../utils/format';
import { FileTypeIcon, fileTypeFromName } from './FileTypeIcon';

interface Props {
  raw: RawDataset;
  schema: DatasetSchema;
  onContinue: () => void;
}

const TYPE_META: {
  key:
    | 'string'
    | 'number'
    | 'date'
    | 'boolean'
    | 'empty'
    | 'mixed';
  label: string;
  color: string;
}[] = [
  {
    key: 'string',
    label: 'Text',
    color: 'bg-ink-600'
  },
  {
    key: 'number',
    label: 'Numbers',
    color: 'bg-[#2563EB]'
  },
  {
    key: 'date',
    label: 'Dates',
    color: 'bg-[#f7f8f6]0'
  },
  {
    key: 'boolean',
    label: 'Boolean',
    color: 'bg-ink-700'
  },
  {
    key: 'mixed',
    label: 'Mixed',
    color: 'bg-rose-500'
  },
  {
    key: 'empty',
    label: 'Empty',
    color: 'bg-ink-200'
  }
];

export function DatasetSummary({
  raw,
  schema,
  onContinue,
}: Props) {
  /* ================================================================
     DATASET STATS
     ================================================================ */

  const recordCount = Math.max(0, schema.dataEndIndex - schema.dataStartIndex);
  const sourceRowCount = raw.meta.totalRows ?? raw.rows.length;
  const isLargePreview = Boolean(raw.meta.isLargeFile && sourceRowCount > raw.rows.length);

  const fieldCount =
    schema.columns.length;

  const counts =
    schema.columns.reduce<
      Record<string, number>
    >((acc, column) => {
      acc[column.dataType] =
        (acc[column.dataType] ?? 0) + 1;

      return acc;
    }, {});

  const detectedTypes =
    TYPE_META.filter(
      (type) => counts[type.key] > 0
    );

  const warningCount =
    schema.quality.filter(
      (quality) =>
        quality.severity === 'warning'
    ).length;

  const hasQualityIssues =
    warningCount > 0;

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <div className="max-w-xl w-full mx-auto animate-fade-in">

      <section
        aria-labelledby="dataset-summary-title"
        className={[
          'rounded-2xl',
          'border border-ink-200',
          'bg-white',
          'shadow-panel',
          'overflow-hidden'
        ].join(' ')}
      >

        {/* ==========================================================
            HEADER
           ========================================================== */}

        <header className="px-5 sm:px-6 pt-5 pb-4 border-b border-ink-100">

          <div className="flex items-start justify-between gap-3">

            <div className="min-w-0 flex items-center gap-3">
              <FileTypeIcon type={fileTypeFromName(raw.meta.fileName)} size={30} />
              <div className="min-w-0">

              <p className="text-[11px] font-mono uppercase tracking-wide text-[#2563EB] mb-1">
                Dataset analyzed
              </p>

              <h1
                id="dataset-summary-title"
                className="font-display text-lg text-ink-900 truncate"
                title={raw.meta.fileName}
              >
                {raw.meta.fileName}
              </h1>

              <p className="text-xs text-ink-600/60 mt-0.5">
                {formatFileSize(
                  raw.meta.fileSize
                )}{' '}
                ·{' '}
                {raw.meta.fileType.toUpperCase()}
              </p>

            </div></div>

          </div>
        </header>

        {/* ==========================================================
            CONTENT
           ========================================================== */}

        <div className="px-5 sm:px-6 py-4 space-y-4">
          {isLargePreview && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3"><p className="text-xs font-semibold text-amber-900">Large file opened incrementally</p><p className="mt-1 text-[11px] leading-5 text-amber-800/80">DocBit scanned {sourceRowCount.toLocaleString()} source rows while keeping a bounded {raw.rows.length.toLocaleString()}-row working preview in browser memory. This prevents a very large file from freezing the page.</p></div>}

          {/* ========================================================
              ROWS × COLUMNS
             ======================================================== */}

          <div
            aria-label={`${recordCount.toLocaleString()} rows and ${fieldCount.toLocaleString()} columns`}
            className={[
              'flex',
              'items-center',
              'justify-center',
              'gap-5',
              'rounded-xl',
              'border border-ink-100',
              'bg-paper-50',
              'px-4',
              'py-3'
            ].join(' ')}
          >

            <div className="min-w-[70px] text-center">
              <p className="text-lg font-semibold text-ink-900 tabular-nums">
                {recordCount.toLocaleString()}
              </p>

              <p className="text-[10px] uppercase tracking-wide text-ink-600/50">
                Rows
              </p>
            </div>

            <span
              aria-hidden="true"
              className="text-lg font-medium text-ink-600/30"
            >
              ×
            </span>

            <div className="min-w-[70px] text-center">
              <p className="text-lg font-semibold text-ink-900 tabular-nums">
                {fieldCount.toLocaleString()}
              </p>

              <p className="text-[10px] uppercase tracking-wide text-ink-600/50">
                Columns
              </p>
            </div>

          </div>

          {/* ========================================================
              DETECTED DATA TYPES
             ======================================================== */}

          {detectedTypes.length > 0 && (
            <div>

              <div className="flex items-center justify-between mb-2">

                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-600/60">
                  Detected fields
                </h2>

                

              </div>

              <div className="flex flex-wrap gap-1.5">

                {detectedTypes.map(
                  (type) => (
                    <div
                      key={type.key}
                      className={[
                        'inline-flex',
                        'items-center',
                        'gap-1.5',
                        'rounded-full',
                        'border border-ink-100',
                        'bg-white',
                        'px-2.5',
                        'py-1'
                      ].join(' ')}
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          'h-1.5',
                          'w-1.5',
                          'rounded-full',
                          type.color
                        ].join(' ')}
                      />
<span className="text-[10.5px] font-medium text-ink-700">
                        {type.label}
                      </span>

                      <span className="text-[10px] font-mono text-ink-600/45">
                        {counts[type.key]}
                      </span>
                      
                    </div>
                  )
                )}

              </div>
            </div>
          )}

          {/* ========================================================
              HEADER DETECTION
             ======================================================== */}

          <div
            className={[
              'rounded-xl',
              'border border-blue-100',
              'bg-blue-50/60',
              'px-3.5',
              'py-3'
            ].join(' ')}
          >

            <div className="flex items-center justify-between gap-3">

              <div className="flex items-center gap-2.5 min-w-0">

                <span
                  aria-hidden="true"
                  className={[
                    'flex',
                    'h-7',
                    'w-7',
                    'shrink-0',
                    'items-center',
                    'justify-center',
                    'rounded-full',
                    'bg-blue-100',
                    'text-[#2563EB]'
                  ].join(' ')}
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    className="h-4 w-4"
                  >
                    <path
                      d="M5 10.5 8.2 13.5 15 6.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>

                <div className="min-w-0">

                  <p className="text-xs font-medium text-ink-900">
                    Header detected
                  </p>

                  <p className="text-[11px] text-ink-600/60 mt-0.5">
                    Column names identified automatically
                  </p>

                </div>
              </div>

              <span
                className={[
                  'shrink-0',
                  'rounded-full',
                  'bg-white',
                  'border border-blue-100',
                  'px-2.5',
                  'py-1',
                  'text-[11px]',
                  'font-mono',
                  'font-medium',
                  'text-[#2563EB]'
                ].join(' ')}
              >
                Row{' '}
                {schema.headerRowIndex + 1}
              </span>

            </div>
          </div>

          {/* ========================================================
              DATA QUALITY
             ======================================================== */}

          {hasQualityIssues ? (
            <div
              role="status"
              className={[
                'flex',
                'items-center',
                'gap-2.5',
                'rounded-xl',
                'bg-[#f7f8f6]',
                'border border-[#e1e4df]',
                'px-3.5',
                'py-3'
              ].join(' ')}
            >

              <span
                aria-hidden="true"
                className={[
                  'flex',
                  'h-7',
                  'w-7',
                  'shrink-0',
                  'items-center',
                  'justify-center',
                  'rounded-full',
                  'bg-[#eef4ff]',
                  'text-[#2563eb]',
                  'text-sm',
                  'font-semibold'
                ].join(' ')}
              >
                !
              </span>

              <div className="min-w-0">

                <p className="text-xs font-medium text-[#475569]">
                  Data review recommended
                </p>

                <p className="text-[11px] text-[#2563eb]/80 mt-0.5">
                  {warningCount}{' '}
                  potential data-quality{' '}
                  {warningCount === 1
                    ? 'issue'
                    : 'issues'}{' '}
                  detected.
                </p>

              </div>
            </div>
          ) : (
            <div
              role="status"
              className={[
                'flex',
                'items-center',
                'gap-2.5',
                'rounded-xl',
                'bg-blue-50',
                'border border-blue-100',
                'px-3.5',
                'py-3'
              ].join(' ')}
            >

              <span
                aria-hidden="true"
                className={[
                  'flex',
                  'h-7',
                  'w-7',
                  'shrink-0',
                  'items-center',
                  'justify-center',
                  'rounded-full',
                  'bg-blue-100',
                  'text-[#2563EB]'
                ].join(' ')}
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className="h-4 w-4"
                >
                  <path
                    d="M5 10.5 8.2 13.5 15 6.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>

              <div className="min-w-0">

                <p className="text-xs font-medium text-blue-700">
                  Data ready
                </p>

                <p className="text-[11px] text-blue-600/75 mt-0.5">
                  No data-quality issues detected.
                </p>

              </div>
            </div>
          )}

        </div>

        {/* ==========================================================
            ACTIONS
           ========================================================== */}

        <div className="px-5 sm:px-6 pb-5">

          <button
            type="button"
            onClick={onContinue}
            className={[
              'focus-visible:outline-none',
              'focus-visible:ring-2',
              'focus-visible:ring-[#2563EB]/25',
              'focus-visible:ring-offset-2',
              'w-full',
              'inline-flex',
              'items-center',
              'justify-center',
              'rounded-lg',
              'bg-[#2563EB]',
              'text-white',
              'h-11',
              'text-sm',
              'font-medium',
              'hover:bg-[#1D4ED8]',
              'active:bg-[#1E40AF]',
              'active:scale-[0.99]',
              'transition-all'
            ].join(' ')}
          >
            Continue
            <span
              aria-hidden="true"
              className="ml-1.5"
            >
              →
            </span>
          </button>

        </div>
      </section>
    </div>
  );
}