import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, Settings2 } from 'lucide-react';
import type { ReportSection } from '../types/report';
import { NAV_ITEMS, type NavCounts } from './navItems';

export type MobileSection = ReportSection;

interface Props {
  active: MobileSection | null;
  onChange: (section: MobileSection | null) => void;
  counts: NavCounts;
  onReset: () => void;
  canReset: boolean;
  children: React.ReactNode;
}

const SECTION_LABEL: Record<ReportSection, string> = {
  general: 'General',
  columns: 'Columns',
  filter: 'Filter',
  sort: 'Sort',
  group: 'Group',
  calculate: 'Calculate',
  export: 'Export',
  report: 'Generate Report'
};

/* ================================================================
   TRIGGER POSITION
   ================================================================ */

function useTriggerPosition(
  wrapperRef: React.RefObject<HTMLDivElement | null>
) {
  const [offset, setOffset] = useState({
    x: 0,
    y: 0
  });

  const clamp = useCallback(
    (x: number, y: number) => {
      const el = wrapperRef.current;

      const w = el?.offsetWidth ?? 190;
      const h = el?.offsetHeight ?? 48;

      const safeLeft = envInset('--safe-left');
      const safeRight = envInset('--safe-right');
      const safeTop = envInset('--safe-top');
      const safeBottom = envInset('--safe-bottom');

      const minX =
        safeLeft -
        (window.innerWidth / 2 - w / 2);

      const maxX =
        window.innerWidth / 2 -
        w / 2 -
        safeRight;

      const minY = -(
        window.innerHeight -
        h -
        safeBottom -
        safeTop -
        70
      );

      const maxY = 0;

      return {
        x: Math.min(Math.max(x, minX), maxX),
        y: Math.min(Math.max(y, minY), maxY)
      };
    },
    [wrapperRef]
  );

  useEffect(() => {
    const handleResize = () => {
      setOffset((previous) =>
        clamp(previous.x, previous.y)
      );
    };

    window.addEventListener(
      'resize',
      handleResize
    );

    return () => {
      window.removeEventListener(
        'resize',
        handleResize
      );
    };
  }, [clamp]);

  return {
    offset,
    setOffset,
    clamp
  };
}

function envInset(varName: string): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  const raw = getComputedStyle(
    document.documentElement
  ).getPropertyValue(varName);

  const value = parseFloat(raw);

  return Number.isFinite(value)
    ? value
    : 0;
}

/* ================================================================
   DRAG HANDLE
   ================================================================ */

function DragHandle({
  side,
  dragging,
  offset,
  setOffset,
  clamp,
  onDragStateChange
}: {
  side: 'left' | 'right';
  dragging: boolean;
  offset: {
    x: number;
    y: number;
  };
  setOffset: React.Dispatch<
    React.SetStateAction<{
      x: number;
      y: number;
    }>
  >;
  clamp: (
    x: number,
    y: number
  ) => {
    x: number;
    y: number;
  };
  onDragStateChange: (
    dragging: boolean
  ) => void;
}) {
  const start = useRef<{
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);

  const onPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    event.currentTarget.setPointerCapture(
      event.pointerId
    );

    start.current = {
      x: event.clientX,
      y: event.clientY,
      originX: offset.x,
      originY: offset.y
    };

    onDragStateChange(true);
  };

  const onPointerMove = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    const initial = start.current;

    if (!initial) {
      return;
    }

    const dx =
      event.clientX - initial.x;

    const dy =
      event.clientY - initial.y;

    // Ignore tiny accidental movements.
    if (
      Math.abs(dx) < 3 &&
      Math.abs(dy) < 3
    ) {
      return;
    }

    setOffset(
      clamp(
        initial.originX + dx,
        initial.originY + dy
      )
    );
  };

  const endDrag = (
    event?: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (
      event &&
      event.currentTarget.hasPointerCapture(
        event.pointerId
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    }

    start.current = null;
    onDragStateChange(false);
  };

  return (
    <button
      type="button"
      aria-label={`Drag to move (${side} handle)`}
      title="Drag to move"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className={[
        'group',
        'self-stretch',
        'w-9 shrink-0',
        'flex items-center justify-center',
        'touch-none select-none',
        'cursor-grab active:cursor-grabbing',
        'focus:outline-none',
        side === 'left'
          ? 'rounded-l-full'
          : 'rounded-r-full',
        dragging
          ? 'bg-[#2563EB]/10'
          : 'hover:bg-paper-50/5'
      ].join(' ')}
    >
      <GripVertical
        aria-hidden="true"
        strokeWidth={2.4}
        className={[
          'block',
          'h-5 w-5',
          'shrink-0',
          'transition-all duration-150',
          dragging
            ? 'text-[#2563EB] scale-110'
            : 'text-paper-50/55 group-hover:text-paper-50/90'
        ].join(' ')}
      />
    </button>
  );
}

/* ================================================================
   MOBILE NAVIGATION
   ================================================================ */

