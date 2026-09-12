-- DocBit production product model: workspaces, canonical entitlements and access.
-- Additive migration: preserves existing data and backfills a default workspace.

create type public.workspace_role as enum ('owner','admin','editor','member');

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  slug text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, slug)
);
create index if not exists workspaces_owner_idx on public.workspaces(owner_id,updated_at desc);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id,workspace_id);

alter table public.projects add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
create index if not exists projects_workspace_idx on public.projects(workspace_id,updated_at desc);

-- Backfill one meaningful default workspace per account and attach every existing project.
insert into public.workspaces(owner_id,name,description,slug)
select p.id,
       case when nullif(trim(p.display_name),'') is null then 'My Workspace' else trim(p.display_name)||'''s Workspace' end,
       'Your default DocBit workspace.',
       'default'
from public.profiles p
where not exists(select 1 from public.workspaces w where w.owner_id=p.id);

insert into public.workspace_members(workspace_id,user_id,role)
select w.id,w.owner_id,'owner'::public.workspace_role
from public.workspaces w
where not exists(select 1 from public.workspace_members wm where wm.workspace_id=w.id and wm.user_id=w.owner_id);

update public.projects p
set workspace_id = w.id
from public.workspaces w
where p.workspace_id is null and w.owner_id=p.owner_id and w.slug is not distinct from 'default';

-- If a future account has multiple legacy candidates, choose its first workspace safely.
update public.projects p
set workspace_id = w.id
from lateral (select id from public.workspaces x where x.owner_id=p.owner_id order by x.created_at asc limit 1) w
where p.workspace_id is null;

alter table public.projects alter column workspace_id set not null;

-- Keep the updated_at trigger model consistent.
drop trigger if exists workspaces_updated on public.workspaces;
create trigger workspaces_updated before update on public.workspaces for each row execute function public.set_updated_at();
drop trigger if exists workspace_members_updated on public.workspace_members;
create trigger workspace_members_updated before update on public.workspace_members for each row execute function public.set_updated_at();

create or replace function public.is_workspace_owner(p_workspace_id uuid) returns boolean
language sql security definer set search_path=public stable as $$
  select exists(select 1 from public.workspaces where id=p_workspace_id and owner_id=auth.uid());
$$;

create or replace function public.workspace_role_for(p_workspace_id uuid) returns public.workspace_role
language sql security definer set search_path=public stable as $$
  select case when w.owner_id=auth.uid() then 'owner'::public.workspace_role else wm.role end
  from public.workspaces w
  left join public.workspace_members wm on wm.workspace_id=w.id and wm.user_id=auth.uid()
  where w.id=p_workspace_id;
$$;

create or replace function public.can_workspace_access(p_workspace_id uuid) returns boolean
language sql security definer set search_path=public stable as $$
  select public.workspace_role_for(p_workspace_id) is not null;
$$;

create or replace function public.can_workspace_manage(p_workspace_id uuid) returns boolean
language sql security definer set search_path=public stable as $$
  select public.workspace_role_for(p_workspace_id) in ('owner','admin');
$$;

create or replace function public.can_project_access(p_project_id uuid) returns boolean
language sql security definer set search_path=public stable as $$
  select exists(select 1 from public.projects p where p.id=p_project_id and (
      p.owner_id=auth.uid()
      or exists(select 1 from public.workspace_members wm where wm.workspace_id=p.workspace_id and wm.user_id=auth.uid())
      or exists(select 1 from public.project_members pm where pm.project_id=p.id and pm.user_id=auth.uid())
  ));
$$;

create or replace function public.can_project_edit(p_project_id uuid) returns boolean
language sql security definer set search_path=public stable as $$
  select exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=auth.uid())
      or exists(select 1 from public.workspace_members wm join public.projects p on p.workspace_id=wm.workspace_id where p.id=p_project_id and wm.user_id=auth.uid() and wm.role in ('owner','admin','editor'))
      or exists(select 1 from public.project_members pm where pm.project_id=p_project_id and pm.user_id=auth.uid() and pm.role='editor');
$$;

-- Canonical plan function. max_rows is deliberately absent from customer entitlements.
create or replace function public.plan_limit(p_plan text,p_key text) returns bigint
language sql immutable as $$
  select case p_key
    when 'workspaces' then case p_plan when 'free' then 1 when 'starter' then 3 when 'pro' then 10 when 'pro_plus' then 50 else 1 end
    when 'projects' then case p_plan when 'free' then 10 when 'starter' then 50 when 'pro' then 100 when 'pro_plus' then 1000 else 10 end
    when 'storage_bytes' then case p_plan when 'free' then 250::bigint*1024*1024 when 'starter' then 2::bigint*1024*1024*1024 when 'pro' then 10::bigint*1024*1024*1024 when 'pro_plus' then 50::bigint*1024*1024*1024 else 250::bigint*1024*1024 end
    when 'max_file_bytes' then case p_plan when 'free' then 25::bigint*1024*1024 when 'starter' then 100::bigint*1024*1024 when 'pro' then 500::bigint*1024*1024 when 'pro_plus' then 1024::bigint*1024*1024 else 25::bigint*1024*1024 end
    when 'processing_sessions_month' then case p_plan when 'free' then 10 when 'starter' then 50 when 'pro' then 1000 when 'pro_plus' then 10000 else 10 end
    when 'editors' then case p_plan when 'pro' then 50 when 'pro_plus' then null else 0 end
    when 'users' then case p_plan when 'pro' then 500 when 'pro_plus' then null else 0 end
    when 'activity' then case p_plan when 'pro' then 1 when 'pro_plus' then 2 else 0 end
    when 'priority_processing' then case when p_plan in ('pro','pro_plus') then 1 else 0 end
    when 'priority_support' then 1
    when 'advertisements' then case when p_plan='free' then 1 else 0 end
    when 'custom_pdf_branding' then case when p_plan in ('starter','pro','pro_plus') then 1 else 0 end
    when 'saved_configurations' then case p_plan when 'free' then 3 when 'starter' then 25 when 'pro' then 100 when 'pro_plus' then null else 3 end
    else 0
  end;
$$;

-- Project creation is now workspace-aware and remains authoritative in the database.
create or replace function public.create_project(p_name text,p_description text default '',p_workspace_id uuid default null)
returns public.projects
language plpgsql security definer set search_path=public as $$
declare result public.projects; wid uuid; p_plan text; p_count bigint; role public.workspace_role;
begin
  if auth.uid() is null or not public.account_is_active(auth.uid()) then raise exception 'Authentication required.' using errcode='42501'; end if;
  select coalesce(plan,'free') into p_plan from public.profiles where id=auth.uid();
  if p_workspace_id is null then select id into wid from public.workspaces where owner_id=auth.uid() order by created_at asc limit 1;
  else wid:=p_workspace_id; end if;
  if wid is null or not public.can_workspace_access(wid) then raise exception 'Workspace not found or inaccessible.' using errcode='42501'; end if;
  role:=public.workspace_role_for(wid);
  if role not in ('owner','admin','editor') then raise exception 'You do not have permission to create projects in this workspace.' using errcode='42501'; end if;
  select count(*) into p_count from public.projects where owner_id=auth.uid();
  if p_count >= public.plan_limit(p_plan,'projects') then raise exception 'Project limit reached for your % plan.',p_plan using errcode='P2001'; end if;
  insert into public.projects(owner_id,workspace_id,name,description)
  values(auth.uid(),wid,left(coalesce(nullif(trim(p_name),''),'Untitled project'),200),left(coalesce(p_description,''),2000)) returning * into result;
  return result;
end;$$;
revoke execute on function public.create_project(text,text,uuid) from public,anon;
grant execute on function public.create_project(text,text,uuid) to authenticated;

-- Authoritative monthly processing-session consumption. Atomic row lock prevents races.
alter table public.usage add column if not exists processing_sessions integer not null default 0;
create or replace function public.consume_processing_session() returns boolean
language plpgsql security definer set search_path=public as $$
declare p_plan text; used bigint; lim bigint;
begin
 select coalesce(plan,'free') into p_plan from public.profiles where id=auth.uid() and status='active';
 if p_plan is null then raise exception 'Active profile not found.' using errcode='42501'; end if;
 lim:=public.plan_limit(p_plan,'processing_sessions_month');
 select coalesce(processing_sessions,0) into used from public.usage where user_id=auth.uid() and period=public.current_usage_period() for update;
 if used>=lim then return false; end if;
 insert into public.usage(user_id,period,processed_files,processing_sessions) values(auth.uid(),public.current_usage_period(),used+1,used+1)
 on conflict(user_id,period) do update set processed_files=excluded.processed_files,processing_sessions=excluded.processing_sessions,updated_at=now();
 return true;
end;$$;
revoke execute on function public.consume_processing_session() from public,anon;
grant execute on function public.consume_processing_session() to authenticated;

-- New saved file path records row_count for technical diagnostics only. Never use it as a plan entitlement.
create or replace function public.enforce_file_plan_limits() returns trigger language plpgsql security definer set search_path=public as $$
declare owner_uid uuid; p_plan text; used_storage bigint; old_size bigint:=0; limit_storage bigint; limit_file bigint;
begin
 select owner_id into owner_uid from public.projects where id=coalesce(new.project_id,old.project_id);
 if owner_uid is null then raise exception 'Project not found.' using errcode='P1000'; end if;
 select coalesce(plan,'free') into p_plan from public.profiles where id=owner_uid;
 limit_file:=public.plan_limit(p_plan,'max_file_bytes'); limit_storage:=public.plan_limit(p_plan,'storage_bytes');
 if new.size is null or new.size<0 then raise exception 'File size cannot be negative.' using errcode='P1000'; end if;
 if new.size>limit_file then raise exception 'Your % plan supports files up to % MB.',p_plan,(limit_file/1024/1024)::text using errcode='P1001'; end if;
 select coalesce(sum(size),0)::bigint into used_storage from public.project_files where owner_id=owner_uid;
 if tg_op='UPDATE' then select coalesce(size,0) into old_size from public.project_files where id=old.id; end if;
 if used_storage-old_size+new.size>limit_storage then raise exception 'Storage limit reached for your % plan.',p_plan using errcode='P1002'; end if;
 return new;
end;$$;

drop trigger if exists enforce_file_plan_limits on public.project_files;
create trigger enforce_file_plan_limits before insert or update of project_id,size on public.project_files for each row execute function public.enforce_file_plan_limits();

-- Workspace/project/file RLS. Existing project-member policies remain useful for scoped project assignments.
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces for select using(public.can_workspace_access(id));
drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces for insert with check(owner_id=auth.uid() and public.account_is_active(auth.uid()));
drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces for update using(public.can_workspace_manage(id)) with check(owner_id=auth.uid());
drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_delete on public.workspaces for delete using(public.is_workspace_owner(id));

drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members for select using(public.can_workspace_access(workspace_id));
drop policy if exists workspace_members_insert on public.workspace_members;
create policy workspace_members_insert on public.workspace_members for insert with check(public.can_workspace_manage(workspace_id));
drop policy if exists workspace_members_update on public.workspace_members;
create policy workspace_members_update on public.workspace_members for update using(public.can_workspace_manage(workspace_id)) with check(public.can_workspace_manage(workspace_id) and role<>'owner');
drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members for delete using(public.can_workspace_manage(workspace_id) and role<>'owner');

-- Project visibility is now workspace-aware while project-level assignment still works.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select using(public.can_project_access(id));
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update using(public.can_project_edit(id)) with check(public.can_project_access(id));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete using(public.is_workspace_owner(workspace_id) or owner_id=auth.uid());

-- Storage policies inherit project/workspace isolation.
drop policy if exists storage_select on storage.objects;
create policy storage_select on storage.objects for select using(bucket_id='project-files' and public.can_project_access(split_part(name,'/',1)::uuid));
drop policy if exists storage_insert on storage.objects;
create policy storage_insert on storage.objects for insert with check(bucket_id='project-files' and public.can_project_edit(split_part(name,'/',1)::uuid));
drop policy if exists storage_update on storage.objects;
create policy storage_update on storage.objects for update using(bucket_id='project-files' and public.can_project_edit(split_part(name,'/',1)::uuid)) with check(bucket_id='project-files' and public.can_project_edit(split_part(name,'/',1)::uuid));
drop policy if exists storage_delete on storage.objects;
create policy storage_delete on storage.objects for delete using(bucket_id='project-files' and public.can_project_edit(split_part(name,'/',1)::uuid));

-- New-user trigger creates a real workspace immediately; existing accounts are already backfilled above.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare wid uuid; nm text;
begin
 insert into public.profiles(id,email,display_name,photo_url,plan,status,onboarding_complete)
 values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),new.raw_user_meta_data->>'avatar_url','free','active',false)
 on conflict(id) do update set email=excluded.email;
 nm:=coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'My Workspace');
 insert into public.workspaces(owner_id,name,description,slug) values(new.id,case when nm='My Workspace' then nm else nm||'''s Workspace' end,'Your default DocBit workspace.','default') returning id into wid;
 insert into public.workspace_members(workspace_id,user_id,role) values(wid,new.id,'owner') on conflict do nothing;
 return new;
