-- =========================================================
-- JUDX :: SYSTEM PRINCIPLES / GOVERNANCE LAYER
-- =========================================================

create table if not exists judx_system_principle (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  normative_text text not null,
  rationale text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into judx_system_principle (code, title, normative_text, rationale)
values
  (
    'NO_DATA_WITHOUT_CONTEXT',
    'Nenhum dado entra sem contexto',
    'Nenhum dado entra no sistema sem contexto institucional, processual ou relacional mínimo que permita sua interpretação.',
    'O dado jurídico bruto não é suficiente; todo registro deve estar vinculado a uma ecologia decisória.'
  ),
  (
    'NO_ISOLATED_DECISION',
    'Nenhuma decisão é tratada como texto isolado',
    'Nenhuma decisão deve ser tratada como texto isolado; toda decisão deve poder ser relacionada a caso, ambiente, órgão, julgador ou linha decisória.',
    'A decisão é manifestação de um sistema vivo e não documento autossuficiente.'
  ),
  (
    'ENVIRONMENT_SHIFT_IS_RELEVANT',
    'Mudança de ambiente é hipótese relevante',
    'Toda mudança de ambiente entre virtual, presencial ou híbrido constitui hipótese relevante de alteração de comportamento, técnica, linguagem ou resultado.',
    'A trajetória ambiental do caso integra o núcleo observável do Judx.'
  ),
  (
    'ALLOW_PRETAXONOMIC_REGISTRATION',
    'O ainda não nomeado deve ser registrável',
    'Padrões, sinais ou recorrências ainda não estabilizados conceitualmente devem poder ser registrados antes de sua consolidação taxonômica.',
    'O sistema deve capturar fenômenos emergentes antes de sua domesticação classificatória.'
  )
on conflict (code) do nothing;

comment on table judx_system_principle is
'Metaprincípios normativos do Judx.';

comment on column judx_system_principle.normative_text is
'Texto normativo da regra estrutural do sistema.';

-- =========================================================
-- UPDATED_AT TRIGGER FOR PRINCIPLES
-- =========================================================

drop trigger if exists trg_judx_system_principle_updated_at on judx_system_principle;
create trigger trg_judx_system_principle_updated_at
before update on judx_system_principle
for each row execute function judx_set_updated_at();

-- =========================================================
-- COMMENTS ON CORE TABLES TO EMBED THE RULES
-- =========================================================

comment on table judx_case is
'Regra estrutural: nenhum dado entra sem contexto. Cada caso deve conter contexto institucional, processual ou relacional mínimo.';

comment on table judx_decision is
'Regra estrutural: nenhuma decisão é tratada como texto isolado. Toda decisão deve ser vinculável a caso, ambiente, órgão, julgador ou linha decisória.';

comment on table judx_judgment_regime is
'Regra estrutural: mudança de ambiente é hipótese relevante de alteração de comportamento e resultado.';

comment on table judx_unknown_pattern_registry is
'Regra estrutural: o que ainda não tem nome deve poder ser registrado antes de ser domesticado pela taxonomia.';

comment on table judx_latent_signal is
'Registro de sinais ainda não estabilizados conceitualmente, preservando o excedente do fenômeno sobre a taxonomia.';

-- =========================================================
-- MINIMUM ENFORCEMENT :: DATA CONTEXT VALIDATION
-- Rule 1: Nenhum dado entra sem contexto
-- =========================================================

create or replace function judx_validate_case_context()
returns trigger
language plpgsql
as $$
begin
  if new.court_id is null then
    raise exception 'JUDX_RULE_VIOLATION: nenhum dado entra sem contexto :: court_id é obrigatório.';
  end if;

  if new.procedural_class_id is null
     and new.main_subject_id is null
     and new.organ_id is null
     and coalesce(new.summary, '') = ''
     and coalesce(new.metadata, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'JUDX_RULE_VIOLATION: nenhum dado entra sem contexto :: forneça ao menos classe, assunto, órgão, resumo ou metadata.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_judx_validate_case_context on judx_case;
create trigger trg_judx_validate_case_context
before insert or update on judx_case
for each row execute function judx_validate_case_context();

-- =========================================================
-- MINIMUM ENFORCEMENT :: DECISION CANNOT BE ISOLATED
-- Rule 2: Nenhuma decisão é tratada como texto isolado
-- =========================================================

create or replace function judx_validate_decision_not_isolated()
returns trigger
language plpgsql
as $$
begin
  if new.case_id is null then
    raise exception 'JUDX_RULE_VIOLATION: nenhuma decisão é tratada como texto isolado :: case_id é obrigatório.';
  end if;

  if coalesce(new.full_text, '') = ''
     and coalesce(new.excerpt, '') = ''
     and coalesce(new.metadata, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'JUDX_RULE_VIOLATION: decisão sem texto, excerto ou metadata suficiente.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_judx_validate_decision_not_isolated on judx_decision;
create trigger trg_judx_validate_decision_not_isolated
before insert or update on judx_decision
for each row execute function judx_validate_decision_not_isolated();

-- =========================================================
-- MINIMUM ENFORCEMENT :: ENVIRONMENT SHIFT MUST BE REGISTERED
-- Rule 3: Mudança de ambiente é hipótese relevante
-- =========================================================

create or replace function judx_validate_environment_shift()
returns trigger
language plpgsql
as $$
begin
  if new.initial_environment is distinct from new.final_environment
     and new.final_environment is not null
     and new.judgment_path = 'nao_identificado' then
    raise exception 'JUDX_RULE_VIOLATION: mudança de ambiente detectada sem judgment_path identificado.';
  end if;

  if new.was_highlighted = true and new.highlight_count < 1 then
    raise exception 'JUDX_RULE_VIOLATION: was_highlighted=true exige highlight_count >= 1.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_judx_validate_environment_shift on judx_judgment_regime;
create trigger trg_judx_validate_environment_shift
before insert or update on judx_judgment_regime
for each row execute function judx_validate_environment_shift();

-- =========================================================
-- MINIMUM ENFORCEMENT :: PRE-TAXONOMIC REGISTRATION
-- Rule 4: O ainda não nomeado deve ser registrável
-- =========================================================

create or replace function judx_validate_unknown_pattern_registry()
returns trigger
language plpgsql
as $$
begin
  if coalesce(trim(new.pattern_label), '') = '' then
    raise exception 'JUDX_RULE_VIOLATION: padrões ainda não nomeados precisam ao menos de um pattern_label provisório.';
  end if;

  if coalesce(trim(new.description), '') = ''
     and coalesce(new.hypothesis, '{}'::jsonb) = '{}'::jsonb
     and coalesce(new.linked_cases, '[]'::jsonb) = '[]'::jsonb
     and coalesce(new.linked_events, '[]'::jsonb) = '[]'::jsonb then
    raise exception 'JUDX_RULE_VIOLATION: registro pré-taxonômico exige descrição, hipótese, casos vinculados ou eventos vinculados.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_judx_validate_unknown_pattern_registry on judx_unknown_pattern_registry;
create trigger trg_judx_validate_unknown_pattern_registry
before insert or update on judx_unknown_pattern_registry
for each row execute function judx_validate_unknown_pattern_registry();

-- =========================================================
-- OPTIONAL VIEW :: ACTIVE PRINCIPLES
-- =========================================================

create or replace view judx_active_system_principles as
select
  code,
  title,
  normative_text,
  rationale,
  is_active,
  created_at,
  updated_at
from judx_system_principle
where is_active = true
order by code;

-- =========================================================
-- OPTIONAL FUNCTION :: CHECK PRINCIPLE EXISTS
-- =========================================================

create or replace function judx_has_active_principle(p_code text)
returns boolean
language sql
as $$
  select exists (
    select 1
    from judx_system_principle
    where code = p_code
      and is_active = true
  );
$$;
