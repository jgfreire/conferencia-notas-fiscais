// Gera planilhas sinteticas cobrindo os cenarios da especificacao e valida o resultado.
const XLSX = require('xlsx');
const assert = require('assert');
const { processar } = require('../src');
const { lerDominio, lerAutomais } = require('../src/readers');
const { carregarConfig } = require('../src');
const { conferir } = require('../src/engine');

const pad = (v, n) => String(v).padStart(n, '0');
const chave = (uf, cnpj, mod, serie, num) =>
  pad(uf, 2) + '2609' + cnpj + pad(mod, 2) + pad(serie, 3) + pad(num, 9) + '1' + '12345678' + '0';

const CAB_DOM = ['Código', 'Data', 'Nota', 'Série', 'Espécie', 'Código', 'Fornecedor', 'CFOP', 'AC.', 'UF', 'Valor Contábil',
  'Tipo', 'Base Cálculo', 'Alíq.', 'Valor', 'Isentas', 'Outras'];
const dom = (cod, data, nota, serie, esp, forn, cfop, uf, vc) =>
  [cod, data, nota, serie, esp, 900 + cod, forn, cfop, '', uf, vc, '', 0, 0, 0, 0, 0];

const dominio = [
  ['LIVRO DE ENTRADAS'], [], CAB_DOM,
  dom(1, '02/09/2026', 100, '1', 'NFE', 'Alfa Comércio LTDA', 1102, 'GO', 1000),
  dom(2, '03/09/2026', 101, '1', 'NFE', 'Beta Indústria S/A', 1102, 'SP', 500),
  dom(2, '03/09/2026', 101, '1', 'NFE', 'Beta Indústria S/A', 1403, 'SP', 250.5), // multi-linha: soma 750,50
  dom(3, '04/09/2026', 102, '1', 'NFE', 'Gama Distribuidora', 1102, 'GO', 300),    // valor diverge
  dom(4, '05/09/2026', 103, '', 'NFE', 'Delta Serviços ME', 1102, 'GO', 80),       // serie vazia
  dom(5, '06/09/2026', 104, '1', 'NFE', 'Epsilon Atacadista', 1102, 'GO', 90),     // cancelada
  dom(6, '07/09/2026', 105, '1', 'NFE', 'Zeta Comercial de Alimentos', 1102, 'GO', 70), // so no Dominio
  dom(7, '08/09/2026', 106, '1', 'NFE', 'Eta Transportes Rapidos', 1102, 'GO', 60),     // revisao (nome parecido)
  dom(8, '09/09/2026', 107, '1', 'NFE', 'Teta Papelaria', 1102, 'GO', 40),             // data anterior
  dom(9, '10/09/2026', 108, '1', 'NFCE', 'Iota Mercado', 1102, 'GO', 30),              // especie x modelo
  dom(10, '11/09/2026', 109, '1', 'NFE', 'Kapa Pecas', 1102, 'MG', 20),                // UF diverge
  dom(11, '12/09/2026', 110, '1', 'NFE', 'Lambda Gas', 1102, 'GO', 10),                // empate
  ['', '', '', '', '', '', 'Total', '', '', '', 3000.5],
  CAB_DOM // cabecalho repetido (quebra de pagina)
];

const CAB_AUT = ['Chave NF', 'Numero NF', 'Modelo NF', 'Valor NF', 'Data Emissão', 'CNPJ Emitente', 'Nome Emitente', 'Tags (Etiquetas)', 'Eventos'];
const aut = (uf, cnpj, mod, serie, num, valor, data, nome, ev = '') =>
  [chave(uf, cnpj, mod, serie, num), num, mod, valor, data, cnpj, nome, '', ev];

