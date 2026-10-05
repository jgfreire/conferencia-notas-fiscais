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
Resumo · Divergências (só notas com divergência, com critério e % de similaridade) · Canceladas escrituradas · Revisão manual · Só no Domínio · Só no Automais · Chaves inválidas.

## Decisões
- Domínio: cabeçalho localizado automaticamente; as duas colunas "Código" por posição (1ª = lançamento, 2ª = fornecedor); linhas sem nota/fornecedor/data (totais, quebras) ignoradas; várias linhas da mesma nota somam o Valor Contábil.
- Chave NF: precisa de 44 posições; CNPJ mantém letras (alfanumérico); UF por tabela IBGE.
- Similaridade: `token_sort_ratio` (fuzzball, equivalente ao rapidfuzz), configurável em `metodoSimilaridade`.
- Série vazia em um lado: cruza por Número + Fornecedor e sinaliza.
- Mais de um candidato: desempate pelo valor; empate persistente vai para Revisão manual.

## Hospedar em servidor
Requer Node.js 18+.
```
git clone <repo> && cd <repo>
npm install
HOST=0.0.0.0 PORT=3100 npm start      # Windows (PowerShell): $env:HOST='0.0.0.0'; npm start
```
Por padrão escuta só em 127.0.0.1 (apenas a própria máquina). Use `HOST=0.0.0.0` para acessar pela rede. Não há login: mantenha o servidor na rede interna ou atrás de um proxy com autenticação. Os arquivos enviados ficam só em memória, nada é gravado em disco.
