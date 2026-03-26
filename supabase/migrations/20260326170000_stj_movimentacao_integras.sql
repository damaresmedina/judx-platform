-- Migration: stj_movimentacao + stj_integras
-- Novas tabelas para movimentação processual e íntegras de decisões do STJ

-- ────────────────────────────────────────────────────────────
-- 1. stj_movimentacao — andamentos processuais (XML CNJ/Datajud)
-- ────────────────────────────────────────────────────────────

create table if not exists stj_movimentacao (
  id bigint generated always as identity primary key,
  numero_processo text not null,
  data_movimentacao text,
  tipo_movimentacao text,
  descricao text,
  orgao text,
  ambiente text,
  source_file text not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_stj_movimentacao_processo
  on stj_movimentacao(numero_processo);
create index if not exists idx_stj_movimentacao_data
  on stj_movimentacao(data_movimentacao);
create index if not exists idx_stj_movimentacao_tipo
  on stj_movimentacao(tipo_movimentacao);
create index if not exists idx_stj_movimentacao_ambiente
  on stj_movimentacao(ambiente) where ambiente is not null;

alter table stj_movimentacao enable row level security;
create policy "service_role_stj_movimentacao"
  on stj_movimentacao for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 2. stj_integras — íntegras de decisões terminativas e acórdãos
-- ────────────────────────────────────────────────────────────

create table if not exists stj_integras (
  id bigint generated always as identity primary key,
  numero_registro text not null unique,
  processo text,
  data_decisao text,
  orgao_julgador text,
  relator text,
  partes_raw text,
  inteiro_teor_texto text,
  source_file text not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_stj_integras_registro
  on stj_integras(numero_registro);
create index if not exists idx_stj_integras_processo
  on stj_integras(processo);
create index if not exists idx_stj_integras_data
  on stj_integras(data_decisao);
create index if not exists idx_stj_integras_relator
  on stj_integras(relator);

alter table stj_integras enable row level security;
create policy "service_role_stj_integras"
  on stj_integras for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
