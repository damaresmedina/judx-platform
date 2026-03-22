-- sequencial do CSV como identificador textual (ex.: "1601"); alinha UNIQUE com numero_registro (text).
alter table public.stj_precedentes_processos
  alter column sequencial_precedente type text using sequencial_precedente::text;
