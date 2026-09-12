alter table if exists upstream_channels
  add column if not exists health_status varchar(16) not null default 'unknown',
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_latency_ms integer,
  add column if not exists last_health_error text;

alter table if exists upstream_channels
  add constraint chk_health_status
  check (health_status in ('unknown','healthy','degraded','unhealthy'));

create index if not exists idx_upstream_channels_health_status on upstream_channels(health_status);
