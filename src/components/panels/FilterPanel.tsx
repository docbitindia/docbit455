import React from 'react';
import { GlobalSelect } from '../GlobalSelect';
import type { DatasetSchema } from '../../types/dataset';
import type {
  FilterCondition,
  ReportConfig
} from '../../types/report';
import { operatorsForType } from '../../engine/filters';
import { makeId } from '../../utils/id';

interface Props {
  schema: DatasetSchema;
  config: ReportConfig;
  update: (
    updater: (prev: ReportConfig) => ReportConfig
  ) => void;
}

export function FilterPanel({
  schema,
  config,
  update
}: Props) {
  const columns = schema.columns;
  const group = config.filterGroup;

  const addCondition = () => {
    const first = columns[0];

    if (!first) return;

    const cond: FilterCondition = {
      id: makeId('cond'),
      columnKey: first.key,
      operator:
        operatorsForType(first.dataType)[0]
          .value as FilterCondition['operator'],
      value: '',
      value2: ''
    };

    update((prev) => ({
      ...prev,
      filterGroup: {
        ...prev.filterGroup,
        conditions: [
          ...prev.filterGroup.conditions,
          cond
        ]
      }
    }));
  };

  const updateCondition = (
    id: string,
    patch: Partial<FilterCondition>
  ) => {
    update((prev) => ({
      ...prev,
      filterGroup: {
        ...prev.filterGroup,
        conditions:
          prev.filterGroup.conditions.map(
            (c) =>
              c.id === id
                ? {
                    ...c,
                    ...patch
                  }
                : c
          )
      }
    }));
  };

  const removeCondition = (id: string) => {
    update((prev) => ({
      ...prev,
      filterGroup: {
        ...prev.filterGroup,
        conditions:
          prev.filterGroup.conditions.filter(
            (c) => c.id !== id
          )
      }
    }));
  };

  const setLogic = (
    logic: 'AND' | 'OR'
  ) => {
    update((prev) => ({
      ...prev,
      filterGroup: {
        ...prev.filterGroup,
        logic
      }
    }));
  };

  if (columns.length === 0) {
    return (
      <p className="text-sm text-ink-600/60">
        No columns available to filter on.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* ============================================================
          LOGIC
         ============================================================ */}

      {group.conditions.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-ink-600/60">
            Match
          </span>

          {(['AND', 'OR'] as const).map(
            (logic) => {
              const active =
                group.logic === logic;

              return (
                <button
                  key={logic}
                  type="button"
                  onClick={() =>
                    setLogic(logic)
                  }
                  className={[
                    'px-2.5 py-1',
                    'rounded-md',
                    'font-medium',
                    'focus-ring',
                    'transition-colors',
                    active
                      ? [
                          'bg-[#2563EB]',
                          'text-white',
                          'hover:bg-[#1D4ED8]'
                        ].join(' ')
                      : [
                          'bg-paper-100',
                          'text-ink-600',
                          'hover:bg-paper-200'
                        ].join(' ')
                  ].join(' ')}
                >
                  {logic}
                </button>
              );
            }
          )}

          <span className="text-ink-600/60">
            of the conditions below
          </span>
        </div>
      )}

      {/* ============================================================
          EMPTY STATE
         ============================================================ */}

      {group.conditions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center">
          <p className="text-sm text-ink-900 font-medium">
            No filters yet
          </p>

          <p className="text-xs text-ink-600/60 mt-1 mb-3">
            Add a filter to show only the
            records you need.
          </p>

          <button
            type="button"
            onClick={addCondition}
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
            + Add filter
          </button>
        </div>
      ) : (
        <>
          {/* ========================================================
              CONDITIONS
             ======================================================== */}

          <ul className="space-y-2.5">
            {group.conditions.map(
              (cond) => {
                const col =
                  columns.find(
                    (c) =>
                      c.key ===
                      cond.columnKey
                  ) ??
                  columns[0];

                const ops =
                  operatorsForType(
                    col.dataType
                  );

                const needsValue =
                  ![
                    'empty',
                    'nempty'
                  ].includes(
                    cond.operator
                  );

                const needsSecondValue =
                  [
                    'between',
                    'dateBetween'
                  ].includes(
                    cond.operator
                  );

                const isDate =
                  col.dataType ===
                  'date';

                return (
                  <li
                    key={cond.id}
                    className={[
                      'rounded-lg',
                      'border border-ink-200',
                      'bg-white',
                      'p-3',
                      'space-y-2'
                    ].join(' ')}
                  >
                    {/* ==================================================
                        COLUMN + REMOVE
                       ================================================== */}

                    <div className="flex items-center gap-2">
                      <GlobalSelect
                        value={
                          cond.columnKey
                        }
                        onChange={(value) => {
                          const newCol =
                            columns.find(
                              (c) =>
                                c.key === value
                            );

                          const newOps =
                            operatorsForType(
                              newCol?.dataType ??
                                'string'
                            );

                          updateCondition(
                            cond.id,
                            {
                              columnKey: value,
                              operator:
                                newOps[0]
                                  .value as FilterCondition['operator']
                            }
                          );
                        }}
                        className={[
                          'flex-1 min-w-0',
                          'rounded-md',
                          'border border-ink-200',
                          'bg-white',
                          'px-2 py-1.5',
                          'text-xs text-ink-900',
                          'outline-none',
                          'transition-all duration-150',
                          'hover:border-ink-300',
                          'focus:border-[#2563EB]',
                          'focus:ring-2',
                          'focus:ring-[#2563EB]/15'
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

                      <button
                        type="button"
                        onClick={() =>
                          removeCondition(
                            cond.id
                          )
                        }
                        aria-label="Remove filter"
                        title="Remove filter"
                        className={[
                          'focus-ring',
                          'text-ink-600/50',
                          'hover:text-rose-500',
                          'shrink-0',
                          'transition-colors'
                        ].join(' ')}
                      >
                        ✕
                      </button>
                    </div>

                    {/* ==================================================
                        OPERATOR
                       ================================================== */}

                    <GlobalSelect
                      value={
                        cond.operator
                      }
                      onChange={(value) =>
                        updateCondition(
                          cond.id,
                          {
                            operator: value as FilterCondition['operator']
                          }
                        )
                      }
                      className={[
                        'w-full',
                        'rounded-md',
                        'border border-ink-200',
                        'bg-white',
                        'px-2 py-1.5',
                        'text-xs text-ink-900',
                        'outline-none',
                        'transition-all duration-150',
                        'hover:border-ink-300',
                        'focus:border-[#2563EB]',
                        'focus:ring-2',
                        'focus:ring-[#2563EB]/15'
                      ].join(' ')}
                    >
                      {ops.map((op) => (
                        <option
                          key={
                            op.value
                          }
                          value={
                            op.value
                          }
                        >
                          {op.label}
                        </option>
                      ))}
                    </GlobalSelect>

                    {/* ==================================================
                        VALUES
                       ================================================== */}

                    {needsValue && (
                      <div className="flex items-center gap-2">
                        <input
                          type={
                            isDate
                              ? 'date'
                              : col.dataType ===
                                'number'
                              ? 'number'
                              : 'text'
                          }
                          value={
                            cond.value
                          }
                          onChange={(e) =>
                            updateCondition(
                              cond.id,
                              {
                                value:
                                  e.target
                                    .value
                              }
                            )
                          }
                          placeholder="Value"
                          className={[
                            'flex-1 min-w-0',
                            'rounded-md',
                            'border border-ink-200',
                            'bg-white',
                            'px-2 py-1.5',
                            'text-xs text-ink-900',
                            'placeholder:text-ink-600/40',
                            'outline-none',
                            'transition-all duration-150',
                            'hover:border-ink-300',
                            'focus:border-[#2563EB]',
                            'focus:ring-2',
                            'focus:ring-[#2563EB]/15'
                          ].join(' ')}
                        />

                        {needsSecondValue && (
                          <>
                            <span className="text-ink-600/40 text-xs shrink-0">
                              and
                            </span>

                            <input
                              type={
                                isDate
                                  ? 'date'
                                  : 'number'
                              }
                              value={
                                cond.value2
                              }
                              onChange={(e) =>
                                updateCondition(
                                  cond.id,
                                  {
                                    value2:
                                      e.target
                                        .value
                                  }
                                )
                              }
                              placeholder="Value"
                              className={[
                                'flex-1 min-w-0',
                                'rounded-md',
                                'border border-ink-200',
                                'bg-white',
                                'px-2 py-1.5',
                                'text-xs text-ink-900',
                                'placeholder:text-ink-600/40',
                                'outline-none',
                                'transition-all duration-150',
                                'hover:border-ink-300',
                                'focus:border-[#2563EB]',
                                'focus:ring-2',
                                'focus:ring-[#2563EB]/15'
                              ].join(' ')}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              }
            )}
          </ul>

          {/* ========================================================
              ADD CONDITION
             ======================================================== */}

          <button
            type="button"
            onClick={addCondition}
            className={[
              'focus-ring',
              'w-full',
              'rounded-md',
              'border border-dashed border-ink-200',
              'py-2',
              'text-xs font-medium',
              'text-ink-600',
              'hover:border-[#2563EB]/40',
              'hover:bg-blue-50/40',
              'hover:text-[#2563EB]',
              'active:bg-blue-100',
              'transition-colors'
            ].join(' ')}
          >
            + Add condition
          </button>
        </>
      )}
    </div>
  );
}