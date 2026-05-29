create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
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

create index if not exists transactions_line_user_id_date_idx
  on public.transactions (line_user_id, date desc, created_at desc);

create table if not exists public.user_preferences (
  line_user_id text primary key,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  updated_at timestamptz not null default now()
);

