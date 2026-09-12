import type { CellValue, ColumnSchema } from '../types/dataset';
import type { FilterCondition, FilterGroup } from '../types/report';
import { toDate, toNumber } from '../utils/format';

export function describeCondition(cond: FilterCondition, columnLabel: string): string {
  const map: Record<string, string> = {
    eq: `${columnLabel} = ${cond.value}`,
    neq: `${columnLabel} ≠ ${cond.value}`,
    contains: `${columnLabel} contains "${cond.value}"`,
    ncontains: `${columnLabel} does not contain "${cond.value}"`,
    startsWith: `${columnLabel} starts with "${cond.value}"`,
    endsWith: `${columnLabel} ends with "${cond.value}"`,
    empty: `${columnLabel} is empty`,
    nempty: `${columnLabel} is not empty`,
    gt: `${columnLabel} > ${cond.value}`,
    lt: `${columnLabel} < ${cond.value}`,
    gte: `${columnLabel} ≥ ${cond.value}`,
    lte: `${columnLabel} ≤ ${cond.value}`,
    between: `${columnLabel} between ${cond.value} and ${cond.value2}`,
    onDate: `${columnLabel} on ${cond.value}`,
    before: `${columnLabel} before ${cond.value}`,
    after: `${columnLabel} after ${cond.value}`,
    dateBetween: `${columnLabel} between ${cond.value} and ${cond.value2}`
  };
  return map[cond.operator] ?? `${columnLabel} matches`;
}

function evaluateCondition(value: CellValue, cond: FilterCondition): boolean {
  const strVal = value === null || value === undefined ? '' : String(value);

  switch (cond.operator) {
    case 'empty':
      return strVal.trim() === '';
    case 'nempty':
      return strVal.trim() !== '';
    case 'eq':
      return strVal.trim().toLowerCase() === cond.value.trim().toLowerCase();
    case 'neq':
      return strVal.trim().toLowerCase() !== cond.value.trim().toLowerCase();
    case 'contains':
      return strVal.toLowerCase().includes(cond.value.toLowerCase());
    case 'ncontains':
      return !strVal.toLowerCase().includes(cond.value.toLowerCase());
    case 'startsWith':
      return strVal.toLowerCase().startsWith(cond.value.toLowerCase());
    case 'endsWith':
      return strVal.toLowerCase().endsWith(cond.value.toLowerCase());
    case 'gt':
    case 'lt':
    case 'gte':
    case 'lte':
    case 'between': {
      const n = toNumber(value);
      if (n === null) return false;
      const target = Number(cond.value);
      if (cond.operator === 'gt') return n > target;
      if (cond.operator === 'lt') return n < target;
      if (cond.operator === 'gte') return n >= target;
      if (cond.operator === 'lte') return n <= target;
      const target2 = Number(cond.value2);
      const lo = Math.min(target, target2);
      const hi = Math.max(target, target2);
      return n >= lo && n <= hi;
    }
    case 'onDate':
    case 'before':
    case 'after':
    case 'dateBetween': {
      const d = toDate(value);
      if (!d) return false;
      const dTime = stripTime(d).getTime();
      if (cond.operator === 'onDate') {
        const target = toDate(cond.value);
        return !!target && stripTime(target).getTime() === dTime;
      }
      if (cond.operator === 'before') {
        const target = toDate(cond.value);
        return !!target && dTime < stripTime(target).getTime();
      }
      if (cond.operator === 'after') {
        const target = toDate(cond.value);
        return !!target && dTime > stripTime(target).getTime();
      }
      const t1 = toDate(cond.value);
      const t2 = toDate(cond.value2);
      if (!t1 || !t2) return false;
      const lo = Math.min(stripTime(t1).getTime(), stripTime(t2).getTime());
      const hi = Math.max(stripTime(t1).getTime(), stripTime(t2).getTime());
      return dTime >= lo && dTime <= hi;
    }
    default:
      return true;
  }
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function rowMatchesFilterGroup(
  row: CellValue[],
  group: FilterGroup,
  columnsByKey: Map<string, ColumnSchema>
): boolean {
  if (group.conditions.length === 0) return true;
  const results = group.conditions.map((cond) => {
    const col = columnsByKey.get(cond.columnKey);
    const value = col ? row[col.index] : null;
    return evaluateCondition(value ?? null, cond);
  });
  return group.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

export function operatorsForType(dataType: string): { value: string; label: string }[] {
  if (dataType === 'number') {
    return [
      { value: 'eq', label: 'Equals' },
      { value: 'neq', label: 'Does not equal' },
      { value: 'gt', label: 'Greater than' },
      { value: 'lt', label: 'Less than' },
      { value: 'gte', label: 'Greater than or equal' },
      { value: 'lte', label: 'Less than or equal' },
      { value: 'between', label: 'Between' },
      { value: 'empty', label: 'Is empty' },
      { value: 'nempty', label: 'Is not empty' }
    ];
  }
  if (dataType === 'date') {
    return [
      { value: 'onDate', label: 'On date' },
      { value: 'before', label: 'Before' },
      { value: 'after', label: 'After' },
      { value: 'dateBetween', label: 'Between' },
      { value: 'empty', label: 'Is empty' },
      { value: 'nempty', label: 'Is not empty' }
    ];
  }
  return [
    { value: 'eq', label: 'Equals' },
    { value: 'neq', label: 'Does not equal' },
    { value: 'contains', label: 'Contains' },
    { value: 'ncontains', label: 'Does not contain' },
    { value: 'startsWith', label: 'Starts with' },
    { value: 'endsWith', label: 'Ends with' },
    { value: 'empty', label: 'Is empty' },
    { value: 'nempty', label: 'Is not empty' }
  ];
}
