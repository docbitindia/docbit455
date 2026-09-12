-- 20260902000200: Grant PostgREST table privileges to authenticated users.
--
-- Supabase RLS answers: "which rows may this user access?"
-- PostgreSQL table grants answer: "may this role access the table at all?"
--
-- The DocBit RLS policies already restrict rows to the signed-in user/project
-- membership. These grants make those RLS policies reachable through the
-- Supabase REST API without disabling RLS.

-- Schema access required for PostgREST roles.
grant usage on schema public to anon, authenticated;

-- Profile: users can read/create/update only their own row via RLS.
grant select, insert, update on table public.profiles to authenticated;

-- Projects: row access is restricted by projects_select/update/delete RLS.
grant select, insert, update, delete on table public.projects to authenticated;

-- Project membership: RLS restricts management to project owners and
-- visibility to the member/owner.
grant select, insert, update, delete on table public.project_members to authenticated;

-- Project files: RLS restricts reads to project members and writes to the
-- project owner/editor.
grant select, insert, update, delete on table public.project_files to authenticated;

-- Activities: users can only read/write their own activity rows via RLS.
grant select, insert on table public.activities to authenticated;

-- Usage: users can read/create/update their own usage row via RLS.
grant select, insert, update on table public.usage to authenticated;

-- Sessions: users can read/delete their own session records via RLS.
grant select, delete on table public.user_sessions to authenticated;

-- Billing events are server-written with the service-role key. Authenticated
-- users only need SELECT, and RLS limits visibility to their own events.
grant select on table public.billing_events to authenticated;

-- Subscription and payment records are server-managed. Authenticated users
-- only need SELECT, with RLS limiting rows to their own records.
grant select on table public.subscriptions to authenticated;
grant select on table public.payments to authenticated;

-- No anonymous client access to private application data.
-- Keeping these tables ungranted to anon is intentional.
