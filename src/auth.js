const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ARQ = path.join(__dirname, '..', 'data', 'usuarios.json');
const SESSAO_MS = 12 * 60 * 60 * 1000;
const sessoes = new Map(); // token -> { usuario, admin, expira }

const norm = (s) => String(s ?? '').trim().normalize('NFC').toLowerCase();

function hash(segredo, salt) {
  return crypto.scryptSync(String(segredo), salt, 64).toString('hex');
}
function iguais(a, b) {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function carregar() {
  try { return JSON.parse(fs.readFileSync(ARQ, 'utf8')); } catch { return []; }
}
function salvar(lista) {
  fs.mkdirSync(path.dirname(ARQ), { recursive: true });
  fs.writeFileSync(ARQ, JSON.stringify(lista, null, 2));
}

function criarUsuario(lista, { usuario, senha, admin = false, chave = '' }) {
  const nome = String(usuario).trim();
  if (!nome || !senha) throw new Error('Informe usuário e senha.');
  if (lista.some((u) => norm(u.usuario) === norm(nome))) throw new Error('Esse usuário já existe.');
  const salt = crypto.randomBytes(16).toString('hex');
  const u = { usuario: nome, salt, hash: hash(senha, salt), admin };
  if (admin) {
    if (!chave) throw new Error('O administrador precisa de uma chave.');
    u.chaveSalt = crypto.randomBytes(16).toString('hex');
    u.chaveHash = hash(chave, u.chaveSalt);
  }
  lista.push(u);
  return u;
}

function verificar(usuario, senha, chave) {
  const u = carregar().find((x) => norm(x.usuario) === norm(usuario));
  // calcula o hash mesmo quando o usuario nao existe (nao revela quais usuarios existem pelo tempo)
  const salt = u ? u.salt : '00'.repeat(16);
  const okSenha = iguais(hash(senha ?? '', salt), u ? u.hash : '00'.repeat(64)) && !!u;
  if (!u || !okSenha) return null;
  if (u.admin && !iguais(hash(chave ?? '', u.chaveSalt), u.chaveHash)) return null;
  return u;
}

function lerCookie(req, nome) {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(nome + '='));
  return m ? decodeURIComponent(m.slice(nome.length + 1)) : null;
}

function sessaoDe(req) {
  const t = lerCookie(req, 'sid');
  const s = t && sessoes.get(t);
  if (!s) return null;
  if (s.expira < Date.now()) { sessoes.delete(t); return null; }
  return s;
}

function iniciarSessao(req, res, u) {
  const token = crypto.randomBytes(32).toString('hex');
  sessoes.set(token, { usuario: u.usuario, admin: !!u.admin, expira: Date.now() + SESSAO_MS });
  const seguro = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSAO_MS / 1000}${seguro ? '; Secure' : ''}`);
}

function encerrarSessao(req, res) {
  const t = lerCookie(req, 'sid');
  if (t) sessoes.delete(t);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

function exigirLogin(req, res, next) {
  const s = sessaoDe(req);
  if (s) { req.sessao = s; return next(); }
  if (req.path.startsWith('/api/')) return res.status(401).json({ erro: 'Faça login.' });
  res.redirect('/login.html');
}
function exigirAdmin(req, res, next) {
  if (req.sessao?.admin) return next();
  res.status(403).json({ erro: 'Apenas o administrador.' });
}

module.exports = {
  carregar, salvar, criarUsuario, verificar, sessaoDe, iniciarSessao, encerrarSessao,
  exigirLogin, exigirAdmin, norm
};
