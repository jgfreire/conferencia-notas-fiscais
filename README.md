# Conferência de Notas Fiscais (Domínio x Automais)

Cruza o livro de entradas do Domínio com as notas do Automais por chave (Número + Série + Fornecedor por similaridade), nunca por posição.

## Usar
```
npm start        # http://localhost:3100
npm test         # cenários sintéticos (test/run.js)
```
Envie as duas planilhas (.xlsx/.xls/.csv) e baixe o relatório. Tudo roda local.

## Configuração
`config.json`: similaridade mínima (85) e de revisão (70), tolerância de valor (R$ 0,01), dias máx. emissão→entrada (30), tabela Espécie→Modelo, palavras de evento (CANCEL, DENEG), sufixos de empresa ignorados. Os 4 números também podem ser alterados na tela.

## Abas do relatório
Resumo · Não constam no Domínio · Não constam no Automais · Conferência manual (divergências, linha inteira das duas planilhas) · Canceladas escrituradas · Chaves inválidas.

## Decisões
- Domínio: cabeçalho localizado automaticamente; as duas colunas "Código" por posição (1ª = lançamento, 2ª = fornecedor); linhas sem nota/fornecedor/data (totais, quebras) ignoradas; várias linhas da mesma nota somam o Valor Contábil.
- Chave NF: precisa de 44 posições; CNPJ mantém letras (alfanumérico); UF por tabela IBGE.
- Similaridade de nomes: `token_sort_ratio` (fuzzball) ou nome contido no outro / abreviações (ignorando palavras genéricas). Só entram espécies de `especiesConferidas` (36 = NF-e).
- Série vazia em um lado: cruza por Número + Fornecedor e sinaliza.
- Mais de um candidato: desempate pelo valor; empate persistente vai para Conferência manual.

## Hospedar em servidor
Requer Node.js 18+.
```
git clone <repo> && cd <repo>
npm install
HOST=0.0.0.0 PORT=3100 npm start      # Windows (PowerShell): $env:HOST='0.0.0.0'; npm start
```
Por padrão escuta em 0.0.0.0 (acessível pela rede, protegido por login). Use `HOST=127.0.0.1` para restringir à própria máquina. Mantenha o servidor na rede interna. Os arquivos enviados ficam só em memória, nada é gravado em disco.

## Login
Todas as telas e a API exigem login. Usuários ficam em `data/usuarios.json` (senhas com hash, fora do git). **Em cada máquina nova**, crie o administrador antes de iniciar:
```
node scripts/criar-admin.js "<usuario>" "<senha>" "<chave do administrador>"
```
O administrador entra marcando "Sou administrador" e informando a chave; na página **Usuários** ele cria e remove usuários comuns. Sessão de 12 h; 5 erros seguidos bloqueiam o IP por 5 minutos. Atrás de HTTPS (proxy), o cookie passa a ser `Secure` automaticamente.
