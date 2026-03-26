-- =========================================================
-- STF :: TABELAS BRUTAS — DROP + RECREATE
-- Substitui as tabelas da migration 20260326140000.
-- Espelho da estrutura STJ: dado bruto, sem lógica ontológica.
-- =========================================================

-- ---------------------------------------------------------
-- 1. DROP das tabelas anteriores (cascata nas policies)
-- ---------------------------------------------------------

drop policy if exists "stf_decisions_service"          on stf_decisions;
drop policy if exists "stf_partes_service"             on stf_partes;
drop policy if exists "stf_incidente_raw_service"      on stf_incidente_raw;
drop policy if exists "stf_repercussao_geral_service"  on stf_repercussao_geral;

drop table if exists stf_decisions         cascade;
drop table if exists stf_partes            cascade;
drop table if exists stf_incidente_raw     cascade;
drop table if exists stf_repercussao_geral cascade;

-- ---------------------------------------------------------
-- 2. stf_decisoes — decisões brutas (fonte: 372e + e7a4)
-- ---------------------------------------------------------

create table if not exists stf_decisoes (
  id                        bigserial primary key,
  processo                  text not null,
  orgao_julgador            text,
  relator_decisao           text,
  relator_atual             text,
  data_autuacao             date,
  data_decisao              text,
  data_baixa                date,
  grupo_origem              text,
  tipo_classe               text,
  classe                    text,
  ramo_direito              text,
  assunto                   text,
  assunto_completo          text,
  incidente                 bigint,
  link_processo             text,
  cod_andamento             text,
  subgrupo_andamento        text,
  descricao_andamento       text,
  observacao_andamento      text,
  tipo_decisao              text,
  preferencia_covid19       boolean,
  preferencia_criminal      boolean,
  sigla_ultimo_recurso      text,
  recurso_interno_pendente  boolean,
  em_tramitacao             boolean,
  decisoes_virtual          boolean,
  -- campos do e7a4 (merge posterior)
  ambiente_julgamento       text,
  indicador_colegiado       text,
  id_fato_decisao           bigint,
  raw_source                text default '372e',
  created_at                timestamptz default now(),
  created_dedup text generated always as (md5(coalesce(observacao_andamento, ''))) stored
);

-- Dedup: mesmo processo+data+andamento pode ter decisões distintas (ex: embargos vs segundos embargos)
create unique index if not exists uq_stf_decisoes_dedup
  on stf_decisoes (processo, data_decisao, cod_andamento, md5(coalesce(observacao_andamento, '')));

comment on table stf_decisoes is
'Dado bruto do STF — decisões dos datasets 372e (145K) e e7a4 (24K). Nunca inferir aqui.';

-- ---------------------------------------------------------
-- 3. stf_processos — acervo processual (fonte: 7c9f)
-- ---------------------------------------------------------

create table if not exists stf_processos (
  id                          bigserial primary key,
  processo                    text unique not null,
  classe                      text,
  numero                      integer,
  numero_unico                text,
  incidente                   bigint,
  link_processo               text,
  relator                     text,
  situacao_processual         text,
  grupo_origem                text,
  tipo_classe                 text,
  ramo_direito                text,
  assuntos                    text,
  legislacao                  text,
  meio_processo               text,
  data_autuacao               date,
  data_autuacao_agregada      text,
  data_ultima_decisao         text,
  data_ultimo_andamento       timestamptz,
  grupo_ultimo_andamento      text,
  descricao_ultimo_andamento  text,
  localizacao_atual           text,
  processo_criminal           text,
  situacao_decisao_final      text,
  processo_sobrestado         boolean,
  pedido_vista                boolean,
  raw_source                  text default '7c9f',
  created_at                  timestamptz default now()
);

comment on table stf_processos is
'Dado bruto do STF — acervo processual do dataset 7c9f (21K). Nunca inferir aqui.';

-- ---------------------------------------------------------
-- 4. Índices essenciais
-- ---------------------------------------------------------

create index if not exists idx_stf_decisoes_processo   on stf_decisoes(processo);
create index if not exists idx_stf_decisoes_incidente  on stf_decisoes(incidente);
create index if not exists idx_stf_decisoes_classe     on stf_decisoes(classe);
create index if not exists idx_stf_decisoes_ambiente   on stf_decisoes(ambiente_julgamento);
create index if not exists idx_stf_processos_incidente on stf_processos(incidente);
create index if not exists idx_stf_processos_classe    on stf_processos(classe);

-- ---------------------------------------------------------
-- 5. RLS + service bypass
-- ---------------------------------------------------------

alter table stf_decisoes  enable row level security;
alter table stf_processos enable row level security;

create policy "stf_decisoes_service"  on stf_decisoes  for all using (true) with check (true);
create policy "stf_processos_service" on stf_processos for all using (true) with check (true);
