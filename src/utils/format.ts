import type { CellValue } from '../types/dataset';
import type { ColumnDisplaySettings } from '../types/report';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatNumber(
  n: number,
  settings: Pick<ColumnDisplaySettings, 'thousandsSeparator' | 'decimalPlaces' | 'decimalSeparator' | 'negativeDisplay'>
): string {
  if (!Number.isFinite(n)) return '';
  const decimals = Math.max(0, Math.min(10, settings.decimalPlaces));
  const absolute = Math.abs(n).toFixed(decimals);
  let [whole, fraction] = absolute.split('.');
  if (settings.thousandsSeparator) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let result = fraction ? `${whole}.${fraction}` : whole;
  if (settings.decimalSeparator === 'comma') result = result.replace('.', ',');
  if (n < 0) result = settings.negativeDisplay === 'parentheses' ? `(${result})` : `-${result}`;
  return result;
}

export function formatDate(value: CellValue, format: ColumnDisplaySettings['dateFormat'], customFormat = ''): string {
  const d = toDate(value);
  if (!d) return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();

  const dd = String(d.getDate()).padStart(2, '0');
  const d1 = String(d.getDate());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const m1 = String(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLong = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  if (format === 'custom' && customFormat) return applyCustomDateFormat(d, customFormat);
  switch (format) {
    case 'DD/MM/YYYY': return `${dd}/${mm}/${yyyy}`;
    case 'MM/DD/YYYY': return `${mm}/${dd}/${yyyy}`;
    case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
    case 'DD-MM-YYYY': return `${dd}-${mm}-${yyyy}`;
    case 'MM-DD-YYYY': return `${mm}-${dd}-${yyyy}`;
    case 'DD MMM YYYY, HH:mm': return `${dd} ${months[d.getMonth()]} ${yyyy}, ${hours}:${minutes}`;
    case 'DD MMM YYYY':
    default: return `${dd} ${months[d.getMonth()]} ${yyyy}`;
  }
}

function applyCustomDateFormat(date: Date, format: string): string {
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MMMM: ['January','February','March','April','May','June','July','August','September','October','November','December'][date.getMonth()],
    MMM: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()],
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    DD: String(date.getDate()).padStart(2, '0'),
    HH: String(date.getHours()).padStart(2, '0'),
    mm: String(date.getMinutes()).padStart(2, '0')
  };
  return format.replace(/YYYY|MMMM|MMM|MM|DD|HH|mm/g, (token) => tokens[token]);
}

/* ====================================================================
 * DATE PARSING
 *
 * Real-world spreadsheets and CSVs contain dates in wildly inconsistent
 * shapes: mixed separators ("2024/01-05"), extra/irregular whitespace
 * ("17   Aug  2026", " 2024-01-05 "), textual months ("Aug 17, 2026",
 * "17-August-2026"), 2-digit or 4-digit years, and outright invalid
 * values ("31/02/2024", "13/13/2024"). The parser below normalizes the
 * input first, then tries a small set of well-defined interpretations,
 * and finally validates the result so that logically impossible dates
 * (Feb 30, month 13, etc.) are rejected rather than silently rolled
 * over into the next month by the JS Date constructor.
 * ==================================================================== */

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

/** Splits a date-like string into its meaningful parts, treating any run
 *  of non-alphanumeric characters (slashes, dashes, dots, commas, and any
 *  amount of whitespace) as a single separator. This is what lets mixed
 *  separators and unnecessary/irregular spacing "just work". */
function tokenizeDateString(input: string): string[] {
  return input
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter((t) => t.length > 0);
}

function normalizeYear(y: number): number {
  if (y >= 100 || y < 0) return y;
  // Two-digit year heuristic: 00-69 -> 2000s, 70-99 -> 1900s.
  return y >= 70 ? 1900 + y : 2000 + y;
}

/** Builds a Date from year/month(0-based)/day and rejects any value that
 *  the JS Date constructor would otherwise silently "roll over" (e.g.
 *  Feb 30 -> Mar 2), so genuinely incorrect dates are treated as unparseable. */
function buildValidatedDate(year: number, month: number, day: number): Date | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 0 || month > 11) return null;
  if (day < 1 || day > 31) return null;
  const normalizedYear = year < 100 && year >= 0 ? normalizeYear(year) : year;
  const d = new Date(normalizedYear, month, day);
  if (d.getFullYear() !== normalizedYear || d.getMonth() !== month || d.getDate() !== day) return null;
  return d;
}

/** Resolves the two remaining numeric tokens once a month name has been
 *  identified, figuring out which is the day and which is the year. */
function resolveDayAndYear(a: string, b: string): { day: number; year: number } | null {
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return null;
  const na = Number(a);
  const nb = Number(b);
  // Whichever token is 4 digits (or too large to be a day) is the year.
  if (a.length === 4 || na > 31) return { day: nb, year: na };
  if (b.length === 4 || nb > 31) return { day: na, year: nb };
  // Ambiguous (both small): the year is conventionally the token that is
  // NOT adjacent to the month name in common formats ("DD Mon YYYY" /
  // "Mon DD, YYYY"), which in both cases is the trailing token here.
  return { day: na, year: nb };
}

