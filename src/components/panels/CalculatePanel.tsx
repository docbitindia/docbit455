import React from 'react';
import { GlobalSelect } from '../GlobalSelect';
import type { DatasetSchema } from '../../types/dataset';
import type {
  AggregateConfig,
  AggregateFn,
  ReportConfig
} from '../../types/report';
import type { ProcessedReport } from '../../types/processed';
import { makeId } from '../../utils/id';

interface Props {
  schema: DatasetSchema;
  config: ReportConfig;
  report: ProcessedReport;
  update: (
    updater: (prev: ReportConfig) => ReportConfig
  ) => void;
}

const FN_LABELS: Record<
  AggregateFn,
  string
> = {
  count: 'Count',
  sum: 'Sum',
  avg: 'Average',
  min: 'Minimum',
  max: 'Maximum'
};

const BLUE = '#2563EB';
const BLUE_HOVER = '#1D4ED8';
const BLUE_ACTIVE = '#1E40AF';

export function CalculatePanel({
  schema,
  config,
  report,
  update
}: Props) {
  const numericColumns =
    schema.columns.filter(
      (c) => c.dataType === 'number'
    );

  const addAggregate = () => {
    const agg: AggregateConfig = {
      id: makeId('agg'),
      fn: 'count',
      columnKey: null,
      label: ''
    };

    update((prev) => ({
      ...prev,
      calculations: [
        ...prev.calculations,
        agg
      ]
    }));
  };

  const updateAggregate = (
    id: string,
    patch: Partial<AggregateConfig>
  ) => {
    update((prev) => ({
      ...prev,
      calculations:
        prev.calculations.map((a) =>
          a.id === id
            ? {
                ...a,
                ...patch
              }
            : a
        )
    }));
  };

  const removeAggregate = (
    id: string
  ) => {
    update((prev) => ({
      ...prev,
      calculations:
        prev.calculations.filter(
          (a) => a.id !== id
        )
    }));
  };

  return (
    <div className="space-y-4">

      {/* ==========================================================
          DESCRIPTION
         ========================================================== */}

      <p className="text-xs text-ink-600/60">
        Calculations run on the current filtered
        dataset — if you filter to Payment Status =
        Paid, totals reflect only those rows.
      </p>

      {/* ==========================================================
          CALCULATIONS
         ========================================================== */}

      {config.calculations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center">
          <p className="text-sm text-ink-900 font-medium">
            No calculations yet
          </p>

          <p className="text-xs text-ink-600/60 mt-1 mb-3">
            Add totals, averages, or counts to
            summarize your data.
          </p>

          <button
            type="button"
            onClick={addAggregate}
            className={[
              'focus-ring',
              'inline-flex items-center',
              'rounded-md',
              'bg-[#2563EB]',
              'text-white',
              'text-xs font-medium',
              'px-3 py-1.5',
              'hover:bg-[#1D4ED8]',
              'active:bg-[#1E40AF]',
              'active:scale-[0.98]',
              'transition-all'
            ].join(' ')}
          >
            + Add calculation
          </button>
        </div>
      ) : (
        <>
          {/* ========================================================
              CALCULATION LIST
             ======================================================== */}

          <ul className="space-y-2">
            {config.calculations.map(
              (agg) => (
                <li
                  key={agg.id}
                  className={[
                    'rounded-lg',
                    'border border-ink-200',
                    'bg-white',
                    'p-2.5',
                    'flex items-center gap-2'
                  ].join(' ')}
                >

                  {/* ==================================================
                      FUNCTION
                     ================================================== */}

                  <GlobalSelect
                    value={agg.fn}
                    onChange={(value) =>
                      updateAggregate(
                        agg.id,
                        {
                          fn: value as AggregateFn
                        }
                      )
                    }
                    className={[
                      'rounded-md',
                      'border',
                      'border-ink-200',
                      'bg-white',
                      'px-2 py-1.5',
                      'text-xs',
                      'text-ink-900',
                      'outline-none',
                      'transition-colors',
                      'hover:border-ink-300',
                      'focus:border-[#2563EB]'
                    ].join(' ')}
                  >
                    {(
                      Object.keys(
                        FN_LABELS
                      ) as AggregateFn[]
                    ).map((fn) => (
                      <option
                        key={fn}
                        value={fn}
                      >
                        {FN_LABELS[fn]}
                      </option>
                    ))}
                  </GlobalSelect>

                  {/* ==================================================
                      NUMERIC FIELD
                     ================================================== */}

                  {agg.fn !== 'count' && (
                    <GlobalSelect
                      value={
                        agg.columnKey ?? ''
                      }
                      onChange={(value) =>
                        updateAggregate(
                          agg.id,
                          {
                            columnKey: value || null
                          }
                        )
                      }
                      className={[
                        'flex-1',
                        'min-w-0',
                        'rounded-md',
                        'border',
                        'border-ink-200',
                        'bg-white',
                        'px-2 py-1.5',
                        'text-xs',
                        'text-ink-900',
                        'outline-none',
                        'transition-colors',
                        'hover:border-ink-300',
                        'focus:border-[#2563EB]'
                      ].join(' ')}
                    >
                      <option value="">
                        Choose field…
                      </option>

                      {numericColumns.map(
                        (column) => (
                          <option
                            key={
                              column.key
                            }
                            value={
                              column.key
                            }
                          >
                            {
                              column.originalName
                            }
                          </option>
                        )
                      )}
                    </GlobalSelect>
                  )}

                  {/* ==================================================
                      LABEL
                     ================================================== */}

                  <input
                    value={agg.label}
                    onChange={(e) =>
                      updateAggregate(
                        agg.id,
                        {
                          label:
                            e.target.value
                        }
                      )
                    }
                    placeholder="Label"
                    className={[
                      'flex-1',
                      'min-w-0',
                      'rounded-md',
                      'border',
                      'border-ink-200',
                      'bg-white',
                      'px-2 py-1.5',
                      'text-xs',
                      'text-ink-900',
                      'placeholder:text-ink-600/40',
                      'outline-none',
                      'transition-colors',
                      'hover:border-ink-300',
                      'focus:border-[#2563EB]'
                    ].join(' ')}
                  />

                  {/* ==================================================
                      REMOVE
                     ================================================== */}

                  <button
                    type="button"
                    onClick={() =>
                      removeAggregate(
                        agg.id
                      )
                    }
                    className={[
                      'focus-ring',
                      'shrink-0',
                      'text-ink-600/50',
                      'hover:text-rose-500',
                      'transition-colors'
                    ].join(' ')}
                    aria-label="Remove calculation"
                    title="Remove calculation"
                  >
                    ✕
                  </button>
                </li>
              )
            )}
          </ul>

          {/* ========================================================
              ADD CALCULATION
             ======================================================== */}

          <button
            type="button"
            onClick={addAggregate}
            className={[
              'focus-ring',
              'w-full',
              'rounded-md',
              'border border-dashed',
              'border-[#2563EB]/30',
              'py-2',
              'text-xs font-medium',
              'text-[#2563EB]',
              'bg-transparent',
              'hover:bg-blue-50',
              'hover:border-[#2563EB]/50',
              'active:bg-blue-100',
              'transition-colors'
            ].join(' ')}
          >
            + Add calculation
          </button>
        </>
      )}

      {/* ==========================================================
          RESULTS
         ========================================================== */}

      {report.summaries.length > 0 && (
        <div className="rounded-lg bg-paper-100 p-3 space-y-1">
          {report.summaries.map(
            (summary) => (
              <div
                key={summary.id}
                className="flex justify-between text-sm"
              >
                <span className="text-ink-600/70">
                  {summary.label}
                </span>

                <span className="font-semibold font-mono text-ink-900">
                  {summary.displayValue}
                </span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}