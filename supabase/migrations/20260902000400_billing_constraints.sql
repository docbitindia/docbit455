-- DocBit v19.4: billing integrity and safe server-managed subscription state.

-- One active subscription record per account.
create unique index if not exists subscriptions_user_unique on public.subscriptions(user_id);

-- Billing tables are server-managed. Do not expose INSERT/UPDATE/DELETE to the browser role.
revoke insert, update, delete on table public.subscriptions from authenticated;
revoke insert, update, delete on table public.payments from authenticated;
revoke insert, update, delete on table public.billing_events from authenticated;

grant select on table public.subscriptions to authenticated;
grant select on table public.payments to authenticated;
grant select on table public.billing_events to authenticated;

-- Deactivated accounts keep their data but lose application access until recovery.
create or replace function public.account_is_active(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id=p_user_id and status='active');
$$;
revoke execute on function public.account_is_active(uuid) from public, anon;
grant execute on function public.account_is_active(uuid) to authenticated;

create or replace function public.can_project_access(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.account_is_active(auth.uid()) and (
    exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=auth.uid())
    or exists(select 1 from public.project_members pm where pm.project_id=p_project_id and pm.user_id=auth.uid())
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.account_is_active(auth.uid()) and exists(select 1 from public.projects where id=p_project_id and owner_id=auth.uid());
$$;

create or replace function public.can_project_edit(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.account_is_active(auth.uid()) and (
    exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=auth.uid())
    or exists(select 1 from public.project_members pm where pm.project_id=p_project_id and pm.user_id=auth.uid() and pm.role='editor')
  );
$$;

create or replace function public.consume_processed_file()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare p_plan text; used bigint;
begin
  select plan into p_plan from public.profiles where id=auth.uid() and status='active';
  if p_plan is null then return false; end if;
  select processed_files into used from public.usage where user_id=auth.uid() and period='current' for update;
  used := coalesce(used,0);
  if used >= public.plan_limit(p_plan,'processed_files') then return false; end if;
  insert into public.usage(user_id,period,processed_files) values(auth.uid(),'current',used+1)
  on conflict(user_id,period) do update set processed_files=excluded.processed_files,updated_at=now();
  return true;
end;
$$;

-- Keep avatar writes restricted to active account owners.
drop policy if exists profile_media_insert on storage.objects;
create policy profile_media_insert on storage.objects for insert with check (
  bucket_id='profile-media' and public.account_is_active(auth.uid()) and
  split_part(name,'/',1)='avatars' and split_part(name,'/',2)=auth.uid()::text
);
drop policy if exists profile_media_update on storage.objects;
create policy profile_media_update on storage.objects for update using (
  bucket_id='profile-media' and public.account_is_active(auth.uid()) and
  split_part(name,'/',1)='avatars' and split_part(name,'/',2)=auth.uid()::text
) with check (
  bucket_id='profile-media' and public.account_is_active(auth.uid()) and
  split_part(name,'/',1)='avatars' and split_part(name,'/',2)=auth.uid()::text
);

-- Orders and subscriptions are distinct Razorpay concepts. Keep the order id separate
-- so a one-time checkout is never mislabeled as a recurring subscription id.
alter table public.subscriptions add column if not exists provider_order_id text;
create index if not exists subscriptions_provider_order_idx on public.subscriptions(provider_order_id);

-- Least-privilege column grants prevent browser clients from self-upgrading or
-- forging protected counters. Server functions/service role retain full access.
revoke insert, update on table public.profiles from authenticated;
grant update (display_name, photo_url, onboarding_complete) on table public.profiles to authenticated;

revoke insert, update on table public.projects from authenticated;
grant insert (owner_id, name, description) on table public.projects to authenticated;
grant update (name, description) on table public.projects to authenticated;

-- Membership changes are performed by the authenticated owner through the
-- Netlify server function, which uses the service role and enforces seat limits.
revoke insert, update, delete on table public.project_members from authenticated;

-- Project file records are created/updated by the client for the active project,
-- but protected ownership/counters cannot be rewritten through the browser.
revoke insert, update on table public.project_files from authenticated;
grant insert (id, project_id, owner_id, name, original_name, file_type, size, storage_path, document_path, version, last_opened_at) on table public.project_files to authenticated;
grant update (name, original_name, file_type, size, storage_path, document_path, version, last_opened_at) on table public.project_files to authenticated;

-- Usage counters are server-controlled; the browser may only read them.
revoke insert, update, delete on table public.usage from authenticated;
grant select on table public.usage to authenticated;

-- Never trust a client-supplied file size for project counters. Recalculate
-- counters from the authoritative project_files rows instead.
create or replace function public.increment_project_usage(p_project_id uuid, p_size bigint default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare owner_uid uuid; total_files integer; total_bytes bigint;
begin
  if not public.can_project_edit(p_project_id) then return; end if;
  select owner_id into owner_uid from public.projects where id=p_project_id;
  select count(*)::integer, coalesce(sum(size),0)::bigint into total_files,total_bytes
  from public.project_files where project_id=p_project_id;
  update public.projects set file_count=total_files,storage_bytes=total_bytes,updated_at=now() where id=p_project_id;
end;
$$;
revoke execute on function public.increment_project_usage(uuid,bigint) from public, anon;
grant execute on function public.increment_project_usage(uuid,bigint) to authenticated;
create unique index if not exists payments_provider_payment_unique on public.payments(provider_payment_id) where provider_payment_id is not null;

-- Database-owned project counters: file writes always reconcile file_count and storage_bytes.
create or replace function public.sync_project_file_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare pid uuid;
begin
  pid := coalesce(new.project_id,old.project_id);
  update public.projects p
  set file_count=(select count(*)::integer from public.project_files f where f.project_id=pid),
      storage_bytes=(select coalesce(sum(f.size),0)::bigint from public.project_files f where f.project_id=pid),
      updated_at=now()
  where p.id=pid;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists sync_project_file_counters_after_write on public.project_files;
create trigger sync_project_file_counters_after_write
after insert or update on public.project_files
for each row execute function public.sync_project_file_counters();
revoke execute on function public.sync_project_file_counters() from public, anon, authenticated;

-- Processing usage is monthly, so the period key must roll over automatically.
create or replace function public.current_usage_period()
returns text
language sql
stable
as $$ select to_char(date_trunc('month', now()), 'YYYY-MM'); $$;
revoke execute on function public.current_usage_period() from public, anon;
grant execute on function public.current_usage_period() to authenticated;

create or replace function public.consume_processed_file()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare p_plan text; used bigint; period_key text;
begin
  select plan into p_plan from public.profiles where id=auth.uid() and status='active';
  if p_plan is null then return false; end if;
  period_key := public.current_usage_period();
  select processed_files into used from public.usage where user_id=auth.uid() and period=period_key for update;
  used := coalesce(used,0);
  if used >= public.plan_limit(p_plan,'processed_files') then return false; end if;
  insert into public.usage(user_id,period,processed_files) values(auth.uid(),period_key,used+1)
  on conflict(user_id,period) do update set processed_files=excluded.processed_files,updated_at=now();
  return true;
end;
$$;
revoke execute on function public.consume_processed_file() from public, anon;
grant execute on function public.consume_processed_file() to authenticated;
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free','starter','pro','pro_plus'));
