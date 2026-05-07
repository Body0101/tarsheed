-- Supabase schema for the ESP32 hybrid online/offline layer.
-- Apply this in the Supabase SQL editor before enabling CLOUD_SYNC_ENABLED.

create table if not exists public.device_states (
  device_id text primary key,
  updated_epoch bigint,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.device_events (
  id bigserial primary key,
  device_id text not null,
  event text not null,
  event_ts bigint,
  dedupe_key text unique,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.remote_commands (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  command jsonb not null,
  result jsonb,
  processed_epoch bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_events_device_created
  on public.device_events (device_id, created_at desc);

create index if not exists idx_remote_commands_pending
  on public.remote_commands (device_id, status, created_at asc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_device_states_touch on public.device_states;
create trigger trg_device_states_touch
before update on public.device_states
for each row execute function public.touch_updated_at();

drop trigger if exists trg_remote_commands_touch on public.remote_commands;
create trigger trg_remote_commands_touch
before update on public.remote_commands
for each row execute function public.touch_updated_at();

alter table public.device_states enable row level security;
alter table public.device_events enable row level security;
alter table public.remote_commands enable row level security;

-- Direct-device REST mode. For stronger production security, route writes
-- through Supabase Edge Functions and keep table policies stricter.
drop policy if exists "device state read" on public.device_states;
create policy "device state read" on public.device_states
for select to anon using (true);

drop policy if exists "device state upsert" on public.device_states;
create policy "device state upsert" on public.device_states
for all to anon using (true) with check (true);

drop policy if exists "device events read" on public.device_events;
create policy "device events read" on public.device_events
for select to anon using (true);

drop policy if exists "device events insert" on public.device_events;
create policy "device events insert" on public.device_events
for insert to anon with check (true);

drop policy if exists "remote commands device read" on public.remote_commands;
create policy "remote commands device read" on public.remote_commands
for select to anon using (true);

drop policy if exists "remote commands device update" on public.remote_commands;
create policy "remote commands device update" on public.remote_commands
for update to anon using (true) with check (true);

drop policy if exists "remote commands client insert" on public.remote_commands;
create policy "remote commands client insert" on public.remote_commands
for insert to anon with check (true);
