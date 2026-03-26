-- =========================================================
-- JUDX :: STRUCTURAL BACKBONE v2
-- Eicon = matriz genética
-- Judx  = expansão adaptativa
-- Conceito central: litigiosidade como tecnologia de governança
-- Núcleo: DNA decisório + linha decisória + perfil situado
-- Eixo ontológico central: virtual vs presencial
-- Banco alvo: PostgreSQL / Supabase
-- =========================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- =========================================================
-- ENUMS
-- =========================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'judx_court_branch_enum') then
    create type judx_court_branch_enum as enum (
      'constitucional',
      'infraconstitucional',
      'federal',
      'estadual',
      'trabalhista',
      'eleitoral',
      'militar',
      'administrativo',
      'outro'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_court_level_enum') then
    create type judx_court_level_enum as enum (
      'supremo',
      'superior',
      'segundo_grau',
      'primeiro_grau',
      'administrativo',
      'outro'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_dominant_function_enum') then
    create type judx_dominant_function_enum as enum (
      'uniformizacao',
      'filtragem',
      'revisao',
      'controle',
      'precedentes',
      'gestao_de_massa',
      'arbitragem_institucional',
      'gestao_do_tempo',
      'alocacao_de_risco',
      'outra'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_state_centrality_enum') then
    create type judx_state_centrality_enum as enum (
      'baixa',
      'media',
      'alta'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_litigation_profile_enum') then
    create type judx_litigation_profile_enum as enum (
      'massa',
      'estrutural',
      'regulatoria',
      'fiscal',
      'previdenciaria',
      'sancionatoria',
      'concorrencial',
      'penal',
      'tributaria',
      'administrativa',
      'mista',
      'outra'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_case_phase_enum') then
    create type judx_case_phase_enum as enum (
      'conhecimento',
      'execucao',
      'cumprimento',
      'recursal',
      'originaria',
      'incidente',
      'cautelar',
      'admissibilidade',
      'afetacao',
      'julgamento',
      'pos_julgamento',
      'outra'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_decision_kind_enum') then
    create type judx_decision_kind_enum as enum (
      'monocratica',
      'colegiada',
      'despacho',
      'decisao_interlocutoria',
      'sentenca',
      'acordao',
      'voto',
      'outra'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_decision_result_enum') then
    create type judx_decision_result_enum as enum (
      'procedente',
      'improcedente',
      'parcialmente_procedente',
      'nao_conhecido',
      'prejudicado',
      'extinto_sem_resolucao',
      'deferido',
      'indeferido',
      'sobrestado',
      'convertido_em_diligencia',
      'outro'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_decision_technique_enum') then
    create type judx_decision_technique_enum as enum (
      'modulacao',
      'deferencia',
      'distincao',
      'superacao',
      'contencao',
      'expansao',
      'neutralizacao',
      'gestao_de_massa',
      'fundamentacao_formular',
      'remissao_a_precedentes',
      'selecao_processual',
      'fuga_do_merito',
      'graduacao_temporal',
      'administracao_do_conflito',
      'outra'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_temporal_effect_enum') then
    create type judx_temporal_effect_enum as enum (
      'retroativo',
      'prospectivo',
      'modulado',
      'imediato',
      'diferido',
      'suspensivo',
      'sem_efeito_temporal_relevante',
      'outro'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_line_state_enum') then
    create type judx_line_state_enum as enum (
      'em_formacao',
      'estabilizada',
      'em_mutacao',
      'rompida'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_line_position_enum') then
    create type judx_line_position_enum as enum (
      'inicio',
      'consolidacao',
      'mutacao',
      'ruptura',
      'reafirmacao',
      'desvio',
      'transicao_ambiental'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_judge_role_enum') then
    create type judx_judge_role_enum as enum (
      'relator',
      'revisor',
      'vogal',
      'presidente',
      'substituto',
      'convocado',
      'outro'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_vote_type_enum') then
    create type judx_vote_type_enum as enum (
      'condutor',
      'adesao',
      'divergente',
      'vencido',
      'convergente_com_ressalva',
      'nao_aplicavel',
      'outro'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_session_environment_enum') then
    create type judx_session_environment_enum as enum (
      'virtual',
      'presencial',
      'hibrido',
      'nao_informado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_judgment_path_enum') then
    create type judx_judgment_path_enum as enum (
      'virtual_puro',
      'presencial_originario',
      'virtual_para_presencial',
      'presencial_para_virtual',
      'hibrido',
      'nao_identificado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_environment_event_type_enum') then
    create type judx_environment_event_type_enum as enum (
      'ingresso_virtual',
      'ingresso_presencial',
      'destaque',
      'retirada_de_pauta',
      'reinclusao_virtual',
      'reinclusao_presencial',
      'pedido_de_vista',
      'adiamento',
      'julgamento_final',
      'sessao_convertida',
      'oralidade_ativada',
      'outro'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_environment_reason_category_enum') then
    create type judx_environment_reason_category_enum as enum (
      'dissenso',
      'complexidade',
      'relevancia_institucional',
      'alta_visibilidade',
      'risco_fiscal',
      'litigancia_estatal',
      'oralidade',
      'estrategia_colegiada',
      'gestao_do_acervo',
      'nao_explicita',
      'nao_identificada',
      'outra'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_majority_stability_enum') then
    create type judx_majority_stability_enum as enum (
      'estavel',
      'fluida',
      'fragmentada',
      'nao_informada'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_density_enum') then
    create type judx_density_enum as enum (
      'baixa',
      'media',
      'alta',
      'nao_informada'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_pattern_intensity_enum') then
    create type judx_pattern_intensity_enum as enum (
      'baixa',
      'media',
      'alta'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_pattern_stability_enum') then
    create type judx_pattern_stability_enum as enum (
      'instavel',
      'intermediaria',
      'estavel'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'judx_inference_status_enum') then
    create type judx_inference_status_enum as enum (
      'rascunho',
      'inferido',
      'validado',
      'rejeitado'
    );
  end if;
end $$;

-- =========================================================
-- BASE INSTITUCIONAL
-- =========================================================

create table if not exists judx_court (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  acronym text not null unique,
  branch judx_court_branch_enum not null,
  level judx_court_level_enum not null,
  competence text,
  description text,
  constitutional_anchor text,
  system_position text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists judx_ecology (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references judx_court(id) on delete cascade,
  dominant_function judx_dominant_function_enum not null,
  case_volume bigint,
  state_centrality judx_state_centrality_enum not null default 'media',
  litigation_profile judx_litigation_profile_enum not null default 'mista',
  virtualization_share numeric(8,5),
  presential_share numeric(8,5),
  orality_relevance numeric(8,5),
  symbolic_visibility numeric(8,5),
  analytical_note text,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint judx_ecology_period_chk check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table if not exists judx_organ (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references judx_court(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  organ_type text,
  parent_organ_id uuid references judx_organ(id) on delete set null,
  competence text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (court_id, normalized_name)
);

create table if not exists judx_procedural_class (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references judx_court(id) on delete cascade,
  raw_name text not null,
  normalized_name text not null,
  hierarchy_level integer not null default 1,
  parent_class_id uuid references judx_procedural_class(id) on delete set null,
  description text,
  likely_environment jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (court_id, normalized_name)
);

create table if not exists judx_subject (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  normalized_name text not null unique,
  parent_subject_id uuid references judx_subject(id) on delete set null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists judx_litigant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  litigant_type text,
  state_entity boolean not null default false,
  state_entity_kind text,
  market_relevance numeric(8,5),
  institutional_relevance numeric(8,5),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- CASO / PROCESSO
-- =========================================================

create table if not exists judx_case (
  id uuid primary key default gen_random_uuid(),
  external_number text not null unique,
  court_id uuid not null references judx_court(id) on delete restrict,
  organ_id uuid references judx_organ(id) on delete set null,
  procedural_class_id uuid references judx_procedural_class(id) on delete set null,
  main_subject_id uuid references judx_subject(id) on delete set null,
  phase judx_case_phase_enum not null default 'outra',
  filed_at date,
  distributed_at date,
  decided_at date,
  state_involved boolean not null default false,
  state_litigation_profile judx_litigation_profile_enum,
  fiscal_risk_signal numeric(12,4),
  political_sensitivity_signal numeric(12,4),
  institutional_visibility_signal numeric(12,4),
  controversy_complexity_signal numeric(12,4),
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  unknown_factors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists judx_case_litigant (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references judx_case(id) on delete cascade,
  litigant_id uuid not null references judx_litigant(id) on delete restrict,
  procedural_position text not null,
  is_state_side boolean not null default false,
  asymmetry_signal numeric(8,5),
  created_at timestamptz not null default now(),
  unique (case_id, litigant_id, procedural_position)
);

-- =========================================================
-- REGIME DE JULGAMENTO / TRAJETORIA AMBIENTAL
-- =========================================================

create table if not exists judx_judgment_regime (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references judx_case(id) on delete cascade,
  initial_environment judx_session_environment_enum not null default 'nao_informado',
  current_environment judx_session_environment_enum not null default 'nao_informado',
  final_environment judx_session_environment_enum,
  judgment_path judx_judgment_path_enum not null default 'nao_identificado',
  entered_virtual_at timestamptz,
  exited_virtual_at timestamptz,
  entered_presential_at timestamptz,
  exited_presential_at timestamptz,
  was_highlighted boolean not null default false,
  highlight_count integer not null default 0,
  first_highlight_at timestamptz,
  last_highlight_at timestamptz,
  orality_activated boolean not null default false,
  presential_conversion_signal numeric(8,5),
  virtual_retention_signal numeric(8,5),
  unexplained_environment_shift boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists judx_judgment_environment_event (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references judx_case(id) on delete cascade,
  decision_id uuid,
  from_environment judx_session_environment_enum,
  to_environment judx_session_environment_enum not null,
  event_type judx_environment_event_type_enum not null,
  event_at timestamptz,
  actor_type text,
  actor_judge_id uuid,
  reason_text text,
  reason_category judx_environment_reason_category_enum not null default 'nao_identificada',
  explicit_reason boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- JULGADOR / PERFIL SITUADO
-- =========================================================

create table if not exists judx_judge (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  court_id uuid not null references judx_court(id) on delete cascade,
  primary_organ_id uuid references judx_organ(id) on delete set null,
  active_from date,
  active_to date,
  biography_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (court_id, normalized_name)
);

alter table judx_judgment_environment_event
  add constraint fk_judx_env_event_actor_judge
  foreign key (actor_judge_id) references judx_judge(id) on delete set null;

-- =========================================================
-- DECISAO
-- =========================================================

create table if not exists judx_decision (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references judx_case(id) on delete cascade,
  decision_date date,
  kind judx_decision_kind_enum not null,
  result judx_decision_result_enum not null,
  technique judx_decision_technique_enum,
  normative_ground text,
  temporal_effect judx_temporal_effect_enum,
  practical_effect text,
  session_environment judx_session_environment_enum not null default 'nao_informado',
  scheduled_environment judx_session_environment_enum,
  effective_environment judx_session_environment_enum,
  is_highlighted_decision boolean not null default false,
  highlight_requested_by_judge_id uuid references judx_judge(id) on delete set null,
  highlight_reason_text text,
  converted_from_virtual boolean not null default false,
  converted_from_presential boolean not null default false,
  oral_argument_present boolean,
  oral_argument_expected boolean,
  argumentative_density judx_density_enum not null default 'nao_informada',
  collegial_fragmentation judx_density_enum not null default 'nao_informada',
  symbolic_visibility judx_density_enum not null default 'nao_informada',
  vote_count integer,
  dissent_count integer,
  unanimity_signal boolean,
  full_text text,
  excerpt text,
  metadata jsonb not null default '{}'::jsonb,
  latent_features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- CONTEXTO COLEGIADO
-- =========================================================

create table if not exists judx_collegial_context (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references judx_case(id) on delete cascade,
  decision_id uuid references judx_decision(id) on delete cascade,
  organ_id uuid references judx_organ(id) on delete set null,
  composition jsonb not null default '[]'::jsonb,
  session_environment judx_session_environment_enum not null default 'nao_informado',
  scheduled_environment judx_session_environment_enum,
  effective_environment judx_session_environment_enum,
  majority_stability judx_majority_stability_enum not null default 'nao_informada',
  composition_changed boolean not null default false,
  was_withdrawn_from_virtual boolean not null default false,
  was_reincluded boolean not null default false,
  oral_argument_expected boolean,
  oral_argument_held boolean,
  institutional_context text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- POSICAO DO JULGADOR NO CASO
-- =========================================================

create table if not exists judx_judge_position_in_case (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references judx_case(id) on delete cascade,
  decision_id uuid references judx_decision(id) on delete cascade,
  judge_id uuid not null references judx_judge(id) on delete cascade,
  role judx_judge_role_enum not null,
  vote_type judx_vote_type_enum not null default 'nao_aplicavel',
  authored_vote boolean not null default false,
  leading_vote boolean not null default false,
  majority_side boolean,
  opinion_length_words integer,
  rhetorical_density judx_density_enum not null default 'nao_informada',
  created_at timestamptz not null default now(),
  unique (case_id, coalesce(decision_id, '00000000-0000-0000-0000-000000000000'::uuid), judge_id, role)
);

-- =========================================================
-- PERFIL SITUADO / PERFIL AMBIENTAL
-- =========================================================

create table if not exists judx_situated_profile (
  id uuid primary key default gen_random_uuid(),
  judge_id uuid not null references judx_judge(id) on delete cascade,
  material_cut text,
  organ_cut text,
  temporal_cut daterange,
  environment_cut judx_session_environment_enum,
  observed_pattern jsonb not null default '{}'::jsonb,
  intensity judx_pattern_intensity_enum not null default 'media',
  auto_description text,
  status judx_inference_status_enum not null default 'rascunho',
  evidence_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists judx_environmental_profile (
  id uuid primary key default gen_random_uuid(),
  court_id uuid references judx_court(id) on delete cascade,
  organ_id uuid references judx_organ(id) on delete cascade,
  procedural_class_id uuid references judx_procedural_class(id) on delete cascade,
  subject_id uuid references judx_subject(id) on delete cascade,
  state_profile judx_litigation_profile_enum,
  environment judx_session_environment_enum not null,
  retention_pattern jsonb not null default '{}'::jsonb,
  migration_pattern jsonb not null default '{}'::jsonb,
  auto_description text,
  intensity judx_pattern_intensity_enum not null default 'media',
  status judx_inference_status_enum not null default 'rascunho',
  evidence_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- LINHA DECISORIA
-- =========================================================

create table if not exists judx_decision_line (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references judx_court(id) on delete cascade,
  theme text not null,
  normalized_theme text not null,
  description text,
  line_environmental_signature jsonb not null default '{}'::jsonb,
  state judx_line_state_enum not null default 'em_formacao',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (court_id, normalized_theme)
);

create table if not exists judx_decision_line_case (
  id uuid primary key default gen_random_uuid(),
  decision_line_id uuid not null references judx_decision_line(id) on delete cascade,
  case_id uuid not null references judx_case(id) on delete cascade,
  decision_id uuid references judx_decision(id) on delete cascade,
  line_position judx_line_position_enum not null,
  environmental_transition_relevance boolean not null default false,
  analytical_note text,
  created_at timestamptz not null default now(),
  unique (decision_line_id, case_id, coalesce(decision_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- =========================================================
-- DNA DECISORIO
-- =========================================================

create table if not exists judx_decisional_dna (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references judx_court(id) on delete cascade,
  decision_line_id uuid references judx_decision_line(id) on delete set null,
  theme text not null,
  structural_pattern jsonb not null default '{}'::jsonb,
  operational_pattern jsonb not null default '{}'::jsonb,
  behavioral_pattern jsonb not null default '{}'::jsonb,
  environmental_pattern jsonb not null default '{}'::jsonb,
  intensity judx_pattern_intensity_enum not null default 'media',
  stability judx_pattern_stability_enum not null default 'intermediaria',
  auto_description text,
  status judx_inference_status_enum not null default 'rascunho',
  evidence_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table judx_decisional_dna is
'DNA decisório = padrão estrutural + operacional + comportamental + ambiental recorrente em uma ecologia institucional.';

-- =========================================================
-- RESULTADO POR REGIME / COMPARACAO AMBIENTAL
-- =========================================================

create table if not exists judx_regime_outcome_profile (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references judx_case(id) on delete cascade,
  decision_id uuid references judx_decision(id) on delete cascade,
  environment judx_session_environment_enum not null,
  result judx_decision_result_enum,
  technique judx_decision_technique_enum,
  temporal_effect judx_temporal_effect_enum,
  argumentative_density judx_density_enum not null default 'nao_informada',
  collegial_fragmentation judx_density_enum not null default 'nao_informada',
  symbolic_visibility judx_density_enum not null default 'nao_informada',
  state_involved boolean,
  state_litigation_profile judx_litigation_profile_enum,
  created_at timestamptz not null default now()
);

create table if not exists judx_environment_inference (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references judx_case(id) on delete cascade,
  event_id uuid references judx_judgment_environment_event(id) on delete cascade,
  inferred_driver text not null,
  confidence numeric(5,4),
  evidence jsonb not null default '[]'::jsonb,
  auto_description text,
  status judx_inference_status_enum not null default 'rascunho',
  created_at timestamptz not null default now()
);

-- =========================================================
-- TAXONOMIA EMERGENTE
-- =========================================================

create table if not exists judx_emergent_taxonomy (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  normalized_category text not null,
  court_id uuid references judx_court(id) on delete cascade,
  organ_id uuid references judx_organ(id) on delete cascade,
  environment judx_session_environment_enum,
  inference_criteria jsonb not null default '{}'::jsonb,
  recurrence integer not null default 0,
  evidence jsonb not null default '[]'::jsonb,
  description text,
  status judx_inference_status_enum not null default 'rascunho',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (court_id, organ_id, environment, normalized_category)
);

-- =========================================================
-- CAMADA DO AINDA NAO NOMEADO
-- =========================================================

create table if not exists judx_latent_signal (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references judx_case(id) on delete cascade,
  decision_id uuid references judx_decision(id) on delete cascade,
  judge_id uuid references judx_judge(id) on delete cascade,
  signal_domain text not null, -- ex: ambiente, risco, linguagem, ritmo, friccao
  signal_name text not null,
  signal_value numeric(18,6),
  signal_payload jsonb not null default '{}'::jsonb,
  extracted_from text, -- full_text, metadata, event, inference etc.
  created_at timestamptz not null default now()
);

create table if not exists judx_unknown_pattern_registry (
  id uuid primary key default gen_random_uuid(),
  court_id uuid references judx_court(id) on delete cascade,
  pattern_label text not null,
  description text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  recurrence integer not null default 0,
  linked_cases jsonb not null default '[]'::jsonb,
  linked_events jsonb not null default '[]'::jsonb,
  hypothesis jsonb not null default '{}'::jsonb,
  status judx_inference_status_enum not null default 'rascunho',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table judx_unknown_pattern_registry is
'Registro do que ainda nao tem nome ou categoria estabilizada, mas reaparece e exige futura taxonomia.';

-- =========================================================
-- COMPARACAO INTERTRIBUNAIS
-- =========================================================

create table if not exists judx_intercourt_relation (
  id uuid primary key default gen_random_uuid(),
  source_court_id uuid not null references judx_court(id) on delete cascade,
  target_court_id uuid not null references judx_court(id) on delete cascade,
  relation_type text not null, -- influencia, absorcao, adaptacao, resistencia, replicacao
  theme text,
  description text,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists judx_intercourt_pattern (
  id uuid primary key default gen_random_uuid(),
  source_court_id uuid not null references judx_court(id) on delete cascade,
  target_court_id uuid not null references judx_court(id) on delete cascade,
  category text not null,
  environment_sensitive boolean not null default false,
  pattern jsonb not null default '{}'::jsonb,
  auto_description text,
  status judx_inference_status_enum not null default 'rascunho',
  created_at timestamptz not null default now()
);

-- =========================================================
-- ESCRITA / LIVRO / WORD
-- =========================================================

create table if not exists judx_prompt_template (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  prompt_body text not null,
  target_scope text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into judx_prompt_template (code, title, prompt_body, target_scope)
values
  (
    'dna_descricao_tribunal',
    'Descrição do DNA decisório do tribunal',
    'Descreva o DNA decisório do tribunal com base nos padrões estruturais, operacionais, comportamentais e ambientais identificados.',
    'tribunal'
  ),
  (
    'linha_decisoria_tema',
    'Descrição da linha decisória',
    'Explique a evolução da linha decisória do tema, indicando formação, estabilização, mutações, rupturas e variações ambientais entre virtual e presencial.',
    'tema'
  ),
  (
    'perfil_situado_julgador',
    'Descrição do perfil situado do julgador',
    'Descreva o perfil situado do julgador, considerando variações conforme papel, órgão, composição, matéria e ambiente de julgamento.',
    'julgador'
  ),
  (
    'ecologia_institucional',
    'Descrição da ecologia institucional',
    'Analise como o ambiente institucional do tribunal molda os padrões decisórios observados.',
    'tribunal'
  ),
  (
    'trajetoria_ambiental',
    'Descrição da trajetória ambiental do caso',
    'Descreva a trajetória do caso entre regimes de julgamento, incluindo virtualização, destaque, reingresso, oralidade e eventual corporificação presencial.',
    'caso'
  ),
  (
    'capitulo_livro',
    'Conversão analítica para capítulo',
    'Converta os dados estruturados em texto contínuo, analítico e autoral, apto para publicação em livro.',
    'capitulo'
  )
on conflict (code) do nothing;

-- =========================================================
-- INGESTAO / NORMALIZACAO
-- =========================================================

create table if not exists judx_ingest_source (
  id uuid primary key default gen_random_uuid(),
  source_name text not null unique,
  source_type text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists judx_raw_document (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references judx_ingest_source(id) on delete set null,
  external_id text,
  court_hint text,
  raw_payload jsonb not null default '{}'::jsonb,
  raw_text text,
  checksum text,
  ingested_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (source_id, external_id)
);

create table if not exists judx_normalization_log (
  id uuid primary key default gen_random_uuid(),
  raw_document_id uuid references judx_raw_document(id) on delete cascade,
  entity_type text not null,
  raw_value text not null,
  normalized_value text not null,
  confidence numeric(5,4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- REGRAS / INFERENCE LOG
-- =========================================================

create table if not exists judx_inference_rule (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into judx_inference_rule (code, name, description)
values
  ('PADRAO_RECORRENTE', 'Padrão recorrente', 'Mesma técnica + mesmo resultado + mesmo contexto repetidos em múltiplos casos.'),
  ('DNA_CONSOLIDADO', 'DNA consolidado', 'Padrão persistente no tempo e distribuído por múltiplos casos de uma mesma ecologia.'),
  ('VARIACAO_SITUADA', 'Variação situada', 'Mudança de relatoria, órgão ou composição associada à alteração de técnica, resultado ou linguagem.'),
  ('INFLEXAO_LINHA', 'Inflexão da linha decisória', 'Alteração abrupta em padrão anteriormente consolidado.'),
  ('SENSIBILIDADE_JULGADOR', 'Sensibilidade do julgador', 'Mudança de comportamento do julgador conforme papel, ambiente ou matéria.'),
  ('SELECAO_PRESENCIAL', 'Seleção para julgamento presencial', 'Identifica padrões associados à permanência ou migração para o ambiente presencial.'),
  ('DESTAQUE_SITUADO', 'Destaque situado', 'Identifica correlações entre pedido de destaque, perfil do julgador, tipo de caso, órgão e sensibilidade institucional.'),
  ('MUDANCA_AMBIENTE_RESULTADO', 'Mudança de ambiente e resultado', 'Verifica se a migração entre virtual e presencial se associa a alterações de resultado, técnica ou fragmentação.'),
  ('VIRTUALIZACAO_MASSA', 'Virtualização de massa', 'Detecta retenção de certas classes ou litígios no ambiente virtual como forma de administração institucional.'),
  ('ORALIDADE_CORPORIFICACAO', 'Oralidade e corporificação', 'Identifica situações em que a oralidade ou presença institucional altera o regime da decisão.'),
  ('PADRAO_AINDA_NAO_NOMEADO', 'Padrão ainda não nomeado', 'Registra recorrências detectadas sem categoria estabilizada.'),
  ('INFLUENCIA_INTERTRIBUNAIS', 'Influência intertribunais', 'Detecta circulação de técnicas, linguagens e padrões entre tribunais.')
on conflict (code) do nothing;

create table if not exists judx_inference_log (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references judx_inference_rule(id) on delete set null,
  target_table text not null,
  target_id uuid not null,
  evidence jsonb not null default '[]'::jsonb,
  inference_summary text,
  confidence numeric(5,4),
  status judx_inference_status_enum not null default 'rascunho',
  created_at timestamptz not null default now()
);

-- =========================================================
-- INDEXES
-- =========================================================

create index if not exists idx_judx_case_court on judx_case(court_id);
create index if not exists idx_judx_case_class on judx_case(procedural_class_id);
create index if not exists idx_judx_case_subject on judx_case(main_subject_id);
create index if not exists idx_judx_case_decided_at on judx_case(decided_at);
create index if not exists idx_judx_case_state_profile on judx_case(state_litigation_profile);

create index if not exists idx_judx_regime_case on judx_judgment_regime(case_id);
create index if not exists idx_judx_regime_path on judx_judgment_regime(judgment_path);
create index if not exists idx_judx_regime_final_env on judx_judgment_regime(final_environment);

create index if not exists idx_judx_env_event_case on judx_judgment_environment_event(case_id);
create index if not exists idx_judx_env_event_type on judx_judgment_environment_event(event_type);
create index if not exists idx_judx_env_event_reason on judx_judgment_environment_event(reason_category);
create index if not exists idx_judx_env_event_actor on judx_judgment_environment_event(actor_judge_id);

create index if not exists idx_judx_decision_case on judx_decision(case_id);
create index if not exists idx_judx_decision_env on judx_decision(session_environment);
create index if not exists idx_judx_decision_result on judx_decision(result);
create index if not exists idx_judx_decision_technique on judx_decision(technique);

create index if not exists idx_judx_judge_court on judx_judge(court_id);
create index if not exists idx_judx_judge_case on judx_judge_position_in_case(case_id);
create index if not exists idx_judx_situated_profile_judge on judx_situated_profile(judge_id);

create index if not exists idx_judx_line_court on judx_decision_line(court_id);
create index if not exists idx_judx_dna_court on judx_decisional_dna(court_id);
create index if not exists idx_judx_taxonomy_court on judx_emergent_taxonomy(court_id);

create index if not exists idx_judx_case_metadata_gin on judx_case using gin (metadata);
create index if not exists idx_judx_case_unknown_factors_gin on judx_case using gin (unknown_factors);
create index if not exists idx_judx_decision_metadata_gin on judx_decision using gin (metadata);
create index if not exists idx_judx_decision_latent_features_gin on judx_decision using gin (latent_features);
create index if not exists idx_judx_dna_structural_gin on judx_decisional_dna using gin (structural_pattern);
create index if not exists idx_judx_dna_operational_gin on judx_decisional_dna using gin (operational_pattern);
create index if not exists idx_judx_dna_behavioral_gin on judx_decisional_dna using gin (behavioral_pattern);
create index if not exists idx_judx_dna_environmental_gin on judx_decisional_dna using gin (environmental_pattern);
create index if not exists idx_judx_profile_observed_gin on judx_situated_profile using gin (observed_pattern);

-- =========================================================
-- UPDATED_AT TRIGGER
-- =========================================================

create or replace function judx_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'judx_court',
    'judx_ecology',
    'judx_organ',
    'judx_procedural_class',
    'judx_case',
    'judx_judgment_regime',
    'judx_judge',
    'judx_decision',
    'judx_situated_profile',
    'judx_environmental_profile',
    'judx_decision_line',
    'judx_decisional_dna',
    'judx_emergent_taxonomy',
    'judx_unknown_pattern_registry',
    'judx_prompt_template'
  ]
  loop
    execute format('drop trigger if exists trg_%s_updated_at on %I;', t, t);
    execute format('create trigger trg_%s_updated_at before update on %I for each row execute function judx_set_updated_at();', t, t);
  end loop;
end $$;

-- =========================================================
-- VIEWS
-- =========================================================

create or replace view judx_case_overview as
select
  c.id as case_id,
  c.external_number,
  co.name as court_name,
  co.acronym as court_acronym,
  o.name as organ_name,
  pc.normalized_name as procedural_class,
  s.normalized_name as main_subject,
  c.phase,
  c.state_involved,
  c.state_litigation_profile,
  jr.initial_environment,
  jr.final_environment,
  jr.judgment_path,
  jr.was_highlighted,
  c.filed_at,
  c.decided_at
from judx_case c
join judx_court co on co.id = c.court_id
left join judx_organ o on o.id = c.organ_id
left join judx_procedural_class pc on pc.id = c.procedural_class_id
left join judx_subject s on s.id = c.main_subject_id
left join judx_judgment_regime jr on jr.case_id = c.id;

create or replace view judx_environment_transition_overview as
select
  e.id as event_id,
  c.external_number,
  co.acronym as court_acronym,
  e.from_environment,
  e.to_environment,
  e.event_type,
  e.reason_category,
  j.name as actor_judge_name,
  e.event_at
from judx_judgment_environment_event e
join judx_case c on c.id = e.case_id
join judx_court co on co.id = c.court_id
left join judx_judge j on j.id = e.actor_judge_id;

create or replace view judx_judge_behavior_snapshot as
select
  j.id as judge_id,
  j.name as judge_name,
  c.external_number,
  jp.role,
  jp.vote_type,
  jp.leading_vote,
  jp.majority_side,
  d.result,
  d.technique,
  d.session_environment,
  d.argumentative_density,
  cc.majority_stability
from judx_judge_position_in_case jp
join judx_judge j on j.id = jp.judge_id
join judx_case c on c.id = jp.case_id
left join judx_decision d on d.id = jp.decision_id
left join judx_collegial_context cc on cc.case_id = jp.case_id and (cc.decision_id = jp.decision_id or cc.decision_id is null);

-- =========================================================
-- STARTER FUNCTIONS
-- =========================================================

create or replace function judx_detect_recurrent_patterns(
  p_court_id uuid,
  p_min_cases integer default 3
)
returns table (
  technique judx_decision_technique_enum,
  result judx_decision_result_enum,
  environment judx_session_environment_enum,
  state_profile judx_litigation_profile_enum,
  case_count bigint
)
language sql
as $$
  select
    d.technique,
    d.result,
    d.session_environment,
    c.state_litigation_profile,
    count(*) as case_count
  from judx_decision d
  join judx_case c on c.id = d.case_id
  where c.court_id = p_court_id
  group by d.technique, d.result, d.session_environment, c.state_litigation_profile
  having count(*) >= p_min_cases
  order by count(*) desc;
$$;

create or replace function judx_detect_judge_sensitivity(
  p_judge_id uuid
)
returns table (
  role judx_judge_role_enum,
  session_environment judx_session_environment_enum,
  technique judx_decision_technique_enum,
  result judx_decision_result_enum,
  n bigint
)
language sql
as $$
  select
    jp.role,
    d.session_environment,
    d.technique,
    d.result,
    count(*) as n
  from judx_judge_position_in_case jp
  join judx_decision d on d.id = jp.decision_id
  where jp.judge_id = p_judge_id
  group by jp.role, d.session_environment, d.technique, d.result
  order by n desc;
$$;

create or replace function judx_detect_presential_selection(
  p_court_id uuid
)
returns table (
  procedural_class text,
  subject_name text,
  highlighted_cases bigint,
  presential_cases bigint,
  total_cases bigint
)
language sql
as $$
  select
    pc.normalized_name as procedural_class,
    s.normalized_name as subject_name,
    count(*) filter (where jr.was_highlighted = true) as highlighted_cases,
    count(*) filter (where jr.final_environment = 'presencial') as presential_cases,
    count(*) as total_cases
  from judx_case c
  left join judx_procedural_class pc on pc.id = c.procedural_class_id
  left join judx_subject s on s.id = c.main_subject_id
  left join judx_judgment_regime jr on jr.case_id = c.id
  where c.court_id = p_court_id
  group by pc.normalized_name, s.normalized_name
  order by presential_cases desc, highlighted_cases desc;
$$;

create or replace function judx_detect_environment_shift_impact(
  p_court_id uuid
)
returns table (
  case_id uuid,
  external_number text,
  judgment_path judx_judgment_path_enum,
  result judx_decision_result_enum,
  technique judx_decision_technique_enum,
  argumentative_density judx_density_enum
)
language sql
as $$
  select
    c.id,
    c.external_number,
    jr.judgment_path,
    d.result,
    d.technique,
    d.argumentative_density
  from judx_case c
  join judx_judgment_regime jr on jr.case_id = c.id
  join judx_decision d on d.case_id = c.id
  where c.court_id = p_court_id
    and jr.judgment_path in ('virtual_para_presencial', 'presencial_para_virtual', 'hibrido')
  order by c.decided_at nulls last;
$$;

-- =========================================================
-- COMMENTS
-- =========================================================

comment on schema public is
'Judx = sistema de leitura do comportamento institucional do Judiciario, sensivel ao ambiente, a trajetoria de julgamento e aos padrões ainda nao explicitados pelo tribunal.';

comment on table judx_judgment_regime is
'O ambiente de julgamento e variavel ontologica central: o caso deve ser observavel por sua trajetoria entre regimes decisorios.';

comment on table judx_judgment_environment_event is
'Cada transicao entre virtual e presencial e evento juridicamente relevante para inferencia institucional.';

comment on table judx_environment_inference is
'Inferencias sobre motores ocultos de destaque, migracao e corporificacao presencial.';

comment on table judx_latent_signal is
'Sinais que ainda nao se tornaram categoria estabilizada, mas podem futuramente compor o DNA decisorio.';

-- =========================================================
-- SEED INICIAL
-- =========================================================

insert into judx_court (name, acronym, branch, level, competence, description, constitutional_anchor, system_position)
values
  ('Supremo Tribunal Federal', 'STF', 'constitucional', 'supremo', 'jurisdicao constitucional e competencias originarias/recursais', 'Matriz genética inicial do Eicon.', 'Constituicao Federal', 'centro do sistema'),
  ('Superior Tribunal de Justiça', 'STJ', 'infraconstitucional', 'superior', 'uniformizacao infraconstitucional federal', 'Primeira expansão adaptativa do Judx.', 'Constituicao Federal', 'sistema adaptativo superior')
on conflict (acronym) do nothing;
