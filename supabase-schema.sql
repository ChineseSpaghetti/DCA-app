create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  line_user_id text not null,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  currency text not null check (currency in ('THB', 'USD')),
  date date not null,
  shares numeric not null,
  price numeric not null,
  stock_value numeric not null default 0,
  fee numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists client_id uuid;

create index if not exists transactions_line_user_id_date_idx
  on public.transactions (line_user_id, date desc, created_at desc);

create unique index if not exists transactions_line_user_id_client_id_idx
  on public.transactions (line_user_id, client_id);

alter table public.transactions enable row level security;
revoke all on table public.transactions from anon, authenticated;

create table if not exists public.user_preferences (
  line_user_id text primary key,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
revoke all on table public.user_preferences from anon, authenticated;

create table if not exists public.line_pending_transactions (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  client_id uuid,
  payload jsonb not null,
  confidence numeric not null default 0,
  date_confidence numeric not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 day'
);

create index if not exists line_pending_transactions_user_expiry_idx
  on public.line_pending_transactions (line_user_id, expires_at desc);

alter table public.line_pending_transactions enable row level security;
revoke all on table public.line_pending_transactions from anon, authenticated;
