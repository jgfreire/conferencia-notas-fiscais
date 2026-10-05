const fuzz = require('fuzzball');
const U = require('./util');

// Palavras que aparecem em muitos nomes e nao identificam a empresa.
const GENERICAS = new Set(['E', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'EM', 'COM', 'COMERCIO', 'COMERCIAL', 'INDUSTRIA', 'INDUSTRIAL',
  'DISTRIBUIDORA', 'DIST', 'SERVICOS', 'PRODUTOS', 'BRASIL', 'CIA', 'GRUPO', 'IMPORTACAO', 'EXPORTACAO', 'IMP', 'EXP']);

function tokensIguais(x, y) {
  if (x === y) return true;
  const [c, l] = x.length <= y.length ? [x, y] : [y, x];
  return c.length >= 3 && l.startsWith(c); // abreviacao: DIST -> DISTRIBUIDORA
}

// Nome mais curto contido no mais longo (ex.: "RANCHEIRO" x "CAFE RANCHEIRO AGRO INDUSTRIAL"),
// considerando abreviacoes e ignorando palavras genericas.
function coberturaDeNomes(a, b) {
  const sig = (s) => s.split(' ').filter((t) => t && !GENERICAS.has(t));
  const ta = sig(a), tb = sig(b);
  if (!ta.length || !tb.length) return 0;
  const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const casados = curto.filter((t) => longo.some((u) => tokensIguais(t, u))).length;
  return (casados / curto.length) * 100;
}

function similaridade(a, b, metodo) {
  if (!a || !b) return 0;
  const fn = fuzz[metodo] || fuzz.token_sort_ratio;
  return Math.max(fn(a, b), coberturaDeNomes(a, b));
}

