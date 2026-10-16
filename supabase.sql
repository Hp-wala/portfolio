-- Run in Supabase: SQL Editor > New query
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null,
  phone      text not null,
  email      text,
  need       text not null,
  budget     text,
  message    text,
  source     text,
  status     text not null default 'new'
);

alter table public.leads alter column email drop not null;
alter table public.leads enable row level security;
revoke all on public.leads from public, anon, authenticated;
grant insert on public.leads to anon, authenticated;

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text not null default '',
  tech          text[] not null default '{}',
  link          text,
  note          text,
  display_order integer not null default 0,
  visible       boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.project_images (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  storage_path text not null unique,
  public_url   text not null,
  caption      text not null default '',
  alt_text     text not null default '',
  width        integer not null check (width > 0),
  height       integer not null check (height > 0),
  sort_order   integer not null default 0,
  is_cover     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.site_visits (
  id         uuid primary key default gen_random_uuid(),
  source     text not null check (source in ('instagram', 'facebook', 'direct', 'other')),
  created_at timestamptz not null default now()
);

create unique index if not exists project_images_one_cover_per_project
  on public.project_images(project_id) where is_cover;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename in ('leads', 'projects', 'project_images', 'site_visits')
  loop
    execute format('drop policy %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end
$$;

create policy leads_public_insert on public.leads
  for insert to anon, authenticated
  with check (true);

alter table public.site_visits enable row level security;
revoke all on public.site_visits from public, anon, authenticated;
grant insert on public.site_visits to anon, authenticated;
grant select on public.site_visits to authenticated;

create policy site_visits_public_insert on public.site_visits
  for insert to anon, authenticated
  with check (source in ('instagram', 'facebook', 'direct', 'other'));

create policy site_visits_admin_read on public.site_visits
  for select to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = lower('ritul@gmail.com'));

alter table public.projects enable row level security;
revoke all on public.projects from public, anon, authenticated;
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;

drop policy if exists projects_public_read_visible on public.projects;
create policy projects_public_read_visible on public.projects
  for select to anon, authenticated
  using (visible = true);

drop policy if exists projects_admin_all on public.projects;
create policy projects_admin_all on public.projects
  for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = lower('ritul@gmail.com'))
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = lower('ritul@gmail.com'));

alter table public.project_images enable row level security;
revoke all on public.project_images from public, anon, authenticated;
grant select on public.project_images to anon, authenticated;
grant insert, update, delete on public.project_images to authenticated;

create policy project_images_public_read on public.project_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_images.project_id and projects.visible = true
    )
  );

create policy project_images_admin_all on public.project_images
  for all to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = lower('ritul@gmail.com'))
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = lower('ritul@gmail.com'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-images',
  'project-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%project-images%'
        or coalesce(with_check, '') ilike '%project-images%'
      )
  loop
    execute format('drop policy %I on storage.objects', policy_record.policyname);
  end loop;
end
$$;

create policy project_images_bucket_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'project-images');

create policy project_images_bucket_admin_all on storage.objects
  for all to authenticated
  using (
    bucket_id = 'project-images'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('ritul@gmail.com')
  )
  with check (
    bucket_id = 'project-images'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('ritul@gmail.com')
  );
