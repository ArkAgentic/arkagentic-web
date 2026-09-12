create table if not exists users (
  id varchar(64) primary key,
  email varchar(320) unique not null,
  name varchar(160) not null default '',
  phone varchar(32),
  password_hash varchar(255),
  role varchar(16) not null default 'user',
  status varchar(16) not null default 'active',
  balance_usd decimal(18,6) not null default 0,
  total_deposited_usd decimal(18,6) not null default 0,
  pricing_tier varchar(16) not null default 'tier_1',
  created_at timestamptz not null default now()
);

create table if not exists api_keys (
  id varchar(64) primary key,
  user_id varchar(64) not null references users(id) on delete cascade,
  key_hash varchar(128) not null unique,
  key_prefix varchar(32) not null,
  quota_limit bigint not null default 0,
  status varchar(16) not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists api_logs (
  id uuid primary key,
  user_id varchar(64) not null references users(id) on delete cascade,
  api_key_id varchar(64) not null references api_keys(id) on delete cascade,
  model_id varchar(120) not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd decimal(18,6) not null default 0,
  charged_usd decimal(18,6) not null default 0,
  net_profit_usd decimal(18,6) not null default 0,
  status_code integer not null default 200,
  created_at timestamptz not null default now()
);

create table if not exists usage_logs (
  id uuid primary key,
  user_id varchar(64) not null references users(id) on delete cascade,
  api_key_id varchar(64) references api_keys(id) on delete set null,
  model varchar(120) not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd decimal(18,6) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key,
  user_id varchar(64) not null references users(id) on delete cascade,
  stripe_id varchar(120),
  amount_usd decimal(18,6) not null,
  kind varchar(16) not null default 'deposit',
  created_at timestamptz not null default now()
);

create index if not exists idx_api_keys_user_id on api_keys(user_id);
create index if not exists idx_api_logs_user_id_created_at on api_logs(user_id, created_at desc);
create index if not exists idx_usage_logs_user_id_created_at on usage_logs(user_id, created_at desc);
create index if not exists idx_transactions_user_id_created_at on transactions(user_id, created_at desc);

alter table if exists users add column if not exists phone varchar(32);
alter table if exists users add column if not exists password_hash varchar(255);
