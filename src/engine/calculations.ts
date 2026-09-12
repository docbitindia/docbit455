import type { CellValue } from '../types/dataset';
import type { AggregateConfig } from '../types/report';
import type { SummaryResult } from '../types/processed';
import { formatNumber, toNumber } from '../utils/format';

export function computeAggregate(
  config: AggregateConfig,
  rows: CellValue[][],
  columnIndex: number | null,
  currencySymbol: string,
  isCurrency: boolean,
  thousands: boolean
): SummaryResult {
  let value = 0;

  if (config.fn === 'count') {
    value = rows.length;
  } else if (columnIndex !== null) {
    const nums = rows.map((r) => toNumber(r[columnIndex])).filter((n): n is number => n !== null);
    if (config.fn === 'sum') {
      value = nums.reduce((a, b) => a + b, 0);
    } else if (config.fn === 'avg') {
      value = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    } else if (config.fn === 'min') {
      value = nums.length ? Math.min(...nums) : 0;
    } else if (config.fn === 'max') {
      value = nums.length ? Math.max(...nums) : 0;
    }
  }

  const formatted = formatNumber(value, { thousandsSeparator: thousands, decimalPlaces: 2, decimalSeparator: 'dot', negativeDisplay: 'minus' });
  const displayValue = config.fn === 'count' ? formatted : `${isCurrency ? currencySymbol : ''}${formatted}`;

  return {
    id: config.id,
    label: config.label,
    fn: config.fn,
    columnKey: config.columnKey,
    value,
    displayValue
  };
}

export function aggregateLabel(fn: AggregateConfig['fn'], columnName: string | null): string {
  switch (fn) {
    case 'count':
      return 'Count';
    case 'sum':
      return `Sum of ${columnName ?? ''}`;
    case 'avg':
      return `Average of ${columnName ?? ''}`;
    case 'min':
      return `Minimum of ${columnName ?? ''}`;
    case 'max':
      return `Maximum of ${columnName ?? ''}`;
    default:
      return fn;
  }
}
