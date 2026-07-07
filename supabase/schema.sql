create table if not exists public.emc_quotes (
  folio text primary key,
  status text not null default 'Nueva',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  valid_until timestamptz,
  client_name text,
  client_phone text,
  client_city text,
  client_company text,
  client_type text,
  service_need text,
  urgency text,
  total numeric not null default 0,
  payload jsonb not null
);

alter table public.emc_quotes
  add column if not exists client_company text,
  add column if not exists client_type text,
  add column if not exists service_need text,
  add column if not exists urgency text;

create index if not exists emc_quotes_created_at_idx
  on public.emc_quotes (created_at desc);

create index if not exists emc_quotes_status_idx
  on public.emc_quotes (status);

create index if not exists emc_quotes_service_need_idx
  on public.emc_quotes (service_need);

create index if not exists emc_quotes_urgency_idx
  on public.emc_quotes (urgency);

create table if not exists public.emc_collaborators (
  id uuid primary key,
  status text not null default 'Nuevo',
  created_at timestamptz not null default now(),
  name text,
  phone text,
  city text,
  zone text,
  age integer,
  preferential_review boolean not null default false,
  payload jsonb not null
);

create index if not exists emc_collaborators_created_at_idx
  on public.emc_collaborators (created_at desc);

create index if not exists emc_collaborators_city_idx
  on public.emc_collaborators (city);

alter table public.emc_quotes enable row level security;
alter table public.emc_collaborators enable row level security;

drop policy if exists "emc_quotes_no_public_access" on public.emc_quotes;
drop policy if exists "emc_collaborators_no_public_access" on public.emc_collaborators;

create policy "emc_quotes_no_public_access"
  on public.emc_quotes
  for all
  using (false)
  with check (false);

create policy "emc_collaborators_no_public_access"
  on public.emc_collaborators
  for all
  using (false)
  with check (false);
