# Plano de rubricas do Diego — o que entrou, o que ficou, o que falta

> Fonte: `Cópia de rubricas-e-importadores-para-o-diego preencv2.xlsx` (Diego, 12/08/2026),
> a resposta da **pendência #5**. Este documento é a leitura fiel dela dentro do repo — a
> planilha vive no Downloads, some; a decisão fica aqui.

O Diego preencheu **~51 rubricas** (além das 6 de exemplo que já estavam no sistema), cada uma
com natureza, incidências (INSS/IRRF/FGTS), tipo de cálculo e observação. **Achado central:** os
códigos que ele usou são os **reais do sistema de folha atual da Fast** (`00S1FO`, `01H1FO`,
`5031`…), não o esquema-exemplo (`1001`, `1301`). Isso é ótimo para casar com os importadores, mas
cria uma reconciliação com os placeholders que já existem.

---

## 1 · O que ENTROU agora — migration `0069` (catálogo seguro)

Rubricas **novas**, de `valor_informado` (o valor chega apurado, o motor não recalcula), com
incidência inequívoca e código livre. Não tocam em nada que já existe nem em folha já calculada —
só ficam disponíveis para o DP lançar. Verificado: as 9 nasceram `ativa`, total de rubricas 18 → 27.

| Código | Nome | Natureza | INSS | IRRF | FGTS |
|---|---|---|:--:|:--:|:--:|
| 0119 | Triênio | provento | ✔ | ✔ | ✔ |
| 0227 | Empréstimo eConsignado em Folha | desconto | — | — | — |
| 05D2FO | Desconto Refeição | desconto | — | — | — |
| 05D6FO | Desc. VT Não Utilizado | desconto | — | — | — |
| 5031 | ASSIM SAUDE | desconto | — | — | — |
| 5033 | ASSIM SAUDE DEPENDENTES | desconto | — | — | — |
| 5034 | AMIL SAÚDE | desconto | — | — | — |
| 5035 | AMIL SAÚDE DEPENDENTE | desconto | — | — | — |
| ZA25FO | Desc de Dano a Equipe | desconto | — | — | — |

---

## 2 · O que FICOU DE FORA (e por quê) — precisa de gente

### 2a · Decisão de código: duplicatas — ✅ DECIDIDO (adotar os reais), execução ACOPLADA aos importadores
O Diego trouxe, com **código real**, rubricas que o sistema já tem como **placeholder**.
**Decisão do dono (12/08/2026): adotar os códigos reais e aposentar os placeholders.**

**Mas a execução NÃO é um `INSERT` — é mudança de risco no motor de folha, e por isso vai junto dos
importadores (não agora):**
- **4 das 7 são códigos DO MOTOR** (`esquemas.ts` → `CODIGOS_DO_MOTOR`): `1001` Salário Base,
  `1101` HE 50%, `1102` HE 100%, `2001` INSS. Trocar exige editar as **constantes do motor**
  (`CODIGO_SALARIO_BASE` etc.) e **reverificar a folha inteira** (recalcular e provar centavo a
  centavo que nada mudou). Encerrar uma dessas sem trocar a constante *derruba o cálculo da
  competência* (o próprio código avisa).
- **As 3 restantes** (`1303` DSR, `1401` Abono, `1501` Salário Família) são catálogo, mas o
  **semeador `db/semear/10-folha-sst.js` lança nelas** — aposentá-las exige atualizar o semeador e
  re-semear a demo, senão o próximo `db:demo` quebra.
- **O retorno de adotar os reais é casar com os arquivos de importação** — que é justamente o que
  foi adiado. Fazer agora é risco no motor sem o ganho. **Recomendação: executar como UM passo
  cuidadoso junto dos importadores**, com re-verificação completa da folha.

| Rubrica do Diego | Placeholder atual | Motor? |
|---|---|:--:|
| `00S1FO` Salário Base | `1001` Salário Base | ⚠️ sim |
| `01H1FO` Hora Extra 50% | `1101` Horas Extras 50% | ⚠️ sim |
| `01H2FO` Hora Extra 100% | `1102` Horas Extras 100% | ⚠️ sim |
| `0088` INSS | `2001` Desconto INSS | ⚠️ sim |
| `0082`/`0084` DSR | `1303` DSR | não (semeador) |
| `0086` Salário Família | `1501` Salário Família | não (semeador) |
| `0060` Abono Pecuniário | `1401` Abono Pecuniário | não (semeador) |

| Rubrica do Diego | Placeholder atual |
|---|---|
| `00S1FO` Salário Base | `1001` Salário Base |
| `01H1FO` Hora Extra 50% | `1101` Horas Extras 50% |
| `01H2FO` Hora Extra 100% | `1102` Horas Extras 100% |
| `0082` DSR / `0084` DSR Horista | `1303` DSR |
| `0086` Salário Família | `1501` Salário Família |
| `0060` Abono Pecuniário | `1401` Abono Pecuniário |
| `0088` INSS | `2001` Desconto INSS |

### 2b · Incidência a validar (DP/contador)
| Código | Nome | Dúvida |
|---|---|---|
| 0136 | Férias | Gozadas incidem (Sim); indenizadas na rescisão não (Não). Depende do caso. |
| 0137 | Adicional de Férias | Idem — 1/3 de gozadas = Sim; de indenizadas = Não. |
| 0087 | Salário Maternidade | Distinção de INSS após o Tema 72/STF; o Diego pediu para validar o objetivo da coluna. |

