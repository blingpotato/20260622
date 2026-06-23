-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.lotto_draws (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tickets jsonb not null,
  game_count integer not null check (game_count >= 1)
);

create index if not exists lotto_draws_created_at_idx
  on public.lotto_draws (created_at desc);

alter table public.lotto_draws enable row level security;

comment on table public.lotto_draws is '로또 추첨기에서 생성된 번호 기록';
comment on column public.lotto_draws.tickets is '게임별 번호 배열 예: [[1,2,3,4,5,6],[7,8,9,10,11,12]]';
