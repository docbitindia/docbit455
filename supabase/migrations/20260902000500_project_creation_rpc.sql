-- DocBit v19.6: create projects through a controlled SECURITY DEFINER RPC.
-- This removes browser dependence on the projects INSERT RLS path while
-- retaining active-account and server-side plan-limit enforcement.
create or replace function public.create_project(p_name text, p_description text default '')
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.projects;
  p_plan text;
  p_count bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode='42501';
  end if;
  if not public.account_is_active(auth.uid()) then
    raise exception 'Account is deactivated.' using errcode='42501';
  end if;

  select coalesce(plan,'free') into p_plan from public.profiles where id=auth.uid();
  select count(*) into p_count from public.projects where owner_id=auth.uid();
  if p_count >= public.plan_limit(p_plan,'projects') then
    raise exception 'Project limit reached for your % plan.', p_plan using errcode='check_violation';
  end if;

  insert into public.projects(owner_id,name,description)
  values(auth.uid(), left(coalesce(nullif(trim(p_name),''),'Untitled project'),200), left(coalesce(p_description,''),2000))
  returning * into result;
  return result;
end;
$$;
revoke execute on function public.create_project(text,text) from public, anon;
grant execute on function public.create_project(text,text) to authenticated;

-- Keep direct browser INSERTs safe for clients that call the table directly.
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert
with check (public.account_is_active((select auth.uid())) and owner_id=(select auth.uid()));
