import React, { useMemo, useState } from 'react';
import type { DatasetSchema } from '../../types/dataset';
import type { ReportConfig } from '../../types/report';
import type { DataType, CellValue } from '../../types/dataset';
import { Modal } from '../Modal';
import { GlobalSelect } from '../GlobalSelect';

interface Props {
  schema: DatasetSchema;
  config: ReportConfig;
  update: (updater: (prev: ReportConfig) => ReportConfig) => void;
  onAddColumn?: (afterColumnKey?: string | null, options?: { name: string; type: DataType; values?: CellValue[] }) => void;
}

const BLUE = '#2563EB';

export function ColumnsPanel({
  schema,
  config,
  update,
  onAddColumn
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState<DataType>('string');
  const [search, setSearch] = useState('');
  const [dragKey, setDragKey] = useState<string | null>(null);

  const ordered = useMemo(
    () =>
      [...config.columns].sort(
        (a, b) => a.order - b.order
      ),
    [config.columns]
  );

  const nameByKey = useMemo(
    () =>
      new Map(
        schema.columns.map((c) => [
          c.key,
          c.originalName
        ])
      ),
    [schema.columns]
  );

  const filtered = ordered.filter((c) =>
    c.displayName
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const toggleVisible = (key: string) => {
    update((prev) => ({
      ...prev,
      columns: prev.columns.map((c) =>
        c.key === key
          ? {
              ...c,
              visible: !c.visible
            }
          : c
      )
    }));
  };

  const setAllVisible = (visible: boolean) => {
    update((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => ({
        ...c,
        visible
      }))
    }));
  };


  const reorder = (
    fromKey: string,
    toKey: string
  ) => {
    if (fromKey === toKey) return;

    update((prev) => {
      const list = [...prev.columns].sort(
        (a, b) => a.order - b.order
      );

      const fromIdx = list.findIndex(
        (c) => c.key === fromKey
      );

      const toIdx = list.findIndex(
        (c) => c.key === toKey
      );

      if (
        fromIdx === -1 ||
        toIdx === -1
      ) {
        return prev;
      }

      const [moved] = list.splice(
        fromIdx,
        1
      );

      list.splice(
        toIdx,
        0,
        moved
      );

      const reindexed = list.map(
        (c, i) => ({
          ...c,
          order: i
        })
      );

      return {
        ...prev,
        columns: reindexed
      };
    });
  };

  const visibleCount =
    config.columns.filter(
      (c) => c.visible
    ).length;

  return (
    <div className="space-y-4">
      {/* ============================================================
          SEARCH + SELECTION CONTROLS
         ============================================================ */}

      <div>
        <input
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          placeholder="Search fields…"
          className={[
            'w-full',
            'rounded-md',
            'border border-ink-200',
            'bg-white',
            'px-3 py-2',
            'text-sm',
            'text-ink-900',
            'placeholder:text-ink-600/40',
            'outline-none',
            'transition-all duration-150',
            'hover:border-ink-300',
            'focus:border-[#2563EB]',
            'focus:ring-2',
            'focus:ring-[#2563EB]/15'
          ].join(' ')}
        />

        <div className="flex items-center justify-between mt-2.5 text-xs">
          <span className="text-ink-600/60">
            {visibleCount} of{' '}
            {config.columns.length}{' '}
            selected
          </span>

          <div className="flex gap-3">
            {/* Select all */}
            <button
              type="button"
              onClick={() =>
                setAllVisible(true)
              }
              className={[
                'focus-ring',
                'text-[#2563EB]',
                'hover:text-[#1D4ED8]',
                'hover:underline',
                'transition-colors'
              ].join(' ')}
            >
              Select all
            </button>

            {/* Clear all */}
            <button
              type="button"
              onClick={() =>
                setAllVisible(false)
              }
              className={[
                'focus-ring',
                'text-ink-600/60',
                'hover:text-ink-900',
                'hover:underline',
                'transition-colors'
              ].join(' ')}
            >
              Clear all
            </button>
          </div>
        </div>
      </div>

      <button type="button" onClick={() => setAddOpen(true)} className="w-full rounded-lg border border-dashed border-[#2563EB]/40 bg-blue-50/40 px-3 py-2.5 text-xs font-semibold text-[#2563EB] hover:bg-blue-50">+ Add column</button>

      <Modal open={addOpen} title="Add column" description="Create an empty column. Add data later from the column ⋮ menu." onClose={() => setAddOpen(false)} footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setAddOpen(false)} className="modal-cancel-button">Cancel</button><button type="button" disabled={!addName.trim() || !onAddColumn} onClick={() => { onAddColumn?.(undefined, { name: addName.trim(), type: addType }); setAddOpen(false); setAddName(''); }} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Create column</button></div>}>
        <div className="space-y-3"><label className="block text-xs font-medium">Column name<input value={addName} onChange={e => setAddName(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-200 px-2.5 py-2 text-xs" /></label><label className="block text-xs font-medium">Type<GlobalSelect value={addType} onChange={value => setAddType(value as DataType)} className="mt-1 w-full rounded-lg border border-ink-200 px-2.5 py-2 text-xs">{['string','number','date','boolean','url','mixed'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}</GlobalSelect></label></div>
      </Modal>

      {/* ============================================================
          COLUMN LIST
         ============================================================ */}

      <ul className="space-y-1.5">
        {filtered.map((col) => (
          <li
            key={col.key}
            draggable
            onDragStart={() =>
              setDragKey(col.key)
            }
            onDragOver={(e) =>
              e.preventDefault()
            }
            onDrop={() => {
              if (dragKey) {
                reorder(
                  dragKey,
                  col.key
                );
              }

              setDragKey(null);
            }}
            onDragEnd={() =>
              setDragKey(null)
            }
            className={[
              'rounded-lg',
              'border',
              'bg-white',
              'px-2.5 py-2',
              'flex items-center gap-2',
              'cursor-grab',
              'active:cursor-grabbing',
              'transition-colors',
              col.visible
                ? 'border-ink-200'
                : 'border-ink-100 opacity-60',
              dragKey === col.key
                ? 'border-[#2563EB]/50 bg-blue-50/40'
                : ''
            ].join(' ')}
          >
            {/* ======================================================
                DRAG HANDLE
               ====================================================== */}

            <span
              className={[
                'text-ink-200',
                'select-none',
                'transition-colors',
                dragKey === col.key
                  ? 'text-[#2563EB]/60'
                  : ''
              ].join(' ')}
              aria-hidden
            >
              ⋮⋮
            </span>

            {/* ======================================================
                VISIBILITY CHECKBOX
               ====================================================== */}

            <input
              type="checkbox"
              checked={col.visible}
              onChange={() =>
                toggleVisible(col.key)
              }
              className={[
                'focus-ring',
                'h-4 w-4',
                'shrink-0',
                'accent-[#2563EB]'
              ].join(' ')}
              aria-label={`Show ${col.displayName}`}
            />

            <span className="min-w-0 flex-1 truncate text-sm text-ink-900" title={col.displayName}>
              {col.displayName}
            </span>
          </li>
        ))}
      </ul>

      {/* ============================================================
          EMPTY SEARCH STATE
         ============================================================ */}

      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center">
          <p className="text-sm font-medium text-ink-900">
            No fields found
          </p>

          <p className="text-xs text-ink-600/60 mt-1">
            Try a different search term.
          </p>
        </div>
      )}
    </div>
  );
}