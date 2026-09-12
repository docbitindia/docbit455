import type { ReportSection } from '../types/report';

export interface NavItem {
  id: ReportSection;
  label: string;
  hint?: (counts: NavCounts) => string | undefined;
  /** returns a reason the section is unavailable, or undefined if it's usable */
  unavailable?: (counts: NavCounts) => string | undefined;
}

export interface NavCounts {
  filters: number;
  sorts: number;
  columns: number;
  totalColumns: number;
  calculations: number;
  grouped: boolean;
  groupLabel?: string;
  sortLabel?: string;
  qualityIssues: number;
  hasNumericColumns: boolean;
  hasDateColumns: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'general', label: 'General', hint: (c) => (c.qualityIssues > 0 ? `${c.qualityIssues}` : undefined) },
  { id: 'columns', label: 'Columns', hint: (c) => `${c.columns}/${c.totalColumns}` },
  { id: 'filter', label: 'Filter', hint: (c) => (c.filters > 0 ? String(c.filters) : undefined) },
  { id: 'sort', label: 'Sort', hint: (c) => (c.sortLabel ? c.sortLabel : c.sorts > 0 ? String(c.sorts) : undefined) },
  {
    id: 'group',
    label: 'Group',
    hint: (c) => (c.grouped ? c.groupLabel ?? '•' : undefined)
  },
  {
    id: 'calculate',
    label: 'Calculate',
    hint: (c) => (c.calculations > 0 ? String(c.calculations) : undefined),
    unavailable: (c) => (c.hasNumericColumns ? undefined : 'No numeric fields available')
  },
  { id: 'export', label: 'Export' },
  { id: 'report', label: 'Generate Report' }
];
