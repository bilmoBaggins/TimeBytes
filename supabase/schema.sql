-- Run this in Supabase SQL Editor.
-- Enable Authentication > Providers > Anonymous before using cloud backup.

create table if not exists public.device_employees (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id integer not null,
  name text not null,
  hourly_rate numeric not null,
  face_id text,
  is_clocked_in boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, local_id)
);

alter table public.device_employees add column if not exists face_id text;

create table if not exists public.device_admin_faces (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id integer not null,
  name text not null,
  face_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, local_id)
);

create table if not exists public.device_shifts (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id integer not null,
  employee_id integer not null,
  employee_name text not null,
  date date not null,
  clock_in_time text not null,
  clock_out_time text,
  hourly_pay numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, local_id)
);

alter table public.device_employees enable row level security;
alter table public.device_shifts enable row level security;
alter table public.device_admin_faces enable row level security;

grant select, insert, update, delete on public.device_employees to authenticated;
grant select, insert, update, delete on public.device_shifts to authenticated;
grant select, insert, update, delete on public.device_admin_faces to authenticated;

drop policy if exists "device owns employees" on public.device_employees;
drop policy if exists "device owns shifts" on public.device_shifts;
drop policy if exists "device owns admin faces" on public.device_admin_faces;

create policy "device owns employees" on public.device_employees
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "device owns shifts" on public.device_shifts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "device owns admin faces" on public.device_admin_faces
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
