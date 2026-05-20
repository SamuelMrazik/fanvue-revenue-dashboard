-- Run once in Supabase: Dashboard → SQL → New query → paste → Run
-- Fixes: "Could not find the table public.tracker_meta"

create table if not exists tracker_meta (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Optional: enable API access (usually already on for public schema)
-- alter table tracker_meta enable row level security;
