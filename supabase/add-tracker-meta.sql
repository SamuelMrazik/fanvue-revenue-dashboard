-- Run once in Supabase: Dashboard → SQL → New query → paste → Run
-- Fixes: "Could not find the table public.tracker_meta"

create table if not exists tracker_meta (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Safe to enable: the Render app uses SUPABASE_SERVICE_ROLE_KEY (server-only),
-- which bypasses RLS. This blocks anon/authenticated keys from reading the table.
alter table tracker_meta enable row level security;