const automais = [
  CAB_AUT,
  aut(52, '11111111000111', 55, 1, 100, 1000, '01/09/2026', 'ALFA COMERCIO LTDA'),
  aut(35, '22222222000122', 55, 1, 101, 750.5, '03/09/2026', 'BETA INDUSTRIA SA'),
  aut(52, '33333333000133', 55, 1, 102, 310, '04/09/2026', 'GAMA DISTRIBUIDORA LTDA'),
  aut(52, '44444444000144', 55, 1, 103, 80, '05/09/2026', 'DELTA SERVICOS'),
  aut(52, '55555555000155', 55, 1, 104, 90, '06/09/2026', 'EPSILON ATACADISTA', 'Cancelamento de NF-e'),
  aut(52, '77777777000177', 55, 1, 106, 60, '08/09/2026', 'ETA TRANSPORTES E LOGISTICA'),
  aut(52, '88888888000188', 55, 1, 107, 40, '12/09/2026', 'TETA PAPELARIA'),
  aut(52, '99999999000199', 55, 1, 108, 30, '10/09/2026', 'IOTA MERCADO'),
  aut(52, '10101010000110', 55, 1, 109, 20, '11/09/2026', 'KAPA PECAS'),
  aut(52, '12121212000112', 55, 1, 110, 10, '12/09/2026', 'LAMBDA GAS'),
  aut(52, '12121212000999', 55, 1, 110, 10, '12/09/2026', 'LAMBDA GAS'),
  aut(52, '13131313000113', 55, 1, 999, 55, '12/09/2026', 'SO NO AUTOMAIS LTDA'),
  ['123', '', '', 1, '12/09/2026', '', 'CHAVE CURTA', '', ''],
  aut(52, '1A1A1A1A000A1A', 55, 1, 111, 5, '12/09/2026', 'CNPJ ALFA') // CNPJ alfanumerico
];

const wbBuf = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Plan1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = { bd: () => wbBuf(dominio), ba: () => wbBuf(automais) };
if (require.main !== module) return;
(async () => {
  const bd = wbBuf(dominio), ba = wbBuf(automais);
  const cfg = carregarConfig();
  cfg.especiesConferidas.push('NFE', 'NFCE'); // o teste sintetico usa siglas em vez do codigo 36
  const D = lerDominio(bd, cfg), A = lerAutomais(ba, cfg);
  assert.strictEqual(D.notas.find((n) => n.nota === '101').valor, 750.5, 'soma multi-linha');
  assert.strictEqual(D.notas.find((n) => n.nota === '101').linhas, 2);
  assert.strictEqual(A.invalidas.length, 1, 'chave curta');
  assert.ok(A.notas.some((n) => n.cnpjChave === '1A1A1A1A000A1A'), 'CNPJ alfanumerico preservado');
  assert.strictEqual(A.notas.find((n) => n.numero === '100').ufChave, 'GO');

  const r = conferir(D, A, cfg);
  const div = (n) => r.divergentes.find((x) => x.d.nota === n)?.divs;
  console.log(r.resumo);
  assert.deepStrictEqual(div('102'), ['Valor']);
  assert.ok(div('103').some((s) => s.startsWith('Série vazia')));
  assert.ok(r.canceladas.some((m) => m.d.nota === '104'));
  assert.ok(r.soDominio.some((d) => d.nota === '105'));
  assert.ok(r.revisao.some((x) => x.d.nota === '106'));
  assert.ok(div('107').includes('Entrada anterior à emissão'));
  assert.ok(div('108').includes('Espécie x Modelo'));
  assert.deepStrictEqual(div('109'), ['UF']);
  assert.ok(!r.divergentes.some((x) => x.d.nota === '100' || x.d.nota === '101'), '100 e 101 ok');
  assert.ok(r.revisao.some((x) => x.d.nota === '110' && /Empate/.test(x.motivo)), 'empate vai para revisao');
  assert.ok(r.soAutomais.some((a) => a.numero === '999'));

  const resumo = r.resumo;
  const xlsx = await require('../src/report').gerarRelatorio(r, cfg);
  assert.ok(xlsx.byteLength > 1000);
  require('fs').writeFileSync(__dirname + '/saida_teste.xlsx', Buffer.from(xlsx));
  console.log('OK - relatório gerado:', resumo.comDivergencia, 'divergências');
})().catch((e) => { console.error(e); process.exit(1); });
