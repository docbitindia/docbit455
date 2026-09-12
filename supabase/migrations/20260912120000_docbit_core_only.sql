-- DocBit core-only product cleanup.
-- The application no longer exposes projects, workspaces, members, billing,
-- entitlements or PDF configuration persistence. This migration removes the
-- corresponding server-side product model from an existing installation.

-- Remove functions whose sole purpose was project/workspace/plan enforcement.
drop function if exists public.save_pdf_configuration(uuid,text,jsonb) cascade;
drop function if exists public.list_pdf_configurations(uuid) cascade;
drop function if exists public.create_project(text,text,uuid) cascade;
drop function if exists public.create_project(text,text) cascade;
drop function if exists public.increment_project_usage(uuid,bigint) cascade;
drop function if exists public.enforce_project_plan_limits() cascade;
drop function if exists public.enforce_file_plan_limits() cascade;
drop function if exists public.plan_limit(text,text) cascade;
drop function if exists public.is_workspace_owner(uuid) cascade;
drop function if exists public.workspace_role_for(uuid) cascade;
drop function if exists public.can_workspace_access(uuid) cascade;
drop function if exists public.can_workspace_manage(uuid) cascade;
drop function if exists public.is_project_owner(uuid) cascade;
drop function if exists public.can_project_access(uuid) cascade;
drop function if exists public.can_project_edit(uuid) cascade;
drop function if exists public.consume_processed_file() cascade;
drop function if exists public.consume_processing_session() cascade;
drop function if exists public.create_workspace(text,text) cascade;
drop function if exists public.enforce_member_plan_limits() cascade;
drop function if exists public.enforce_workspace_member_plan_limits() cascade;
drop function if exists public.current_usage_period() cascade;
drop function if exists public.invite_workspace_member(uuid,text,public.workspace_role) cascade;
drop function if exists public.manage_project_member(uuid,uuid,public.project_role) cascade;
drop function if exists public.prevent_client_plan_change() cascade;
drop function if exists public.project_member_is_owner(uuid) cascade;
drop function if exists public.remove_workspace_member(uuid,uuid) cascade;
drop function if exists public.sync_project_file_counters() cascade;
drop function if exists public.sync_usage_storage() cascade;
drop function if exists public.update_workspace_member(uuid,uuid,public.workspace_role) cascade;
drop function if exists public.workspace_owner_id(uuid) cascade;

-- Remove product tables and dependent data.
drop table if exists public.pdf_configurations cascade;
drop table if exists public.workspace_members cascade;
drop table if exists public.workspaces cascade;
drop table if exists public.project_members cascade;
drop table if exists public.project_files cascade;
drop table if exists public.projects cascade;
drop table if exists public.activities cascade;
drop table if exists public.usage cascade;
drop table if exists public.billing_events cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.payments cascade;

-- Session tracking is not required by the core product.
drop table if exists public.user_sessions cascade;

-- The core account model does not contain subscription state.
alter table if exists public.profiles drop column if exists plan;

-- Keep the auth trigger, but remove its legacy plan dependency.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,display_name,photo_url,status,onboarding_complete)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),new.raw_user_meta_data->>'avatar_url','active',false)
  on conflict(id) do update set email=excluded.email;
  return new;
end $$;

-- Remove obsolete enum types after dependent tables/functions are gone.
drop type if exists public.workspace_role cascade;
drop type if exists public.project_role cascade;
drop type if exists public.activity_type cascade;

-- Project storage is obsolete. Profile media is retained for account profile
-- compatibility; raw working files must not be stored in Postgres rows.
delete from storage.objects where bucket_id = 'project-files';
delete from storage.buckets where id = 'project-files';