end;$$;

-- Backfill usage processing session value from the legacy counter without changing existing counts.
update public.usage set processing_sessions=coalesce(processed_files,0) where processing_sessions=0 and coalesce(processed_files,0)>0;

create or replace function public.create_workspace(p_name text,p_description text default '') returns public.workspaces
language plpgsql security definer set search_path=public as $$
declare result public.workspaces; p_plan text; cnt bigint; lim bigint; base_slug text;
begin
 if auth.uid() is null or not public.account_is_active(auth.uid()) then raise exception 'Authentication required.' using errcode='42501'; end if;
 select coalesce(plan,'free') into p_plan from public.profiles where id=auth.uid();
 select count(*) into cnt from public.workspaces where owner_id=auth.uid(); lim:=public.plan_limit(p_plan,'workspaces');
 if cnt>=lim then raise exception 'Workspace limit reached for your % plan.',p_plan using errcode='P2002'; end if;
 base_slug:=lower(regexp_replace(coalesce(nullif(trim(p_name),''),'workspace'),'[^a-zA-Z0-9]+','-','g'));
 insert into public.workspaces(owner_id,name,description,slug) values(auth.uid(),left(coalesce(nullif(trim(p_name),''),'New workspace'),120),left(coalesce(p_description,''),500),base_slug||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,8)) returning * into result;
 insert into public.workspace_members(workspace_id,user_id,role) values(result.id,auth.uid(),'owner');
 return result;
