# DocBit updated build notes

Implemented in this source update:

- Moved XLSX workbook parsing/extraction into a dedicated Web Worker so workbook parsing no longer blocks React's main thread.
- Added AbortSignal cancellation to Excel/CSV/JSON large-file parsing and a visible Cancel processing action in the analysis screen.
- Added explicit analysis-stage messaging and live percentage progress.
- Added an off-main-thread report-processing worker for large datasets (large-file previews and datasets over 20k rows), including filtering/sorting/grouping/quality calculations.
- Removed a full-dataset `JSON.stringify()` dirty-state check; editor revisions now use the existing revision counter.
- Removed an unnecessary normalized-row Map allocation from the report pipeline.
- Deferred table search input with React `useDeferredValue` to prevent keystrokes from synchronously triggering expensive 100k-row scans.
- Throttled grid scroll state updates with `requestAnimationFrame`.
- Added an Excel-style fast row navigator on the right edge of the grid with a draggable thumb and track jumping.
- Added Ctrl/Cmd+Home, Ctrl/Cmd+End, PageUp and PageDown navigation.
- Large grouped datasets (>20,000 report rows) automatically use a flat virtualized grid view rather than rendering every grouped row at once. Grouping calculations remain intact.
- Added a clear UI state while the large-data report worker recalculates.

Important architectural limitation:
- CSV/JSON large-file imports currently load a bounded interactive preview (100,000 rows) rather than retaining millions of editable rows in browser memory. The fast navigator therefore jumps through the rows actually loaded into the interactive grid; it does not pretend to provide random-access editing of unloaded source rows.
- XLSX/XLS processing remains capped at 200 MB because SheetJS workbook expansion can multiply memory usage dramatically even inside a worker. For truly huge workbooks, a server-side workbook processor or conversion to CSV is still the safer architecture.
- Full production `npm run typecheck` / `npm run build` could not be executed in this environment because dependency installation timed out and the supplied project did not include `node_modules`. The source was statically inspected after the changes; run `npm install`, then `npm run typecheck` and `npm run build` in the target environment before deployment.