export function MobileNav({
  active,
  onChange,
  counts,
  onReset,
  canReset,
  children
}: Props) {
  const [sheetOpen, setSheetOpen] =
    useState(false);

  const [dragging, setDragging] =
    useState(false);

  const isDetail =
    active !== null;

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.id === 'filter' || item.id === 'sort' || item.id === 'group') return counts.columns > 0;
    if (item.id === 'calculate') return counts.hasNumericColumns;
    return true;
  });

  const wrapperRef =
    useRef<HTMLDivElement>(null);

  const {
    offset,
    setOffset,
    clamp
  } = useTriggerPosition(wrapperRef);

  /* ================================================================
     TRIGGER ACTION
     ================================================================ */

  const handleTap = () => {
    if (isDetail) {
      onChange(null);
      return;
    }

    setSheetOpen(true);
  };

  const closeAll = () => {
    setSheetOpen(false);
    onChange(null);
  };

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-ink-200 bg-white/95 backdrop-blur" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        <div className="grid grid-cols-2 gap-2 p-2">
          <button type="button" onClick={() => { if (isDetail) onChange(null); else setSheetOpen(true); }} className="focus-ring h-11 rounded-xl border border-ink-200 bg-paper-50 text-sm font-semibold text-ink-900">{isDetail ? 'Back' : 'Configure'}</button>
          <button type="button" onClick={() => { setSheetOpen(true); onChange('export'); }} className="focus-ring h-11 rounded-xl bg-signal-600 text-sm font-semibold text-white">Export</button>
        </div>
      </div>

      {/* ==========================================================
          CONFIGURATION SHEET
          ========================================================== */}

      {(sheetOpen || isDetail) && (
        <div
          className={[
            'md:hidden',
            'fixed inset-0 z-40',
            'flex items-end',
            'bg-ink-950/45',
            'backdrop-blur-[2px]',
            'animate-fade-in'
          ].join(' ')}
          onClick={closeAll}
        >
          <div
            className={[
              'w-full',
              'bg-white',
              'rounded-t-[22px]',
              'overflow-hidden',
              'shadow-panel',
              'flex flex-col',
              'animate-sheet-up'
            ].join(' ')}
            style={{
              height: '75vh',
              paddingBottom:
                'var(--safe-bottom)'
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            {/* ====================================================
                SHEET HANDLE
                ==================================================== */}

            <div className="flex h-7 shrink-0 items-center justify-center bg-white">
              <button
                type="button"
                onClick={closeAll}
                aria-label="Minimize"
                title="Minimize"
                className="focus-ring flex h-7 w-10 items-center justify-center text-ink-700 hover:text-ink-950"
              >
                <span aria-hidden="true" className="block h-0 w-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-current" />
              </button>
            </div>

            {/* ====================================================
                SHEET HEADER
                ==================================================== */}

            <div
              className={[
                'flex items-center',
                'justify-between',
                'px-4 pt-1 pb-2.5',
                'border-b border-[#e1e4df]',
                'bg-white',
                'shrink-0'
              ].join(' ')}
            >
              {isDetail ? (
                <button
                  type="button"
                  onClick={() =>
                    onChange(null)
                  }
                  className={[
                    'focus-ring',
                    'flex items-center gap-1',
                    '-ml-1.5',
                    'px-1.5 py-1',
                    'rounded-md',
                    'text-sm font-medium',
                    'text-ink-600',
                    'hover:bg-paper-200'
                  ].join(' ')}
                >
                  <span aria-hidden="true">
                    ←
                  </span>

                  Back
                </button>
              ) : (
                <span className="text-sm font-semibold text-ink-900">
                  Configure your extraction
                </span>
              )}

              <div className="flex items-center gap-1">
                {!isDetail && (
                  <button
                    type="button"
                    onClick={onReset}
                    disabled={!canReset}
                    className={[
                      'focus-ring',
                      'rounded-md',
                      'px-2.5 py-1',
                      'text-xs font-medium',
                      'text-ink-600/70',
                      'hover:text-ink-900',
                      'hover:bg-paper-200',
                      'disabled:opacity-30',
                      'disabled:hover:bg-transparent'
                    ].join(' ')}
                  >
                    Reset
                  </button>
                )}


              </div>
            </div>

            {/* ====================================================
                SHEET CONTENT
                ==================================================== */}

            <div className="flex-1 overflow-y-auto thin-scroll bg-paper-50">
              {isDetail ? (
                <div className="px-4 py-4">
                  {children}
                </div>
              ) : (
                <ul className="px-2 py-2">
                  {visibleItems.map((item) => {
                    const hint =
                      item.hint?.(counts);

                    const blocked =
                      item.unavailable?.(
                        counts
                      );

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() =>
                            !blocked &&
                            onChange(item.id)
                          }
                          disabled={!!blocked}
                          className={[
                            'focus-ring',
                            'w-full',
                            'flex items-center',
                            'justify-between',
                            'px-3 py-3.5',
                            'text-sm',
                            'rounded-xl',
                            blocked
                              ? 'text-ink-600/30'
                              : [
                                  'text-ink-900',
                                  'hover:bg-white',
                                  'active:bg-white'
                                ].join(' ')
                          ].join(' ')}
                        >
                          <span className="font-medium">
                            {item.label}
                          </span>

                          {blocked ? (
                            <span className="text-[11px] text-ink-600/40">
                              {blocked}
                            </span>
                          ) : hint ? (
                            <span
                              className={[
                                'text-[11px]',
                                'font-mono',
                                'rounded-full',
                                'px-2 py-0.5',
                                'bg-paper-200',
                                'text-ink-600/60'
                              ].join(' ')}
                            >
                              {hint}
                            </span>
                          ) : (
                            <span className="text-ink-200">
                              ›
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}