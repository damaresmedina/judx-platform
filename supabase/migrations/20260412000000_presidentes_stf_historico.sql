-- Histórico completo das presidências do STF (1891–2027)
-- Fonte: portal.stf.jus.br/ministro/listarPresidente.asp
-- 51 presidências (49 ministros, José Linhares com 2 mandatos)
-- Discursos de posse: 4 extraídos via OCR de plaquetas (Wayback Machine)
-- 5 ainda a localizar no Diário da Justiça (⚠)

INSERT INTO stf_composicao_temporal (ministro, cargo, data_inicio, data_fim, fonte, observacao)
SELECT ministro, cargo, data_inicio::date, data_fim::date, fonte, observacao
FROM (VALUES
  ('Freitas Henriques','Presidente STF','1891-02-28','1892-09-10','Portal STF / Wikipedia','Primeiro presidente do STF republicano'),
  ('Aquino e Castro','Presidente STF','1894-01-01','1906-12-31','Portal STF','Datas aproximadas — mandato 1894–1906'),
  ('Piza e Almeida','Presidente STF','1906-01-01','1908-12-31','Portal STF','Datas aproximadas — mandato 1906–1908'),
  ('Pindahiba de Mattos','Presidente STF','1908-01-01','1910-12-31','Portal STF','Datas aproximadas — mandato 1908–1910'),
  ('Hermínio do Espírito Santo','Presidente STF','1911-01-01','1924-12-31','Portal STF','Presidência mais longa da história — 13 anos'),
  ('André Cavalcanti','Presidente STF','1924-01-01','1927-12-31','Portal STF','Datas aproximadas — mandato 1924–1927'),
  ('Godofredo Cunha','Presidente STF','1927-01-01','1931-12-31','Portal STF','Datas aproximadas — mandato 1927–1931'),
  ('Leoni Ramos','Presidente STF','1931-01-01','1931-01-23','Portal STF','Presidência mais breve — 23 dias'),
  ('Edmundo Lins','Presidente STF','1931-02-01','1937-12-31','Portal STF','Datas aproximadas — mandato 1931–1937'),
  ('Bento de Faria','Presidente STF','1937-01-01','1940-12-31','Portal STF','Datas aproximadas — mandato 1937–1940; presidente indicado por Vargas'),
  ('Eduardo Espínola','Presidente STF','1940-01-01','1945-12-31','Portal STF','Datas aproximadas — mandato 1940–1945'),
  ('José Linhares','Presidente STF','1945-10-29','1949-12-31','Portal STF','Exerceu a Presidência da República interinamente em 1945'),
  ('Laudo de Camargo','Presidente STF','1949-01-01','1951-12-31','Portal STF','Datas aproximadas — mandato 1949–1951'),
  ('José Linhares','Presidente STF','1951-01-01','1956-12-31','Portal STF','Segundo mandato — 1951–1956'),
  ('Orozimbo Nonato','Presidente STF','1956-01-01','1960-12-31','Portal STF','Datas aproximadas — mandato 1956–1960'),
  ('Barros Barreto','Presidente STF','1960-01-01','1962-12-31','Portal STF','Primeiro presidente do STF instalado em Brasília (1960)'),
  ('Lafayette de Andrada','Presidente STF','1962-01-01','1963-12-31','Portal STF','Datas aproximadas — mandato 1962–1963'),
  ('Ribeiro da Costa','Presidente STF','1963-02-01','1966-12-31','Portal STF','⚠ Discurso de posse publicado no DJ — a localizar'),
  ('Luiz Gallotti','Presidente STF','1966-01-01','1968-12-31','Portal STF','Datas aproximadas — mandato 1966–1968'),
  ('Gonçalves de Oliveira','Presidente STF','1968-01-01','1969-02-09','Portal STF','Renunciou à presidência; encaminhou aposentadoria'),
  ('Oswaldo Trigueiro','Presidente STF','1969-02-10','1971-02-09','Portal STF','⚠ Posse 10/02/1969 — DJ 11/02/1969 p.333'),
  ('Aliomar Baleeiro','Presidente STF','1971-02-10','1973-02-09','Portal STF','⚠ Posse 10/02/1971 — DJ a localizar; defensor das liberdades públicas sob AI-5'),
  ('Eloy da Rocha','Presidente STF','1973-02-10','1975-02-09','Portal STF','⚠ Posse 10/02/1973 — DJ a localizar'),
  ('Djaci Falcão','Presidente STF','1975-02-10','1977-02-09','Portal STF','Plaqueta institucional disponível — OCR extraído'),
  ('Thompson Flores','Presidente STF','1977-02-10','1979-02-09','Portal STF','Plaqueta institucional disponível — OCR extraído'),
  ('Antonio Neder','Presidente STF','1979-02-10','1981-02-09','Portal STF','⚠ Posse fev/1979 — DJ a localizar'),
  ('Xavier de Albuquerque','Presidente STF','1981-02-16','1983-02-20','Portal STF','Posse 16/02/1981 — plaqueta digitalizada e OCR extraído'),
  ('Cordeiro Guerra','Presidente STF','1983-02-21','1985-02-24','Portal STF','Posse 21/02/1983 — plaqueta digitalizada e OCR extraído'),
  ('Moreira Alves','Presidente STF','1985-02-25','1987-03-01','Portal STF','Presidiu sessão de abertura da ANC 1987; plaqueta digitalizada'),
  ('Rafael Mayer','Presidente STF','1987-03-02','1989-10-30','Portal STF','Plaqueta digitalizada'),
  ('Néri da Silveira','Presidente STF','1989-10-01','1991-04-02','STF Portal Histórico','Plaqueta com texto embutido — 78K chars'),
  ('Sydney Sanches','Presidente STF','1991-04-03','1993-04-07','STF Portal Histórico',''),
  ('Octavio Gallotti','Presidente STF','1993-04-08','1995-04-04','STF Portal Histórico',''),
  ('Sepúlveda Pertence','Presidente STF','1995-04-05','1997-04-22','STF Portal Histórico',''),
  ('Celso de Mello','Presidente STF','1997-04-23','1999-04-14','STF Portal Histórico',''),
  ('Carlos Velloso','Presidente STF','1999-04-15','2001-05-23','STF Portal Histórico',''),
  ('Marco Aurélio','Presidente STF','2001-05-24','2003-05-14','STF Portal Histórico',''),
  ('Maurício Corrêa','Presidente STF','2003-05-15','2004-04-21','STF Portal Histórico',''),
  ('Nelson Jobim','Presidente STF','2004-04-22','2006-03-29','STF Portal Histórico',''),
  ('Ellen Gracie','Presidente STF','2006-04-20','2008-04-22','STF Portal Histórico',''),
  ('Gilmar Mendes','Presidente STF','2008-04-23','2010-04-22','STF Portal Histórico',''),
  ('Cezar Peluso','Presidente STF','2010-04-23','2012-04-11','STF Portal Histórico',''),
  ('Ayres Britto','Presidente STF','2012-04-12','2012-11-16','STF Portal Histórico',''),
  ('Joaquim Barbosa','Presidente STF','2012-11-22','2014-07-31','STF Portal Histórico',''),
  ('Ricardo Lewandowski','Presidente STF','2014-09-10','2016-10-11','STF Portal Histórico',''),
  ('Cármen Lúcia','Presidente STF','2016-10-12','2018-10-12','STF Portal Histórico',''),
  ('Dias Toffoli','Presidente STF','2018-10-12','2020-10-22','STF Portal Histórico',''),
  ('Luiz Fux','Presidente STF','2020-10-22','2022-10-12','STF Portal Histórico',''),
  ('Rosa Weber','Presidente STF','2022-10-12','2023-09-27','STF Portal Histórico',''),
  ('Luís Roberto Barroso','Presidente STF','2023-09-28','2025-10-22','STF Portal Histórico',''),
  ('Edson Fachin','Presidente STF','2025-10-23',NULL,'STF Portal Histórico','Mandato 2025–2027')
) AS t(ministro,cargo,data_inicio,data_fim,fonte,observacao)
WHERE NOT EXISTS (
  SELECT 1 FROM stf_composicao_temporal x
  WHERE x.ministro = t.ministro AND x.cargo = 'Presidente STF' AND x.data_inicio = t.data_inicio::date
);
