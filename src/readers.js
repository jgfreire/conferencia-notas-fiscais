const XLSX = require('xlsx');
const U = require('./util');

// Alguns .xls (ex.: exportados pelo Dominio) gravam errado o deslocamento das abas no registro
// BoundSheet, e o leitor devolve a planilha vazia. Aqui o deslocamento e recalculado pelas posicoes reais.
function lerWorkbook(buffer) {
  const opts = { raw: true };
  if (buffer.length > 8 && buffer.readUInt32BE(0) === 0xd0cf11e0) {
    try {
      const cfb = XLSX.CFB.read(buffer, { type: 'buffer' });
      const entrada = XLSX.CFB.find(cfb, 'Workbook') || XLSX.CFB.find(cfb, 'Book');
      if (entrada && entrada.content) {
        const w = entrada.content;
        const bound = [];
        const bofs = [];
        for (let p = 0; p + 4 <= w.length;) {
          const t = w.readUInt16LE(p);
          const len = w.readUInt16LE(p + 2);
          if (t === 0x85) bound.push(p);
          if (t === 0x809 && p > 0) {
            const dt = w.readUInt16LE(p + 6);
            if (dt === 0x10 || dt === 0x20 || dt === 0x40) bofs.push(p);
          }
          p += 4 + len;
        }
        bound.forEach((q, i) => { if (bofs[i] !== undefined) w.writeUInt32LE(bofs[i], q + 4); });
        return XLSX.parse_xlscfb(cfb, opts);
      }
    } catch (e) { /* cai para a leitura padrao */ }
  }
  return XLSX.read(buffer, { type: 'buffer', ...opts });
}

// Todas as abas, cada uma como matriz de linhas.
function lerAbas(buffer) {
  const wb = lerWorkbook(buffer);
  return wb.SheetNames.filter((n) => wb.Sheets[n]).map((n) => ({
    nome: n,
    linhas: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: false })
  }));
}

// Indice da coluna: nome exato primeiro, depois "comeca com/contem" (ex.: "VALOR CONTABIL R$").
function achar(hs, ...nomes) {
  for (const n of nomes) { const i = hs.indexOf(n); if (i >= 0) return i; }
  for (const n of nomes) { const i = hs.findIndex((h) => h && (h.startsWith(n + ' ') || h.includes(n))); if (i >= 0) return i; }
  return -1;
}

// O cabecalho pode estar em qualquer linha de qualquer aba: pontua cada linha pelas colunas
// reconhecidas e escolhe a melhor (as obrigatorias precisam ser todas encontradas).
function acharCabecalho(abas, obrigatorias, opcionais) {
  let melhor = null;
  for (const aba of abas) {
    for (let i = 0; i < aba.linhas.length; i++) {
      const hs = aba.linhas[i].map(U.normHeader);
      if (hs.filter(Boolean).length < 3) continue;
      const okObr = obrigatorias.filter((o) => achar(hs, ...o) >= 0).length;
      if (okObr < obrigatorias.length) continue;
      const score = okObr + opcionais.filter((o) => achar(hs, ...o) >= 0).length;
      if (!melhor || score > melhor.score) melhor = { linhas: aba.linhas, idx: i, hs, score, aba: aba.nome };
    }
  }
  return melhor;
}

function erroCabecalho(sistema, abas, esperado) {
  const amostra = abas.flatMap((a) => a.linhas.slice(0, 3)).map((l) => l.filter((x) => x !== '').slice(0, 8).join(' | ')).filter(Boolean).slice(0, 3);
  return new Error(`${sistema}: não achei a linha de cabeçalho em nenhuma aba (esperado: ${esperado}). Primeiras linhas lidas: ${amostra.join(' // ') || '(planilha vazia)'}`);
}

