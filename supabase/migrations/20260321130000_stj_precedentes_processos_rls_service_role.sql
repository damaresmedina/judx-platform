-- Se RLS for habilitado em stj_precedentes_processos, o role service_role precisa de política explícita
-- (alguns projetos não usam bypass para todas as operações via API). Idempotente.

drop policy if exists "stj_precedentes_processos_service_role_all"
  on public.stj_precedentes_processos;

create policy "stj_precedentes_processos_service_role_all"
  on public.stj_precedentes_processos
  for all
  to service_role
  using (true)
  with check (true);
