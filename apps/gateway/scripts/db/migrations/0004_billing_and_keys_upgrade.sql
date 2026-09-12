alter table if exists api_keys add column if not exists display_name varchar(120) not null default 'API Key';
alter table if exists api_keys add column if not exists spend_limit_usd decimal(18,6);

alter table if exists transactions add column if not exists payment_method varchar(32) not null default 'stripe';
alter table if exists transactions add column if not exists status varchar(16) not null default 'success';

create table if not exists redeem_codes (
  id uuid primary key,
  code_hash varchar(128) unique not null,
  amount_usd decimal(18,6) not null,
  status varchar(16) not null default 'active',
  expires_at timestamptz,
  redeemed_by_user_id varchar(64) references users(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_redeem_codes_status on redeem_codes(status);
