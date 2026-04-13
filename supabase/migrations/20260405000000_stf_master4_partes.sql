-- Migration: stf_master4 + stf_partes_completo + stf_master_premium
-- Data: 2026-04-05
-- Fonte: Corte Aberta STF (2.927.525 decisões 2000-2026) + Qlik Engine API + Portal STF
--
-- stf_master: 20 colunas essenciais, 100% com incidente (resolvido via Qlik)
-- stf_partes_completo: 1.153.635 processos (portal 9col + Corte Aberta)
-- stf_master_premium: observação do andamento (campo pesado, consulta pontual)

-- GUARD: NUNCA dropar tabelas com dados. Migration já aplicada em 05/abr/2026.
-- Se reaplicada, as 3 linhas abaixo estão comentadas para proteger os dados.
-- DROP TABLE IF EXISTS public.stf_master_premium CASCADE;
-- DROP TABLE IF EXISTS public.stf_partes_completo CASCADE;
-- DROP TABLE IF EXISTS public.stf_master CASCADE;

CREATE TABLE public.stf_master (
    id_fato_decisao bigint PRIMARY KEY,
    incidente bigint NOT NULL,
    processo text NOT NULL,
    classe text NOT NULL,
    numero text NOT NULL,
    relator text NOT NULL DEFAULT '',
    ano_decisao smallint NOT NULL,
    data_decisao date,
    tipo_decisao text NOT NULL DEFAULT '',
    andamento text NOT NULL DEFAULT '',
    origem_decisao text NOT NULL DEFAULT '',
    orgao_julgador text NOT NULL DEFAULT '',
    meio_processo text NOT NULL DEFAULT '',
    ramo_direito text NOT NULL DEFAULT '',
    assuntos text NOT NULL DEFAULT '',
    uf_origem text NOT NULL DEFAULT '',
    orgao_origem text NOT NULL DEFAULT '',
    data_autuacao date,
    data_baixa date,
    indicador_tramitacao text NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.stf_master IS 'Decisões STF 2000-2026 — Corte Aberta completa. 2.927.525 decisões, 20 colunas, 100% com incidente. Fonte: Corte Aberta + Qlik Engine API. (Medina, 2026)';

CREATE INDEX idx_stf_master_incidente ON public.stf_master(incidente);
CREATE INDEX idx_stf_master_classe ON public.stf_master(classe);
CREATE INDEX idx_stf_master_relator ON public.stf_master(relator);
CREATE INDEX idx_stf_master_ano ON public.stf_master(ano_decisao);
CREATE INDEX idx_stf_master_origem ON public.stf_master(origem_decisao);

CREATE TABLE public.stf_partes_completo (
    incidente bigint PRIMARY KEY,
    polo_ativo text NOT NULL DEFAULT '',
    adv_ativo text NOT NULL DEFAULT '',
    interessados_ativo text NOT NULL DEFAULT '',
    polo_passivo text NOT NULL DEFAULT '',
    adv_passivo text NOT NULL DEFAULT '',
    interessados_passivo text NOT NULL DEFAULT '',
    min_relator text NOT NULL DEFAULT '',
    nao_classificado text NOT NULL DEFAULT '',
    fonte text NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.stf_partes_completo IS 'Partes por incidente STF — 1.153.635 processos. Portal 9col (241K) + Corte Aberta (912K). JOIN com stf_master via incidente. (Medina, 2026)';

CREATE INDEX idx_stf_partes_fonte ON public.stf_partes_completo(fonte);

CREATE TABLE public.stf_master_premium (
    id_fato_decisao bigint PRIMARY KEY REFERENCES public.stf_master(id_fato_decisao),
    observacao_andamento text NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.stf_master_premium IS 'Observação do andamento — campo texto pesado para consultas pontuais. JOIN com stf_master via id_fato_decisao. (Medina, 2026)';
