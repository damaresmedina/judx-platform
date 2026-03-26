-- Migration: judx_inference_audit + judx_relator_decision_outcome
-- Fixes: missing tables for events layer inference pipeline

-- ────────────────────────────────────────────────────────────
-- 1. judx_inference_audit — append-only audit trail for inferences
-- ────────────────────────────────────────────────────────────

create table if not exists judx_inference_audit (
  id uuid primary key default gen_random_uuid(),
  hypothesis text not null,
  empirical_base text,
  textual_evidence text,
  counter_evidence text,
  limitation text,
  plausible_alternative text,
  rule_applied text,
  pipeline_layer text not null,
  confidence_score numeric(5,4) not null default 0,
  source_table text not null,
  source_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_judx_inference_audit_source
  on judx_inference_audit(source_table, source_id);
create index if not exists idx_judx_inference_audit_layer
  on judx_inference_audit(pipeline_layer);
create index if not exists idx_judx_inference_audit_created
  on judx_inference_audit(created_at);

comment on table judx_inference_audit is
'Registro imutavel de toda inferencia produzida pelo pipeline. Principio anti-autorreferencia: toda inferencia deve expor hipotese, base empirica e alternativa plausivel.';

-- RLS: service_role full access
alter table judx_inference_audit enable row level security;
create policy "service_role_judx_inference_audit"
  on judx_inference_audit for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 2. judx_relator_decision_outcome — rapporteur outcome tracking
-- ────────────────────────────────────────────────────────────

create table if not exists judx_relator_decision_outcome (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references judx_case(id) on delete cascade,
  decision_id uuid references judx_decision(id) on delete set null,
  relator_judge_id uuid not null references judx_judge(id) on delete cascade,
  substitute_judge_id uuid references judx_judge(id) on delete set null,
  outcome text not null,
  environment text,
  inferred_from_text boolean not null default false,
  confidence numeric(5,4),
  source_fragment text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_judx_rapporteur_outcome_case
  on judx_relator_decision_outcome(case_id);
create index if not exists idx_judx_rapporteur_outcome_relator
  on judx_relator_decision_outcome(relator_judge_id);
create index if not exists idx_judx_rapporteur_outcome_result
  on judx_relator_decision_outcome(outcome);

comment on table judx_relator_decision_outcome is
'Rastreia se o relator prevaleceu ou foi vencido em cada decisao. Cada registro e inferencia derivada de texto, sujeita a auditoria.';

-- RLS: service_role full access
alter table judx_relator_decision_outcome enable row level security;
create policy "service_role_judx_relator_decision_outcome"
  on judx_relator_decision_outcome for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
