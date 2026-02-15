create table if not exists club_chat_read_states (
  id uuid primary key default gen_random_uuid(),
  club_id text not null references clubs(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  last_read_at timestamp not null default now(),
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  unique (club_id, user_id)
);

create index if not exists club_chat_read_states_user_id_updated_at_idx
  on club_chat_read_states (user_id, updated_at desc);

create table if not exists tournament_chat_read_states (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournaments(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  last_read_at timestamp not null default now(),
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  unique (tournament_id, user_id)
);

create index if not exists tournament_chat_read_states_user_id_updated_at_idx
  on tournament_chat_read_states (user_id, updated_at desc);

create table if not exists division_chat_read_states (
  id uuid primary key default gen_random_uuid(),
  division_id text not null references divisions(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  last_read_at timestamp not null default now(),
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  unique (division_id, user_id)
);

create index if not exists division_chat_read_states_user_id_updated_at_idx
  on division_chat_read_states (user_id, updated_at desc);
