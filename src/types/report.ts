// Report configuration: the user's instructions for turning a RawDataset
// into a report. This is never mutated destructively into the source data —
// it is a separate, serializable description of intent.

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'ncontains'
  | 'startsWith'
  | 'endsWith'
  | 'empty'
  | 'nempty'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'between'
  | 'onDate'
  | 'before'
  | 'after'
  | 'dateBetween';

export interface FilterCondition {
  id: string;
  columnKey: string;
  operator: FilterOperator;
  value: string;
  value2: string; // used by "between" style operators
}

export interface FilterGroup {
  id: string;
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export interface SortRule {
  id: string;
  columnKey: string;
  direction: 'asc' | 'desc';
}

export type AggregateFn = 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface AggregateConfig {
  id: string;
  fn: AggregateFn;
  columnKey: string | null; // null only valid for "count"
  label: string;
}

export interface GroupConfig {
  columnKey: string | null;
  aggregates: AggregateConfig[];
}

export type DateDisplayFormat =
  | 'DD MMM YYYY'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY-MM-DD'
  | 'DD-MM-YYYY'
  | 'MM-DD-YYYY'
  | 'DD MMM YYYY, HH:mm'
  | 'custom';

export interface ColumnDisplaySettings {
  numberFormat: 'standard' | 'plain';
  decimalPlaces: number;
  thousandsSeparator: boolean;
  decimalSeparator: 'dot' | 'comma';
  currencyEnabled: boolean;
  percentageEnabled: boolean;
  currencySymbol: string;
  currencyCode: string;
  negativeDisplay: 'minus' | 'parentheses';
  dateFormat: DateDisplayFormat;
  customDateFormat: string;
  alignment: 'left' | 'center' | 'right';
  width: number;
  wrapping: 'wrap' | 'truncate';
  trimWhitespace: boolean;
  textCase: 'none' | 'upper' | 'lower' | 'title';
  urlDisplay: 'full' | 'compact' | 'domain';
  openLinks: boolean;
  openInNewTab: boolean;
  validateUrl: boolean;
  booleanStyle: 'text' | 'checkbox';
  trueLabel: string;
  falseLabel: string;
  nullDisplay: string;
}

export interface ColumnConfig {
  key: string;
  visible: boolean;
  displayName: string;
  order: number;
  type: import('./dataset').DataType;
  settings: ColumnDisplaySettings;
}

export interface RowRange {
  id: string;
  start: number; // 1-based, inclusive, refers to position within the raw file
  end: number; // 1-based, inclusive
}

/** Settings for data exports plus the separate report generator. */
export interface ReportBranding {
  logoUrl: string;
  title: string;
  subtitle: string;
  phone: string;
  email: string;
  link: string;
  theme: string;
  bottomText: string;
  iconUrls: string[];
}

export interface ExtractSettings {
  fileName: string;
  showSummary: boolean;
  density: 'compact' | 'comfortable';
  branding: ReportBranding;
}

export interface ReportConfig {
  /** Monotonic logical revision; changed only by persistent document transactions. */
  revision?: number;
  headerRowIndex: number;
  excludedRanges: RowRange[];
  columns: ColumnConfig[];
  filterGroup: FilterGroup;
  sorts: SortRule[];
  group: GroupConfig;
  calculations: AggregateConfig[];
  design: ExtractSettings;
}

export type ReportSection =
  | 'general'
  | 'columns'
  | 'filter'
  | 'sort'
  | 'group'
  | 'calculate'
  | 'export'
  | 'report';