function chaveEspecie(s) {
  return U.semAcentos(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function conferirCampos(d, a, cfg) {
  const div = [];

  const dif = U.r2(d.valor - a.valor);
  if (a.valor === null) div.push('Valor NF ausente no Automais');
  else if (Math.abs(dif) > cfg.toleranciaValor + 1e-9) div.push('Valor');

  if (!a.data) div.push('Data de emissão ausente no Automais');
  else {
    const dias = U.diasEntre(d.data, a.data);
    if (dias < 0) div.push('Entrada anterior à emissão');
    else if (dias > cfg.diasMaximosEntreEmissaoEEntrada) div.push(`Entrada ${dias} dias após a emissão`);
  }

  const esperado = cfg.equivalenciaEspecieModelo[chaveEspecie(d.especie)];
  if (!esperado) div.push(`Espécie "${d.especie}" sem equivalência`);
  else if (esperado !== a.modeloChave) div.push('Espécie x Modelo');
  const modInf = a.modeloInformado
    ? (cfg.equivalenciaEspecieModelo[chaveEspecie(a.modeloInformado)] || U.normNumero(a.modeloInformado))
    : '';
  if (modInf && modInf !== a.modeloChave) div.push('Modelo NF difere do modelo da chave');

  if (d.uf !== a.ufChave) div.push('UF');
  if (!a.cnpjConfere) div.push('CNPJ Emitente difere do CNPJ da chave');
  return div;
}

function conferir(domTodas, aut, cfg) {
  // so entram no cruzamento as especies listadas (36 = NF-e); servicos, saidas etc. ficam de fora
  const aceitas = new Set(cfg.especiesConferidas.map(chaveEspecie));
  const dom = { ...domTodas, notas: domTodas.notas.filter((d) => aceitas.has(chaveEspecie(d.especie))) };
  const foraDoEscopo = domTodas.notas.length - dom.notas.length;
  const porNumero = new Map();
  for (const a of aut.notas) {
    if (!porNumero.has(a.numero)) porNumero.set(a.numero, []);
    porNumero.get(a.numero).push(a);
  }

  // candidatos de cada nota do Dominio
  const infos = dom.notas.map((d) => {
    const cands = [];
    for (const a of porNumero.get(d.nota) || []) {
      if (d.serie && a.serie && d.serie !== a.serie) continue;
      const serieVazia = !d.serie || !a.serie;
      cands.push({ a, serieVazia, sim: similaridade(d.nomeNorm, a.nomeNorm, cfg.metodoSimilaridade) });
    }
    return { d, cands, boas: cands.filter((c) => c.sim >= cfg.similaridadeMinima) };
  });
  // quem tem menos opcoes resolve primeiro (evita que um ambiguo "roube" a nota de outro)
  infos.sort((x, y) => x.boas.length - y.boas.length);

  const usados = new Set();
  const casados = [];
  const revisao = [];
  const soDominio = [];
  const emRevisao = new Set();

  for (const { d, cands, boas } of infos) {
    const livres = boas.filter((c) => !usados.has(c.a));
    if (livres.length) {
      let escolhido = livres[0];
      let criterio = 'Número + Série + Fornecedor';
      let motivoRev = null;
      if (livres.length > 1) {
        const ord = livres
          .map((c) => ({ ...c, dv: Math.abs(d.valor - (c.a.valor ?? Infinity)) }))
          .sort((x, y) => x.dv - y.dv || y.sim - x.sim);
        escolhido = ord[0];
        criterio += ' (desempate por valor)';
        if (Math.abs(ord[1].dv - ord[0].dv) < 0.005) {
          motivoRev = `Empate: ${livres.length} correspondências com o mesmo valor`;
          for (const c of livres) emRevisao.add(c.a);
          revisao.push({ d, motivo: motivoRev, candidatos: ord });
          continue;
        }
      }
      if (escolhido.serieVazia) criterio = 'Número + Fornecedor (série vazia em um dos lados)';
      usados.add(escolhido.a);
      casados.push({ d, a: escolhido.a, sim: escolhido.sim, criterio, serieVazia: escolhido.serieVazia });
      continue;
    }
    const meio = cands
      .filter((c) => !usados.has(c.a) && c.sim >= cfg.similaridadeRevisao && c.sim < cfg.similaridadeMinima)
      .sort((x, y) => y.sim - x.sim);
    if (meio.length) {
      for (const c of meio) emRevisao.add(c.a);
      revisao.push({
        d,
        motivo: `Similaridade do nome entre ${cfg.similaridadeRevisao}% e ${cfg.similaridadeMinima}%`,
        candidatos: meio
      });
      continue;
    }
    // mesmo numero, serie e valor, mas nome muito diferente (ex.: razao social x nome fantasia): nao e "falta", e revisao
    const mesmoValor = cands
      .filter((c) => !usados.has(c.a) && !emRevisao.has(c.a) && c.a.valor !== null && Math.abs(c.a.valor - d.valor) <= cfg.toleranciaValor + 1e-9)
      .sort((x, y) => y.sim - x.sim);
    if (mesmoValor.length) {
      for (const c of mesmoValor) emRevisao.add(c.a);
      revisao.push({ d, motivo: 'Mesmo número, série e valor, nome diferente', candidatos: mesmoValor });
      continue;
    }
    soDominio.push(d);
  }

  const soAutomais = aut.notas.filter((a) => !usados.has(a) && !emRevisao.has(a));

  const divergentes = [];
  const canceladas = [];
  let conferidasOk = 0;
  const palavras = cfg.palavrasEventoCancelamento;
  for (const m of casados) {
    const divs = conferirCampos(m.d, m.a, cfg);
    if (m.serieVazia) divs.unshift('Série vazia: cruzado por Número + Fornecedor');
    const ev = U.semAcentos(m.a.eventos).toUpperCase();
    if (palavras.some((p) => ev.includes(p))) canceladas.push(m);
    if (divs.length) divergentes.push({ ...m, divs });
    else if (!canceladas.includes(m)) conferidasOk++;
  }

  const resumo = {
    totalDominio: dom.notas.length,
    totalAutomais: aut.notas.length,
    cruzadas: casados.length,
    conferidasOk,
    comDivergencia: divergentes.length,
    revisaoManual: revisao.length,
    soDominio: soDominio.length,
    soAutomais: soAutomais.length,
    canceladasEscrituradas: canceladas.length,
    chavesInvalidas: aut.invalidas.length,
    automaisDuplicadas: aut.duplicadas,
    foraDoEscopo,
    linhasDominioIgnoradas: dom.ignoradas
  };
  return { cabDominio: domTodas.cabecalho, cabAutomais: aut.cabecalho, resumo, casados, divergentes, canceladas, revisao, soDominio, soAutomais, invalidas: aut.invalidas };
}

// Notas que precisam de conferencia manual: divergencias + correspondencias incertas.
function conferenciaManual(res) {
  const lista = res.divergentes.map((m) => ({ d: m.d, a: m.a, obs: m.divs.join('; ') }));
  for (const x of res.revisao) {
    lista.push({ d: x.d, a: x.candidatos[0].a, obs: 'Correspondência incerta: confirmar se é a mesma nota' });
  }
  return lista;
}

module.exports = { conferir, conferenciaManual };
