const ExcelJS = require('exceljs');
const U = require('./util');
const { conferenciaManual } = require('./engine');

function aba(wb, nome, colunas, linhas, opts = {}) {
  const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = colunas.map(([header, key, width, fmt]) => ({ header, key, width, style: fmt ? { numFmt: fmt } : {} }));
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.cor || 'FF1F4E78' } };
  h.alignment = { vertical: 'middle', wrapText: true };
  linhas.forEach((l) => ws.addRow(l));
  if (linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  return ws;
}

const MONEY = '#,##0.00';

// Celula bruta -> valor legivel (datas em serial viram dd/mm/aaaa).
function celula(v, cab) {
  if (typeof v === 'number' && /^DATA/.test(U.normHeader(cab))) return U.fmtDate(U.parseDate(v)) || v;
  return v;
}

// Aba com a linha inteira (todas as colunas da planilha de origem) de cada nota.
function abaLinhas(wb, nome, titulo, cabecalho, grupos) {
  const ws = wb.addWorksheet(nome);
  const cols = cabecalho.map((h, i) => [h, i]).filter(([h]) => String(h).trim() !== '');
  ws.addRow([titulo]).font = { bold: true, size: 14, color: { argb: 'FFC00000' } };
  ws.addRow([]);
  const h = ws.addRow(cols.map(([t]) => t));
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
  cols.forEach((_, i) => { ws.getColumn(i + 1).width = 16; });
  ws.views = [{ state: 'frozen', ySplit: 3 }];
  if (!grupos.length) ws.addRow(['Nenhuma nota.']);
  grupos.forEach((linhas) => linhas.forEach((l) => ws.addRow(cols.map(([t, i]) => celula(l[i], t)))));
}

// Aba "Notas que precisam de conferencia manual": a linha inteira de cada planilha.
function abaConferenciaManual(wb, res, itens, nomeAba = 'Conferência manual', titulo = 'NOTAS QUE PRECISAM DE CONFERÊNCIA MANUAL', cor = 'FFC00000') {
  const ws = wb.addWorksheet(nomeAba);
  const colsD = res.cabDominio.map((h, i) => [h, i]).filter(([h]) => String(h).trim() !== '');
  const colsA = res.cabAutomais.map((h, i) => [h, i]).filter(([h]) => String(h).trim() !== '');
  const total = 4 + colsD.length + colsA.length;
  ws.addRow([titulo]).font = { bold: true, size: 14, color: { argb: cor } };
  ws.addRow([]);
  const g = ws.addRow(['', '', '', '', ...colsD.map((_, i) => (i === 0 ? 'LINHA DO DOMÍNIO' : '')), ...colsA.map((_, i) => (i === 0 ? 'LINHA DO AUTOMAIS' : ''))]);
  g.font = { bold: true };
  const h = ws.addRow(['Nota', 'Série', 'Fornecedor', 'O que conferir', ...colsD.map(([t]) => t), ...colsA.map(([t]) => t)]);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } };
  h.alignment = { vertical: 'middle', wrapText: true };
  [10, 8, 34, 46].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (let c = 5; c <= total; c++) ws.getColumn(c).width = 14;
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 3 }];
  for (const { d, a, obs } of itens) {
    d.brutas.forEach((linha, k) => {
      const rowD = colsD.map(([t, i]) => celula(linha[i], t));
      const rowA = k === 0 ? colsA.map(([t, i]) => celula(a.bruta[i], t)) : colsA.map(() => '');
      const row = ws.addRow([d.nota, d.serie || '(vazia)', d.nome, k === 0 ? obs : '', ...rowD, ...rowA]);
      row.getCell(4).font = { bold: true, color: { argb: cor } };
      row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
    });
  }
  if (!itens.length) ws.addRow(['Nenhuma nota precisa de conferência manual.']);
}

function linhaPar(m) {
  const { d, a } = m;
  const dias = a.data ? U.diasEntre(d.data, a.data) : '';
  return {
    numero: d.nota, serie: d.serie || '(vazia)',
    fornDom: d.nome, fornAut: a.nome,
    divs: (m.divs || []).join('; '),
    valorDom: d.valor, valorAut: a.valor,
    dif: a.valor === null ? '' : U.r2(d.valor - a.valor),
    dataEntrada: U.fmtDate(d.data), dataEmissao: U.fmtDate(a.data), dias,
    especie: d.especie, modelo: a.modeloChave,
    ufDom: d.uf, ufChave: a.ufChave,
    eventos: a.eventos, chave: a.chave
  };
}

