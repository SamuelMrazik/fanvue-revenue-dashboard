-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

create table if not exists tracker_models (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists tracker_snapshots (
  id text primary key,
  model_id text not null references tracker_models(id) on delete cascade,
  captured_at timestamptz not null,
  data jsonb not null
);

create index if not exists tracker_snapshots_model_captured_idx
  on tracker_snapshots (model_id, captured_at desc);

create table if not exists tracker_sync_logs (
  id text primary key,
  model_id text not null,
  created_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists tracker_sync_logs_created_idx
  on tracker_sync_logs (created_at desc);

create table if not exists tracker_oauth_states (
  state text primary key,
  model_id text not null,
  code_verifier text not null,
  redirect_uri text not null,
  expires_at timestamptz not null
);

create index if not exists tracker_oauth_states_expires_idx
  on tracker_oauth_states (expires_at);

create table if not exists tracker_meta (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table tracker_meta enable row level security;
