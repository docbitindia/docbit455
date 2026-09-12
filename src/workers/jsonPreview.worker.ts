const CHUNK_SIZE = 4 * 1024 * 1024;

type Message = { file: File; maxRows: number };

function stripBom(text: string) { return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; }

self.onmessage = async (event: MessageEvent<Message>) => {
  const { file, maxRows } = event.data;
  const rows: unknown[] = [];
  let totalRows = 0;
  let buffer = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  let valueStart = -1;
  let started = false;
  let rootArray = false;

  const consume = (text: string, final = false) => {
    buffer += text;
    if (!started) {
      buffer = stripBom(buffer);
      const first = buffer.search(/\S/);
      if (first < 0) return;
      if (buffer[first] !== '[') throw new Error('Large JSON processing currently requires a top-level array of records.');
      rootArray = true; started = true;
      buffer = buffer.slice(first + 1);
    }

    let segmentStart = 0;
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; if (depth === 0 && valueStart < 0) valueStart = i; continue; }
      if (depth === 0 && valueStart < 0) {
        if (/\s|,/.test(ch)) { segmentStart = i + 1; continue; }
        if (ch === ']') { segmentStart = i + 1; continue; }
        valueStart = i;
      }
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
      if (depth === 0 && valueStart >= 0) {
        const raw = buffer.slice(valueStart, i + 1).trim().replace(/,$/, '');
        if (raw) {
          try { const value = JSON.parse(raw); totalRows++; if (rows.length < maxRows) rows.push(value); }
          catch { throw new Error('This JSON file contains an invalid record.'); }
        }
        valueStart = -1; segmentStart = i + 1;
      }
    }
    if (valueStart > 0 && !final) buffer = buffer.slice(valueStart);
    else if (final) buffer = buffer.slice(segmentStart);
    else buffer = buffer.slice(Math.max(0, segmentStart));
  };

  try {
    for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
      const text = await file.slice(offset, Math.min(file.size, offset + CHUNK_SIZE)).text();
      consume(text);
      self.postMessage({ type: 'progress', progress: Math.min(99, Math.round(Math.min(file.size, offset + CHUNK_SIZE) / file.size * 100)), rows: totalRows });
    }
    consume('', true);
    if (!rootArray || totalRows === 0) throw new Error('This JSON file does not contain any records.');
    self.postMessage({ type: 'complete', result: { rows, totalRows, truncated: totalRows > rows.length } });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The JSON could not be parsed.' });
  }
};
