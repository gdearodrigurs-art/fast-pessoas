# Layout OLAC — arquivo de folha para a contabilidade (v1)

> Decisão E4 do [docs/20-decisoes-para-a-cadeia.md](../20-decisoes-para-a-cadeia.md):
> em vez de esperar o layout da OLAC/Castor, **o layout é NOSSO** — nós o
> definimos e publicamos junto do arquivo, e a OLAC se adapta para importá-lo.
> **O retorno deles entra no MESMO layout.** Este documento é a fonte
> publicável; as outras duas cópias da regra (que têm que dizer o mesmo) são o
> módulo `fast-pessoas/src/dominios/folha/olac.ts` (o código que gera e lê) e o
> cabeçalho das rotas `exportar-olac`/`importar-olac`.

## O arquivo

- **CSV em UTF-8 (sem BOM)**, quebra de linha `\n`, separador **`;`**.
- **Uma linha de cabeçalho** fixa (a primeira), depois **uma linha por
  colaborador × rubrica** da competência.
- Nome do arquivo na ida: `olac-folha-AAAA-MM.csv` (ex.: `olac-folha-2026-08.csv`).
- Campos de texto nunca contêm `;` (na geração o separador vira espaço).

## As 9 colunas

```
competencia;empresa_cnpj;matricula;colaborador;rubrica;rubrica_nome;natureza;conta_contabil;valor
```

| # | Coluna | Regra | Chave na volta? |
|---|--------|-------|------------------|
| 1 | `competencia` | `MM/AAAA` (ex.: `08/2026`) | **sim** — precisa bater com a competência em que o retorno é importado |
| 2 | `empresa_cnpj` | 14 dígitos, sem máscara; **vazio** = linha sem apropriação de empresa | **sim** — identifica a empresa do grupo; CNPJ desconhecido rejeita a linha |
| 3 | `matricula` | matrícula do colaborador, como está no cadastro | **sim** — é a chave da pessoa; desconhecida marca a linha `sem_colaborador` |
| 4 | `colaborador` | nome completo | não (informativo) |
| 5 | `rubrica` | código de **4 dígitos** do catálogo de rubricas do Fast Pessoas | **sim** — é a chave da verba; desconhecido marca a linha `sem_rubrica` |
| 6 | `rubrica_nome` | nome da rubrica | não (informativo) |
| 7 | `natureza` | `provento` \| `desconto` \| `informativa` | não (informativo) |
| 8 | `conta_contabil` | conta do de-para rubrica → conta contábil **vigente na competência**; **vazio** = rubrica ainda sem de-para | não (informativo na volta) |
| 9 | `valor` | reais, **vírgula decimal, sempre 2 casas, sem separador de milhar** (ex.: `3500,00`); **sempre positivo** — o sinal é dado pela natureza | **sim** — é o valor conciliado |

## Exemplo

```
competencia;empresa_cnpj;matricula;colaborador;rubrica;rubrica_nome;natureza;conta_contabil;valor
08/2026;11222333000181;1042;Maria da Silva;1001;Salário Base;provento;3.1.1.01.001;3500,00
08/2026;11222333000181;1042;Maria da Silva;2001;Desconto INSS;desconto;2.1.4.02.001;308,42
08/2026;11222333000181;1042;Maria da Silva;3001;FGTS;informativa;;280,00
```

## A volta (retorno da OLAC)

- Mesmas colunas, mesma ordem, mesmo separador. A importação lê **as chaves**
  (`competencia`, `empresa_cnpj`, `matricula`, `rubrica`) **e o `valor`**; as
  colunas informativas são aceitas como vierem.
- Na leitura o `valor` é tolerante: aceita `3.500,00`, `3500.00` e `R$ 3.500,00`
  além do formato canônico. Na geração sai **sempre** canônico (`3500,00`) — é
  isso que garante a ida-e-volta byte-idêntica.
- **Linha ruim nunca aborta o arquivo**: ela vira rejeição com motivo no
  relatório do lote (formato inválido, competência trocada, CNPJ que não é do
  grupo) e o resto entra.
- O que entra vira **espelho de conciliação** (somente-leitura — nunca item de
  folha), linha a linha com a situação: `casada`, `sem_rubrica` (código não
  encontrado no catálogo da competência) ou `sem_colaborador` (matrícula não
  encontrada).
- **Reimportar o retorno da mesma competência+empresa substitui** o espelho
  anterior daquela empresa — corrigir é mandar o arquivo corrigido de novo.

## Versão

- **v1** (2026-08): 9 colunas acima. Mudança de layout é versão nova DESTE
  documento + do módulo `olac.ts`, nunca mudança silenciosa.
