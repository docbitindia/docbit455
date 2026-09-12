-- DocBit v19.3: database hardening, atomic usage enforcement and plan limits.
-- Safe additive migration. Do not reset the database.

-- RLS helper functions must not recursively re-enter the caller's RLS policies.
create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from public.projects where id=p_project_id and owner_id=auth.uid());
$$;

create or replace function public.can_project_access(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=auth.uid())
      or exists(select 1 from public.project_members pm where pm.project_id=p_project_id and pm.user_id=auth.uid());
$$;

create or replace function public.can_project_edit(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=auth.uid())
      or exists(select 1 from public.project_members pm where pm.project_id=p_project_id and pm.user_id=auth.uid() and pm.role='editor');
$$;

revoke execute on function public.is_project_owner(uuid) from public, anon;
revoke execute on function public.can_project_access(uuid) from public, anon;
revoke execute on function public.can_project_edit(uuid) from public, anon;
grant execute on function public.is_project_owner(uuid) to authenticated;
grant execute on function public.can_project_access(uuid) to authenticated;
grant execute on function public.can_project_edit(uuid) to authenticated;

-- Plan limits are kept server-side so browser code cannot bypass entitlements.
create or replace function public.plan_limit(p_plan text, p_key text)
returns bigint
language sql
immutable
as $$
  select case p_key
    when 'projects' then case p_plan when 'free' then 3 when 'starter' then 10 else 9223372036854775807 end
    when 'saved_files' then case p_plan when 'free' then 10 when 'starter' then 100 when 'pro' then 1000 when 'pro_plus' then 5000 else 10 end
    when 'storage_bytes' then case p_plan when 'free' then 250*1024*1024 when 'starter' then 2048*1024*1024 when 'pro' then 10240*1024*1024 when 'pro_plus' then 51200*1024*1024 else 250*1024*1024 end
    when 'max_file_bytes' then case p_plan when 'free' then 10*1024*1024 when 'starter' then 50*1024*1024 when 'pro' then 100*1024*1024 when 'pro_plus' then 250*1024*1024 else 10*1024*1024 end
    when 'processed_files' then case p_plan when 'free' then 25 when 'starter' then 150 when 'pro' then 750 when 'pro_plus' then 2500 else 25 end
    else 0 end;
$$;

create or replace function public.enforce_project_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p_plan text;
  p_count bigint;
begin
  select plan into p_plan from public.profiles where id=auth.uid();
  p_plan := coalesce(p_plan,'free');
  select count(*) into p_count from public.projects where owner_id=auth.uid();
  if p_count >= public.plan_limit(p_plan,'projects') then
    raise exception 'Project limit reached for your % plan.', p_plan using errcode='check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_project_plan_limits on public.projects;
create trigger enforce_project_plan_limits
before insert on public.projects
for each row execute function public.enforce_project_plan_limits();

create or replace function public.enforce_file_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_uid uuid;
  p_plan text;
  p_count bigint;
  p_storage bigint;
begin
  select owner_id into owner_uid from public.projects where id=new.project_id;
  if owner_uid is null then raise exception 'Project not found.' using errcode='foreign_key_violation'; end if;
  select plan into p_plan from public.profiles where id=owner_uid;
  p_plan := coalesce(p_plan,'free');

  if new.size > public.plan_limit(p_plan,'max_file_bytes') then
    raise exception 'File exceeds the maximum file size for your % plan.', p_plan using errcode='check_violation';
  end if;

  select count(*) into p_count from public.project_files where owner_id=owner_uid;
  if p_count >= public.plan_limit(p_plan,'saved_files') then
    raise exception 'Saved file limit reached for your % plan.', p_plan using errcode='check_violation';
  end if;

  select coalesce(sum(storage_bytes),0) into p_storage from public.projects where owner_id=owner_uid;
  if p_storage + greatest(new.size,0) > public.plan_limit(p_plan,'storage_bytes') then
    raise exception 'Storage limit reached for your % plan.', p_plan using errcode='check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_file_plan_limits on public.project_files;
create trigger enforce_file_plan_limits
before insert on public.project_files
for each row execute function public.enforce_file_plan_limits();

-- Atomic monthly processing counter. Returns false instead of allowing a race to exceed the limit.
create or replace function public.consume_processed_file()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  p_plan text;
  used bigint;
begin
  select plan into p_plan from public.profiles where id=auth.uid();
  if p_plan is null then raise exception 'Profile not found.'; end if;
  select processed_files into used from public.usage where user_id=auth.uid() and period='current' for update;
  used := coalesce(used,0);
  if used >= public.plan_limit(p_plan,'processed_files') then return false; end if;
  insert into public.usage(user_id,period,processed_files)
  values(auth.uid(),'current',used+1)
  on conflict(user_id,period) do update set processed_files=excluded.processed_files,updated_at=now();
  return true;
end;
$$;
revoke execute on function public.consume_processed_file() from public, anon;
grant execute on function public.consume_processed_file() to authenticated;

grant execute on function public.increment_project_usage(uuid,bigint) to authenticated;

-- Keep usage storage synchronized from project counters whenever a saved file is added.
create or replace function public.sync_usage_storage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid;
begin
  select owner_id into uid from public.projects where id=coalesce(new.project_id,old.project_id);
  if uid is not null then
    insert into public.usage(user_id,period,storage_bytes)
    values(uid,public.current_usage_period(),coalesce((select sum(storage_bytes) from public.projects where owner_id=uid),0))
    on conflict(user_id,period) do update set storage_bytes=excluded.storage_bytes,updated_at=now();
  end if;
  return coalesce(new,old);
end;
$$;

drop trigger if exists sync_usage_storage_after_project on public.projects;
create trigger sync_usage_storage_after_project
after insert or update or delete on public.projects
for each row execute function public.sync_usage_storage();

-- API privileges for the new server-side functions.
grant usage on schema public to authenticated;

-- Enforce collaboration seats server-side using the project owner's plan.
create or replace function public.enforce_member_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare owner_uid uuid; p_plan text; editor_count bigint; member_count bigint; max_editors bigint; max_members bigint;
begin
  select owner_id into owner_uid from public.projects where id=new.project_id;
  if owner_uid is null then raise exception 'Project not found.'; end if;
  select coalesce(plan,'free') into p_plan from public.profiles where id=owner_uid;
  max_editors := case p_plan when 'pro' then 2 when 'pro_plus' then 10 else 0 end;
  max_members := case p_plan when 'pro' then 5 when 'pro_plus' then 25 else 0 end;
  select count(*) filter (where role='editor') into editor_count from public.project_members where project_id=new.project_id and user_id<>new.user_id;
  select count(*) filter (where role='member') into member_count from public.project_members where project_id=new.project_id and user_id<>new.user_id;
  if new.role='editor' and editor_count >= max_editors then raise exception 'Editor seat limit reached for your % plan.', p_plan using errcode='check_violation'; end if;
  if new.role='member' and member_count >= max_members then raise exception 'Member seat limit reached for your % plan.', p_plan using errcode='check_violation'; end if;
  return new;
end;
$$;

drop trigger if exists enforce_member_plan_limits on public.project_members;
create trigger enforce_member_plan_limits before insert or update of role on public.project_members for each row execute function public.enforce_member_plan_limits();

-- Activity rows are personal, but project/file references must belong to an accessible project.
drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert with check(
  user_id=auth.uid()
  and (project_id is null or public.can_project_access(project_id))
  and (file_id is null or exists(select 1 from public.project_files f where f.id=file_id and public.can_project_access(f.project_id)))
);

revoke execute on function public.enforce_member_plan_limits() from public, anon, authenticated;
