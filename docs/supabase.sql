-- DC Chess global leaderboard. Paste into Supabase: SQL Editor -> New query -> Run.
create table if not exists public.players (
  id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  pid         text not null unique,
  username    text not null check (char_length(username) between 3 and 16),
  icon        text not null default 'icon.knight',
  card        text not null default 'card.carbon',
  level       int  not null default 1   check (level between 1 and 100),
  xp          int  not null default 0   check (xp >= 0),
  rating      int  not null default 1000 check (rating between 100 and 3500),
  bullet      int  not null default 1000 check (bullet between 100 and 3500),
  blitz       int  not null default 1000 check (blitz between 100 and 3500),
  rapid       int  not null default 1000 check (rapid between 100 and 3500),
  classical   int  not null default 1000 check (classical between 100 and 3500),
  bullet_games    int not null default 0,
  blitz_games     int not null default 0,
  rapid_games     int not null default 0,
  classical_games int not null default 0,
  games       int  not null default 0,
  wins        int  not null default 0,
  updated_at  timestamptz not null default now()
);

create index if not exists players_rating_idx on public.players (rating desc);
create index if not exists players_xp_idx on public.players (xp desc);
create index if not exists players_username_idx on public.players (lower(username));

alter table public.players enable row level security;

-- everyone can read the leaderboard
drop policy if exists "players are public" on public.players;
create policy "players are public" on public.players for select using (true);

-- each browser (anonymous Supabase user) can only create / change its own row
drop policy if exists "insert own row" on public.players;
create policy "insert own row" on public.players for insert to authenticated with check (id = auth.uid());
drop policy if exists "update own row" on public.players;
create policy "update own row" on public.players for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
