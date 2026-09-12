-- DocBit PDF generation configuration storage.
create table if not exists public.pdf_configurations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'PDF configuration',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pdf_configurations_project_idx on public.pdf_configurations(project_id,updated_at desc);

alter table public.pdf_configurations enable row level security;

drop policy if exists pdf_configurations_select on public.pdf_configurations;
create policy pdf_configurations_select on public.pdf_configurations for select using (public.can_project_access(project_id));
drop policy if exists pdf_configurations_insert on public.pdf_configurations;
create policy pdf_configurations_insert on public.pdf_configurations for insert with check (false);
drop policy if exists pdf_configurations_update on public.pdf_configurations;
create policy pdf_configurations_update on public.pdf_configurations for update using (false);
drop policy if exists pdf_configurations_delete on public.pdf_configurations;
create policy pdf_configurations_delete on public.pdf_configurations for delete using (false);
revoke insert,update,delete on public.pdf_configurations from anon,authenticated;
grant select on public.pdf_configurations to authenticated;

create or replace function public.save_pdf_configuration(p_project_id uuid,p_name text,p_config jsonb)
returns public.pdf_configurations
language plpgsql security definer set search_path=public
as $$
declare v_owner uuid; v_plan text; v_limit bigint; v_count bigint; v_row public.pdf_configurations;
begin
  if not public.can_project_edit(p_project_id) then raise exception 'Only project editors can save PDF configurations.' using errcode='42501'; end if;
  select owner_id into v_owner from public.projects where id=p_project_id;
  select coalesce(plan,'free') into v_plan from public.profiles where id=v_owner;
  v_limit := public.plan_limit(v_plan,'saved_configurations');
  if v_limit = 0 then raise exception 'PDF configurations are not available on your plan.' using errcode='check_violation'; end if;
  select count(*) into v_count from public.pdf_configurations where owner_id=v_owner;
  if v_count >= v_limit then raise exception 'Saved PDF configuration limit reached for your % plan.',v_plan using errcode='check_violation'; end if;
  insert into public.pdf_configurations(owner_id,project_id,name,config) values(v_owner,p_project_id,coalesce(nullif(trim(p_name),''),'PDF configuration'),coalesce(p_config,'{}'::jsonb)) returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.save_pdf_configuration(uuid,text,jsonb) from public,anon;
grant execute on function public.save_pdf_configuration(uuid,text,jsonb) to authenticated;

-- Extend the canonical plan-limit helper with saved configuration limits.
create or replace function public.plan_limit(p_plan text,p_key text)
returns bigint language sql immutable as $$
  select case p_key
    when 'projects' then case p_plan when 'free' then 3::bigint when 'starter' then 10::bigint else 9223372036854775807::bigint end
    when 'saved_files' then case p_plan when 'free' then 10::bigint when 'starter' then 100::bigint when 'pro' then 1000::bigint when 'pro_plus' then 5000::bigint else 10::bigint end
    when 'storage_bytes' then case p_plan when 'free' then 250::bigint*1024*1024 when 'starter' then 2048::bigint*1024*1024 when 'pro' then 10240::bigint*1024*1024 when 'pro_plus' then 51200::bigint*1024*1024 else 250::bigint*1024*1024 end
    when 'max_file_bytes' then case p_plan when 'free' then 10::bigint*1024*1024 when 'starter' then 50::bigint*1024*1024 when 'pro' then 100::bigint*1024*1024 when 'pro_plus' then 250::bigint*1024*1024 else 10::bigint*1024*1024 end
    when 'processed_files' then case p_plan when 'free' then 25::bigint when 'starter' then 150::bigint when 'pro' then 750::bigint when 'pro_plus' then 2500::bigint else 25::bigint end
    when 'saved_configurations' then case p_plan when 'free' then 3::bigint when 'starter' then 25::bigint when 'pro' then 100::bigint when 'pro_plus' then 9223372036854775807::bigint else 3::bigint end
    else 0::bigint end;
$$;
