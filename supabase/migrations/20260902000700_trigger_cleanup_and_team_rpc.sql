-- DocBit v19.8: remove stale trigger attachments and make team RPC resilient.
-- Safe additive migration. Do not reset the database.

-- Older migrations attached sync_usage_storage() to projects. Remove every
-- trigger on projects that invokes that function, regardless of trigger name.
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname = 'projects'
      and p.proname = 'sync_usage_storage'
  loop
    execute format('drop trigger if exists %I on %I.%I', r.trigger_name, r.schema_name, r.table_name);
  end loop;
end $$;

-- The storage synchronizer belongs only on project_files.
drop trigger if exists sync_usage_storage_after_project on public.projects;
drop trigger if exists sync_usage_storage_after_file on public.project_files;
create trigger sync_usage_storage_after_file
after insert or update or delete on public.project_files
for each row execute function public.sync_usage_storage();

-- The project creation RPC must not rely on the browser INSERT privilege.
revoke insert on table public.projects from authenticated;
grant execute on function public.create_project(text,text) to authenticated;

-- Recreate the team RPC with explicit, predictable target-account lookup and
-- role casting at the SQL boundary. This is the only browser write path.
drop function if exists public.manage_project_member(text,uuid,uuid,text,public.project_role);

create or replace function public.manage_project_member(
  p_action text,
  p_project_id uuid,
  p_user_id uuid default null,
  p_email text default null,
  p_role text default 'member'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_uid uuid := auth.uid();
  target_uid uuid;
  v_target_email text;
  target_name text;
  role_value public.project_role;
  result public.project_members;
begin
  if caller_uid is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if not public.account_is_active(caller_uid) then raise exception 'Account is deactivated.' using errcode='42501'; end if;
  if not exists (select 1 from public.projects where id = p_project_id and owner_id = caller_uid) then
    raise exception 'Project not found or you do not own it.' using errcode='42501';
  end if;
  if p_action not in ('add','update','remove') then raise exception 'Unsupported member action.' using errcode='22023'; end if;

  if p_action = 'remove' then
    if p_user_id is null then raise exception 'Member is required.' using errcode='22023'; end if;
    delete from public.project_members where project_id = p_project_id and user_id = p_user_id;
    return jsonb_build_object('ok', true);
  end if;

  begin
    role_value := p_role::public.project_role;
  exception when invalid_text_representation then
    raise exception 'Invalid project role.' using errcode='22023';
  end;

  if p_action = 'update' then
    if p_user_id is null then raise exception 'Member is required.' using errcode='22023'; end if;
    update public.project_members
      set role = role_value, updated_at = now()
      where project_id = p_project_id and user_id = p_user_id
      returning * into result;
    if not found then raise exception 'Member was not found.' using errcode='P0002'; end if;
  else
    v_target_email := lower(trim(coalesce(p_email,'')));
    if v_target_email = '' then raise exception 'Email is required.' using errcode='22023'; end if;
    select id, email, display_name into target_uid, v_target_email, target_name
      from public.profiles where lower(email) = v_target_email and status = 'active' limit 1;
    if target_uid is null then raise exception 'No active DocBit account exists with that email.' using errcode='P0002'; end if;
    if target_uid = caller_uid then raise exception 'The project owner already has full access.' using errcode='22023'; end if;
    insert into public.project_members(project_id,user_id,email,display_name,role)
    values(p_project_id,target_uid,v_target_email,coalesce(target_name,split_part(v_target_email,'@',1)),role_value)
    on conflict(project_id,user_id) do update
      set email=excluded.email, display_name=excluded.display_name, role=excluded.role, updated_at=now()
    returning * into result;
  end if;

  return jsonb_build_object('ok',true,'member',jsonb_build_object(
    'uid',result.user_id,'email',result.email,'displayName',coalesce(result.display_name,result.email),
    'role',result.role,'addedAt',result.created_at));
end;
$$;

revoke execute on function public.manage_project_member(text,uuid,uuid,text,text) from public, anon;
grant execute on function public.manage_project_member(text,uuid,uuid,text,text) to authenticated;
