import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportSection } from '../types/report';
import { NAV_ITEMS, type NavCounts } from './navItems';
import {
  PanelLeftClose, PanelLeftOpen, Settings2, Columns3, ListFilter,
  ArrowUpDown, Group, Calculator, Download, GripVertical, FileOutput
} from 'lucide-react';

interface Props {
  active: ReportSection;
  onChange: (section: ReportSection) => void;
  counts: NavCounts;
  collapsed: boolean;
  onToggleCollapse: () => void;
  width: number;
  onWidthChange: (width: number) => void;
  sectionLabel: string;
  children: React.ReactNode;
}

const MIN_WIDTH = 250;
const MAX_WIDTH = 440;
const COLLAPSED_WIDTH = 64;

const ICONS: Record<ReportSection, React.ComponentType<{ className?: string }>> = {
  general: Settings2,
  columns: Columns3,
  filter: ListFilter,
  sort: ArrowUpDown,
  group: Group,
  calculate: Calculator,
  export: Download,
  report: FileOutput
};

export function SideNav({
  active, onChange, counts, collapsed, onToggleCollapse, width, onWidthChange, sectionLabel, children
}: Props) {
  const [dragging, setDragging] = useState(false);
  const dragRaf = useRef<number | null>(null);
  const pendingWidth = useRef<number | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      if (event.clientX <= COLLAPSED_WIDTH + 28) {
        setDragging(false);
        onToggleCollapse();
        return;
      }
      pendingWidth.current = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, event.clientX));
      if (dragRaf.current !== null) return;
      dragRaf.current = window.requestAnimationFrame(() => {
        dragRaf.current = null;
        if (pendingWidth.current !== null) onWidthChange(pendingWidth.current);
      });
    };
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dragRaf.current !== null) {
        window.cancelAnimationFrame(dragRaf.current);
        dragRaf.current = null;
      }
    };
  }, [dragging, onToggleCollapse, onWidthChange]);

  const visibleItems = useMemo(() => NAV_ITEMS.filter((item) => {
    if (item.id === 'filter' || item.id === 'sort' || item.id === 'group') return counts.columns > 0;
    if (item.id === 'calculate') return counts.hasNumericColumns;
    return true;
  }), [counts]);

  if (collapsed) {
    return (
      <aside
        aria-label="Configure sidebar"
        className="hidden md:flex h-full w-16 shrink-0 flex-col border-r border-ink-200 bg-white shadow-[1px_0_0_rgba(15,23,42,0.02)]"
      >
        <div className="flex h-14 shrink-0 items-center justify-center border-b border-[#e1e4df] bg-white">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-paper-100 hover:text-ink-900"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 py-3 thin-scroll" aria-label="Configure sections">
          {visibleItems.map((item) => {
            const Icon = ICONS[item.id];
            const activeItem = active === item.id;
            const hint = item.hint?.(counts);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                title={`${item.label}${hint ? ` · ${hint}` : ''}`}
                aria-label={item.label}
                aria-current={activeItem ? 'page' : undefined}
                className={`focus-ring relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${activeItem ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-ink-500 hover:bg-paper-100 hover:text-ink-900'}`}
              >
                <Icon className="h-[17px] w-[17px]" />
                {hint && <span className="absolute right-0.5 top-0.5 min-w-1.5 rounded-full bg-ink-800 px-1 text-[8px] font-semibold leading-3 text-white">{hint.length > 3 ? '•' : hint}</span>}
              </button>
            );
          })}
        </nav>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Configure sidebar"
      className="hidden md:flex h-full shrink-0 flex-col border-r border-ink-200 bg-white shadow-[1px_0_0_rgba(15,23,42,0.02)] relative"
      style={{ width }}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#e1e4df] bg-white px-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-900 text-white">
              <Settings2 className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-ink-900">Configure</div>
              <div className="truncate text-[9px] text-ink-500">Table & document settings</div>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Minimize sidebar"
          aria-label="Minimize sidebar"
          className="focus-ring ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-paper-100 hover:text-ink-900"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <nav className="shrink-0 border-b border-ink-100 px-2.5 py-2" aria-label="Configure sections">
          <div className="grid grid-cols-2 gap-1">
            {visibleItems.map((item) => {
              const Icon = ICONS[item.id];
              const activeItem = active === item.id;
              const hint = item.hint?.(counts);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChange(item.id)}
                  aria-current={activeItem ? 'page' : undefined}
                  className={`focus-ring group flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${activeItem ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-ink-600 hover:bg-paper-100 hover:text-ink-900'}`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${activeItem ? 'text-blue-600' : 'text-ink-400 group-hover:text-ink-600'}`} />
                  <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium">{item.label}</span>
                  {hint && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${activeItem ? 'bg-white text-blue-600' : 'bg-paper-100 text-ink-500'}`}>{hint}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#e1e4df] bg-white px-3.5">
            <div className="min-w-0">
              <div className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">{sectionLabel}</div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-5 pt-3 thin-scroll text-[13px]">{children}</div>
        </section>
      </div>

      <button
        type="button"
        aria-label="Resize sidebar"
        title="Drag to resize sidebar"
        onPointerDown={(e) => { e.preventDefault(); setDragging(true); }}
        className={`absolute -right-1.5 top-0 z-30 flex h-full w-3 touch-none cursor-col-resize items-center justify-center ${dragging ? 'bg-blue-50/80' : 'hover:bg-blue-50/70'}`}
      >
        <GripVertical className="h-5 w-5 text-ink-300" />
      </button>
    </aside>
  );
}