/** Resolves three purely numeric tokens (no month name present) into a date. */
function resolveNumericTriplet(t1: string, t2: string, t3: string): { year: number; month: number; day: number } | null {
  if (!/^\d+$/.test(t1) || !/^\d+$/.test(t2) || !/^\d+$/.test(t3)) return null;
  const n1 = Number(t1);
  const n2 = Number(t2);
  const n3 = Number(t3);

  let year: number;
  let month: number; // 1-based here, converted before returning
  let day: number;

  if (t1.length === 4) {
    // YYYY-MM-DD (or YYYY-DD-MM if the middle value can't be a month).
    year = n1;
    if (n2 > 12 && n3 <= 12) {
      month = n3;
      day = n2;
    } else {
      month = n2;
      day = n3;
    }
  } else if (t3.length === 4 || n3 > 31) {
    // xx-xx-YYYY. Disambiguate DD/MM vs MM/DD by checking which value
    // can't possibly be a month.
    year = n3;
    if (n1 > 12 && n2 <= 12) {
      day = n1;
      month = n2;
    } else if (n2 > 12 && n1 <= 12) {
      month = n1;
      day = n2;
    } else {
      // Genuinely ambiguous (both <=12): default to MM/DD/YYYY, the
      // convention used elsewhere in DocBit's own date format options.
      month = n1;
      day = n2;
    }
  } else {
    // No 4-digit year present at all: assume a trailing 2-digit year.
    year = n3;
    if (n1 > 12 && n2 <= 12) {
      day = n1;
      month = n2;
    } else if (n2 > 12 && n1 <= 12) {
      month = n1;
      day = n2;
    } else {
      month = n1;
      day = n2;
    }
  }

  return { year, month: month - 1, day };
}

/** Parses a date expressed with a textual month name mixed with numeric
 *  day/year tokens, in any order, regardless of separator or spacing. */
function resolveNamedMonthDate(tokens: string[]): Date | null {
  const [t1, t2, t3] = tokens;
  const named = (t: string) => MONTH_NAMES[t.toLowerCase()] ?? null;

  const m1 = named(t1);
  const m2 = named(t2);
  const m3 = named(t3);

  if (m1 !== null) {
    const rest = resolveDayAndYear(t2, t3);
    if (!rest) return null;
    return buildValidatedDate(rest.year, m1, rest.day);
  }
  if (m2 !== null) {
    const rest = resolveDayAndYear(t1, t3);
    if (!rest) return null;
    return buildValidatedDate(rest.year, m2, rest.day);
  }
  if (m3 !== null) {
    const rest = resolveDayAndYear(t1, t2);
    if (!rest) return null;
    return buildValidatedDate(rest.year, m3, rest.day);
  }
  return null;
}

/** Advanced, tolerant date-string parser: handles mixed separators,
 *  unnecessary/irregular whitespace, textual months, 2- or 4-digit years,
 *  and rejects logically incorrect dates outright. */
function parseFlexibleDate(raw: string): Date | null {
  const tokens = tokenizeDateString(raw);
  if (tokens.length < 3) return null;

  // Only the first three tokens describe the date itself; anything after
  // (e.g. a time-of-day component) is ignored since DocBit formats dates
  // without time.
  const dateTokens = tokens.slice(0, 3);

  const named = resolveNamedMonthDate(dateTokens);
  if (named) return named;

  const numeric = resolveNumericTriplet(dateTokens[0], dateTokens[1], dateTokens[2]);
  if (!numeric) return null;
  return buildValidatedDate(numeric.year, numeric.month, numeric.day);
}

export function toDate(value: CellValue): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // Excel serial date (days since 1899-12-30)
    if (value > 20000 && value < 80000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(epoch.getTime() + value * 86400000);
    }
    return null;
  }
  if (typeof value === 'string') {
    // Collapse any run of whitespace (including tabs/newlines/multiple
    // spaces) down to a single space, and trim the ends, so "unnecessary
    // spaces" never break parsing.
    const collapsed = value.replace(/\s+/g, ' ').trim();
    if (!collapsed) return null;

    // Fast path: unambiguous ISO 8601 date (optionally with a time part).
    const isoMatch = /^(\d{4}-\d{2}-\d{2})([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(collapsed);
    if (isoMatch) {
      const iso = collapsed.includes(' ') ? collapsed.replace(' ', 'T') : collapsed;
      const parsed = new Date(iso);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    return parseFlexibleDate(collapsed);
  }
  return null;
}

export function displayCell(
  value: CellValue,
  dataType: import('../types/dataset').DataType,
  settings: ColumnDisplaySettings
): string {
  if (value === null || value === undefined || value === '') return settings.nullDisplay ?? '';
  if (settings.trimWhitespace && typeof value === 'string') value = value.replace(/\s+/g, ' ').trim();

  if (dataType === 'date') return formatDate(value, settings.dateFormat, settings.customDateFormat);
  if (dataType === 'number') {
    const parsedNumber = toNumber(value);
    if (parsedNumber === null) return typeof value === 'string' ? value : '';
    let displayNumber = parsedNumber;
    // Percentage values are stored as percentage points: 73.5 means 73.5%.
    let formatted = formatNumber(displayNumber, settings);
    if (settings.percentageEnabled) formatted += '%';
    if (settings.currencyEnabled) formatted = `${settings.currencySymbol}${formatted}`;
    return formatted;
  }
  if (dataType === 'boolean') {
    if (settings.booleanStyle === 'checkbox') return value ? '☑' : '☐';
    return value ? settings.trueLabel : settings.falseLabel;
  }
  if (dataType === 'url' && typeof value === 'string') {
    try {
      const url = new URL(value.trim());
      if (settings.urlDisplay === 'domain') return url.hostname;
      if (settings.urlDisplay === 'compact') return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
    } catch {}
  }
  if (typeof value === 'string') {
    if (settings.textCase === 'upper') return value.toUpperCase();
    if (settings.textCase === 'lower') return value.toLowerCase();
    if (settings.textCase === 'title') return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    return value;
  }
  return String(value);
}

export function toNumber(value: CellValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return null;
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[,$₹€£\s]/g, '');
  if (cleaned === '' || isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}
