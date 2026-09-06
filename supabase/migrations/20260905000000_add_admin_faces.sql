create table if not exists public.device_admin_faces (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id integer not null,
  name text not null,
  face_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, local_id)
);

alter table public.device_admin_faces enable row level security;

grant select, insert, update, delete on public.device_admin_faces to authenticated;

drop policy if exists "device owns admin faces" on public.device_admin_faces;
create policy "device owns admin faces" on public.device_admin_faces
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
