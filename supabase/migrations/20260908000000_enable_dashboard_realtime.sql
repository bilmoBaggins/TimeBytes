-- Enable Supabase Realtime on the device tables so the web dashboard
-- receives live updates whenever a clock-in/out syncs from the tablet.
-- Run this in the Supabase SQL Editor (idempotent — safe to re-run).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'device_employees'
  ) then
    alter publication supabase_realtime add table public.device_employees;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'device_shifts'
  ) then
    alter publication supabase_realtime add table public.device_shifts;
  end if;
end $$;