### 2c · Parâmetro faltando (o percentual não veio)
| Código | Nome | Falta |
|---|---|---|
| ZE24FO | Adicional Periculosidade | O `%` (geralmente 30% do salário — confirmar). |
| 5000FO | Vale Transporte 1% | O `%` do desconto (limite legal de 6%, ou o que a Fast pratica). |

### 2d · Pergunta embutida
- `ZBHJFO` **Aluguel Moto** — incide se for contraprestação habitual; não incide se for reembolso
  comprovado. O Diego marcou Não/Não/Não (assumindo reembolso). Confirmar o caso da Fast.
- `1302` **Reflexo de Comissão** — sobre QUAIS verbas a Fast calcula o reflexo (13º, férias, aviso)?
  (já era pergunta aberta desde a 0028.)

### 2e · Motor de cálculo (épico à parte — não é catálogo)
~30 rubricas de **férias, rescisão e 13º** vieram marcadas "Automático (o sistema calcula)". Isso é
a *expectativa* de que o motor produza a verba. O motor de hoje fecha a **competência mensal**
(salário, INSS, IRRF, FGTS, ponto). Rescisão completa, férias e 13º com tributação própria são um
**motor à parte** — listar a rubrica não faz o cálculo existir. Exemplos: 0008–0018 (férias
vencidas, 13º), 0041–0067 (férias no mês), 0078/0002/0015 (rescisão), 0024/0056 (INSS de 13º e
férias), 30D4FO (adiantamento de férias). `0138` 13º Salário entra aqui (tributação separada), e
`01H0FO` Salário Horista Intermitente pede um olhar sobre tipo de contrato.

---

## 3 · Importadores — NÃO vieram

O Diego preencheu só a **linha de exemplo** (Comissões do mês) na aba Importadores. Nenhum
importador real foi descrito. Sem isso não dá para escrever os leitores de arquivo. É o que ainda
falta dele para a folha ler valores apurados de fora (comissões, variáveis, descontos). Para cada
arquivo precisamos: fonte, formato, como identifica a pessoa, colunas na ordem, frequência, e uma
linha de exemplo.

---

## 4 · Status da pendência #5

**Parcialmente resolvida.** Catálogo seguro (0069) + rodada 2 (0070) dentro. Continuam abertos, com
o Diego/DP: a decisão de código (2a), o motor de férias/rescisão/13º (2e) e — o maior — a **aba
Importadores** (3, ainda em branco). Folha de confirmação: `docs/confirmacao-rubricas-diego.xlsx`.

---

## 5 · Rodada 2 — respostas do Diego (12/08/2026, 16h)

O Diego devolveu a folha de confirmação (`confirmacao-rubricas-diego2.xlsx`). O que ele respondeu:

**ENTROU — migration `0070`** (3 rubricas que as respostas tornaram inequívocas e cabem no motor):

| Código | Nome | Natureza | INSS | IRRF | FGTS | Cálculo |
|---|---|---|:--:|:--:|:--:|---|
| ZBHJFO | Aluguel Moto | provento | — | — | — | valor informado |
| ZE24FO | Adicional Periculosidade | provento | ✔ | ✔ | ✔ | **30% do salário** |
| 5000FO | Vale Transporte 1% | desconto | — | — | — | **1% do salário** |

> ⚠️ **Armadilha de unidade evitada:** o Diego mandou os percentuais como FRAÇÃO (0,3 e 0,01), mas o
> motor usa PERCENTUAL (30 = 30%, 1 = 1%). Gravado 30 e 1 — 0,3 faria a periculosidade sair 100× menor.

**RESPONDIDO mas fica PARKEADO (registrado para o motor):**
- **0087 Salário Maternidade** — incidência agora conhecida: **INSS não, IRRF sim, FGTS sim**. É
  benefício "automático"; a decisão valor_informado × motor fica com o épico de cálculo.
- **0136 Férias / 0137 Adicional de Férias** — regra do Diego: *"as férias só têm incidência quando
  são GOZADAS. Férias vencidas de quem é desligado são pagas na rescisão SEM incidência (não foram
  gozadas)."* Ou seja, a rubrica genérica não tem uma incidência fixa — quem decide é o **motor de
  férias/rescisão**, pela rubrica ESPECÍFICA de cada caso (gozada incide: 0041/0052; indenizada não:
  0009/0081/0012). É a razão de 0136/0137 não virarem linha de catálogo com flag fixa.
- **1302 Reflexo de Comissão** — o reflexo incide sobre: **férias, saldo de salário, 13º, aviso
  prévio, horas extras e DSR** (insumo para o cálculo do reflexo; a incidência da 1302 já é salarial).

**DECIDIDO pelo dono (12/08/2026), execução adiada:**
- **Códigos (aba 1-Codigos)** — o dono decidiu **adotar os reais**. Execução vai **junto dos
  importadores** (é mudança de risco no motor; ver §2a).
- **Importadores (aba 5)** — o dono pediu para **deixar como pendência**, não construir agora. Só o
  exemplo foi preenchido; sem isso os leitores de arquivo não têm o que ler. **É a maior lacuna que
  resta para a folha real** — e o gatilho para, no mesmo passo, adotar os códigos reais (§2a).
