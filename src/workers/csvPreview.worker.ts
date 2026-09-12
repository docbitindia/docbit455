import Papa from 'papaparse';

type Message = { file: File; maxRows: number };

type Result = { rows: unknown[][]; totalRows: number; truncated: boolean };

self.onmessage = (event: MessageEvent<Message>) => {
  const { file, maxRows } = event.data;
  const rows: unknown[][] = [];
  let totalRows = 0;
  try {
    Papa.parse<unknown[]>(file, {
      header: false,
      dynamicTyping: true,
      skipEmptyLines: false,
      worker: false,
      chunkSize: 4 * 1024 * 1024,
      chunk: (chunk: Papa.ParseResult<unknown[]>) => {
        for (const row of chunk.data) {
          if (Array.isArray(row)) {
            totalRows += 1;
            if (rows.length < maxRows) rows.push(row);
          }
        }
        const cursor = Number(chunk.meta?.cursor || 0);
        const progress = file.size ? Math.min(99, Math.round(cursor / file.size * 100)) : 0;
        self.postMessage({ type: 'progress', progress, rows: totalRows });
      },
      complete: () => {
        const result: Result = { rows, totalRows, truncated: totalRows > rows.length };
        self.postMessage({ type: 'complete', result });
      },
      error: (error: any) => self.postMessage({ type: 'error', message: error?.message || 'The CSV could not be parsed.' })
    });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The CSV could not be parsed.' });
  }
};
