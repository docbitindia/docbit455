# Supabase deployment notes

DocBit now uses Supabase primarily for authentication and account profile data. The legacy project, workspace, member, billing and entitlement model has been removed from the application.

## Migration

Apply migrations in order. The final core-only migration is:

`20260912120000_docbit_core_only.sql`

It removes legacy project/workspace/team/billing tables, related functions and obsolete plan state. **This is destructive for those legacy features and data. Back up anything you need before applying it.**

## Authentication

Configure the Supabase URL and anon key through the existing environment variables. Keep service-role credentials server-side only.

## Large files

Do not store 1 GB working files in Postgres rows. The browser workflow is optimized around incremental parsing and bounded previews, with CSV providing the strongest large-file path.