end;$$;
revoke execute on function public.create_workspace(text,text) from public,anon;
grant execute on function public.create_workspace(text,text) to authenticated;

create or replace function public.invite_workspace_member(p_workspace_id uuid,p_email text,p_role public.workspace_role default 'member') returns uuid
language plpgsql security definer set search_path=public as $$
declare target uuid; lim bigint; current_count bigint; p_plan text;
begin
 if not public.can_workspace_manage(p_workspace_id) or p_role='owner' then raise exception 'You do not have permission to manage workspace members.' using errcode='42501'; end if;
 select id into target from public.profiles where lower(email)=lower(trim(p_email)) and status='active';
 if target is null then raise exception 'No active DocBit account was found for that email. The user must sign up before being added.' using errcode='P2003'; end if;
 select coalesce(plan,'free') into p_plan from public.profiles where id=(select owner_id from public.workspaces where id=p_workspace_id);
 lim:=public.plan_limit(p_plan,'users');
 select count(*) filter(where role<>'owner') into current_count from public.workspace_members where workspace_id=p_workspace_id;
 if p_role='editor' then
   if public.plan_limit(p_plan,'editors')=0 then raise exception 'Your plan does not include editor seats.' using errcode='P2004'; end if;
   if public.plan_limit(p_plan,'editors') is not null and (select count(*) from public.workspace_members where workspace_id=p_workspace_id and role='editor')>=public.plan_limit(p_plan,'editors') then raise exception 'Editor seat limit reached.' using errcode='P2005'; end if;
 else
   if lim=0 then raise exception 'Your plan does not include team users.' using errcode='P2006'; end if;
   if lim is not null and current_count>=lim then raise exception 'User limit reached.' using errcode='P2007'; end if;
 end if;
 insert into public.workspace_members(workspace_id,user_id,role) values(p_workspace_id,target,p_role) on conflict(workspace_id,user_id) do update set role=excluded.role,updated_at=now();
 return target;
