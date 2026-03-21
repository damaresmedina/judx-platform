-- Upsert por numero_registro (sync em src/lib/stj-sync.ts).
-- Vários NULL são permitidos em índice UNIQUE no PostgreSQL.

alter table public.stj_decisions
  add column if not exists numero_registro text;

create unique index if not exists stj_decisions_numero_registro_uidx
  on public.stj_decisions (numero_registro);
