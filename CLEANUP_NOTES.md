# Project cleanup

- Removed five orphaned UI/page modules that had no imports or route references.
- Kept all worker modules because the Excel, CSV, JSON and report pipelines instantiate them directly.
- Kept adapter/engine/export modules because they are part of the active editor pipeline.
- No PDF editor/export module exists; report generation is intentionally isolated in `ReportGeneratorModal` and uses the browser print flow.
- Public/legal pages were left untouched per product scope.
