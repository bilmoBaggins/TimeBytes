-- Records which overnight clock-in alerts have already been texted, so each
-- shift only triggers one message. Only the service role (the Edge Function)
-- touches this table: RLS is on with no policies, so clients can't read it.
create table if not exists public.shift_alerts (
  user_id uuid not null references auth.users(id) on delete cascade,
  shift_local_id integer not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, shift_local_id)
);

alter table public.shift_alerts enable row level security;
