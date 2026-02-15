-- Recreate chat read-state tables with FK column types that match existing DB schema.
-- Safe for environments where ids are mixed (text in some projects, uuid in others).

drop table if exists division_chat_read_states cascade;
drop table if exists tournament_chat_read_states cascade;
drop table if exists club_chat_read_states cascade;

do $$
declare
  clubs_id_type text;
  users_id_type text;
  tournaments_id_type text;
  divisions_id_type text;
begin
  select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into clubs_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'clubs'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into users_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'users'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into tournaments_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'tournaments'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into divisions_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'divisions'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if clubs_id_type is null then
    raise exception 'Cannot detect type for clubs.id';
  end if;
  if users_id_type is null then
    raise exception 'Cannot detect type for users.id';
  end if;
  if tournaments_id_type is null then
    raise exception 'Cannot detect type for tournaments.id';
  end if;
  if divisions_id_type is null then
    raise exception 'Cannot detect type for divisions.id';
  end if;

  execute format($sql$
    create table club_chat_read_states (
      id uuid primary key default gen_random_uuid(),
      club_id %s not null,
      user_id %s not null,
      last_read_at timestamp not null default now(),
      created_at timestamp not null default now(),
      updated_at timestamp not null default now(),
      constraint club_chat_read_states_club_id_user_id_key unique (club_id, user_id),
      constraint club_chat_read_states_club_id_fkey
        foreign key (club_id) references clubs(id) on delete cascade,
      constraint club_chat_read_states_user_id_fkey
        foreign key (user_id) references users(id) on delete cascade
    )
  $sql$, clubs_id_type, users_id_type);

  execute format($sql$
    create table tournament_chat_read_states (
      id uuid primary key default gen_random_uuid(),
      tournament_id %s not null,
      user_id %s not null,
      last_read_at timestamp not null default now(),
      created_at timestamp not null default now(),
      updated_at timestamp not null default now(),
      constraint tournament_chat_read_states_tournament_id_user_id_key unique (tournament_id, user_id),
      constraint tournament_chat_read_states_tournament_id_fkey
        foreign key (tournament_id) references tournaments(id) on delete cascade,
      constraint tournament_chat_read_states_user_id_fkey
        foreign key (user_id) references users(id) on delete cascade
    )
  $sql$, tournaments_id_type, users_id_type);

  execute format($sql$
    create table division_chat_read_states (
      id uuid primary key default gen_random_uuid(),
      division_id %s not null,
      user_id %s not null,
      last_read_at timestamp not null default now(),
      created_at timestamp not null default now(),
      updated_at timestamp not null default now(),
      constraint division_chat_read_states_division_id_user_id_key unique (division_id, user_id),
      constraint division_chat_read_states_division_id_fkey
        foreign key (division_id) references divisions(id) on delete cascade,
      constraint division_chat_read_states_user_id_fkey
        foreign key (user_id) references users(id) on delete cascade
    )
  $sql$, divisions_id_type, users_id_type);
end
$$;

create index if not exists club_chat_read_states_user_id_updated_at_idx
  on club_chat_read_states (user_id, updated_at desc);

create index if not exists tournament_chat_read_states_user_id_updated_at_idx
  on tournament_chat_read_states (user_id, updated_at desc);

create index if not exists division_chat_read_states_user_id_updated_at_idx
  on division_chat_read_states (user_id, updated_at desc);
