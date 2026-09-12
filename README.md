# DocBit

DocBit is a focused browser-first data preparation and editing application for Excel, CSV and JSON. The product flow is intentionally small:

**Authentication → `/workspace` → upload → analyze → edit → export → history**

## Core architecture

- React + TypeScript + Vite
- Supabase Auth for account authentication
- Papa Parse for CSV parsing
- Web Workers for large CSV/JSON parsing
- Virtualized table rendering for large working previews
- XLSX parsing for normal Excel workbooks
- Local browser history for recently opened files

## Large files

CSV and supported large JSON arrays are read incrementally in a Web Worker. Large inputs keep a bounded interactive preview rather than materializing an entire multi-gigabyte JavaScript object graph.

The current XLSX library is not a streaming workbook parser. To protect browser stability, very large Excel workbooks are rejected before `arrayBuffer()` allocation. For very large data, CSV is the preferred browser format. A future server-side workbook processor can remove that format-specific constraint.

## Routes

- `/` — public landing page
- `/auth/login` — authentication
- `/auth/signup` — account creation
- `/password/reset` — password recovery
- `/workspace` — primary file workflow
- `/history` — local file history

## Supabase

The latest migration (`20260912120000_docbit_core_only.sql`) removes the legacy project/workspace/team/billing data model from an existing database. Review it before applying because it intentionally drops those legacy tables and their data.

Never expose the Supabase service-role key in client-side environment variables.
