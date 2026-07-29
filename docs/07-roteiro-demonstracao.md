# Roteiro de demonstração — Fast Pessoas (≈20 minutos)

Apresentação do sistema de DP/RH ao setor de RH. Todos os dados são
**fictícios** (empresa "Fast", distribuidora de material de construção, 5
unidades, 60 ativos + 8 desligados). Nenhuma pessoa, CPF ou CNPJ da demo
existe.

---

## 0. Antes de começar (5 minutos de preparo, sozinho)

### Reset dos dados

```bash
cd "C:\sistema RH\fast-pessoas"
npm run db:demo
```

Apaga os dados de demonstração e repopula do zero. É idempotente: pode rodar
quantas vezes quiser, sempre com o mesmo resultado. Leva ~100 s. Rode **antes
de cada apresentação** — a demo é feita para ser mexida na frente do público
(aprovar demanda, calcular folha, responder check-in) e o reset devolve tudo ao
estado inicial.

> As credenciais também são regravadas em `fast-pessoas/db/semear/CREDENCIAIS-DEMO.md`.

### Suba o sistema em modo produção, não em modo desenvolvimento

```bash
npm run build
npm start          # http://localhost:3000
```

**Isto não é preciosismo.** O servidor de desenvolvimento (`npm run dev`)
compila cada tela na primeira visita; se você clicar rápido demais entre duas
telas pesadas, ele pode devolver uma página de erro ("A server error
occurred"). Reproduzi isso navegando de **Metas** para **Demandas** em modo
dev; no build de produção a mesma sequência funciona sempre. Se por algum
motivo tiver que apresentar em modo dev, **abra todas as telas do roteiro uma
vez antes de o público entrar** para deixá-las compiladas.

### Credenciais

Senha de **todos** os usuários: `FastDemo2026!`

| Papel | E-mail | Pessoa | O que mostra |
| --- | --- | --- | --- |
| diretoria | `diretora.pessoas@fastdemo.local` | Helena Marques Andrade | Rede inteira, clima, resultado da avaliação |
| dp | `dp@fastdemo.local` | Patrícia Nogueira Lima | Folha, férias, admissão, desligamento, benefícios |
| rh | `rh@fastdemo.local` | Rafael Andrade Pires | Recrutamento, metas, configuração da avaliação |
| gestor | `gestor@fastdemo.local` | Marcos Vieira Salles | Só a própria equipe (10 liderados ativos) |
| funcionario | `funcionario@fastdemo.local` | Juliana Costa Ferreira | Visão de quem só consulta e solicita |

**2FA** é obrigatório para `dp`, `rh` e `diretoria`. Código do momento:

```bash
node --env-file=.env db/codigo-2fa.js dp@fastdemo.local
```

Deixe esse terminal aberto ao lado — você vai trocar de persona 3 ou 4 vezes.
Alternativa: os QR Codes/URIs `otpauth://` estão no `CREDENCIAIS-DEMO.md` e
podem ser cadastrados no seu celular uma vez só (o segredo é determinístico —
o reset **não** invalida o que já foi lido).

### Abas para deixar pré-abertas

Uma janela por persona ajuda muito (janelas anônimas separadas, para as sessões
não se atropelarem):

1. `dp@` em `/demandas`
2. `gestor@` em `/colaboradores`
3. `funcionario@` em `/clima`

---

## 1. Abertura — o problema (1 min, sem tela)

> "Hoje a informação de pessoas da Fast está espalhada: planilha de férias,
> pasta de contratos, e-mail de solicitação, WhatsApp do gestor. Ninguém
> consegue responder rápido 'quantas férias estão vencendo?' ou 'por que este
> desconto apareceu no holerite?'. O Fast Pessoas junta isso num sistema só,
> com uma regra: **todo número tem que ser explicável e toda leitura de dado
> sensível fica registrada**."

Não abra tela ainda. Esta frase é o fio de toda a apresentação.

---

## 2. O dia do DP — a fila (3 min) · persona `dp@`

**Tela:** `/demandas` → aba **Fila do DP**
📸 `docs/demo/04-demandas-fila-do-dp.png`

O que apontar, nesta ordem:

- **18 na fila · 2 vencendo hoje · 6 atrasadas.** "Isto é o painel do DP ao
  abrir o sistema de manhã. Não é um relatório que alguém monta: é o estado
  real da fila."
- O aviso cinza: **"9 demandas aguardando aprovação do gestor — ainda fora da
  fila do DP."** "Repare: o que está travado no gestor não conta como atraso do
  DP. Cada um responde pelo seu pedaço do prazo."
- Cada cartão traz o **SLA por tipo de demanda** (declaração de vínculo 3 dias,
  informe de rendimentos 2 dias) e o selo "atrasada há 3 dias".

**Faça ao vivo:** clique em **Assumir** numa demanda atrasada. Ela sai de
"Abertas" e vai para "Em atendimento", com o seu nome como atendente.

> "O prazo não é decorativo: ele vira indicador, e o indicador vira meta. Volto
> nisso no final."

**Se perguntarem "e quem abre a demanda?"** — guarde para o bloco 6
(funcionário). Não troque de persona agora.

---

## 3. A ficha da pessoa (3 min) · persona `dp@`

**Tela:** `/colaboradores` → busque **Juliana Costa Ferreira** → aba **Linha do tempo**
📸 `docs/demo/05-ficha-colaborador-linha-do-tempo.png`

- Na lista, aponte o selo **"feedback 90d vencido"**: aparece em **8 pessoas de
  60**. "Não é enfeite — é a cadência de conversa formal que o RH definiu. Se
  aparecesse em todo mundo, não serviria de alerta nenhum."
- Abra a ficha e percorra as abas: **Dados**, **Linha do tempo**,
  **Ocorrências**, **Feedbacks/Ações**, **Administração**.
- Na **Linha do tempo**: admissão, posição inicial, férias programadas, férias
  concluídas, ASO, demandas concluídas, ocorrências, feedbacks. "É a história
  da pessoa na empresa em ordem, sem ninguém precisar montar."
- Na aba **Dados**, aponte o campo salário: **"dado sensível · leitura gravada
  na trilha"**.

> "Você acabou de ver o salário dela. O sistema registrou que **você** viu,
> **quando** e **de quem**. Não é vigilância de vocês — é o que a LGPD pede
> quando alguém questiona quem teve acesso ao dado dele."

### O momento do dado de saúde

**Deixe esta tela aberta** e anote a URL. Vamos voltar nela no bloco 5 logado
como gestor.

---

## 4. A folha — o momento mais forte (4 min) · persona `dp@`

**Tela:** `/folha` → competência **06/2026 (FECHADA)** → role até **Folhas calculadas**
📸 `docs/demo/01-folha-memoria-de-calculo.png`

- **58 folhas calculadas · R$ 231.220,85 de proventos · R$ 174.243,31 de
  líquido.**
- Clique em **Ver itens** de qualquer pessoa: salário base, horas extras,
  INSS, desconto de benefício, FGTS.
- **Abra a "Memória de cálculo" do Desconto INSS.** Deixe o público ler:

```json
{
  "formula": "progressivo faixa a faixa sobre a base limitada ao teto",
  "base_inss": 2174.74,
  "teto_contribuicao": 8565.28,
  "faixas_percorridas": [
    { "ate": 1631.00,  "aliquota": 7.5, "base_na_faixa": 1631.00, "valor": 122.325 },
    { "ate": 2933.57,  "aliquota": 9.0, "base_na_faixa":  543.74, "valor":  48.9366 }
  ],
  "valor_sem_arredondar": 171.2616,
  "valor_final": 171.26,
  "arredondamento": "meio-para-cima no centavo, só no valor final",
  "tabela_inss_versao_id": 1
}
```

> "Quando o colaborador vem perguntar 'por que descontaram R$ 171,26?', vocês
> não precisam refazer a conta na calculadora. A conta está gravada junto com o
> valor: a base, cada faixa, a alíquota, o arredondamento e **qual versão da
> tabela do INSS** foi usada. Se a tabela mudar no ano que vem, a folha de
> junho continua explicada pela tabela de junho."

Aponte também **"Salário congelado"**: o valor usado no cálculo é o da posição
vigente no momento do cálculo, não o de hoje. Aumento posterior não reescreve
folha passada.

**Depois abra a competência 07/2026 (ABERTA)**: 307 variáveis lançadas (horas
extras manuais, descontos de benefício vindos das adesões). "Esta ainda não foi
calculada. O fluxo é aberta → cálculo → conferência → aprovada → fechada. E
**fechada não reabre** — correção se faz em competência futura, como manda o
processo. É proposital: uma folha que reabre é uma folha que ninguém audita."

---

## 5. O gestor vê menos — de propósito (3 min) · persona `gestor@`

Troque para `gestor@fastdemo.local` (sem 2FA — entra direto).

- **Tela inicial:** compare com a do DP. Sumiram os cartões de Folha,
  Afastamentos, Saúde e Segurança e Desligamentos. "Não é menu escondido: se
  ele digitar a URL na mão, o sistema devolve ele para cá."
- **Faça isso ao vivo:** digite `/afastamentos` na barra de endereço. Ele volta
  para a tela inicial.
- **Tela:** `/colaboradores` → **13 linhas**: ele mesmo, 10 liderados ativos e
  2 desligados que continuam no histórico. "O DP via 60."

### O dado de saúde (o ponto que mais convence)

Abra a ficha do **Maurício Saraiva Cunha (mat. 1028)** → **Linha do tempo**.
O gestor lê:

```
EVENTO  19/05/2026   Afastamento registrado: 19/05/2026 a 21/05/2026
EVENTO  21/05/2026   Afastamento encerrado em 21/05/2026 (3 dia(s))
```

> "O gestor precisa saber que a pessoa faltou três dias, para remanejar a
> escala. Ele **não** precisa saber se foi atestado, licença médica, INSS ou
> acidente de trabalho — e não vê. O tipo do afastamento e o conteúdo clínico
> ficam cifrados, visíveis só para DP e Diretoria, com a leitura registrada."

Se quiser fechar o argumento, volte na mesma ficha logado como `dp@`: a linha
do tempo tem mais eventos (adesões a benefício) e aparece a aba
**Administração**. Mesma URL, duas pessoas, conteúdos diferentes.

- **Tela:** `/demandas` → aba **Aprovações (8)**. Aprove ou reprove uma. Ao
  reprovar, o motivo é obrigatório e vai para o histórico da demanda.
- **Sino de notificações** (canto superior direito): **7 não lidas** —
  aprovações pendentes e ciclos de avaliação abertos. "O aviso nunca traz o
  dado: diz 'você tem uma aprovação pendente' e leva para a tela, que confere a
  permissão de novo."

---

## 6. O colaborador (2 min) · persona `funcionario@`

Troque para `funcionario@fastdemo.local`.

- **Tela:** `/colaboradores` → **só a própria ficha**, com o aviso "Como
  funcionário, você acessa apenas a própria ficha. Correções cadastrais são
  solicitadas ao DP."
- **Tela:** `/ferias` → períodos aquisitivos, saldo de 60 dias, limite legal
  para gozo, e uma programação **aguardando aprovação**. Programe férias ao
  vivo: o sistema valida saldo, mínimo de 5 dias e abono de até 10 — e abre uma
  **demanda** para o gestor aprovar. "Férias não é formulário solto: entra no
  mesmo fluxo de aprovação e prazo."
- **Tela:** `/clima` → check-in do dia, dois emojis. **Responda ao vivo.**
  Aponte o aviso: *"Suas respostas individuais são visíveis apenas à Diretoria
  de Pessoas; seu gestor vê somente médias agregadas."*
- **Tela:** `/documentos` → políticas e comunicados com botão **Dar ciência**.
  Dê ciência em um. "Fica gravado o hash do documento no momento do aceite —
  se o arquivo for trocado depois, dá para provar qual versão a pessoa leu."

---

## 7. Clima — a queda que ninguém tinha visto (2 min) · persona `diretora.pessoas@`

Troque para `diretora.pessoas@fastdemo.local` (2FA).

**Tela:** `/clima/painel`
📸 `docs/demo/02-clima-queda-filial-norte.png`

- Média geral **3,9 · 1.759 respostas · 60 participantes**. "Olhando só isso,
  está tudo bem."
- Role para **Média por unidade**:

| Unidade | Média (30 d) | Últimos 7 d | Antes | Variação |
| --- | --- | --- | --- | --- |
| Filial Leste | 3,9 | 3,9 | 3,9 | +0,1 |
| **Filial Norte** | **3,6** | **2,9** | **3,8** | **−0,9** |
| Filial Oeste | 3,9 | 4,0 | 3,9 | +0,1 |
| Filial Sul | 4,0 | 4,3 | 4,0 | +0,3 |
| Matriz Centro | 4,0 | 3,9 | 4,0 | −0,1 |

> "A média da rede escondia isso. A Filial Norte caiu de 3,8 para 2,9 em uma
> semana — e a participação dela também caiu. Nenhum gestor abriu chamado; o
> sistema é que mostrou."

Aponte o rodapé: **só aparecem unidades com pelo menos 5 pessoas
respondendo**. "Abaixo disso a média deixaria de ser agregado e viraria
dedução de quem respondeu."

Se quiser ir mais fundo, a Diretoria (e só ela) tem `/clima/individual` com os
comentários — e **cada leitura fica na trilha de acesso**.

---

## 8. Avaliação 360 — a máquina recomenda, o humano decide (2 min) · persona `diretora.pessoas@`

**Tela:** `/avaliacoes` → filtre por **Decididas** → **Kleber Mendonça Barros (mat. 1051)**

- **Resultado consolidado: 30,62%** → faixa **"Plano de recuperação"**.
- **Decisão registrada: Manter na função** — com o selo **"divergente da
  recomendação"**.
- Leia a justificativa em voz alta:

> *"Resultado puxado para baixo por 47 dias de afastamento previdenciário
> dentro do período avaliado — a janela de observação do gestor foi menor que a
> dos demais. A recomendação da faixa era plano de recuperação; a decisão é
> manter na função, com acompanhamento quinzenal e nova avaliação em 90 dias."*

> "Este é o ponto onde a maioria dos sistemas de avaliação erra. A nota **não**
> decide nada sozinha. A faixa é uma recomendação; a decisão é de uma pessoa,
> tem nome, data, e **justificativa obrigatória quando diverge**. Isso protege
> o colaborador de uma nota injusta e protege a empresa numa reclamatória."

Aponte também: o **modelo v1 fica congelado na abertura do ciclo** — mudar os
pesos depois não reescreve avaliação já feita.

---

## 9. Metas e indicadores — fechando o fio (2 min) · persona `rh@`

Troque para `rh@fastdemo.local` (2FA).

**Tela:** `/metas`
📸 `docs/demo/03-metas-farois-indicadores.png`

| Indicador | Meta | Atual | Farol |
| --- | --- | --- | --- |
| % de entrevistas de desligamento realizadas | 90% | **71,4%** (5 de 7) | 🔴 |
| Adesão ao check-in diário | 70% | **69,9%** | 🔴 |
| % de admissões com documentação no prazo | 95% | **66,7%** | 🔴 |
| Períodos de férias vencidos | 0 | **5** | 🔴 |
| % de folhas fechadas no prazo | 98% | **100%** | 🟢 |
| % de vagas fechadas no prazo | 80% | **100%** | 🟢 |
| % de ativos com ASO válido | 75% | **76,7%** | 🟢 |

> "Aquele prazo da demanda do começo da apresentação, o ASO do painel de saúde,
> a entrevista de desligamento — tudo vira indicador aqui, apurado do dado
> real. Ninguém digita esses números."

Dois pontos importantes de vender:

1. **Nenhuma meta é fixa no sistema.** Clique em **Alterar meta**: o RH define.
2. **Alterar meta não sobrescreve a anterior** — cria uma nova versão com data
   de início de vigência. "Período já apurado continua avaliado pela meta que
   valia na época. Ninguém consegue melhorar o resultado do trimestre passado
   baixando a meta hoje."
3. As metas podem ser **por unidade**: veja "Adesão ao check-in" com Filial
   Norte 55%, Oeste 65%, Sul 75%, Matriz 80%.

---

## 10. Fechamento (1 min)

> "Três ideias, e é o que eu queria que ficasse:
> 1. **Cada um vê o que precisa.** O gestor vê a falta, não o motivo médico.
> 2. **Todo número é explicável.** A folha mostra a conta faixa a faixa; a
>    avaliação mostra a memória de cálculo e a justificativa da decisão.
> 3. **O histórico não é reescrito.** Folha fechada não reabre, meta antiga não
>    some, modelo de avaliação fica congelado no ciclo."

---

## Blocos extras — se sobrar tempo ou se perguntarem

Não cabem nos 20 minutos, mas estão prontos e com dado. Use conforme a plateia.

### Recrutamento e seleção (`rh@` → `/recrutamento`)

Requisição → vaga → kanban → oferta → admissão. **5 requisições** (uma
aguardando decisão, uma reprovada **com motivo escrito**), **3 vagas abertas**
com **21 candidatos** no kanban (a de Estoquista tem 10). Aponte que a seleção
termina na oferta aceita e que a **admissão começa exatamente ali** — não se
redigita o candidato.

### Admissões (`dp@` → `/admissoes`)

**3 processos em preparação**, cada um com checklist versionado (ex.: 4/6
itens, 2 obrigatórios pendentes) e o **prazo do contrato de experiência**
(dia 45 / dia 90) calculado. "O sistema avisa antes de a experiência vencer —
que é quando a empresa perde o prazo de decidir."

### Desligamentos (`dp@` → `/desligamentos`)

**2 em andamento**, com o **prazo do art. 477** monitorado ("477 em 15 dias"),
devoluções pendentes de EPI/equipamento e o status da entrevista de
desligamento. O indicador de entrevistas usa **só o status**, nunca o conteúdo
das respostas.

### Saúde e segurança (`dp@` → `/sst`)

Painel de vencimento de ASO: **6 vencidos, 8 vencendo em 30 dias**, 60
monitorados. Mais entregas de EPI com ciência digital e CATs. As restrições
clínicas do ASO são cifradas — mesmo tratamento do afastamento.

### Benefícios (`dp@` → `/beneficios`)

Catálogo com elegibilidade, adesões ativas e o ponto que amarra tudo: a
**adesão vira demanda** para o DP efetivar, e o desconto efetivado **vira
variável na folha** (origem "Benefício" na competência 07/2026).

---

## O que ainda NÃO está pronto — diga antes que perguntem

Seja explícito. Na tela de Metas essas linhas aparecem como **"sem dados"** e
alguém vai reparar.

| Módulo | Situação | O que falta |
| --- | --- | --- |
| **Ponto / espelho de ponto** | Não implementado | Depende de **contratar o relógio/solução de ponto** e definir a integração. Os indicadores "% de espelhos fechados no prazo" e "Horas extras sobre horas trabalhadas" já existem no catálogo, esperando a fonte. |
| **eSocial / FGTS Digital / DCTFWeb** | Não implementado | Depende de **certificado digital e-CNPJ (A1)** e de homologação no ambiente restrito do governo. O sistema já guarda a matrícula eSocial de cada pessoa. |
| **Absenteísmo e turnover** | Indicador cadastrado, sem apuração | Absenteísmo depende do ponto. Turnover é cálculo simples, mas ainda não plugado. |
| **Cálculo de rescisão** | Não implementado | O processo de desligamento controla prazo do art. 477, devoluções e entrevista; o **valor** da rescisão ainda não é calculado. |
| **13º e férias na folha** | Não implementado | A folha hoje calcula a competência mensal (salário, HE, INSS, IRRF, benefícios, FGTS). |
| **Envio de e-mail/push** | Não implementado | As notificações são internas (sino + página). Integração com e-mail é trabalho pequeno, mas não foi feito. |

Frase sugerida:

> "Prefiro mostrar o que falta agora do que vocês descobrirem depois. Ponto e
> eSocial não são 'a gente esqueceu': são decisões que dependem de compra e de
> certificado digital. O resto do ciclo — admissão, ficha, férias, afastamento,
> benefício, folha mensal, avaliação, clima, desligamento — está funcionando
> com o dado de verdade, como vocês viram."

---

## Perguntas prováveis do RH e como responder

**"Isso substitui a folha do escritório de contabilidade?"**
Ainda não. Hoje o sistema calcula a competência mensal e mostra a conta aberta,
o que serve para **conferir** o que o escritório manda e para responder o
colaborador na hora. Substituir de verdade exige rescisão, 13º, férias e
eSocial — e uma competência rodando em paralelo por alguns meses.

**"O gestor consegue ver o salário da equipe?"**
Depende da chave `rh.posicao.ver`, que hoje o gestor **não** tem. E quem tem,
ao abrir, gera registro na trilha.

**"E se alguém do RH bisbilhotar a ficha de um colega?"**
Consegue abrir, se tiver a permissão — e fica registrado quem abriu, quando e
de quem, em `audit.leitura_sensivel`. O controle é por rastreabilidade, não por
impedir o trabalho.

**"Dá para mudar as perguntas do check-in de clima?"**
Sim, é catálogo versionado. Mudar a pergunta cria nova versão; as respostas
antigas continuam ligadas à pergunta que foi realmente feita.

**"Quem responde a avaliação? É 360 de verdade?"**
Hoje é **líder → liderado** (experiência nos dias 45 e 90, e desempenho).
Autoavaliação e pares não estão no modelo v1. O modelo é configurável em
pilares, indicadores e pesos.

**"E se a gente discordar da faixa da avaliação?"**
É exatamente o caso do Kleber que mostrei. A faixa é recomendação; a decisão é
humana, exige justificativa quando diverge e fica registrada com nome e data.

**"Quantas pessoas cabem?"**
A demo tem 68. O modelo de dados e as consultas não têm limite prático nessa
ordem de grandeza; o gargalo seria o banco, e são consultas simples com índice.

**"E se eu apagar sem querer?"**
As tabelas de histórico são *append-only* (trigger no banco impede alteração e
exclusão): transição de demanda, resposta de avaliação, item de folha, ciência
de documento. O que se corrige, se corrige criando novo registro.

**"Onde ficam os arquivos?"**
Hoje no próprio banco (BYTEA, limite de 10 MB), com hash SHA-256 de cada
arquivo. O repositório isola o armazenamento justamente para trocar por object
storage depois sem mexer no resto. Documento marcado como **sensível**
(advertência, ASO) some do payload de quem não tem a chave
`documento.sensivel.ver`, e a leitura autorizada gera trilha.
Atenção — o que é **cifrado na aplicação** é o dado clínico: o campo de saúde
do afastamento e as restrições do ASO. O arquivo do GED não é cifrado; se isso
for requisito, é um ajuste a fazer.

**"Precisa de internet?"**
O sistema é web e o banco é PostgreSQL. Pode rodar em servidor interno ou em
nuvem — a demo está rodando local.

---

## Se algo der errado ao vivo

| Sintoma | O que fazer |
| --- | --- |
| Tela em branco ou "server error" | Você está em modo dev. F5 resolve (a tela já compilou). Da próxima vez, `npm run build && npm start`. |
| Código 2FA recusado | O código dura 30 s. Rode `node --env-file=.env db/codigo-2fa.js <email>` de novo e digite rápido. |
| Você mexeu demais nos dados | `npm run db:demo` (~100 s) e recomece. Aviso: derruba as sessões abertas. |
| Sessão expirou | A sessão dura 8 h. Entre de novo. |

---

## Screenshots de apoio

Em `docs/demo/` — úteis para slides ou caso a demo ao vivo não seja possível:

| Arquivo | Tela | Persona |
| --- | --- | --- |
| `01-folha-memoria-de-calculo.png` | Folha 06/2026 fechada, memória do INSS aberta | dp |
| `02-clima-queda-filial-norte.png` | Painel de clima, queda da Filial Norte | diretoria |
| `03-metas-farois-indicadores.png` | Central de metas com faróis | rh |
| `04-demandas-fila-do-dp.png` | Fila do DP com atrasadas e SLA | dp |
| `05-ficha-colaborador-linha-do-tempo.png` | Ficha completa, linha do tempo | dp |
| `06-ferias-vencidas-art-137.png` | Painel de vencimento de férias (art. 137) | dp |
