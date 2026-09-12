function insertBlankCell(rows, dataRowIndexes, dataPosition, columnIndex, direction, dataEndRawIndex) {
  const next = rows.map((row) => [...row]);
  if (dataPosition < 0 || dataPosition >= dataRowIndexes.length || dataRowIndexes.length === 0) {
    return { rows: next, insertedRawIndex: -1 };
  }
  const ensureCell = (i) => { while (next[i].length <= columnIndex) next[i].push(null); };
  const insertPosition = direction === 'top' ? dataPosition : dataPosition + 1;
  let indexes = [...dataRowIndexes];
  const last = indexes[indexes.length - 1];
  ensureCell(last);
  const lastValue = next[last][columnIndex] ?? null;
  if (insertPosition >= indexes.length || (lastValue !== null && String(lastValue).trim() !== '')) {
    const width = Math.max(columnIndex + 1, ...next.map(r => r.length), 0);
    next.splice(dataEndRawIndex ?? next.length, 0, Array(width).fill(null));
    const at = dataEndRawIndex ?? next.length - 1;
    indexes = indexes.map(i => i >= at ? i + 1 : i);
    indexes.push(at);
  }
  for (let p = indexes.length - 1; p > insertPosition; p--) {
    const to = indexes[p], from = indexes[p - 1];
    ensureCell(to); ensureCell(from);
    next[to][columnIndex] = next[from][columnIndex] ?? null;
  }
  const at = indexes[insertPosition];
  ensureCell(at); next[at][columnIndex] = null;
  return { rows: next, insertedRawIndex: at };
}

const assert = (actual, expected, label) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
};

const rows = [['HEADER'], ['A'], ['B'], ['GROUP'], ['C'], ['D']];
const data = [1, 2, 4, 5];
assert(insertBlankCell(rows, data, 1, 0, 'top', 6).rows.map(r => r[0]), ['HEADER','A',null,'GROUP','B','C','D'], 'insert before');
assert(insertBlankCell(rows, data, 1, 0, 'bottom', 6).rows.map(r => r[0]), ['HEADER','A','B','GROUP',null,'C','D'], 'insert after');
assert(insertBlankCell([['HEADER'],['A'],['B'],['']], [1,2,3], 1, 0, 'top', 4).rows.map(r => r[0]), ['HEADER','A',null,'B'], 'insert before using spare empty tail');
assert(insertBlankCell([['HEADER'],['A'],['B'],['']], [1,2,3], 2, 0, 'bottom', 4).rows.map(r => r[0]), ['HEADER','A','B','',null], 'insert after using spare empty tail');
console.log('cell insertion regression tests: 4/4 passed');
