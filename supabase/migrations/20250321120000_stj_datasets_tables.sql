-- Tabelas STJ: DJ, precedentes (temas + processos), distribuição.
-- Buckets Storage para backups automáticos (service role).

create table if not exists public.stj_decisoes_dj (
  seq_documento bigint not null,
  data_publicacao timestamptz,
  tipo_documento text,
  numero_registro text,
  processo text,
  ministro text,
  teor text,
  assuntos text,
  constraint stj_decisoes_dj_seq_documento_key unique (seq_documento)
);

create index if not exists stj_decisoes_dj_numero_registro_idx
  on public.stj_decisoes_dj (numero_registro);

create table if not exists public.stj_precedentes_temas (
  sequencial_precedente bigint not null,
  tipo_precedente text,
  numero_precedente text,
  ministro_relator text,
  leading_case text,
  origem_uf text,
  tribunal_origem text,
  tipo_justica_origem text,
  quantidade_processos_suspenso_na_origem integer,
  data_julgamento date,
  data_afetacao date,
  situacao_processo_stf text,
  constraint stj_precedentes_temas_sequencial_key unique (sequencial_precedente)
);

create table if not exists public.stj_precedentes_processos (
  numero_registro text not null,
  sequencial_precedente bigint not null,
  processo text,
  constraint stj_precedentes_processos_registro_seq_key unique (numero_registro, sequencial_precedente)
);

create index if not exists stj_precedentes_processos_seq_idx
  on public.stj_precedentes_processos (sequencial_precedente);

create table if not exists public.stj_distribuicao (
  numero_registro text not null,
  data_distribuicao timestamptz,
  ministro_distribuido text,
  orgao_julgador text,
  classe_processual text,
  constraint stj_distribuicao_numero_registro_key unique (numero_registro)
);

-- Bucket Storage (idempotente se já existir)
insert into storage.buckets (id, name, public) values ('backups', 'backups', false)
on conflict (id) do nothing;
