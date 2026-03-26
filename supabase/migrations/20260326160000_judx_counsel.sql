-- Migration: judx_counsel — advogados/procuradores por caso
-- Append-only: cada registro é uma ocorrência de representação

create table if not exists judx_counsel (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references judx_case(id) on delete cascade,
  court_id uuid references judx_court(id) on delete cascade,
  nome text not null,
  oab_numero text,
  oab_seccional text,
  polo text,
  confidence numeric(5,4),
  evidence text,
  source_table text,
  source_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_judx_counsel_case on judx_counsel(case_id);
create index if not exists idx_judx_counsel_nome on judx_counsel(nome);
create index if not exists idx_judx_counsel_oab on judx_counsel(oab_numero, oab_seccional);

comment on table judx_counsel is
'Representantes legais (advogados, defensores, procuradores) extraidos de abaPartes do portal STF e fontes equivalentes. Append-only.';

alter table judx_counsel enable row level security;
create policy "service_role_judx_counsel"
  on judx_counsel for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