function lerDominio(buffer, cfg) {
  const abas = lerAbas(buffer);
  const cab = acharCabecalho(abas, [['NOTA'], ['FORNECEDOR'], ['VALOR CONTABIL']], [['SERIE'], ['ESPECIE'], ['DATA'], ['UF'], ['CFOP']]);
  if (!cab) throw erroCabecalho('Domínio', abas, 'Nota, Fornecedor, Valor Contábil');
  const { hs, linhas } = cab;
  // "Codigo" aparece duas vezes: 1a = lancamento, 2a = fornecedor (por posicao).
  const codigos = hs.map((h, i) => (h === 'CODIGO' ? i : -1)).filter((i) => i >= 0);
  const c = {
    codLanc: codigos[0] ?? -1,
    codForn: codigos[1] ?? -1,
    data: achar(hs, 'DATA'),
    nota: achar(hs, 'NOTA'),
    serie: achar(hs, 'SERIE'),
    especie: achar(hs, 'ESPECIE'),
    fornecedor: achar(hs, 'FORNECEDOR'),
    cfop: achar(hs, 'CFOP'),
    uf: hs.indexOf('UF'),
    valor: achar(hs, 'VALOR CONTABIL')
  };
  const grupos = new Map();
  let ignoradas = 0;
  for (let i = cab.idx + 1; i < linhas.length; i++) {
    const l = linhas[i];
    const nota = U.normNumero(l[c.nota]);
    const nome = String(l[c.fornecedor] ?? '').trim();
    const valor = U.parseMoney(l[c.valor]);
    const data = U.parseDate(l[c.data]);
    // cabecalhos repetidos, quebras de pagina e totalizadores nao tem nota+fornecedor+data
    if (!nota || !nome || !data || valor === null) { ignoradas++; continue; }
    const serie = U.normSerie(l[c.serie]);
    const nomeNorm = U.normNome(nome, cfg.sufixosEmpresa);
    const k = `${nota}|${serie}|${nomeNorm}`;
    let g = grupos.get(k);
    if (!g) {
      g = {
        linhaOrigem: i + 1,
        codLancamento: l[c.codLanc] ?? '',
        codFornecedor: l[c.codForn] ?? '',
        data, nota, serie, nome, nomeNorm,
        especie: String(l[c.especie] ?? '').trim(),
        uf: String(l[c.uf] ?? '').trim().toUpperCase(),
        cfops: new Set(),
        valor: 0,
        linhas: 0,
        brutas: []
      };
      grupos.set(k, g);
    }
    g.brutas.push(l);
    g.valor = U.r2(g.valor + valor);
    g.linhas++;
    if (l[c.cfop] !== '' && l[c.cfop] != null) g.cfops.add(String(l[c.cfop]));
  }
  return { notas: [...grupos.values()], ignoradas, cabecalho: linhas[cab.idx] };
}

function lerAutomais(buffer, cfg) {
  const abas = lerAbas(buffer);
  const cab = acharCabecalho(abas, [['CHAVE NF', 'CHAVE'], ['VALOR NF', 'VALOR']], [['NUMERO NF'], ['MODELO NF'], ['DATA EMISSAO', 'EMISSAO'], ['CNPJ EMITENTE'], ['NOME EMITENTE'], ['EVENTOS']]);
  if (!cab) throw erroCabecalho('Automais', abas, 'Chave NF, Valor NF');
  const { hs, linhas } = cab;
  const c = {
    chave: achar(hs, 'CHAVE NF', 'CHAVE'), numero: achar(hs, 'NUMERO NF'), modelo: achar(hs, 'MODELO NF'), valor: achar(hs, 'VALOR NF', 'VALOR'),
    data: achar(hs, 'DATA EMISSAO', 'EMISSAO'), cnpj: achar(hs, 'CNPJ EMITENTE'), nome: achar(hs, 'NOME EMITENTE'),
    tags: hs.findIndex((h) => h.startsWith('TAGS')), eventos: achar(hs, 'EVENTOS')
  };
  const notas = [];
  const invalidas = [];
  const vistas = new Set();
  let duplicadas = 0;
  for (let i = cab.idx + 1; i < linhas.length; i++) {
    const l = linhas[i];
    const chaveRaw = String(l[c.chave] ?? '').trim();
    if (!chaveRaw && !String(l[c.nome] ?? '').trim()) continue;
    const chave = U.normCnpj(chaveRaw);
    const base = {
      linhaOrigem: i + 1,
      bruta: l,
      chave: chaveRaw,
      nome: String(l[c.nome] ?? '').trim(),
      valor: U.parseMoney(l[c.valor]),
      data: U.parseDate(l[c.data]),
      cnpj: U.normCnpj(l[c.cnpj]),
      tags: c.tags >= 0 ? String(l[c.tags] ?? '').trim() : '',
      eventos: c.eventos >= 0 ? String(l[c.eventos] ?? '').trim() : '',
      modeloInformado: String(l[c.modelo] ?? '').trim(),
      numeroInformado: U.normNumero(l[c.numero])
    };
    base.nomeNorm = U.normNome(base.nome, cfg.sufixosEmpresa);
    if (chave.length !== 44) {
      invalidas.push({ ...base, motivo: `Chave com ${chave.length} posições (esperado 44)` });
      continue;
    }
    if (vistas.has(chave)) { duplicadas++; continue; }
    vistas.add(chave);
    const ufCod = parseInt(chave.slice(0, 2), 10);
    const nChave = U.normNumero(chave.slice(25, 34));
    notas.push({
      ...base,
      ufChave: U.UF_IBGE[ufCod] || `?${chave.slice(0, 2)}`,
      cnpjChave: chave.slice(6, 20),
      modeloChave: chave.slice(20, 22),
      serie: U.normSerie(chave.slice(22, 25)),
      numero: base.numeroInformado || nChave,
      numeroChave: nChave,
      cnpjConfere: !base.cnpj || base.cnpj === chave.slice(6, 20)
    });
  }
  return { notas, invalidas, duplicadas, cabecalho: linhas[cab.idx] };
}

module.exports = { lerDominio, lerAutomais };
