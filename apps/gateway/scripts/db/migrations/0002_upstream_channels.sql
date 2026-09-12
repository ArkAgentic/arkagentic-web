create table if not exists upstream_channels (
  id uuid primary key,
  channel_type varchar(32) not null,
  name varchar(120) not null unique,
  base_url text not null,
  api_key_encrypted text not null,
  encryption_kid varchar(64) not null default 'v1',
  model_mapping jsonb not null default '{}'::jsonb,
  timeout_ms integer not null default 45000,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_channel_type check (channel_type in ('azure_openai','openai_standard','siliconflow','custom')),
  constraint chk_timeout_ms check (timeout_ms between 1000 and 120000)
);

create table if not exists upstream_model_routes (
  id uuid primary key,
  ark_model_id varchar(120) not null,
  channel_id uuid not null references upstream_channels(id) on delete cascade,
  priority smallint not null,
  enabled boolean not null default true,
  upstream_model_override varchar(160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_route_priority check (priority >= 1 and priority <= 10),
  constraint uq_model_channel unique (ark_model_id, channel_id),
  constraint uq_model_priority unique (ark_model_id, priority)
);

create index if not exists idx_upstream_channels_enabled on upstream_channels(enabled);
create index if not exists idx_upstream_channels_type on upstream_channels(channel_type);
create index if not exists idx_upstream_channels_mapping_gin on upstream_channels using gin (model_mapping jsonb_path_ops);
create index if not exists idx_model_routes_lookup on upstream_model_routes(ark_model_id, enabled, priority);
