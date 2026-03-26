-- =========================================================
-- STF :: TABELAS DE DADOS BRUTOS
-- Responsabilidade: preservar dado extraído do STF.
-- Nunca inferir, normalizar ou classificar aqui.
-- =========================================================

-- ---------------------------------------------------------
-- stf_decisions — decisões extraídas do Qlik Sense
-- Fonte: transparencia.stf.jus.br (objeto UbMrYBg)
-- ---------------------------------------------------------

create table if not exists stf_decisions (
  id bigint generated always as identity primary key,
  court_id text not null default 'STF',
  id_fato_decisao text,
  processo text not null,
  relator_atual text,
  meio_processo text,
  origem_decisao text,
  ambiente_julgamento text,
  data_autuacao text,
  data_baixa text,
  indicador_colegiado text,
  ano_decisao text,
  data_decisao text,
  tipo_decisao text,
  andamento_decisao text,
  observacao_andamento text,
  ramo_direito text,
  assuntos_processo text,
  indicador_tramitacao text,
  orgao_julgador text,
  descricao_procedencia text,
  descricao_orgao_origem text,
  fetched_at timestamptz not null default now(),
  unique (id_fato_decisao)
);

create index if not exists idx_stf_decisions_processo on stf_decisions (processo);
create index if not exists idx_stf_decisions_ano on stf_decisions (ano_decisao);
create index if not exists idx_stf_decisions_relator on stf_decisions (relator_atual);
create index if not exists idx_stf_decisions_ambiente on stf_decisions (ambiente_julgamento);
create index if not exists idx_stf_decisions_orgao on stf_decisions (orgao_julgador);
create index if not exists idx_stf_decisions_tipo on stf_decisions (tipo_decisao);

comment on table stf_decisions is
'Dado bruto do STF — decisões extraídas do painel Qlik Sense de transparência. Nunca inferir aqui.';

-- ---------------------------------------------------------
-- stf_partes — partes processuais extraídas do Qlik Sense
-- Fonte: transparencia.stf.jus.br (objeto pRRETQ)
-- ---------------------------------------------------------

create table if not exists stf_partes (
  id bigint generated always as identity primary key,
  court_id text not null default 'STF',
  processo text not null,
  polo_ativo text,
  polo_passivo text,
  advogado_polo_ativo text,
  advogado_polo_passivo text,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_stf_partes_processo on stf_partes (processo);

comment on table stf_partes is
'Dado bruto do STF — partes processuais extraídas do painel Qlik Sense. Nunca inferir aqui.';

-- ---------------------------------------------------------
-- stf_incidente_raw — HTML bruto das abas do portal
-- Fonte: portal.stf.jus.br/processos/aba*.asp
-- ---------------------------------------------------------

create table if not exists stf_incidente_raw (
  id bigint generated always as identity primary key,
  court_id text not null default 'STF',
  incidente bigint not null,
  aba text not null,
  html text not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_stf_incidente_raw_incidente on stf_incidente_raw (incidente);
create index if not exists idx_stf_incidente_raw_aba on stf_incidente_raw (aba);
create index if not exists idx_stf_incidente_raw_fetched on stf_incidente_raw (fetched_at);

comment on table stf_incidente_raw is
'HTML bruto das abas do portal STF — append-only, preserva histórico de cada fetch. Nunca inferir aqui.';

-- ---------------------------------------------------------
-- stf_repercussao_geral — JSON da API de repercussão geral
-- Fonte: sistemas.stf.jus.br/repgeral/votacao?tema=N
-- ---------------------------------------------------------

create table if not exists stf_repercussao_geral (
  id bigint generated always as identity primary key,
  court_id text not null default 'STF',
  tema integer not null,
  payload_json jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_stf_repgeral_tema on stf_repercussao_geral (tema);

comment on table stf_repercussao_geral is
'JSON bruto da API de repercussão geral do STF. Append-only. Nunca inferir aqui.';

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------

alter table stf_decisions enable row level security;
alter table stf_partes enable row level security;
alter table stf_incidente_raw enable row level security;
alter table stf_repercussao_geral enable row level security;

-- Service role bypass
create policy "stf_decisions_service" on stf_decisions for all using (true) with check (true);
create policy "stf_partes_service" on stf_partes for all using (true) with check (true);
create policy "stf_incidente_raw_service" on stf_incidente_raw for all using (true) with check (true);
create policy "stf_repercussao_geral_service" on stf_repercussao_geral for all using (true) with check (true);
