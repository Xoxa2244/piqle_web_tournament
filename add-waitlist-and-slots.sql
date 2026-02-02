-- Add user linkage and slot support for player self-registration
-- Review carefully before applying to production.

do $$
declare
  tournament_id_type text;
  division_id_type text;
  player_id_type text;
  user_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into tournament_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'tournaments' and a.attname = 'id';

  select format_type(a.atttypid, a.atttypmod)
    into division_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'divisions' and a.attname = 'id';

  select format_type(a.atttypid, a.atttypmod)
    into player_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'players' and a.attname = 'id';

  select format_type(a.atttypid, a.atttypmod)
    into user_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'users' and a.attname = 'id';

  -- Players: link to users
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'user_id'
  ) then
    execute format('alter table public.players add column user_id %s', user_id_type);
  end if;
end $$;

create index if not exists players_user_id_idx
  on public.players (user_id);

-- Team players: slot index (0-based)
alter table public.team_players
  add column if not exists slot_index int;

-- Backfill slot_index based on createdAt order (0-based)
with ordered as (
  select
    id,
    "teamId",
    row_number() over (partition by "teamId" order by "createdAt" asc) - 1 as slot_index
  from public.team_players
  where slot_index is null
)
update public.team_players tp
set slot_index = ordered.slot_index
from ordered
where tp.id = ordered.id;

create unique index if not exists team_players_team_slot_unique
  on public.team_players ("teamId", slot_index);

-- Waitlist entries
do $$ begin
  create type "WaitlistStatus" as enum ('ACTIVE');
exception
  when duplicate_object then null;
end $$;
do $$
declare
  tournament_id_type text;
  division_id_type text;
  player_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into tournament_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'tournaments' and a.attname = 'id';

  select format_type(a.atttypid, a.atttypmod)
    into division_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'divisions' and a.attname = 'id';

  select format_type(a.atttypid, a.atttypmod)
    into player_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'players' and a.attname = 'id';

  execute format(
    'create table if not exists public.waitlist_entries (
      id uuid primary key default gen_random_uuid(),
      tournament_id %s not null references public.tournaments(id) on delete cascade,
      division_id %s not null references public.divisions(id) on delete cascade,
      player_id %s not null references public.players(id) on delete cascade,
      status "WaitlistStatus" not null default ''ACTIVE'',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )',
    tournament_id_type,
    division_id_type,
    player_id_type
  );
end $$;

create unique index if not exists waitlist_entries_player_tournament_unique
  on public.waitlist_entries (player_id, tournament_id);

create index if not exists waitlist_entries_division_created_idx
  on public.waitlist_entries (division_id, created_at);
