const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { processar, carregarConfig } = require('./src');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const relatorios = new Map(); // id -> Buffer (somente em memoria)

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => res.json(carregarConfig()));

app.post('/api/conferir', upload.fields([{ name: 'dominio', maxCount: 1 }, { name: 'automais', maxCount: 1 }]), async (req, res) => {
  try {
    const d = req.files?.dominio?.[0];
    const a = req.files?.automais?.[0];
    if (!d || !a) return res.status(400).json({ erro: 'Envie as duas planilhas (Domínio e Automais).' });
    const { resumo, faltamNoDominio, faltamNoAutomais, revisar, xlsx } = await processar(d.buffer, a.buffer, req.body);
    const id = crypto.randomUUID();
    relatorios.set(id, Buffer.from(xlsx));
    if (relatorios.size > 20) relatorios.delete(relatorios.keys().next().value);
    res.json({ resumo, faltamNoDominio, faltamNoAutomais, revisar, id });
  } catch (e) {
    res.status(422).json({ erro: e.message });
  }
});

app.get('/api/relatorio/:id', (req, res) => {
  const buf = relatorios.get(req.params.id);
  if (!buf) return res.status(404).send('Relatório expirado.');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="conferencia_dominio_x_automais.xlsx"');
  res.send(buf);
});

const PORT = process.env.PORT || 3100;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => console.log(`Conferência de Notas Fiscais em http://${HOST}:${PORT}`));
