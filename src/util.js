const UF_IBGE = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
  21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
  31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
  41: 'PR', 42: 'SC', 43: 'RS',
  50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
};

function semAcentos(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Remove apenas pontuacao/espacos; letras sao mantidas (CNPJ alfanumerico).
function normCnpj(s) {
  return semAcentos(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normHeader(s) {
  return semAcentos(s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function normNumero(s) {
  const d = String(s ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return d;
}

function normSerie(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  const d = t.replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^0+(?=.)/, '');
  return d;
}

function normNome(s, sufixos) {
  let t = semAcentos(s ?? '').toUpperCase();
  t = t.replace(/\bS\s*[\/.]\s*A\b\.?/g, ' SA ');
  t = t.replace(/[^A-Z0-9]+/g, ' ').trim();
  const set = new Set(sufixos);
  let toks = t.split(' ').filter(Boolean);
  while (toks.length > 1 && set.has(toks[toks.length - 1])) toks.pop();
  return toks.join(' ');
}

function parseMoney(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  let t = String(v).trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}

function utcDay(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

// Retorna Date em UTC (meia-noite) ou null.
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return utcDay(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    return new Date(Math.floor(Date.UTC(1899, 11, 30) / 86400000 + v) * 86400000);
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return utcDay(y, +m[2], +m[1]);
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return utcDay(+m[1], +m[2], +m[3]);
  return null;
}

function fmtDate(d) {
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function diasEntre(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

const r2 = (n) => Math.round(n * 100) / 100;

module.exports = {
  UF_IBGE, semAcentos, normCnpj, normHeader, normNumero, normSerie, normNome,
  parseMoney, parseDate, fmtDate, diasEntre, r2
};