end;$$;
revoke execute on function public.invite_workspace_member(uuid,text,public.workspace_role) from public,anon;
grant execute on function public.invite_workspace_member(uuid,text,public.workspace_role) to authenticated;

create or replace function public.update_workspace_member(p_workspace_id uuid,p_user_id uuid,p_role public.workspace_role) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_role='owner' or p_user_id=(select owner_id from public.workspaces where id=p_workspace_id) or not public.can_workspace_manage(p_workspace_id) then raise exception 'Invalid workspace role change.' using errcode='42501'; end if;
 update public.workspace_members set role=p_role,updated_at=now() where workspace_id=p_workspace_id and user_id=p_user_id;
 if not found then raise exception 'Workspace member not found.'; end if;
end;$$;
revoke execute on function public.update_workspace_member(uuid,uuid,public.workspace_role) from public,anon;
grant execute on function public.update_workspace_member(uuid,uuid,public.workspace_role) to authenticated;

create or replace function public.remove_workspace_member(p_workspace_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.can_workspace_manage(p_workspace_id) or p_user_id=(select owner_id from public.workspaces where id=p_workspace_id) then raise exception 'You cannot remove the workspace owner.' using errcode='42501'; end if;
 delete from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id;
end;$$;
revoke execute on function public.remove_workspace_member(uuid,uuid) from public,anon;
grant execute on function public.remove_workspace_member(uuid,uuid) to authenticated;
alter table public.workspace_members add column if not exists email text not null default '';
alter table public.workspace_members add column if not exists display_name text not null default '';
update public.workspace_members wm set email=p.email,display_name=p.display_name from public.profiles p where p.id=wm.user_id and (wm.email='' or wm.display_name='');
-- Keep copied membership identity current without exposing arbitrary profile rows.
create or replace function public.invite_workspace_member(p_workspace_id uuid,p_email text,p_role public.workspace_role default 'member') returns uuid
language plpgsql security definer set search_path=public as $$
declare target uuid; lim bigint; current_count bigint; p_plan text; target_email text; target_name text;
begin
 if not public.can_workspace_manage(p_workspace_id) or p_role='owner' then raise exception 'You do not have permission to manage workspace members.' using errcode='42501'; end if;
 select id,email,display_name into target,target_email,target_name from public.profiles where lower(email)=lower(trim(p_email)) and status='active';
 if target is null then raise exception 'No active DocBit account was found for that email. The user must sign up before being added.' using errcode='P2003'; end if;
 select coalesce(plan,'free') into p_plan from public.profiles where id=(select owner_id from public.workspaces where id=p_workspace_id);
 lim:=public.plan_limit(p_plan,'users'); select count(*) filter(where role<>'owner') into current_count from public.workspace_members where workspace_id=p_workspace_id;
 if p_role='editor' then
   if public.plan_limit(p_plan,'editors')=0 then raise exception 'Your plan does not include editor seats.' using errcode='P2004'; end if;
   if public.plan_limit(p_plan,'editors') is not null and (select count(*) from public.workspace_members where workspace_id=p_workspace_id and role='editor')>=public.plan_limit(p_plan,'editors') then raise exception 'Editor seat limit reached.' using errcode='P2005'; end if;
 elsif lim=0 then raise exception 'Your plan does not include team users.' using errcode='P2006';
 elsif lim is not null and current_count>=lim then raise exception 'User limit reached.' using errcode='P2007'; end if;
 insert into public.workspace_members(workspace_id,user_id,email,display_name,role) values(p_workspace_id,target,target_email,target_name,p_role)
 on conflict(workspace_id,user_id) do update set role=excluded.role,email=excluded.email,display_name=excluded.display_name,updated_at=now();
 return target;
end;$$;

-- Project assignment limits now derive from the workspace owner's plan and workspace-wide seats.
create or replace function public.enforce_member_plan_limits() returns trigger language plpgsql security definer set search_path=public as $$
declare owner_uid uuid; wid uuid; p_plan text; editor_count bigint; user_count bigint; max_editors bigint; max_users bigint;
begin
 select p.owner_id,p.workspace_id into owner_uid,wid from public.projects p where p.id=new.project_id;
 if owner_uid is null then raise exception 'Project not found.' using errcode='P1000'; end if;
 select coalesce(plan,'free') into p_plan from public.profiles where id=owner_uid;
 max_editors:=public.plan_limit(p_plan,'editors'); max_users:=public.plan_limit(p_plan,'users');
 if new.role='editor' then
   if max_editors=0 then raise exception 'Your plan does not include editor seats.' using errcode='P3001'; end if;
   select count(*) into editor_count from public.workspace_members where workspace_id=wid and role='editor';
   if max_editors is not null and editor_count>=max_editors then raise exception 'Editor seat limit reached for your % plan.',p_plan using errcode='P3002'; end if;
 else
   if max_users=0 then raise exception 'Your plan does not include team users.' using errcode='P3003'; end if;
   select count(*) into user_count from public.workspace_members where workspace_id=wid and role in ('member','editor','admin');
   if max_users is not null and user_count>=max_users then raise exception 'User limit reached for your % plan.',p_plan using errcode='P3004'; end if;
 end if;
 return new;
end;$$;

-- Keep the legacy two-argument RPC safe for older clients during rollout.
create or replace function public.create_project(p_name text,p_description text default '') returns public.projects
language sql security definer set search_path=public as $$ select public.create_project(p_name,p_description,null::uuid); $$;
revoke execute on function public.create_project(text,text) from public,anon;
grant execute on function public.create_project(text,text) to authenticated;

-- Never allow a browser session to self-upgrade/downgrade by updating profiles.plan.
create or replace function public.prevent_client_plan_change() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and new.plan is distinct from old.plan then
    raise exception 'Plan changes must be completed through verified billing operations.' using errcode='42501';
  end if;
  return new;
end;$$;
drop trigger if exists protect_profile_plan on public.profiles;
create trigger protect_profile_plan before update on public.profiles for each row execute function public.prevent_client_plan_change();

create or replace function public.workspace_owner_id(p_workspace_id uuid) returns uuid
language sql security definer set search_path=public stable as $$ select owner_id from public.workspaces where id=p_workspace_id; $$;
drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces for update using(public.can_workspace_manage(id)) with check(owner_id=public.workspace_owner_id(id));

-- Seat enforcement covers both workspace members and project-only assignments in the same workspace.
create or replace function public.enforce_member_plan_limits() returns trigger language plpgsql security definer set search_path=public as $$
declare owner_uid uuid; wid uuid; p_plan text; editor_count bigint; user_count bigint; max_editors bigint; max_users bigint;
begin
 select p.owner_id,p.workspace_id into owner_uid,wid from public.projects p where p.id=new.project_id;
 if owner_uid is null then raise exception 'Project not found.' using errcode='P1000'; end if;
 select coalesce(plan,'free') into p_plan from public.profiles where id=owner_uid;
 max_editors:=public.plan_limit(p_plan,'editors'); max_users:=public.plan_limit(p_plan,'users');
 select count(distinct user_id) into editor_count from (
   select wm.user_id from public.workspace_members wm where wm.workspace_id=wid and wm.role='editor'
   union select pm.user_id from public.project_members pm join public.projects pp on pp.id=pm.project_id where pp.workspace_id=wid and pm.role='editor'
 ) e where user_id<>new.user_id;
 if new.role='editor' then
   if max_editors=0 then raise exception 'Your plan does not include editor seats.' using errcode='P3001'; end if;
   if max_editors is not null and editor_count>=max_editors then raise exception 'Editor seat limit reached for your % plan.',p_plan using errcode='P3002'; end if;
 else
   if max_users=0 then raise exception 'Your plan does not include team users.' using errcode='P3003'; end if;
   select count(distinct user_id) into user_count from (
     select wm.user_id from public.workspace_members wm where wm.workspace_id=wid and wm.role<>'owner'
     union select pm.user_id from public.project_members pm join public.projects pp on pp.id=pm.project_id where pp.workspace_id=wid and pm.user_id<>(select owner_id from public.workspaces where id=wid)
   ) u;
   if max_users is not null and user_count>=max_users then raise exception 'User limit reached for your % plan.',p_plan using errcode='P3004'; end if;
 end if;
 return new;
end;$$;

create or replace function public.enforce_workspace_member_plan_limits() returns trigger language plpgsql security definer set search_path=public as $$
declare owner_uid uuid; p_plan text; lim bigint; cnt bigint; editor_lim bigint; editor_cnt bigint;
begin
 select owner_id into owner_uid from public.workspaces where id=new.workspace_id; select coalesce(plan,'free') into p_plan from public.profiles where id=owner_uid;
 if new.role='owner' then return new; end if;
 lim:=public.plan_limit(p_plan,'users'); editor_lim:=public.plan_limit(p_plan,'editors');
 select count(*) into cnt from public.workspace_members where workspace_id=new.workspace_id and user_id<>new.user_id and role<>'owner';
 if lim=0 or (lim is not null and cnt>=lim) then raise exception 'User limit reached for your % plan.',p_plan using errcode='P3010'; end if;
 if new.role='editor' then
   select count(*) into editor_cnt from public.workspace_members where workspace_id=new.workspace_id and user_id<>new.user_id and role='editor';
   if editor_lim=0 or (editor_lim is not null and editor_cnt>=editor_lim) then raise exception 'Editor seat limit reached for your % plan.',p_plan using errcode='P3011'; end if;
 end if;
 return new;
end;$$;
drop trigger if exists enforce_workspace_member_plan_limits on public.workspace_members;
create trigger enforce_workspace_member_plan_limits before insert or update of role on public.workspace_members for each row execute function public.enforce_workspace_member_plan_limits();
revoke execute on function public.enforce_workspace_member_plan_limits() from public,anon,authenticated;

-- Workspace admins/editors create projects owned by the workspace owner, keeping billing ownership canonical.
drop function if exists public.create_project(text,text,uuid);
create or replace function public.create_project(p_name text,p_description text default '',p_workspace_id uuid default null) returns public.projects
language plpgsql security definer set search_path=public as $$
declare result public.projects; wid uuid; workspace_owner uuid; p_plan text; p_count bigint; role public.workspace_role;
begin
 if auth.uid() is null or not public.account_is_active(auth.uid()) then raise exception 'Authentication required.' using errcode='42501'; end if;
 if p_workspace_id is null then select id,owner_id into wid,workspace_owner from public.workspaces where owner_id=auth.uid() order by created_at asc limit 1; else wid:=p_workspace_id; select owner_id into workspace_owner from public.workspaces where id=wid; end if;
 if wid is null or workspace_owner is null or not public.can_workspace_access(wid) then raise exception 'Workspace not found or inaccessible.' using errcode='42501'; end if;
 role:=public.workspace_role_for(wid); if role not in ('owner','admin','editor') then raise exception 'You do not have permission to create projects in this workspace.' using errcode='42501'; end if;
 select coalesce(plan,'free') into p_plan from public.profiles where id=workspace_owner;
 select count(*) into p_count from public.projects where owner_id=workspace_owner;
 if p_count>=public.plan_limit(p_plan,'projects') then raise exception 'Project limit reached for your % plan.',p_plan using errcode='P2001'; end if;
 insert into public.projects(owner_id,workspace_id,name,description) values(workspace_owner,wid,left(coalesce(nullif(trim(p_name),''),'Untitled project'),200),left(coalesce(p_description,''),2000)) returning * into result;
 return result;
end;$$;
revoke execute on function public.create_project(text,text,uuid) from public,anon; grant execute on function public.create_project(text,text,uuid) to authenticated;
create or replace function public.create_project(p_name text,p_description text default '') returns public.projects language sql security definer set search_path=public as $$ select public.create_project(p_name,p_description,null::uuid); $$;
revoke execute on function public.create_project(text,text) from public,anon; grant execute on function public.create_project(text,text) to authenticated;

-- Activity is visible to authorized workspace/project participants, with the plan/UI deciding which depth to expose.
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select using(
  user_id=auth.uid()
  or (project_id is not null and public.can_project_access(project_id))
);
