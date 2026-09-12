-- DocBit v19.9: align entitlements with product plans and fix bigint overflow in plan limits.
-- Safe additive migration. Do not reset the database.

create or replace function public.plan_limit(p_plan text, p_key text)
returns bigint
language sql
immutable
as $$
  select case p_key
    when 'projects' then case p_plan when 'free' then 3::bigint when 'starter' then 10::bigint else 9223372036854775807::bigint end
    when 'saved_files' then case p_plan when 'free' then 10::bigint when 'starter' then 100::bigint when 'pro' then 1000::bigint when 'pro_plus' then 5000::bigint else 10::bigint end
    when 'storage_bytes' then case p_plan when 'free' then 250::bigint*1024*1024 when 'starter' then 2048::bigint*1024*1024 when 'pro' then 10240::bigint*1024*1024 when 'pro_plus' then 51200::bigint*1024*1024 else 250::bigint*1024*1024 end
    when 'max_file_bytes' then case p_plan when 'free' then 10::bigint*1024*1024 when 'starter' then 50::bigint*1024*1024 when 'pro' then 100::bigint*1024*1024 when 'pro_plus' then 250::bigint*1024*1024 else 10::bigint*1024*1024 end
    when 'processed_files' then case p_plan when 'free' then 25::bigint when 'starter' then 150::bigint when 'pro' then 750::bigint when 'pro_plus' then 2500::bigint else 25::bigint end
    else 0::bigint end;
$$;

create or replace function public.enforce_member_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare owner_uid uuid; p_plan text; editor_count bigint; member_count bigint; max_editors bigint; max_members bigint;
begin
  select owner_id into owner_uid from public.projects where id=new.project_id;
  if owner_uid is null then raise exception 'Project not found.' using errcode='foreign_key_violation'; end if;
  select coalesce(plan,'free') into p_plan from public.profiles where id=owner_uid;
  max_editors := case p_plan when 'free' then 5 when 'starter' then 5 when 'pro' then 10 when 'pro_plus' then 100 else 0 end;
  max_members := case p_plan when 'free' then 10 when 'starter' then 10 when 'pro' then 50 when 'pro_plus' then 9223372036854775807::bigint else 0 end;
  select count(*) filter (where role='editor') into editor_count from public.project_members where project_id=new.project_id and user_id<>new.user_id;
  select count(*) filter (where role='member') into member_count from public.project_members where project_id=new.project_id and user_id<>new.user_id;
  if new.role='editor' and editor_count >= max_editors then raise exception 'Editor seat limit reached for your % plan.', p_plan using errcode='check_violation'; end if;
  if new.role='member' and member_count >= max_members then raise exception 'Member seat limit reached for your % plan.', p_plan using errcode='check_violation'; end if;
  return new;
end;
$$;

create or replace function public.enforce_file_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare owner_uid uuid; p_plan text; p_count bigint; p_storage bigint; existing_size bigint := 0;
begin
  select owner_id into owner_uid from public.projects where id=new.project_id;
  if owner_uid is null then raise exception 'Project not found.' using errcode='foreign_key_violation'; end if;
  select plan into p_plan from public.profiles where id=owner_uid; p_plan := coalesce(p_plan,'free');
  if new.size < 0 then raise exception 'File size cannot be negative.' using errcode='22023'; end if;
  if new.size > public.plan_limit(p_plan,'max_file_bytes') then raise exception 'File exceeds the maximum file size for your % plan.',p_plan using errcode='check_violation'; end if;
  if tg_op='UPDATE' then select coalesce(size,0) into existing_size from public.project_files where id=new.id; end if;
  if tg_op='INSERT' then select count(*) into p_count from public.project_files where owner_id=owner_uid; if p_count >= public.plan_limit(p_plan,'saved_files') then raise exception 'Saved file limit reached for your % plan.',p_plan using errcode='check_violation'; end if; end if;
  select coalesce(sum(storage_bytes),0) into p_storage from public.projects where owner_id=owner_uid;
  if tg_op='UPDATE' and old.project_id is not distinct from new.project_id and old.owner_id = owner_uid then p_storage := greatest(0,p_storage-coalesce(old.size,0)); end if;
  if p_storage + greatest(new.size,0) > public.plan_limit(p_plan,'storage_bytes') then raise exception 'Storage limit reached for your % plan.',p_plan using errcode='check_violation'; end if;
  return new;
end;
$$;

drop trigger if exists enforce_file_plan_limits on public.project_files;
create trigger enforce_file_plan_limits before insert or update of project_id,size on public.project_files for each row execute function public.enforce_file_plan_limits();

-- Product plan collaboration is available on every plan. The trigger is the
-- authoritative server-side enforcement for the editor/member seat counts.
drop trigger if exists enforce_member_plan_limits on public.project_members;
create trigger enforce_member_plan_limits before insert or update of role on public.project_members for each row execute function public.enforce_member_plan_limits();

-- Keep project file counters and usage synchronizers free of stale project-table attachments.
drop trigger if exists sync_usage_storage_after_project on public.projects;
