alter table if exists users add column if not exists gateway_locked boolean not null default false;
alter table if exists users add column if not exists gateway_lock_reason varchar(64);
alter table if exists users add column if not exists gateway_locked_at timestamptz;

create table if not exists billing_reservations (
  id uuid primary key,
  user_id varchar(64) not null references users(id) on delete cascade,
  api_key_id varchar(64) not null references api_keys(id) on delete cascade,
  model_id varchar(120) not null,
  reserved_usd decimal(18,6) not null,
  settled_usd decimal(18,6) not null default 0,
  released_usd decimal(18,6) not null default 0,
  status varchar(16) not null default 'reserved',
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_reservations_user_status on billing_reservations(user_id, status, created_at desc);
