import React from 'react';
import { GlobalSelect } from '../GlobalSelect';
import type { DatasetSchema } from '../../types/dataset';
import type {
  AggregateConfig,
  AggregateFn,
  ReportConfig
} from '../../types/report';
import { makeId } from '../../utils/id';

interface Props {
  schema: DatasetSchema;
  config: ReportConfig;
  update: (
    updater: (prev: ReportConfig) => ReportConfig
  ) => void;
}

const FN_LABELS: Record<AggregateFn, string> = {
  count: 'Count',
  sum: 'Sum',
  avg: 'Average',
  min: 'Minimum',
  max: 'Maximum'
};

export function GroupPanel({
  schema,
  config,
  update
}: Props) {
  const columns = schema.columns;

  const numericColumns = columns.filter(
    (c) => c.dataType === 'number'
  );

  const setGroupColumn = (
    key: string | null
  ) => {
    update((prev) => ({
      ...prev,
      group: {
        ...prev.group,
        columnKey: key
      }
    }));
  };

  const addAggregate = () => {
    const agg: AggregateConfig = {
      id: makeId('agg'),
      fn: 'count',
      columnKey: null,
      label: ''
    };

    update((prev) => ({
      ...prev,
      group: {
        ...prev.group,
        aggregates: [
          ...prev.group.aggregates,
          agg
        ]
      }
    }));
  };

  const updateAggregate = (
    id: string,
    patch: Partial<AggregateConfig>
  ) => {
    update((prev) => ({
      ...prev,
      group: {
        ...prev.group,
        aggregates:
          prev.group.aggregates.map(
            (a) =>
              a.id === id
                ? {
                    ...a,
                    ...patch
                  }
                : a
          )
      }
    }));
  };

  const removeAggregate = (
    id: string
  ) => {
    update((prev) => ({
      ...prev,
      group: {
        ...prev.group,
        aggregates:
          prev.group.aggregates.filter(
            (a) => a.id !== id
          )
      }
    }));
  };

  return (
    <div className="space-y-4">

      {/* ============================================================
          GROUP BY
         ============================================================ */}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600/60 mb-2">
          Group by
        </h3>

        <GlobalSelect
          value={
            config.group.columnKey ?? ''
          }
          onChange={(value) =>
            setGroupColumn(
              value || null
            )
          }
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
        >
          <option value="">
            No grouping
          </option>

          {columns.map((column) => (
            <option
              key={column.key}
              value={column.key}
            >
              {column.originalName}
            </option>
          ))}
        </GlobalSelect>
      </div>

      {/* ============================================================
          GROUP SUMMARIES
         ============================================================ */}

      {config.group.columnKey && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600/60 mb-2">
            Group summaries
          </h3>

          {config.group.aggregates.length ===
          0 ? (
            <p className="text-xs text-ink-600/60 mb-2">
              Add a calculation to summarize
              each group.
            </p>
          ) : (
            <ul className="space-y-2 mb-2">
              {config.group.aggregates.map(
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
                        REMOVE
                       ================================================== */}

                    <button
                      type="button"
                      onClick={() =>
                        removeAggregate(
                          agg.id
                        )
                      }
                      aria-label="Remove summary"
                      title="Remove summary"
                      className={[
                        'focus-ring',
                        'ml-auto',
                        'shrink-0',
                        'text-ink-600/50',
                        'hover:text-rose-500',
                        'transition-colors'
                      ].join(' ')}
                    >
                      ✕
                    </button>
                  </li>
                )
              )}
            </ul>
          )}

          {/* ========================================================
              ADD SUMMARY
             ======================================================== */}

          <button
            type="button"
            onClick={addAggregate}
            className={[
              'focus-ring',
              'w-full',
              'rounded-md',
              'border',
              'border-dashed',
              'border-[#2563EB]/30',
              'py-2',
              'text-xs',
              'font-medium',
              'text-[#2563EB]',
              'bg-transparent',
              'hover:border-[#2563EB]/50',
              'hover:bg-blue-50',
              'hover:text-[#1D4ED8]',
              'active:bg-blue-100',
              'transition-colors'
            ].join(' ')}
          >
            + Add summary
          </button>
        </div>
      )}
    </div>
  );
}