import React from 'react';
import { GlobalSelect } from '../GlobalSelect';
import type { DatasetSchema } from '../../types/dataset';
import type {
  ReportConfig,
  SortRule
} from '../../types/report';
import { makeId } from '../../utils/id';

interface Props {
  schema: DatasetSchema;
  config: ReportConfig;
  update: (
    updater: (prev: ReportConfig) => ReportConfig
  ) => void;
}

export function SortPanel({
  schema,
  config,
  update
}: Props) {
  const columns = schema.columns;

  const addSort = () => {
    const used = new Set(
      config.sorts.map((s) => s.columnKey)
    );

    const next =
      columns.find(
        (c) => !used.has(c.key)
      ) ?? columns[0];

    if (!next) return;

    const rule: SortRule = {
      id: makeId('sort'),
      columnKey: next.key,
      direction: 'asc'
    };

    update((prev) => ({
      ...prev,
      sorts: [
        ...prev.sorts,
        rule
      ]
    }));
  };

  const updateSort = (
    id: string,
    patch: Partial<SortRule>
  ) => {
    update((prev) => ({
      ...prev,
      sorts: prev.sorts.map((s) =>
        s.id === id
          ? {
              ...s,
              ...patch
            }
          : s
      )
    }));
  };

  const removeSort = (id: string) => {
    update((prev) => ({
      ...prev,
      sorts: prev.sorts.filter(
        (s) => s.id !== id
      )
    }));
  };

  const move = (
    id: string,
    dir: -1 | 1
  ) => {
    update((prev) => {
      const list = [
        ...prev.sorts
      ];

      const idx =
        list.findIndex(
          (s) => s.id === id
        );

      const target =
        idx + dir;

      if (
        idx === -1 ||
        target < 0 ||
        target >= list.length
      ) {
        return prev;
      }

      [
        list[idx],
        list[target]
      ] = [
        list[target],
        list[idx]
      ];

      return {
        ...prev,
        sorts: list
      };
    });
  };

  if (columns.length === 0) {
    return (
      <p className="text-sm text-ink-600/60">
        No columns available to sort by.
      </p>
    );
  }

  return (
    <div className="space-y-3">

      {/* ============================================================
          EMPTY STATE
         ============================================================ */}

      {config.sorts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center">

          <p className="text-sm text-ink-900 font-medium">
            No sort rules yet
          </p>

          <p className="text-xs text-ink-600/60 mt-1 mb-3">
            Rows are shown in their original order.
          </p>

          <button
            type="button"
            onClick={addSort}
            className={[
              'inline-flex items-center',
              'rounded-md',
              'bg-[#2563EB]',
              'text-white',
              'text-xs font-medium',
              'px-3 py-1.5',
              'outline-none',
              'hover:bg-[#1D4ED8]',
              'active:bg-[#1E40AF]',
              'active:scale-[0.98]',
              'transition-all',
              'focus:outline-none',
              'focus-visible:ring-2',
              'focus-visible:ring-[#2563EB]/30'
            ].join(' ')}
          >
            + Add sort rule
          </button>
        </div>
      ) : (
        <>
          {/* ========================================================
              SORT RULES
             ======================================================== */}

          <ol className="space-y-2">

            {config.sorts.map(
              (s, i) => {
                const col =
                  columns.find(
                    (c) =>
                      c.key ===
                      s.columnKey
                  );

                const isAscending =
                  s.direction ===
                  'asc';

                return (
                  <li
                    key={s.id}
                    className={[
                      'rounded-lg',
                      'border border-ink-200',
                      'bg-white',
                      'p-2.5',
                      'flex items-center gap-2'
                    ].join(' ')}
                  >

                    {/* ==================================================
                        RULE NUMBER
                       ================================================== */}

                    <span className="text-[10px] font-mono text-ink-600/40 w-4 shrink-0">
                      {i + 1}
                    </span>

                    {/* ==================================================
                        COLUMN SELECT
                       ================================================== */}

                    <GlobalSelect
                      value={
                        s.columnKey
                      }
                      onChange={(value) =>
                        updateSort(
                          s.id,
                          {
                            columnKey: value
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
                      {columns.map(
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

                    {/* ==================================================
                        DIRECTION
                       ================================================== */}

                    <button
                      type="button"
                      onClick={() =>
                        updateSort(
                          s.id,
                          {
                            direction:
                              isAscending
                                ? 'desc'
                                : 'asc'
                          }
                        )
                      }
                      className={[
                        'shrink-0',
                        'rounded-md',
                        'border',
                        'border-[#2563EB]/30',
                        'bg-blue-50',
                        'px-2 py-1.5',
                        'text-xs font-mono',
                        'text-[#2563EB]',
                        'outline-none',
                        'transition-colors',
                        'hover:bg-blue-100',
                        'hover:border-[#2563EB]/50',
                        'focus:outline-none',
                        'focus:border-[#2563EB]'
                      ].join(' ')}
                      title={
                        col?.dataType ===
                        'string'
                          ? 'A–Z / Z–A'
                          : 'Ascending / Descending'
                      }
                    >
                      {isAscending
                        ? '↑ Asc'
                        : '↓ Desc'}
                    </button>

                    {/* ==================================================
                        MOVE RULE
                       ================================================== */}

                    <div className="flex flex-col shrink-0">

                      <button
                        type="button"
                        disabled={
                          i === 0
                        }
                        onClick={() =>
                          move(
                            s.id,
                            -1
                          )
                        }
                        className={[
                          'text-ink-600/60',
                          'leading-none',
                          'outline-none',
                          'transition-colors',
                          'hover:text-[#2563EB]',
                          'disabled:opacity-20',
                          'focus:outline-none',
                          'focus-visible:text-[#2563EB]'
                        ].join(' ')}
                        aria-label="Move sort rule up"
                      >
                        ▲
                      </button>

                      <button
                        type="button"
                        disabled={
                          i ===
                          config.sorts
                            .length -
                            1
                        }
                        onClick={() =>
                          move(
                            s.id,
                            1
                          )
                        }
                        className={[
                          'text-ink-600/60',
                          'leading-none',
                          'outline-none',
                          'transition-colors',
                          'hover:text-[#2563EB]',
                          'disabled:opacity-20',
                          'focus:outline-none',
                          'focus-visible:text-[#2563EB]'
                        ].join(' ')}
                        aria-label="Move sort rule down"
                      >
                        ▼
                      </button>

                    </div>

                    {/* ==================================================
                        REMOVE
                       ================================================== */}

                    <button
                      type="button"
                      onClick={() =>
                        removeSort(
                          s.id
                        )
                      }
                      className={[
                        'shrink-0',
                        'text-ink-600/50',
                        'outline-none',
                        'hover:text-rose-500',
                        'transition-colors',
                        'focus:outline-none',
                        'focus-visible:text-rose-500'
                      ].join(' ')}
                      aria-label={`Remove sort rule ${
                        i + 1
                      }`}
                    >
                      ✕
                    </button>

                  </li>
                );
              }
            )}

          </ol>

          {/* ========================================================
              ADD SORT RULE
             ======================================================== */}

          {config.sorts.length <
            columns.length && (
            <button
              type="button"
              onClick={addSort}
              className={[
                'w-full',
                'rounded-md',
                'border border-dashed',
                'border-[#2563EB]/30',
                'bg-transparent',
                'py-2',
                'text-xs font-medium',
                'text-[#2563EB]',
                'outline-none',
                'transition-colors',
                'hover:bg-blue-50',
                'hover:border-[#2563EB]/50',
                'active:bg-blue-100',
                'focus:outline-none',
                'focus-visible:ring-2',
                'focus-visible:ring-[#2563EB]/20'
              ].join(' ')}
            >
              + Add sort rule
            </button>
          )}

        </>
      )}
    </div>
  );
}