const COLS_PAR = [
  ['Número', 'numero', 10], ['Série', 'serie', 8],
  ['Fornecedor (Domínio)', 'fornDom', 34], ['Fornecedor (Automais)', 'fornAut', 34],
  ['Divergências / alertas', 'divs', 50],
  ['Valor Contábil', 'valorDom', 14, MONEY], ['Valor NF', 'valorAut', 14, MONEY], ['Diferença', 'dif', 12, MONEY],
  ['Data entrada', 'dataEntrada', 12], ['Data emissão', 'dataEmissao', 12], ['Dias', 'dias', 7],
  ['Espécie', 'especie', 9], ['Modelo (chave)', 'modelo', 9],
  ['UF Domínio', 'ufDom', 8], ['UF chave', 'ufChave', 8],
  ['Eventos', 'eventos', 20], ['Chave NF', 'chave', 48]
];

async function gerarRelatorio(res, cfg) {
  const wb = new ExcelJS.Workbook();
  const r = res.resumo;

  const wsR = wb.addWorksheet('Resumo');
  wsR.columns = [{ width: 100 }, { width: 12 }];
  wsR.addRow(['Conferência Livro de Entradas (Domínio) x Automais']).font = { bold: true, size: 14 };
  wsR.addRow([]);
  const linhasResumo = [
    ['Notas que NÃO constam no Domínio (estão só no Automais)', r.soAutomais],
    ['Notas que NÃO constam no Automais (estão só no Domínio)', r.soDominio],
    ['Canceladas/denegadas escrituradas', r.canceladasEscrituradas],
    ['Notas que precisam de conferência manual', r.comDivergencia + r.revisaoManual],
    ['Chaves inválidas no Automais', r.chavesInvalidas]
  ];
  linhasResumo.forEach(([t, n]) => {
    const row = wsR.addRow([t, n]);
    if (n) row.font = { bold: true, color: { argb: 'FFC00000' } };
  });

  const nomeia = (titulo, itens) => {
    if (!itens.length) return;
    wsR.addRow([]);
    wsR.addRow([titulo]).font = { bold: true };
    itens.forEach((t) => wsR.addRow([t]));
  };
  nomeia('Notas que precisam de conferência manual:', conferenciaManual(res).map((x) => `Nota ${x.d.nota} (série ${x.d.serie || 'vazia'}) - ${x.d.nome} - ${x.obs}`));
  nomeia('Notas que NÃO constam no Domínio:', res.soAutomais.map((a) => `Nota ${a.numero} (série ${a.serie || 'vazia'}) - ${a.nome} - ${U.fmtDate(a.data)} - R$ ${a.valor}`));
  nomeia('Notas que NÃO constam no Automais:', res.soDominio.map((d) => `Nota ${d.nota} (série ${d.serie || 'vazia'}) - ${d.nome} - ${U.fmtDate(d.data)} - R$ ${d.valor}`));
  nomeia('Canceladas/denegadas escrituradas:', res.canceladas.map((m) => `Nota ${m.d.nota} (série ${m.d.serie || 'vazia'}) - ${m.d.nome}`));

  abaLinhas(wb, 'Não constam no Domínio', 'NOTAS QUE ESTÃO NO AUTOMAIS E NÃO CONSTAM NO DOMÍNIO', res.cabAutomais, res.soAutomais.map((x) => [x.bruta]));
  abaLinhas(wb, 'Não constam no Automais', 'NOTAS QUE ESTÃO NO DOMÍNIO E NÃO CONSTAM NO AUTOMAIS', res.cabDominio, res.soDominio.map((x) => x.brutas));

  abaConferenciaManual(wb, res, conferenciaManual(res));
  abaConferenciaManual(wb, res, res.canceladas.map((m) => ({ d: m.d, a: m.a, obs: `CANCELADA/DENEGADA ESCRITURADA (${m.a.eventos})` })), 'Canceladas escrituradas', 'CANCELADAS/DENEGADAS QUE ESTÃO ESCRITURADAS NO DOMÍNIO', 'FF7030A0');

  if (res.invalidas.length) {
    aba(wb, 'Chaves inválidas', [
      ['Linha', 'l', 8], ['Chave NF', 'chave', 56], ['Emitente', 'nome', 36], ['Valor NF', 'valor', 14, MONEY], ['Motivo', 'motivo', 40]
    ], res.invalidas.map((i) => ({ l: i.linhaOrigem, chave: i.chave, nome: i.nome, valor: i.valor, motivo: i.motivo })));
  }
  return wb.xlsx.writeBuffer();
}

module.exports = { gerarRelatorio };
