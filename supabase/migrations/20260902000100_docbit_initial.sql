create extension if not exists pgcrypto;

create type public.project_role as enum ('editor','member');
create type public.account_status as enum ('active','deactivated');
create type public.activity_type as enum ('project_created','file_uploaded','file_analyzed','file_added_to_project','file_edited','changes_saved','file_exported','member_added','member_removed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  photo_url text,
  plan text not null default 'free',
  status public.account_status not null default 'active',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  file_count integer not null default 0,
  storage_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role public.project_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(project_id,user_id)
);

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  original_name text not null,
  file_type text not null,
  size bigint not null default 0,
  storage_path text not null,
  document_path text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.activity_type not null,
  project_id uuid references public.projects(id) on delete cascade,
  file_id uuid references public.project_files(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

create table public.usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null default 'current',
  processed_files integer not null default 0,
  storage_bytes bigint not null default 0,
  projects integer not null default 0,
  saved_files integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id,period)
);

create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  browser text not null default 'Unknown browser',
  device text not null default 'Unknown device',
  city text,
  region text,
  postal_code text,
  country text,
  ip_address inet,
  is_current boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index projects_owner_updated_idx on public.projects(owner_id,updated_at desc);
create index project_members_user_idx on public.project_members(user_id,project_id);
create index project_files_project_updated_idx on public.project_files(project_id,updated_at desc);
create index activities_user_created_idx on public.activities(user_id,created_at desc);
create index sessions_user_last_seen_idx on public.user_sessions(user_id,last_seen_at desc);

create or replace function public.is_project_owner(p_project_id uuid) returns boolean
language sql security definer set search_path=public stable as $$
  select exists(select 1 from public.projects where id=p_project_id and owner_id=auth.uid());
$$;
create or replace function public.can_project_access(p_project_id uuid) returns boolean
language sql security definer set search_path=public stable as $$
  select exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=auth.uid())
      or exists(select 1 from public.project_members pm where pm.project_id=p_project_id and pm.user_id=auth.uid());
$$;
create or replace function public.can_project_edit(p_project_id uuid) returns boolean
language sql security definer set search_path=public stable as $$
  select exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=auth.uid())
      or exists(select 1 from public.project_members pm where pm.project_id=p_project_id and pm.user_id=auth.uid() and pm.role='editor');
$$;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();
create trigger members_updated before update on public.project_members for each row execute function public.set_updated_at();
create trigger files_updated before update on public.project_files for each row execute function public.set_updated_at();
create trigger usage_updated before update on public.usage for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,display_name,photo_url,plan,status,onboarding_complete)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),new.raw_user_meta_data->>'avatar_url','free','active',false)
  on conflict(id) do update set email=excluded.email;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.increment_project_usage(p_project_id uuid,p_size bigint) returns void language plpgsql security definer set search_path=public as $$
begin
  update public.projects set file_count=file_count+1,storage_bytes=storage_bytes+greatest(p_size,0),updated_at=now() where id=p_project_id and public.can_project_edit(p_project_id);
end $$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_files enable row level security;
alter table public.activities enable row level security;
alter table public.usage enable row level security;
alter table public.user_sessions enable row level security;

create policy profiles_select on public.profiles for select using(id=auth.uid());
create policy profiles_insert on public.profiles for insert with check(id=auth.uid());
create policy profiles_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());

create policy projects_select on public.projects for select using(public.can_project_access(id));
create policy projects_insert on public.projects for insert with check(owner_id=auth.uid());
create policy projects_update on public.projects for update using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy projects_delete on public.projects for delete using(owner_id=auth.uid());

create policy members_select on public.project_members for select using(user_id=auth.uid() or public.is_project_owner(project_id));
create policy members_insert on public.project_members for insert with check(public.is_project_owner(project_id));
create policy members_update on public.project_members for update using(public.is_project_owner(project_id)) with check(public.is_project_owner(project_id));
create policy members_delete on public.project_members for delete using(public.is_project_owner(project_id));

