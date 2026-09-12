create schema if not exists headhunter;

create table if not exists headhunter.users (
  id uuid primary key,
  auth_user_id varchar(64) not null unique,
  email varchar(320) not null,
  created_at timestamptz not null default now()
);

create table if not exists headhunter.resumes (
  id uuid primary key,
  user_id uuid not null references headhunter.users(id) on delete cascade,
  file_name varchar(260) not null,
  mime_type varchar(120),
  file_size_bytes bigint not null default 0,
  parsed_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists headhunter.agent_runs (
  id uuid primary key,
  user_id uuid not null references headhunter.users(id) on delete cascade,
  resume_id uuid references headhunter.resumes(id) on delete set null,
  status varchar(24) not null,
  preferences jsonb not null default '{}'::jsonb,
  foundry_thread_id varchar(128),
  foundry_run_id varchar(128),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists headhunter.saved_jobs (
  id uuid primary key,
  user_id uuid not null references headhunter.users(id) on delete cascade,
  resume_id uuid references headhunter.resumes(id) on delete set null,
  job_id varchar(190) not null,
  job_title varchar(320) not null,
  company varchar(320) not null,
  location varchar(320),
  salary_range varchar(120),
  direct_apply_url text,
  match_score numeric(5,2),
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, job_id)
);

create index if not exists idx_hh_resumes_user_created on headhunter.resumes(user_id, created_at desc);
create index if not exists idx_hh_runs_user_created on headhunter.agent_runs(user_id, created_at desc);
create index if not exists idx_hh_saved_jobs_user_created on headhunter.saved_jobs(user_id, created_at desc);
