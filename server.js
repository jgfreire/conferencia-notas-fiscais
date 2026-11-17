const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { processar, carregarConfig } = require('./src');
const auth = require('./src/auth');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const relatorios = new Map(); // id -> { buf, usuario } (somente em memoria)
const PUB = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

// ---- publico: tela de login ----
app.get('/login.html', (req, res) => res.sendFile(path.join(PUB, 'login.html')));

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (auth.bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
  const { usuario, senha, chave } = req.body || {};
  const u = auth.verificar(usuario, senha, chave);
  if (!u) {
    auth.registrarFalha(ip);
    return res.status(401).json({ erro: 'Usuário, senha ou chave incorretos.' });
  }
  auth.limparFalhas(ip);
  auth.iniciarSessao(req, res, u);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { auth.encerrarSessao(req, res); res.json({ ok: true }); });

// ---- tudo daqui para baixo exige login ----
app.use(auth.exigirLogin);

app.get('/api/me', (req, res) => res.json({ usuario: req.sessao.usuario, admin: req.sessao.admin }));
app.get('/api/config', (req, res) => res.json(carregarConfig()));

app.post('/api/conferir', upload.fields([{ name: 'dominio', maxCount: 1 }, { name: 'automais', maxCount: 1 }]), async (req, res) => {
  try {
    const d = req.files?.dominio?.[0];
    const a = req.files?.automais?.[0];
    if (!d || !a) return res.status(400).json({ erro: 'Envie as duas planilhas (Domínio e Automais).' });
    const { resumo, faltamNoDominio, faltamNoAutomais, revisar, xlsx } = await processar(d.buffer, a.buffer, req.body);
    const id = crypto.randomUUID();
    relatorios.set(id, { buf: Buffer.from(xlsx), usuario: req.sessao.usuario });
    if (relatorios.size > 20) relatorios.delete(relatorios.keys().next().value);
    res.json({ resumo, faltamNoDominio, faltamNoAutomais, revisar, id });
  } catch (e) {
    res.status(422).json({ erro: e.message });
  }
});

app.get('/api/relatorio/:id', (req, res) => {
  const r = relatorios.get(req.params.id);
  if (!r || r.usuario !== req.sessao.usuario) return res.status(404).send('Relatório expirado.');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="conferencia_dominio_x_automais.xlsx"');
  res.send(r.buf);
});

// ---- administrador: gerenciar usuarios ----
app.get('/admin.html', (req, res) => {
  if (!req.sessao.admin) return res.redirect('/');
  res.sendFile(path.join(PUB, 'admin.html'));
});
app.get('/api/usuarios', auth.exigirAdmin, (req, res) =>
  res.json(auth.carregar().map((u) => ({ usuario: u.usuario, admin: !!u.admin }))));
app.post('/api/usuarios', auth.exigirAdmin, (req, res) => {
  try {
    const lista = auth.carregar();
    auth.criarUsuario(lista, { usuario: req.body?.usuario, senha: req.body?.senha });
    auth.salvar(lista);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ erro: e.message }); }
});
app.delete('/api/usuarios/:nome', auth.exigirAdmin, (req, res) => {
  const lista = auth.carregar();
  const alvo = lista.find((u) => auth.norm(u.usuario) === auth.norm(req.params.nome));
  if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (alvo.admin) return res.status(400).json({ erro: 'O administrador não pode ser removido.' });
  auth.salvar(lista.filter((u) => u !== alvo));
  res.json({ ok: true });
});

app.use(express.static(PUB, { index: 'index.html' }));

const PORT = process.env.PORT || 3100;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`Conferência de Notas Fiscais em http://${HOST}:${PORT}`));
