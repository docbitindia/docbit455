-- DocBit v19.7: fix trigger table mismatch and harden team/project operations.
-- Safe additive migration. Do not reset the database.

-- v19.3 accidentally attached sync_usage_storage() to public.projects even though
-- the function reads project_files columns (project_id/size). That causes:
--   record "new" has no field "project_id"
-- during project creation. Remove that trigger and attach the function to the
-- table whose rows actually contain project_id.
drop trigger if exists sync_usage_storage_after_project on public.projects;

create or replace function public.sync_usage_storage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_uid uuid;
  project_uid uuid;
begin
  project_uid := case when TG_OP = 'DELETE' then old.project_id else new.project_id end;
  select owner_id into owner_uid from public.projects where id = project_uid;

  if owner_uid is not null then
    insert into public.usage(user_id, period, storage_bytes)
    values(
      owner_uid,
      public.current_usage_period(),
      coalesce((select sum(storage_bytes) from public.projects where owner_id = owner_uid), 0)
    )
    on conflict(user_id, period)
    do update set storage_bytes = excluded.storage_bytes, updated_at = now();
  end if;

  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Remove any prior incorrectly attached file trigger before recreating it.
drop trigger if exists sync_usage_storage_after_file on public.project_files;
create trigger sync_usage_storage_after_file
after insert or update or delete on public.project_files
for each row execute function public.sync_usage_storage();

revoke execute on function public.sync_usage_storage() from public, anon, authenticated;

-- Team membership must always be managed through the Netlify server function.
-- Browser RLS therefore cannot become an alternate write path.
revoke insert, update, delete on table public.project_members from authenticated;

-- Explicitly grant the service-role owner of the Netlify function full access.
grant select, insert, update, delete on table public.project_members to service_role;

-- Make member updates/deletes idempotent and owner-controlled in the server path.
create or replace function public.project_member_is_owner(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.account_is_active(auth.uid())
     and exists (
       select 1 from public.projects
       where id = p_project_id and owner_id = auth.uid()
     );
$$;
revoke execute on function public.project_member_is_owner(uuid) from public, anon;
grant execute on function public.project_member_is_owner(uuid) to authenticated;

-- The project creation RPC is the canonical browser path. Remove browser INSERT
-- privileges so project ownership cannot depend on a client-supplied owner_id.
revoke insert on table public.projects from authenticated;

-- Allow the SECURITY DEFINER RPC to write regardless of caller table grants.
grant insert, update, delete, select on table public.projects to service_role;

-- Keep profile onboarding safe: only the three client-controlled profile columns.
revoke insert, update on table public.profiles from authenticated;
grant update (display_name, photo_url, onboarding_complete) on table public.profiles to authenticated;

-- Use a database RPC for team mutations so the browser does not depend on
-- Netlify function availability and never receives direct membership writes.
create or replace function public.manage_project_member(
  p_action text,
  p_project_id uuid,
  p_user_id uuid default null,
  p_email text default null,
  p_role public.project_role default 'member'
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
  result public.project_members;
begin
  if caller_uid is null then
    raise exception 'Authentication required.' using errcode='42501';
  end if;
  if not public.account_is_active(caller_uid) then
    raise exception 'Account is deactivated.' using errcode='42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id and owner_id = caller_uid) then
    raise exception 'Project not found or you do not own it.' using errcode='42501';
  end if;
  if p_action not in ('add','update','remove') then
    raise exception 'Unsupported member action.' using errcode='22023';
  end if;

  if p_action = 'remove' then
    if p_user_id is null then raise exception 'Member is required.' using errcode='22023'; end if;
    delete from public.project_members where project_id = p_project_id and user_id = p_user_id;
    return jsonb_build_object('ok', true);
  end if;

  if p_role not in ('editor','member') then
    raise exception 'Invalid project role.' using errcode='22023';
  end if;

  if p_action = 'update' then
    if p_user_id is null then raise exception 'Member is required.' using errcode='22023'; end if;
    update public.project_members
      set role = p_role, updated_at = now()
      where project_id = p_project_id and user_id = p_user_id
      returning * into result;
    if not found then raise exception 'Member was not found.' using errcode='P0002'; end if;
  else
    v_target_email := lower(trim(coalesce(p_email,'')));
    if v_target_email = '' then raise exception 'Email is required.' using errcode='22023'; end if;
    select id, email, display_name into target_uid, v_target_email, target_name
      from public.profiles
      where lower(email) = v_target_email
      limit 1;
    if target_uid is null then raise exception 'No DocBit account exists with that email.' using errcode='P0002'; end if;
    if target_uid = caller_uid then raise exception 'The project owner already has full access.' using errcode='22023'; end if;
    if not exists (select 1 from public.profiles where id = target_uid and status = 'active') then
      raise exception 'That account is deactivated and cannot be added.' using errcode='22023';
    end if;

    insert into public.project_members(project_id,user_id,email,display_name,role)
    values(p_project_id,target_uid,v_target_email,coalesce(target_name,split_part(v_target_email,'@',1)),p_role)
    on conflict(project_id,user_id) do update
      set email = excluded.email,
          display_name = excluded.display_name,
          role = excluded.role,
          updated_at = now()
    returning * into result;
  end if;

  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'uid', result.user_id,
      'email', result.email,
      'displayName', coalesce(result.display_name, result.email),
      'role', result.role,
      'addedAt', result.created_at
    )
  );
end;
$$;

revoke execute on function public.manage_project_member(text,uuid,uuid,text,public.project_role) from public, anon;
grant execute on function public.manage_project_member(text,uuid,uuid,text,public.project_role) to authenticated;