create policy files_select on public.project_files for select using(public.can_project_access(project_id));
create policy files_insert on public.project_files for insert with check(owner_id=(select owner_id from public.projects where id=project_id) and public.can_project_edit(project_id));
create policy files_update on public.project_files for update using(public.can_project_edit(project_id)) with check(owner_id=(select owner_id from public.projects where id=project_id));
create policy files_delete on public.project_files for delete using(public.can_project_edit(project_id));

create policy activities_select on public.activities for select using(user_id=auth.uid());
create policy activities_insert on public.activities for insert with check(user_id=auth.uid());
create policy usage_select on public.usage for select using(user_id=auth.uid());
create policy usage_insert on public.usage for insert with check(user_id=auth.uid());
create policy usage_update on public.usage for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy sessions_select on public.user_sessions for select using(user_id=auth.uid());
create policy sessions_delete on public.user_sessions for delete using(user_id=auth.uid());

insert into storage.buckets(id,name,public) values('project-files','project-files',false) on conflict(id) do nothing;
insert into storage.buckets(id,name,public) values('profile-media','profile-media',true) on conflict(id) do nothing;

create policy storage_select on storage.objects for select using(
  bucket_id='project-files' and public.can_project_access(split_part(name,'/',1)::uuid)
);
create policy storage_insert on storage.objects for insert with check(
  bucket_id='project-files' and public.can_project_edit(split_part(name,'/',1)::uuid)
);
create policy storage_update on storage.objects for update
using (
  bucket_id = 'project-files'
  and public.can_project_edit(split_part(name, '/', 1)::uuid)
)
with check (
  bucket_id = 'project-files'
  and public.can_project_edit(split_part(name, '/', 1)::uuid)
);

create policy storage_delete on storage.objects for delete
using (
  bucket_id = 'project-files'
  and public.can_project_edit(split_part(name, '/', 1)::uuid)
);

/* Profile avatars are public for fast profile rendering, but only the
   authenticated owner can upload, replace, or delete their own avatar. */
create policy profile_media_select on storage.objects for select
using (bucket_id = 'profile-media');

create policy profile_media_insert on storage.objects for insert
with check (
  bucket_id = 'profile-media'
  and auth.uid() is not null
  and split_part(name, '/', 1) = 'avatars'
  and split_part(name, '/', 2) = auth.uid()::text
);

create policy profile_media_update on storage.objects for update
using (
  bucket_id = 'profile-media'
  and auth.uid() is not null
  and split_part(name, '/', 1) = 'avatars'
  and split_part(name, '/', 2) = auth.uid()::text
)
with check (
  bucket_id = 'profile-media'
  and auth.uid() is not null
  and split_part(name, '/', 1) = 'avatars'
  and split_part(name, '/', 2) = auth.uid()::text
);

create policy profile_media_delete on storage.objects for delete
using (
  bucket_id = 'profile-media'
  and auth.uid() is not null
  and split_part(name, '/', 1) = 'avatars'
  and split_part(name, '/', 2) = auth.uid()::text
);

create table public.billing_events (
  id bigint generated by default as identity primary key,
  event_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
create policy billing_events_select on public.billing_events for select using(user_id=auth.uid());


create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  status text not null default 'active',
  billing_cycle text not null default 'monthly',
  provider text not null default 'razorpay',
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions(user_id,updated_at desc);
alter table public.subscriptions enable row level security;
create policy subscriptions_select on public.subscriptions for select using(user_id=auth.uid());
create trigger subscriptions_updated before update on public.subscriptions for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null default 'razorpay',
  provider_payment_id text,
  amount_paise bigint not null,
  currency text not null default 'INR',
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index payments_user_created_idx on public.payments(user_id,created_at desc);
alter table public.payments enable row level security;
create policy payments_select on public.payments for select using(user_id=auth.uid());
