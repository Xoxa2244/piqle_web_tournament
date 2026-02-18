drop table if exists division_chat_messages cascade;
drop table if exists tournament_chat_messages cascade;

create table if not exists tournament_chat_messages (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournaments(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  text text not null,
  deleted_at timestamp,
  deleted_by_user_id text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists tournament_chat_messages_tournament_id_created_at_idx
  on tournament_chat_messages (tournament_id, created_at);
create index if not exists tournament_chat_messages_user_id_idx
  on tournament_chat_messages (user_id);
create index if not exists tournament_chat_messages_tournament_id_user_id_created_at_idx
  on tournament_chat_messages (tournament_id, user_id, created_at);

create table if not exists division_chat_messages (
  id uuid primary key default gen_random_uuid(),
  division_id text not null references divisions(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  text text not null,
  deleted_at timestamp,
  deleted_by_user_id text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists division_chat_messages_division_id_created_at_idx
  on division_chat_messages (division_id, created_at);
create index if not exists division_chat_messages_user_id_idx
  on division_chat_messages (user_id);
create index if not exists division_chat_messages_division_id_user_id_created_at_idx
  on division_chat_messages (division_id, user_id, created_at);
