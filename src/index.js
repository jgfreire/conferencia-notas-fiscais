const fs = require('fs');
const path = require('path');
const { lerDominio, lerAutomais } = require('./readers');
const { conferir, conferenciaManual } = require('./engine');
const { gerarRelatorio } = require('./report');

function carregarConfig(override = {}) {
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
  const cfg = { ...base };
  for (const k of ['similaridadeMinima', 'similaridadeRevisao', 'toleranciaValor', 'diasMaximosEntreEmissaoEEntrada']) {
    const v = override[k];
    if (v !== undefined && v !== '' && !Number.isNaN(Number(v))) cfg[k] = Number(v);
  }
  return cfg;
}

async function processar(bufDominio, bufAutomais, override) {
  const cfg = carregarConfig(override);
  const dom = lerDominio(bufDominio, cfg);
  const aut = lerAutomais(bufAutomais, cfg);
  const res = conferir(dom, aut, cfg);
  const xlsx = await gerarRelatorio(res, cfg);
  const U = require('./util');
  const faltamNoDominio = res.soAutomais.map((a) => ({ numero: a.numero, serie: a.serie, nome: a.nome, data: U.fmtDate(a.data), valor: a.valor }));
  const faltamNoAutomais = res.soDominio.map((d) => ({ numero: d.nota, serie: d.serie, nome: d.nome, data: U.fmtDate(d.data), valor: d.valor }));
  const revisar = conferenciaManual(res).map((x) => ({ numero: x.d.nota, serie: x.d.serie, nome: x.d.nome, data: U.fmtDate(x.d.data), valor: x.d.valor, obs: x.obs }));
  return { resumo: res.resumo, faltamNoDominio, faltamNoAutomais, revisar, xlsx };
}

module.exports = { processar, carregarConfig };
