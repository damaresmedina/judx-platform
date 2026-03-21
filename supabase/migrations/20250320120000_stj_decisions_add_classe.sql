-- Run in Supabase SQL editor or via CLI.
-- Normaliza processo (só dígitos e pontos), extrai classe (antes do 1º dígito) e UF após "/".

alter table public.stj_decisions
  add column if not exists classe text;

alter table public.stj_decisions
  add column if not exists uf text;

update public.stj_decisions
set
  classe = trim(regexp_replace(processo, '\s*[0-9].*$', '')),
  uf = substring(processo from '/([A-Z]{2})$'),
  processo = trim(
    regexp_replace(
      regexp_replace(processo, '^[^0-9]+', ''),
      '/[A-Z]{2}$',
      ''
    )
  )
where classe is null
   or classe = '';
