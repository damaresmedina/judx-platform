"""Dicionário STJ v10 — categorização EXAUSTIVA dos 239 códigos do raw.
Cobertura objetivo: 100% dos pulsos (zero gap).
Categoriza segundo:
- TIPO: RESULTADO_JULGAMENTO | TRAMITACAO | DIAGNOSTICO | PROVISORIO | NAO_DOCUMENTADO
- CATEGORIA_SEMANTICA: granular
- FONTE: TPU_CNJ | TPU_CNJ_v8 | STJ_PROPRIO
- eh_resultado_julgamento, eh_resultado_administrativo
"""
import sys, csv
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path

INPUT = Path(r'C:\Users\medin\Desktop\backup_judx\flat_stj_20260424\exports\inventario_movimentos.csv')
OUT = Path(r'C:\Users\medin\Desktop\backup_judx\flat_stj_20260424\exports\dicionario_stj_canonico_v10.csv')

# (codigo): (categoria_semantica, eh_resultado_julgamento, eh_resultado_administrativo, tipo, fonte)
CAT = {
    # === TPU CNJ — RESULTADOS DE JULGAMENTO ===
    11881: ('PROVIMENTO_AREsp',                  True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    1032:  ('PROVIMENTO_REsp',                   True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    219:   ('PROVIMENTO_ART_557',                True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    220:   ('NEGADO_PROVIMENTO',                 True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    221:   ('PROVIDO_PARCIAL',                   True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    237:   ('PROVIMENTO',                        True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    238:   ('NAO_CONHECIDO',                     True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    239:   ('NAO_PROVIMENTO',                    True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    235:   ('NAO_CONHECIMENTO_RECURSO',          True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    236:   ('NEGACAO_SEGUIMENTO',                True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    240:   ('CONHEC_PARTE_E_PROVIMENTO',         True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    241:   ('PROCEDENTE_PARCIAL',                True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    242:   ('CONHEC_PARTE_NAO_PROVIMENTO',       True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    245:   ('PROVIMENTO_PROVISORIO',             True,  False, 'PROVISORIO',           'TPU_CNJ'),
    246:   ('JULGADO_PROCEDENTE',                True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    247:   ('JULGADO_IMPROCEDENTE',              True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    471:   ('DECADENCIA_PRESCRICAO',             True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    11878: ('PRESCRICAO',                        True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    11373: ('ANULACAO',                          True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    972:   ('PROVIMENTO_ART_557_932',            True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    442:   ('SEGURANCA_CONCEDIDA',               True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    446:   ('SEGURANCA',                         True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    450:   ('SEGURANCA',                         True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    888:   ('SEGURANCA_PARCIAL',                 True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    968:   ('SEGURANCA_NAO_CONCEDIDA',           True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    973:   ('EXTINCAO_PUNIBILIDADE',             True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    459:   ('AUSENCIA_PRESSUPOSTOS',             True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    460:   ('PEREMPCAO_LITISPENDENCIA',          True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    461:   ('AUSENCIA_CONDICOES_ACAO',           True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    268:   ('MORTE_PERDA_CAPACIDADE',            True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    264:   ('SUSPENSAO_CONDICIONAL_PROCESSO',    True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    455:   ('RENUNCIA_AUTOR',                    True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    456:   ('EXTINCAO_GENERICA',                 True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    196:   ('EXTINCAO_EXEC_CUMPRIMENTO',         True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    488:   ('CANCELAMENTO_DISTRIBUICAO',         True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    83:    ('CANCELAMENTO_DISTRIBUICAO',         True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    444:   ('HABEAS_DATA',                       True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    448:   ('HABEAS_DATA',                       True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    452:   ('HABEAS_DATA',                       True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    443:   ('HABEAS_CORPUS',                     True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    447:   ('HABEAS_CORPUS_CONCEDIDO',           True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    451:   ('HABEAS_CORPUS_DENEGADO',            True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    449:   ('MANDADO_INJUNCAO',                  True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    445:   ('MANDADO_INJUNCAO',                  True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    11876: ('ABSOLVICAO_SUMARIA_ART_397',        True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    1042:  ('MORTE_AGENTE',                      True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    1043:  ('ANISTIA_GRACA_INDULTO',             True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    1047:  ('RETRATACAO',                        True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    1049:  ('PAGAMENTO_INTEGRAL_DEBITO',         True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    1050:  ('CUMPRIMENTO_PENA',                  True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    1044:  ('RETROATIVIDADE_LEI',                True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    12028: ('CUMPRIMENTO_TRANSACAO_PENAL',       True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    11801: ('REPARACAO_DANO',                    True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    383:   ('IMPUGNACAO_CUMPRIMENTO',            True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    388:   ('ADITAMENTO_DENUNCIA',               True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    400:   ('ADITAMENTO_QUEIXA',                 True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    391:   ('DENUNCIA',                          True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    402:   ('DENUNCIA',                          True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    393:   ('QUEIXA',                            True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    404:   ('QUEIXA',                            True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    269:   ('IMPEDIMENTO_SUSPEICAO',             True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    1063:  ('DETERMINACAO_ARQUIVAMENTO',         True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    11015: ('EXCECAO_INCOMPETENCIA',             True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    11016: ('EXCECAO_VERDADE',                   True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    133:   ('ACOLHIMENTO_EXCECAO',               True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    275:   ('FORCA_MAIOR',                       True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    276:   ('EXECUCAO_FRUSTRADA',                True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    272:   ('SUSPENSAO_PRE_JUDICIAL',            False, True,  'TRAMITACAO',           'TPU_CNJ'),
    385:   ('COM_RESOLUCAO_MERITO',              True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    11796: ('DECLARACAO_COMPETENCIA',            True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    12318: ('RECONHECIMENTO_PREVENCAO',          True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ_v8'),
    941:   ('INCOMPETENCIA',                     True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    961:   ('SUSCITACAO_CONFLITO_COMPETENCIA',   False, True,  'TRAMITACAO',           'TPU_CNJ'),
    11012: ('CONFLITO_COMPETENCIA',              True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    466:   ('HOMOLOGACAO_TRANSACAO',             True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    11013: ('CONVENCAO_PARTES',                  True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    11014: ('CONVENCAO_CUMPRIMENTO',             True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    454:   ('INDEFERIMENTO_PETICAO_INICIAL',     True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    12455: ('INDEFERIMENTO',                     True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12444: ('DEFERIMENTO',                       True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    944:   ('DESISTENCIA_RECURSO',               True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    463:   ('DESISTENCIA',                       True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    12467: ('DESISTENCIA_PEDIDO',                True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    198:   ('ACOLHIMENTO_ED',                    True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    200:   ('NAO_ACOLHIMENTO_ED',                True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    871:   ('ACOLHIMENTO_PARCIAL_ED',            True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    901:   ('NEGACAO_SEGUIMENTO_ART_932',        True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    230:   ('RECURSO_PREJUDICADO',               True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    12459: ('PREJUDICADO',                       True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12319: ('NAO_CONHECIMENTO_PEDIDO',           True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    853:   ('CONVERSAO_AI_REsp',                 True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12164: ('OUTRAS_DECISOES',                   True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12272: ('DECLINIO_COMPETENCIA',              True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12320: ('DENEGACAO_PREVENCAO',               True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12434: ('CONHEC_DAR_PROVIMENTO_REsp',        True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12435: ('CONHEC_NEGAR_PROVIMENTO_REsp',      True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12436: ('NAO_CONHECIMENTO_REsp',             True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12437: ('CONHEC_AUTUACAO_COMO_REsp',         True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12438: ('CONHEC_PARCIAL_PROVIMENTO_REsp',    True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12439: ('CONHEC_PARTE_E_PROVIMENTO_REsp',    True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12440: ('CONHEC_NEGAR_PROVIMENTO_REsp_alt',  True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12441: ('CONHECER_REsp',                     True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12442: ('CONHEC_PARTE_REsp',                 True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12443: ('CONHEC_PARTE_PROVIMENTO_REsp',      True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12451: ('PROCEDENCIA_STJ',                   True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12452: ('PROCEDENCIA_PARCIAL_STJ',           True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12453: ('IMPROCEDENCIA_STJ',                 True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12458: ('NAO_CONHECIMENTO_HC',               True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12475: ('HC_DE_OFICIO',                      True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12428: ('RECLAMACAO_JULGADA',                True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12429: ('EMBARGOS_DIVERGENCIA_JULGADO',      True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12454: ('PEDIDO_UNIFORMIZACAO_INTERPRETACAO',True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    15162: ('EMBARGOS_VARIACAO',                 True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    15163: ('EMBARGOS_VARIACAO',                 True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    15164: ('EMBARGOS_VARIACAO',                 True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    15063: ('ACOLHIMENTO_EM_PARTE',              True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    15064: ('NAO_ACOLHIMENTO',                   True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    15067: ('REsp_SOBRESTADO_PREJUDICIALIDADE',  False, True,  'TRAMITACAO',           'STJ_PROPRIO'),
    14778: ('SENTENCA_ESTRANGEIRA',              True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    14777: ('SENTENCA_ESTRANGEIRA',              True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12033: ('SENTENCA_ESTRANGEIRA',              True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12034: ('EXEQUATUR',                         True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12032: ('EXEQUATUR',                         True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12422: ('DEVOLUCAO_CARTA_ROGATORIA',         True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12387: ('DECISAO_SANEAMENTO',                True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12446: ('AFETACAO_TORNADA_SEM_EFEITO',       True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12432: ('AFETACAO',                          True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12093: ('DESAFETACAO_REPETITIVOS',           True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    14961: ('ERRO_RECUSA_COMUNICACAO',           False, True,  'TRAMITACAO',           'STJ_PROPRIO'),
    1059:  ('SEM_EFEITO_SUSPENSIVO',             True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    394:   ('COM_EFEITO_SUSPENSIVO',             True,  False, 'RESULTADO_JULGAMENTO', 'TPU_CNJ'),
    12109: ('ANALISE_ADMISSAO_REPETITIVO',       False, True,  'TRAMITACAO',           'STJ_PROPRIO'),
    12113: ('ANALISE_ADMISSAO_IAC',              False, True,  'TRAMITACAO',           'STJ_PROPRIO'),
    12096: ('IAC',                               True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    14968: ('POR_IAC',                           True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12098: ('IRDR',                              True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12099: ('IRDR_PRES_STJ',                     True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12100: ('IRDR_PRES_STF',                     True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12766: ('DIVERGENCIA_STF',                   True,  False, 'RESULTADO_JULGAMENTO', 'STJ_PROPRIO'),
    12108: ('SUSPENSAO_RIRDR',                   False, True,  'TRAMITACAO',           'STJ_PROPRIO'),

    # === SINAIS DIAGNÓSTICOS (não resultado, mas relevantes) ===
    12204: ('PEDIDO_VISTA',                      False, False, 'DIAGNOSTICO',          'TPU_CNJ_v8'),
    12202: ('QUESTAO_ORDEM',                     False, False, 'DIAGNOSTICO',          'TPU_CNJ_v8'),
    12092: ('AFETACAO_REPETITIVOS',              False, False, 'DIAGNOSTICO',          'TPU_CNJ_v8'),
    11975: ('REsp_REPETITIVO',                   False, False, 'DIAGNOSTICO',          'TPU_CNJ_v8'),
    14975: ('SUSPENSAO_RE_RG',                   False, True,  'TRAMITACAO',           'TPU_CNJ_v8'),
    14976: ('SUSPENSAO_REsp_REPETITIVO',         False, True,  'TRAMITACAO',           'TPU_CNJ_v8'),
    14980: ('SUSPENSAO_GRUPO_REPRESENTATIVO',    False, True,  'TRAMITACAO',           'TPU_CNJ_v8'),
    14969: ('POR_GRUPO_REPRESENTATIVO',          False, True,  'TRAMITACAO',           'TPU_CNJ_v8'),
    12106: ('ADIAMENTO_JULGAMENTO',              False, False, 'DIAGNOSTICO',          'TPU_CNJ'),

    # === LIMINARES/CAUTELARES (provisório) ===
    792:   ('LIMINAR',                           False, False, 'PROVISORIO',           'TPU_CNJ'),
    339:   ('LIMINAR',                           False, False, 'PROVISORIO',           'TPU_CNJ'),
    348:   ('LIMINAR',                           False, False, 'PROVISORIO',           'TPU_CNJ'),
    892:   ('LIMINAR',                           False, False, 'PROVISORIO',           'TPU_CNJ'),
    12207: ('LIMINAR',                           False, False, 'PROVISORIO',           'TPU_CNJ'),
    332:   ('ANTECIPACAO_TUTELA',                False, False, 'PROVISORIO',           'TPU_CNJ'),
    889:   ('ANTECIPACAO_TUTELA',                False, False, 'PROVISORIO',           'TPU_CNJ'),
    347:   ('ANTECIPACAO_TUTELA',                False, False, 'PROVISORIO',           'TPU_CNJ'),
    785:   ('ANTECIPACAO_TUTELA',                False, False, 'PROVISORIO',           'TPU_CNJ'),

    # === ADMINISTRATIVO/TRAMITACAO ===
    1061:  ('PUBLICACAO_DJE',                    False, True, 'TRAMITACAO', 'TPU_CNJ'),
    92:    ('PUBLICACAO',                        False, True, 'TRAMITACAO', 'TPU_CNJ'),
    118:   ('PROTOCOLO_PETICAO',                 False, True, 'TRAMITACAO', 'TPU_CNJ'),
    11383: ('ATO_ORDINATORIO',                   False, True, 'TRAMITACAO', 'TPU_CNJ'),
    51:    ('CONCLUSAO',                         False, True, 'TRAMITACAO', 'TPU_CNJ'),
    132:   ('JUNTADA',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    14:    ('REMESSA',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    24:    ('RECEBIMENTO',                       False, True, 'TRAMITACAO', 'TPU_CNJ'),
    36:    ('REDISTRIBUICAO',                    False, True, 'TRAMITACAO', 'TPU_CNJ'),
    26:    ('DISTRIBUICAO',                      False, True, 'TRAMITACAO', 'TPU_CNJ'),
    61:    ('VISTA',                             False, True, 'TRAMITACAO', 'TPU_CNJ'),
    67:    ('EXPEDIDO_DOCUMENTO',                False, True, 'TRAMITACAO', 'TPU_CNJ'),
    11444: ('DEVOLUCAO_PRAZO',                   False, True, 'TRAMITACAO', 'TPU_CNJ'),
    1064:  ('CITACAO',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    12266: ('INTIMACAO_ELETRONICA',              False, True, 'TRAMITACAO', 'TPU_CNJ'),
    14732: ('SISTEMA_AUTOMATIZADO',              False, True, 'TRAMITACAO', 'TPU_CNJ'),
    11434: ('ARQUIVAMENTO',                      False, True, 'TRAMITACAO', 'TPU_CNJ'),
    861:   ('CERTIDAO',                          False, True, 'TRAMITACAO', 'TPU_CNJ'),
    13:    ('DECISAO',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    12217: ('DESPACHO',                          False, True, 'TRAMITACAO', 'TPU_CNJ'),
    85:    ('PETICAO',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    848:   ('TRANSITO_JULGADO',                  False, True, 'TRAMITACAO', 'TPU_CNJ'),
    581:   ('DOCUMENTO',                         False, True, 'TRAMITACAO', 'TPU_CNJ'),
    22:    ('BAIXA_DEFINITIVA',                  False, True, 'TRAMITACAO', 'TPU_CNJ'),
    123:   ('REMESSA',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    982:   ('REMESSA',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    978:   ('REMESSA',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    60:    ('EXPEDICAO_DOCUMENTO',               False, True, 'TRAMITACAO', 'TPU_CNJ'),
    417:   ('INCLUSAO_PAUTA',                    False, True, 'TRAMITACAO', 'TPU_CNJ'),
    106:   ('MANDADO',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    11010: ('MERO_EXPEDIENTE',                   False, True, 'TRAMITACAO', 'TPU_CNJ'),
    12474: ('DISTRIBUICAO',                      False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12255: ('REDISTRIBUICAO_PREVENCAO',          False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12275: ('RETIFICADO',                        False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    11983: ('RETIFICACAO_MOVIMENTO',             False, True, 'TRAMITACAO', 'TPU_CNJ'),
    928:   ('REPUBLICACAO',                      False, True, 'TRAMITACAO', 'TPU_CNJ'),
    12309: ('RETIRADA',                          False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    897:   ('RETIRADA_PAUTA',                    False, True, 'TRAMITACAO', 'TPU_CNJ'),
    1051:  ('DECURSO_PRAZO',                     False, True, 'TRAMITACAO', 'TPU_CNJ'),
    11020: ('REQUISICAO_INFORMACOES',            False, True, 'TRAMITACAO', 'TPU_CNJ'),
    12472: ('DEVOLUCAO_AUTOS_ORIGEM',            False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    10966: ('MUDANCA_CLASSE',                    False, True, 'TRAMITACAO', 'TPU_CNJ'),
    11024: ('ASSISTENCIA_JUDICIARIA_GRATUITA',   False, True, 'TRAMITACAO', 'TPU_CNJ'),
    349:   ('ASSISTENCIA_JUDICIARIA_GRATUITA',   False, True, 'TRAMITACAO', 'TPU_CNJ'),
    334:   ('GRATUIDADE_JUSTICA',                False, True, 'TRAMITACAO', 'TPU_CNJ'),
    15103: ('GRATUIDADE_JUSTICA',                False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12457: ('EXPEDICAO_PRECATORIO_RPV',          False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12449: ('EXPEDICAO_ALVARA_LEVANTAMENTO',     False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12548: ('EXPEDICAO_ALVARA_LEVANTAMENTO',     False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    112:   ('OFICIO',                            False, True, 'TRAMITACAO', 'TPU_CNJ'),
    893:   ('DESARQUIVAMENTO',                   False, True, 'TRAMITACAO', 'TPU_CNJ'),
    25:    ('SUSPENSAO_SOBRESTAMENTO',           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    11022: ('JULGAMENTO_DILIGENCIA',             False, True, 'TRAMITACAO', 'TPU_CNJ'),
    12274: ('SOBRESTADO',                        False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12473: ('AGRAVO_RESP_VAR',                   False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12427: ('AGRAVO_RESP',                       False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12445: ('RECURSO_ORDINARIO',                 False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12456: ('RECURSO_ORDINARIO',                 False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    432:   ('RECURSO_EXTRAORDINARIO',            False, True, 'TRAMITACAO', 'TPU_CNJ'),
    429:   ('RECURSO_EXTRAORDINARIO',            False, True, 'TRAMITACAO', 'TPU_CNJ'),
    265:   ('RE_REP_GERAL',                      False, True, 'TRAMITACAO', 'TPU_CNJ'),
    1060:  ('RECURSO',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    381:   ('RECURSO',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    804:   ('RECURSO',                           False, True, 'TRAMITACAO', 'TPU_CNJ'),
    947:   ('PENDENCIA_AIREsp',                  False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    135:   ('APENSAMENTO',                       False, True, 'TRAMITACAO', 'TPU_CNJ'),
    137:   ('DESAPENSAMENTO',                    False, True, 'TRAMITACAO', 'TPU_CNJ'),
    480:   ('ATUALIZACAO_CONTA',                 False, True, 'TRAMITACAO', 'TPU_CNJ'),
    493:   ('ENTREGA_CARGA_VISTA',               False, True, 'TRAMITACAO', 'TPU_CNJ'),
    12539: ('INFRUTIFERA',                       False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12540: ('FRUTIFERA',                         False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12614: ('REMESSA_CEJUSC',                    False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12619: ('RECEBIMENTO_CEJUSC',                False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12621: ('RECEBIMENTO_CEJUSC',                False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12752: ('AUDIENCIA_MEDIACAO',                False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12749: ('AUDIENCIA_INSTRUCAO',               False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12753: ('AUDIENCIA_PRELIMINAR',              False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    12743: ('AUDIENCIA_INTERROGATORIO',          False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    870:   ('AUTOS_ELIMINADOS',                  False, True, 'TRAMITACAO', 'TPU_CNJ'),
    1013:  ('DETERMINACAO',                      False, True, 'TRAMITACAO', 'TPU_CNJ'),
    898:   ('POR_DECISAO_JUDICIAL',              False, True, 'TRAMITACAO', 'TPU_CNJ'),
    12608: ('PARCIAL',                           False, True, 'TRAMITACAO', 'STJ_PROPRIO'),
    945:   ('DECISAO_ANTERIOR',                  False, True, 'TRAMITACAO', 'TPU_CNJ'),
    246:   ('DEFINITIVO',                        False, True, 'TRAMITACAO', 'TPU_CNJ'),
}

# Carregar inventário
print(f'Lendo {INPUT}')
with open(INPUT, encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))
print(f'  {len(rows)} códigos no raw')

# Construir
out_rows = []
n_cat = 0
n_gap = 0
total_oc_cat = 0
total_oc = 0
for r in rows:
    cod = int(r['codigo_tpu'])
    nome = r['nome_cnj']
    oc = int(r['ocorrencias'])
    docs = int(r['docs_distintos'])
    pct_res = float(r['pct_resultado'])
    total_oc += oc
    cat = CAT.get(cod)
    if cat:
        categoria, eh_jul, eh_adm, tipo, fonte = cat
        n_cat += 1
        total_oc_cat += oc
    else:
        # Fallback: códigos não documentados (sem nome ou nome genérico)
        if not nome or nome.strip() == '':
            categoria = 'STJ_PROPRIO_NAO_DOCUMENTADO'
            eh_jul = False
            eh_adm = False
            tipo = 'NAO_DOCUMENTADO'
            fonte = 'STJ_PROPRIO'
        else:
            # Usa pct_resultado do flat como heurística
            if pct_res > 0.5:
                categoria = f'JULGAMENTO_{nome.upper().replace(" ","_")[:30]}'
                eh_jul = True
                eh_adm = False
                tipo = 'RESULTADO_JULGAMENTO'
            else:
                categoria = f'TRAMITACAO_{nome.upper().replace(" ","_")[:30]}'
                eh_jul = False
                eh_adm = True
                tipo = 'TRAMITACAO'
            fonte = 'INFERIDO_FLAT'
        n_gap += 1
    out_rows.append({
        'codigo': cod, 'nome_oficial': nome, 'ocorrencias': oc, 'docs_distintos': docs,
        'pct_resultado_flat': pct_res, 'categoria_semantica': categoria,
        'eh_resultado_julgamento': eh_jul, 'eh_resultado_administrativo': eh_adm,
        'tipo': tipo, 'fonte_dicionario': fonte,
    })

# Salvar
with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
    w.writeheader()
    for r in sorted(out_rows, key=lambda x: -x['ocorrencias']):
        w.writerow(r)

print(f'\n=== Resultado ===')
print(f'Total códigos: {len(out_rows)}')
print(f'  Categorizados manualmente: {n_cat}')
print(f'  Inferidos via flat (fallback): {n_gap}')
print(f'\nCobertura por ocorrências:')
print(f'  {total_oc_cat:,}/{total_oc:,} = {100*total_oc_cat/total_oc:.2f}% manual')
print(f'  100% via fallback (zero gap)')

# Stats por tipo
from collections import Counter
c = Counter(r['tipo'] for r in out_rows)
print(f'\n=== Distribuição por tipo ===')
for tipo, n in c.most_common():
    print(f'  {tipo:30}: {n}')

# Stats por fonte
c = Counter(r['fonte_dicionario'] for r in out_rows)
print(f'\n=== Distribuição por fonte ===')
for fonte, n in c.most_common():
    print(f'  {fonte:30}: {n}')

# Codigos NAO_DOCUMENTADO (gap real do raw)
gaps_real = [r for r in out_rows if r['categoria_semantica']=='STJ_PROPRIO_NAO_DOCUMENTADO']
print(f'\n=== Códigos sem nome (NAO_DOCUMENTADO) — {len(gaps_real)} ===')
for r in sorted(gaps_real, key=lambda x:-x['ocorrencias']):
    print(f'  {r["codigo"]:>6}  ocorrencias={r["ocorrencias"]:>10,}  pct_res={r["pct_resultado_flat"]:.0%}')

print(f'\n>>> {OUT}')
