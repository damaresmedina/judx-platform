const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, HeadingLevel,
  PageBreak, SectionType, convertInchesToTwip
} = require("docx");
const fs = require("fs");

// Helpers
function heading(text, level) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 600 : level === HeadingLevel.HEADING_2 ? 400 : 300, after: 200 },
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({
      text,
      bold: opts.bold || false,
      italics: opts.italic || false,
      size: opts.size || 24,
      font: "Calibri",
    })],
    spacing: { after: opts.after || 150, line: 276 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
  });
}

function emptyLine() {
  return new Paragraph({ text: "", spacing: { after: 100 } });
}

function makeTable(headers, rows) {
  const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: "666666" };
  const borders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };

  function cell(text, isHeader) {
    return new TableCell({
      children: [new Paragraph({
        children: [new TextRun({
          text: String(text),
          bold: isHeader,
          size: 20,
          font: "Calibri",
        })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 40 },
      })],
      borders,
      verticalAlign: "center",
    });
  }

  const headerRow = new TableRow({
    children: headers.map(h => cell(h, true)),
    tableHeader: true,
  });

  const dataRows = rows.map(r =>
    new TableRow({ children: r.map(c => cell(c, false)) })
  );

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

// Document
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 24 },
        paragraph: { spacing: { line: 276 } },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top: convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left: convertInchesToTwip(1.2),
          right: convertInchesToTwip(1),
        },
      },
    },
    children: [
      // CAPA
      emptyLine(), emptyLine(), emptyLine(), emptyLine(),
      para("AMBIENTES DECISORIOS DO STF", { bold: true, size: 36, center: true }),
      para("Presencial vs Virtual", { size: 28, center: true }),
      emptyLine(),
      para("Relatorio de achados empiricos", { size: 24, center: true }),
      para("16 de abril de 2026", { size: 24, center: true }),
      emptyLine(), emptyLine(),
      para("Fonte: Corte Aberta do STF", { size: 22, center: true }),
      para("stf_master + stf_master_premium", { size: 22, center: true, italic: true }),
      para("2.927.525 decisoes | 2.212.761 processos | 2000-2026", { size: 22, center: true }),
      emptyLine(), emptyLine(), emptyLine(),
      para("Damares Medina", { bold: true, size: 24, center: true }),
      para("Pesquisadora | IDP | Visiting Scholar Bicocca-Milano", { size: 20, center: true, italic: true }),

      // PAGINA 2 - CRONOLOGIA
      new Paragraph({ children: [new PageBreak()] }),
      heading("1. Cronologia normativa do Plenario Virtual", HeadingLevel.HEADING_1),
      para("O plenario virtual do STF nasceu em 2007 como instrumento restrito para julgar a existencia de repercussao geral. Ao longo de 13 anos, sua competencia foi progressivamente ampliada ate a equiparacao total com o presencial em marco de 2020."),
      emptyLine(),
      makeTable(
        ["Norma", "Data", "Competencia"],
        [
          ["Criacao PV + RG", "2007", "Repercussao geral — voto tacito (adesao ao relator)"],
          ["ER 31/2009", "2009", "Questao constitucional"],
          ["ER 42/2010", "2010", "Merito de RE em questoes pacificadas"],
          ["Res. 587/2016", "2016", "Agravos internos e embargos de declaracao"],
          ["ER 52/2019 (Toffoli)", "Jun/2019", "Grande salto — art. 21-B RISTF"],
          ["ER 53/2020", "18/Mar/2020", "EQUIPARACAO TOTAL"],
        ]
      ),
      emptyLine(),
      para("Referencia: MEDINA, Damares. Julgamento eletronico no plenario virtual do STF: reflexos para a advocacia. JOTA, 22/abr/2020.", { italic: true, size: 20 }),
      para("Com a ER 53/2020, nao ha mais ampliacao de competencia — ha equiparacao. Todos os processos podem ser julgados em ambiente presencial ou eletronico, a criterio do relator.", { bold: true }),

      // PAGINA 3 - VOLUME
      new Paragraph({ children: [new PageBreak()] }),
      heading("2. Volume colegiado por ambiente (pos-equiparacao)", HeadingLevel.HEADING_1),
      para("A partir de 2021, o presencial colegiado e residual — menos de 200 decisoes por ano, contra mais de 10 mil no virtual. O virtual absorveu 99% do volume decisorio colegiado do STF."),
      emptyLine(),
      makeTable(
        ["Ano", "Presencial", "Virtual", "% Virtual"],
        [
          ["2020", "1.508", "12.811", "89%"],
          ["2021", "530", "11.347", "96%"],
          ["2022", "165", "9.966", "98%"],
          ["2023", "104", "12.314", "99%"],
          ["2024", "173", "15.170", "99%"],
          ["2025", "105", "18.271", "99%"],
        ]
      ),
      emptyLine(),
      para("O presencial residual nao e uma amostra aleatoria — e uma selecao. Os casos que chegam ao presencial sao escolhidos pelo relator, pelo presidente da turma ou do tribunal, ou por pedido de destaque de qualquer ministro. O presencial pos-pandemia e um ato de curadoria institucional.", { bold: true }),

      // PAGINA 4 - ADI
      new Paragraph({ children: [new PageBreak()] }),
      heading("3. ADI — Controle concentrado", HeadingLevel.HEADING_1),
      heading("3.1 Decisao Final — Tribunal Pleno", HeadingLevel.HEADING_2),
      para("Filtro: classe = ADI, tipo_decisao = Decisao Final, orgao_julgador = TRIBUNAL PLENO, data >= 18/mar/2020."),
      emptyLine(),
      makeTable(
        ["Ano", "Presencial: % unanime (N)", "Virtual: % unanime (N)", "Diferenca (pp)"],
        [
          ["2020", "20,0% (65)", "42,8% (306)", "+22,8"],
          ["2021", "29,4% (51)", "60,1% (263)", "+30,7"],
          ["2022", "12,1% (33)", "83,5% (322)", "+71,4"],
          ["2023", "40,0% (20)", "73,6% (307)", "+33,6"],
          ["2024", "33,3% (30)", "79,6% (191)", "+46,3"],
          ["2025", "62,5% (24)", "75,7% (177)", "+13,2"],
        ]
      ),
      emptyLine(),
      para("Padrao: o presencial e sistematicamente MENOS unanime que o virtual. Em 2022, a diferenca atinge 71 pontos percentuais.", { bold: true }),
      emptyLine(),
      heading("3.2 Relator vencido em ADIs", HeadingLevel.HEADING_2),
      makeTable(
        ["Ano", "Presencial", "Virtual"],
        [
          ["2020", "17 (26,2%)", "21 (6,9%)"],
          ["2021", "10 (19,6%)", "16 (6,1%)"],
          ["2022", "2 (6,1%)", "9 (2,8%)"],
          ["2023", "2 (10,0%)", "21 (6,8%)"],
          ["2024", "4 (13,3%)", "13 (6,8%)"],
          ["2025", "3 (12,5%)", "15 (8,5%)"],
        ]
      ),
      emptyLine(),
      para("O relator e vencido com mais frequencia no presencial — consistente com a hipotese de que o presencial seleciona para controversia."),

      // PAGINA 5 - ADPF
      new Paragraph({ children: [new PageBreak()] }),
      heading("4. ADPF — Arguicao de Descumprimento de Preceito Fundamental", HeadingLevel.HEADING_1),
      heading("4.1 Decisao Final — Tribunal Pleno", HeadingLevel.HEADING_2),
      makeTable(
        ["Ano", "Presencial: % unanime (N)", "Virtual: % unanime (N)", "Direcao"],
        [
          ["2020", "54,5% (11)", "42,1% (38)", "Presencial +12"],
          ["2021", "33,3% (9)", "59,5% (42)", "Virtual +26"],
          ["2022", "30,0% (10)", "71,1% (38)", "Virtual +41"],
          ["2023", "85,7% (7)", "63,3% (49)", "Presencial +22"],
          ["2024", "87,5% (8)", "70,6% (34)", "Presencial +17"],
          ["2025", "85,7% (7)", "65,7% (35)", "Presencial +20"],
        ]
      ),
      emptyLine(),
      para("Padrao INVERTIDO a partir de 2023: o presencial e MAIS unanime que o virtual nas ADPFs.", { bold: true }),
      emptyLine(),
      para("Hipoteses:"),
      para("1. O 8 de janeiro de 2023 e os inqueritos no STF podem ter produzido ADPFs de alta visibilidade institucional julgadas presencialmente com consenso."),
      para("2. A presidencia Barroso (set/2023) pode ter alterado a gestao da pauta — ADPFs consensuais ao presencial para visibilidade, polemicas ao virtual."),
      para("3. Se a escolha do ambiente e estrategica e varia por classe, o ambiente nao e variavel exogena — e variavel endogena ao processo decisorio.", { bold: true }),

      // PAGINA 6 - RE
      new Paragraph({ children: [new PageBreak()] }),
      heading("5. RE — Recurso Extraordinario no Pleno", HeadingLevel.HEADING_1),
      makeTable(
        ["Ano", "Presencial: % unanime (N)", "Virtual: % unanime (N)"],
        [
          ["2020", "25,0% (8)", "66,7% (21)"],
          ["2021", "0,0% (3)", "48,3% (29)"],
          ["2023", "100% (1)", "47,8% (23)"],
          ["2024", "— (0)", "75,0% (24)"],
          ["2025", "66,7% (3)", "64,6% (65)"],
        ]
      ),
      emptyLine(),
      para("RE no Pleno segue o padrao ADI: presencial seleciona controversia. Destaque: em 2021, 0% de unanimidade presencial (3 REs, todas por maioria, 2 relatores vencidos)."),
      emptyLine(),
      heading("6. ARE — Agravo em RE no Pleno", HeadingLevel.HEADING_1),
      makeTable(
        ["Ano", "Virtual: % unanime (N)"],
        [
          ["2020", "69,2% (13)"],
          ["2021", "36,4% (11)"],
          ["2022", "100% (8)"],
          ["2023", "100% (15)"],
          ["2024", "83,8% (37)"],
          ["2025", "75,0% (36)"],
        ]
      ),
      emptyLine(),
      para("AREs no Pleno sao quase exclusivamente virtuais (zero presencial em 2022-2024). Unanimidade alta mas com erosao em 2025 (75%)."),

      // PAGINA 7 - TURMAS
      new Paragraph({ children: [new PageBreak()] }),
      heading("7. RE e ARE nas Turmas", HeadingLevel.HEADING_1),
      heading("7.1 RE — 2a Turma virtual", HeadingLevel.HEADING_2),
      makeTable(
        ["Ano", "% unanime (N)", "Relator vencido"],
        [
          ["2021", "100% (22)", "0"],
          ["2023", "50% (2)", "0"],
          ["2025", "42,2% (45)", "5"],
        ]
      ),
      emptyLine(),
      para("Queda dramatica: de 100% unanime (2021) para 42% (2025). Coincide com a entrada de Nunes Marques (nov/2020) e Andre Mendonca (dez/2021) na 2a Turma.", { bold: true }),
      emptyLine(),
      heading("7.2 ARE — 2a Turma virtual", HeadingLevel.HEADING_2),
      makeTable(
        ["Ano", "% unanime (N)", "Relator vencido"],
        [
          ["2021", "96,0% (50)", "0"],
          ["2024", "80,0% (10)", "2"],
          ["2025", "87,2% (47)", "1"],
          ["2026", "100% (31)", "0"],
        ]
      ),
      emptyLine(),
      para("AREs na 2a Turma mais estaveis que REs. A divergencia concentra-se nos recursos com maior densidade constitucional."),

      // PAGINA 8 - SINTESE
      new Paragraph({ children: [new PageBreak()] }),
      heading("8. Sintese dos achados", HeadingLevel.HEADING_1),
      emptyLine(),
      para("8.1 O ambiente molda o comportamento decisorio.", { bold: true }),
      para("ADIs no mesmo ano, com a mesma composicao, produzem resultados radicalmente diferentes conforme o ambiente. O presencial gera ate 71 pontos percentuais menos unanimidade que o virtual (2022). Nao e efeito de composicao — e efeito de desenho institucional."),
      emptyLine(),
      para("8.2 O presencial pos-pandemia e seletivo, nao aleatorio.", { bold: true }),
      para("Com 99% do volume no virtual, os casos que vao ao presencial sao curados — pelo relator, pelo presidente ou por destaque. O presencial virou o forum da controversia para ADIs e o forum do consenso para ADPFs."),
      emptyLine(),
      para("8.3 A escolha do ambiente e estrategica e varia por classe.", { bold: true }),
      para("ADI presencial = controversia. ADPF presencial = consenso (a partir de 2023). Se a escolha do ambiente e endogena ao processo decisorio, o ambiente nao pode ser tratado como variavel de controle — e variavel explicativa."),
      emptyLine(),
      para("8.4 A 2a Turma virtual esta em erosao de unanimidade.", { bold: true }),
      para("RE: de 100% (2021) para 42% (2025). A nova composicao (Gilmar + Fachin + Toffoli + Nunes Marques + Andre Mendonca) e mais polarizada que a anterior, e o ambiente assincrono — sem debate, sem pressao social — potencializa a divergencia individual."),
      emptyLine(),
      para("8.5 O campo relator da Corte Aberta nao e confiavel.", { bold: true }),
      para("Em 5.133 decisoes, a Corte Aberta substituiu o relator original pelo Redator para o acordao. O relator real so e recuperavel pelo extrato (observacao_andamento). Toda analise de funcao pivotal precisa usar o extrato como fonte."),

      // PAGINA 9 - RESSALVAS
      new Paragraph({ children: [new PageBreak()] }),
      heading("9. Ressalvas metodologicas", HeadingLevel.HEADING_1),
      para("1. O virtual pre-2019 tinha voto tacito (adesao automatica ao relator) — unanimidade artificial. Dados desse periodo nao sao comparaveis."),
      para("2. O virtual 2020-2021 inclui videoconferencias sincronas pandemicas registradas como presencial (127 casos com mencao a videoconferencia, 114 no Pleno)."),
      para("3. O N do presencial pos-2022 e muito pequeno (7-33 por classe/ano). Os padroes sao consistentes mas estatisticamente frageis."),
      para("4. Analise nao controlada por relator, tema ou assunto — proxima etapa."),
      para("5. Filtrado para Decisao Final. Exclui liminares, interlocutorias, sobrestamentos e decisoes em recurso interno."),
      para("6. O destaque (mecanismo de transicao virtual para presencial) quase nao aparece na Corte Aberta. Dos 90.105 extratos virtuais colegiados, apenas 30 mencionam destaque — quase sempre indeferido ou cancelado."),
      emptyLine(),
      heading("10. Contexto institucional", HeadingLevel.HEADING_1),
      para("8 de janeiro de 2023: atos antidemocraticos contra os Tres Poderes. Inqueritos e julgamentos de alta visibilidade no STF. Pode explicar a inversao nas ADPFs — julgamentos presenciais de consenso institucional."),
      para("Setembro de 2023: inicio da presidencia Barroso. Possivel mudanca na gestao da pauta."),
      para("Outubro de 2024: Luiz Fux migra da 1a para a 2a Turma. Muda a composicao de ambas."),
      emptyLine(),
      heading("11. Proximos passos", HeadingLevel.HEADING_1),
      para("1. Decompor por relator dentro de cada classe x ambiente x periodo"),
      para("2. Extrair nomes dos ministros vencidos do extrato — redes de coalizao"),
      para("3. Cruzar com composicao temporal das turmas e presidencias"),
      para("4. Controlar por tema/assunto (main_subject) — isolar efeito do ambiente"),
      para("5. Mapear funcao pivotal: quem forma blocos majoritarios em cada ambiente"),
      para("6. Testar hipotese: o virtual assincrono favorece a adesao ao relator pela ausencia de deliberacao sincrona?"),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  const dest = "C:/Users/medin/Desktop/backup_judx/relatorios/2026-04-16_RELATORIO_ambientes_decisorios_STF.docx";
  fs.writeFileSync(dest, buf);
  console.log("Salvo:", dest, "-", Math.round(buf.length / 1024), "KB");
});
