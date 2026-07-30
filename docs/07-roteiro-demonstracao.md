# Roteiro de demonstração — Fast Pessoas (≈25 minutos)

Apresentação do sistema de DP/RH. Todos os dados são **fictícios**: a empresa
"Fast" (distribuidora de material de construção, 5 unidades), as 70 pessoas, os
CPFs e os CNPJs não existem.

Estado desta versão: **ondas A a E entregues** — núcleo de pessoas, demandas,
férias/afastamentos, documentos, clima, metas, avaliação 360, recrutamento,
folha mensal, SST, notificações, segregação de perfis, RCF, relatórios,
promoção/transferência, pesquisa estruturada, organograma, portais e painel
executivo.

> **Se você tem 30 segundos para saber o que mudou desde a última versão:**
> o bloco **5** deste roteiro ("o feedback da sua analista virou
> funcionalidade") é a novidade. É o bloco que eu não cortaria.

---

## 0. Antes de começar (5 minutos de preparo, sozinho)

### Reset dos dados

```bash
cd "C:\sistema RH\fast-pessoas"
npm run db:demo
```

Apaga os dados de demonstração e repopula do zero. É idempotente: pode rodar
quantas vezes quiser, sempre com o mesmo resultado. Leva ~100 s. Rode **antes de
cada apresentação** — a demo é feita para ser mexida na frente do público
(aprovar promoção, assumir demanda, responder check-in) e o reset devolve tudo
ao estado inicial.

> As credenciais são regravadas em `fast-pessoas/db/semear/CREDENCIAIS-DEMO.md`.
> O reset **não** invalida os QR Codes de 2FA já lidos: o segredo é
> determinístico.

### Suba o sistema em BUILD DE PRODUÇÃO, não em modo desenvolvimento

```bash
npm run build     # ~40 s
npm run demo      # sobe em http://localhost:3001
```

**Isto não é preciosismo.** O servidor de desenvolvimento (`npm run dev`)
compila cada tela na primeira visita; clicando rápido entre duas telas pesadas
ele pode devolver "A server error occurred". No build de produção a navegação
deste roteiro roda sempre. Se por algum motivo tiver que apresentar em modo dev,
**abra todas as telas do roteiro uma vez antes de o público entrar.**

> `npm run demo` é atalho para `next start -p 3001`. Se preferir a porta padrão,
> `npm start` sobe em 3000 — mas então troque a porta em todas as URLs abaixo.

### Credenciais — 7 personas

Senha de **todos**: `FastDemo2026!`

| Papel | E-mail | Pessoa | O que essa conta demonstra |
| --- | --- | --- | --- |
| diretoria | `diretora.pessoas@fastdemo.local` | Helena Marques Andrade (mat. 1001) | Rede inteira, painel executivo, clima individual, decisão de promoção |
| dp | `dp@fastdemo.local` | Patrícia Nogueira Lima (mat. 1021) | Folha, férias, admissão, desligamento, benefícios, SST |
| rh | `rh@fastdemo.local` | Rafael Andrade Pires (mat. 1034) | Avaliação 360, pesquisa e painel de clima, documentos, metas, relatórios |
| **recrutador** | `recrutador@fastdemo.local` | Solange Ferraz Bittencourt (mat. 1069) | **A segregação que a analista pediu** — R&S inteiro, e nada de ficha/folha/saúde |
| **lider_td** | `lidertd@fastdemo.local` | Rogério Sampaio Fontes (mat. 1070) | Business Partner de T&D — estrutura, avaliação, painel executivo; sem salário e sem saúde |
| gestor | `gestor@fastdemo.local` | Marcos Vieira Salles (mat. 1013) | Portal do gestor — só a própria equipe (10 liderados) |
| funcionario | `funcionario@fastdemo.local` | Juliana Costa Ferreira (mat. 1043) | Portal do colaborador — quem só consulta e solicita |

**2FA é obrigatório** para `diretoria`, `dp`, `rh`, `recrutador`, `lider_td` (e
`admin`). Código do momento:

```bash
node --env-file=.env db/codigo-2fa.js diretora.pessoas@fastdemo.local
```

Deixe esse terminal aberto ao lado — você troca de persona 5 ou 6 vezes.
Alternativa mais confortável: cadastre os URIs `otpauth://` do
`CREDENCIAIS-DEMO.md` no autenticador do celular, uma vez só.

> **Detalhe de palco:** nas contas com 2FA, a primeira tentativa (e-mail +
> senha) devolve o campo "Código do autenticador" **junto com** a mensagem
> vermelha "Não foi possível entrar. Tente novamente." Não é erro: é o segundo
> fator sendo pedido. Diga isso em voz alta antes que alguém repare.

### A conta de administrador (a sua)

A tela `/perfis` — onde se compõe papel × permissão — exige a chave
`perfil.administrar`, que **só o papel `admin` tem**. Isso é decisão de projeto,
não esquecimento: *quem concede acesso não é quem consome dado de RH*. Nenhuma
das 7 personas de demonstração abre essa tela; **use a sua própria conta de
administrador** se quiser mostrá-la ao vivo (bloco 5a).

### Abas para deixar pré-abertas

Uma janela anônima por persona, para as sessões não se atropelarem:

1. `dp@` em `/demandas`
2. `gestor@` em `/portal-gestor`
3. `funcionario@` em `/portal-colaborador`
4. `diretora.pessoas@` em `/painel-executivo`
5. `recrutador@` em `/` (a home dele é a prova visual da segregação)

---

## 1. Abertura — o problema (1 min, sem tela)

> "Hoje a informação de pessoas da Fast está espalhada: planilha de férias,
> pasta de contratos, e-mail de solicitação, WhatsApp do gestor. Ninguém
> responde rápido 'quantas férias estão vencendo?' ou 'por que este desconto
> apareceu no holerite?'. O Fast Pessoas junta isso num sistema só, com três
> regras: **todo número tem que ser explicável**, **cada um vê só o que a função
> dele exige**, e **o histórico não é reescrito**."

Não abra tela ainda. Essas três frases são o fio de toda a apresentação.

---

## 2. O dia do DP (4 min) · persona `dp@`

### A fila

**Tela:** `/demandas` → aba **Fila do DP**
📸 `docs/demo/04-demandas-fila-do-dp.png`

- **20 na fila · 3 vencendo hoje · 10 atrasadas.** "Isto não é relatório que
  alguém monta: é o estado real da fila ao abrir o sistema de manhã."
- O aviso cinza: **"10 demandas aguardando aprovação do gestor — ainda fora da
  fila do DP."** "O que está travado no gestor não conta como atraso do DP. Cada
  um responde pelo seu pedaço do prazo."
- Cada cartão traz o **SLA por tipo** (declaração de vínculo 3 dias, informe de
  rendimentos 2 dias, promoção 10 dias) e o selo "atrasada há X dias".

**Faça ao vivo:** clique **Assumir** numa demanda atrasada. Ela sai de "Abertas"
e vai para "Em atendimento" com o seu nome.

### A ficha da pessoa

**Tela:** `/colaboradores` → **Juliana Costa Ferreira** → aba **Dados**
📸 `docs/demo/17-ficha-rcf-do-cargo-e-salario-sensivel.png`

- Aponte o campo salário: **R$ 2.850,00 · "dado sensível · leitura gravada na
  trilha"**.

> "Você acabou de ver o salário dela. O sistema registrou que **você** viu,
> **quando** e **de quem**. Não é vigilância de vocês — é o que a LGPD pede
> quando alguém questiona quem teve acesso ao dado dele. Nesta base de
> demonstração já há **554 leituras de dado sensível** registradas."

- Na mesma aba, role até **RCF do cargo — Vendedor(a)**: missão, atividades e
  CHA aparecem **dentro da ficha**. (Voltamos nisso no bloco 5b.)
- Troque para a aba **Linha do tempo**
  📸 `docs/demo/05-ficha-colaborador-linha-do-tempo.png`: admissão, posição
  inicial, férias, ASO, demandas concluídas, ocorrências, feedbacks. "É a
  história da pessoa em ordem, sem ninguém precisar montar."

---

## 3. A folha — o momento mais forte (4 min) · persona `dp@`

**Tela:** `/folha` → competência **06/2026 (FECHADA)** → **Folhas calculadas**
📸 `docs/demo/01-folha-memoria-de-calculo.png`

- **58 folhas · R$ 232.432,87 de proventos · R$ 57.244,51 de descontos ·
  R$ 175.188,36 de líquido.**
- Clique **Ver itens** de qualquer pessoa: salário base, INSS, desconto de
  benefício, FGTS.
- **Abra a "Memória de cálculo" do Desconto INSS.** Deixe o público ler:

```json
{
  "formula": "progressivo faixa a faixa sobre a base limitada ao teto",
  "base_inss": 2110,
  "valor_final": 165.44,
  "teto_aplicado": false,
  "teto_contribuicao": 8565.28,
  "faixas_percorridas": [
    { "ate": 1631.00,  "aliquota": 7.5, "base_na_faixa": 1631, "valor": 122.325 },
    { "ate": 2933.57,  "aliquota": 9.0, "base_na_faixa":  479, "valor":  43.11  }
  ],
  "valor_sem_arredondar": 165.435,
  "arredondamento": "meio-para-cima no centavo, só no valor final",
  "tabela_inss_versao_id": 1
}
```

> "Quando o colaborador perguntar 'por que descontaram R$ 165,44?', vocês não
> refazem a conta na calculadora. A conta está gravada junto com o valor: a
> base, cada faixa, a alíquota, o arredondamento e **qual versão da tabela do
> INSS** foi usada. Se a tabela mudar no ano que vem, junho continua explicado
> pela tabela de junho."

- Aponte **"Salário congelado"**: o valor usado é o da posição vigente no momento
  do cálculo. Aumento posterior não reescreve folha passada.
- Abra **07/2026 (ABERTA)**: **319 variáveis lançadas** (horas extras manuais e
  descontos vindos das adesões a benefício). "O fluxo é aberta → cálculo →
  conferência → aprovada → fechada. E **fechada não reabre** — correção se faz em
  competência futura. É proposital: folha que reabre é folha que ninguém audita."

---

## 4. Os dois portais (3 min)

Aqui a conversa sai do DP e vai para quem usa o sistema sem ser do RH.

### Portal do gestor · persona `gestor@` (sem 2FA, entra direto)

**Tela:** `/portal-gestor`
📸 `docs/demo/10-portal-do-gestor.png`

Uma tela com o que o líder precisa decidir hoje — **10 liderados ativos**:

- **Minha equipe**: cargo, unidade, tempo de casa, situação.
- **Férias da equipe**: 1 programada e **2 períodos vencendo** (Cristiane em
  28/08, Maurício em 28/09) — "risco de pagamento em dobro, art. 137".
- **Avaliações em que você é o avaliador**: **2 com prazo vencido** há 13 dias.
- **Pendências de aprovação**: **8 aguardando decisão, 2 fora do prazo.**
- **Turnover da equipe**: 19% em 12 meses, com a conta aberta ao lado.
- **Alertas**: feedback formal atrasado (o pior tem **203 dias**), ASO a vencer
  em 6 dias.

Dois pontos de ouro nesta tela:

1. **"Afastado" mostra só o FATO.** Nenhum tipo, motivo ou dado clínico chega ao
   gestor — está escrito na própria tela.
2. **O bloco "Treinamentos da equipe" está vazio e honesto**, dizendo que
   depende do módulo de T&D que hoje vive no Sults. "Preferimos a caixa vazia
   explicada a fingir que temos o dado."

### Portal do colaborador · persona `funcionario@`

**Tela:** `/portal-colaborador`
📸 `docs/demo/11-portal-do-colaborador.png`

- Dados, cargo com link **ver RCF**, gestor, tempo de casa.
- **Remuneração não aparece neste portal** — está escrito na tela: dúvida de
  salário se resolve abrindo solicitação "Dúvida sobre a folha" para o DP.
- Férias (saldo 60 dias, 1 programação aguardando aprovação), 5 solicitações em
  andamento, benefícios com o próprio desconto, **7 documentos aguardando
  ciência**, PDI com 2 ações acordadas.
- **Faça ao vivo:** responda o **check-in do dia** (2 emojis, 10 segundos).
  Aponte o aviso: *"Suas respostas individuais são visíveis apenas à Diretoria
  de Pessoas; seu gestor vê somente médias agregadas."*

---

## 5. ⭐ O FEEDBACK DA SUA ANALISTA VIROU FUNCIONALIDADE (7 min)

> **Este é o bloco a proteger se o tempo apertar.** Diga a frase de abertura
> olhando para ela:
>
> "Você mandou o documento com os comentários em vermelho. Nós lemos linha por
> linha, respondemos por escrito no documento `08-analise-feedback-analista-rh.md`
> e implementamos. O que você vai ver agora nas próximas sete minutos **não
> existia** quando você comentou. Cinco coisas."

### 5a. "R&S não deve ver o histórico de DP" — a segregação (2 min)

Esse foi o **achado de segurança** dela, e ela estava certa: o papel `rh`
acumulava recrutamento **e** ficha, afastamento, desligamento e ocorrência.

**Entre como `recrutador@fastdemo.local`** (2FA).

**Tela:** `/` (a home)
📸 `docs/demo/15-recrutador-home-segregada.png`

> "Olhe o que **não** está na tela dela."

Não existem: Colaboradores, Folha, Desligamentos, Afastamentos, Saúde e
Segurança, Avaliações, Relatórios, Clima individual, Dashboard Executivo.
Existem: Recrutamento, Organograma, e o que toda pessoa tem (portal, férias,
demandas, documentos, clima).

**Faça ao vivo — são os três momentos que convencem.** Digite as URLs na mão,
uma por uma, e narre o que aparece:

1. `localhost:3001/folha` → **o sistema devolve ela para a home.** Faça o mesmo
   com `/desligamentos`, `/afastamentos`, `/sst`, `/relatorios` e
   `/clima/individual`: todas voltam. "Não é menu escondido — é a tela negando."
2. `localhost:3001/colaboradores` → **a tela abre, e a lista tem uma linha
   só: ela mesma.** O título muda para "Sua ficha" e o aviso diz *"Como
   funcionário, você acessa apenas a própria ficha."*
   📸 `docs/demo/18-recrutador-lista-de-colaboradores-so-ela.png`
   > "Ela é do RH e a lista de colaboradores tem uma pessoa: ela. Antes, essa
   > mesma tela mostrava as 62."
3. `localhost:3001/colaboradores/1601` (o número da ficha da Juliana) →
   **"Colaborador não encontrado."**
   > "Repare no que o sistema **não** disse. Não disse 'acesso negado', que já
   > seria a confirmação de que existe uma Juliana com essa ficha. Para ela,
   > essa pessoa simplesmente não existe. **Ausência, não máscara** — é a regra
   > que vale para todo dado sensível aqui."

> "E por baixo é a mesma coisa: a API de folha, desligamento, afastamento, SST,
> clima individual, relatórios e painel executivo responde **403** para ela —
> testado nas 14 rotas. E se ela digitar o número de outra pessoa para tentar
> ler a **pasta de documentos** de terceiro, o sistema **ignora o número** e
> devolve a pasta dela mesma: o pedido não é obedecido nem só recusado, é
> respondido com o que ela tem direito de ver."

Contraponto que **ela mesma** fez no documento — o Líder de T&D precisa de
**mais** acesso, não menos. Entre como `lidertd@fastdemo.local`: ele **tem**
estrutura, ficha, avaliação, relatórios e painel executivo; **não tem** salário,
saúde, motivo de desligamento nem parecer de seleção.

> "Não apertamos todo mundo. Modelamos perfil por função real, que é exatamente
> o que você escreveu."

Se quiser fechar com a ferramenta (**precisa da sua conta de administrador**):
`/perfis` mostra a matriz papel × permissão, editável por tela, com a alteração
indo para a trilha de auditoria. Hoje são 8 papéis:
dp 63 chaves, rh 33, diretoria 29, gestor 18, lider_td 18, recrutador 13,
funcionario 6, admin 7 (só administração).

> "Antes, mudar quem vê o quê era tarefa de desenvolvedor, numa migration.
> Agora é tela. É isso que transforma controle de acesso em ferramenta de
> gestão."

### 5b. "RCF do cargo/função na ficha" (1 min)

Ela pediu o RCF e nós **perguntamos o que era** em vez de adivinhar. Hoje o RCF
completo existe nos **15 cargos**, na ordem oficial.

**Tela:** `/cargos` → Vendedor(a) → **Abrir versão imprimível**
📸 `docs/demo/12-rcf-do-cargo-imprimivel.png`

- Cabeçalho: cargo, setor, líder direto, tipo de contrato.
- **Responsabilidade Chave da Função (missão do cargo)**.
- **Atividades a desempenhar** (6 itens).
- **CHA** em três colunas: Conhecimentos (perfil técnico) · Habilidades
  (experiências necessárias) · Atitudes (comportamentos).
- Observações importantes.
- Rodapé com a **versão vigente e desde quando** — mudar o RCF cria versão nova;
  a avaliação que usou a versão antiga continua ligada a ela.

Dois detalhes que valem dizer:

1. É **imprimível/PDF** — é o documento que o gestor entrega e assina.
2. **A recrutadora lê o RCF** (é o insumo da vaga) mas **não vê faixa
   salarial** — o RCF não tem remuneração.
3. O mesmo RCF aparece **dentro da ficha da pessoa** (bloco 2), então o gestor
   não precisa procurar em outro lugar.

### 5c. "Aniversariantes e diversidade" (1 min)

Estavam **impossíveis**: `rh.colaborador` não tinha data de nascimento nem
gênero. Migration acrescentou os dois campos (gênero autodeclarado, com "não
informar"), e as 70 fichas foram preenchidas.

**Persona `rh@`** · **Tela:** `/relatorios`
📸 `docs/demo/16-relatorios-aniversariantes-e-diversidade.png`

- Aba **Aniversariantes**: **6 aniversariantes em julho**, **0 fichas sem data
  de nascimento**. Filtro por mês e por unidade.
  > "Só dia e mês. O ano não entra no relatório — a idade não é necessária para
  > parabenizar alguém."
- Aba **Diversidade**: 27 mulheres, 33 homens, e **dois recortes suprimidos**.
  > "Recorte com menos de 5 pessoas não é publicado. Num quadro de 62, publicar
  > 'uma pessoa' identifica alguém — e gênero autodeclarado é dado sensível. E
  > se sobrasse um único recorte suprimido, o menor recorte publicado também
  > seria suprimido, senão bastava subtrair do total."
- Aba **Composição familiar** (crianças até 12 anos, via dependentes) e
  **Headcount**.
- No pé da tela: a lista honesta dos relatórios que ela pediu e **ainda não
  existem porque o dado não existe** (treinados por curso/setor — depende do
  Sults).

### 5d. "Aprovação de promoção do líder para a diretoria" (2 min)

Ela escreveu: *"hoje ocorre de forma aleatória em canais diversos ou sem canal."*
Virou tipo de demanda com **cadeia de dois níveis** e **efeito automático**.

**Persona `diretora.pessoas@`** · **Tela:** `/demandas` → aba **Promoções e
transferências (1)**
📸 `docs/demo/14-promocao-aguardando-a-diretoria.png`

- **DEM-0066 · Promoção · "Aguardando aprovação da diretoria"**
  Maurício Saraiva Cunha · **Estoquista → Conferente** · vigência 01/08/2026.
  A justificativa escrita pelo líder está no cartão.
- A cadeia aparece numerada:
  **1 Líder do colaborador — Aprovada** (Marcos Vieira Salles, 24/07/2026 07:20)
  **2 Diretoria — Pendente**, esperando decisão.

**Faça ao vivo: clique "Aprovar (diretoria)".** Na mesma transação:

1. cria a **posição nova** vigente na data pretendida (e encerra a anterior);
2. grava o **evento na linha do tempo** da pessoa;
3. **notifica DP e T&D** para providenciar os trâmites;
4. notifica o líder solicitante.

> "Era isso que você descreveu: aprova e, no mesmo instante, o DP e o T&D já
> ficam cientes. Ninguém precisa avisar por WhatsApp."

Role um pouco para os já aplicados e mostre **DEM-0064** com o selo
**"Fora da faixa — com exceção"**:

> *"Enquadramento gradual acordado com o colaborador e aprovado pela diretoria:
> entra abaixo do piso da faixa na assunção da função e é reenquadrado em 6
> meses."*

> "Proposta fora da faixa salarial do cargo destino **não é bloqueada** — ela
> exige justificativa escrita e fica marcada para sempre. É o controle de
> enquadramento do PCCS que você citou, na versão que dá para usar hoje."

E mostre **DEM-0067**, uma **transferência de unidade** (Filial Oeste → Filial
Leste) pedida pelo próprio colaborador por mudança de residência, aprovada com o
comentário da diretoria: *"Reposição da Leste resolvida sem abrir vaga e sem
custo de recrutamento."*

### 5e. "O check-in não substitui pesquisa anual, eNPS e plano de ação" (1 min)

Ela estava certa, e nós registramos por escrito que era **custo de uma decisão
consciente** nossa de simplificar. Decisão reaberta: agora existem **os dois**.

**Persona `rh@`** · **Tela:** `/pesquisas` → **Pesquisa de Clima Fast 2026**
(encerrada) → **resultado**
📸 `docs/demo/13-pesquisa-de-clima-resultado-enps.png`

- **Adesão 75,8%** (47 de 62) · **eNPS +25,5** (22 promotores, 15 neutros, 10
  detratores).
- Média por pergunta — e o achado que salta:
  **"Recebo do meu líder feedback que me ajuda a melhorar" = 2,64 de 5**, a pior
  de todas, contra 4,53 em segurança do trabalho.
- **Por unidade:** Filial Leste com eNPS **−50**, a única negativa da rede.
- **Comentários anônimos**, e a tela explica: chegam **sem unidade, sem data e
  sem ordem de envio** — "três pistas que, cruzadas, apontariam autoria."
- **Planos de ação** ligados à pesquisa: um **concluído** (plano odontológico
  entrou no catálogo, porque "benefícios" foi a 2ª opção mais votada) e um **em
  andamento**: *ritual de feedback quinzenal na Filial Leste*, responsável
  Márcio Santana Macedo, prazo 12/09/2026.

> "Pesquisa que não vira plano de ação é formulário. Aqui o pior número da rede
> tem dono, prazo e status — e a meta escrita é sair do último lugar no próximo
> pulse."

Feche mostrando que os dois convivem: há um **pulse aberto** agora (a quinzena de
carga de trabalho e reconhecimento) **e** o check-in diário rodando —
**3.188 respostas** acumuladas.

---

## 6. Direção: os números da diretoria (4 min) · persona `diretora.pessoas@`

Estes também saíram do documento dela ("Dashboard Executivo" e "Organograma
automático").

### Painel executivo

**Tela:** `/painel-executivo`
📸 `docs/demo/07-painel-executivo-diretoria.png`

Nove cards, e **cada um tem "A CONTA"** escrita embaixo:

| Card | Valor hoje |
| --- | --- |
| Headcount | **62** (+1 em 12 meses) |
| Turnover 12 meses | **13,01%** — 8 desligados ÷ headcount médio 61,5 |
| Custo de pessoal | **BLOQUEADO** para esta persona |
| Tempo médio de contratação | **51,0 dias** (aprovação da requisição → admissão) |
| Absenteísmo 12 meses | **1,31%** — 198 dias úteis de afastamento em 15.104 |
| Promoções | **2** + 1 transferência |
| Diversidade | 62 pessoas · 2 recortes suprimidos |
| Clima | **3,87** de média · **eNPS +25,5** |
| Performance | 21 avaliações, distribuídas em 4 faixas |
| ROI de treinamento | **SEM FONTE** |

Três coisas para apontar, nesta ordem:

1. **"CUSTO DE PESSOAL — BLOQUEADO. Requer permissão de folha (`folha.ver`)."**
   A Diretora de Pessoas não tem a chave da folha nesta configuração.
   > "Repare que ele não mostra valor aproximado nem número mascarado. Custo de
   > pessoal é dado de remuneração: quem não tem a chave **não recebe o
   > número**, e a tela diz qual chave falta em vez de fingir que o dado não
   > existe. Se a diretoria quiser esse card, é uma marcação na tela de perfis —
   > e fica registrada."
   Quem tem `folha.ver` (o DP) vê **R$ 250.885,74** — R$ 232.432,87 de proventos
   + R$ 18.452,87 de FGTS, competência jun/2026, com quebra por unidade e centro
   de custo. 📸 `docs/demo/08-painel-executivo-custo-de-pessoal.png`
2. **"ROI DE TREINAMENTO — SEM FONTE."** Depende do módulo de T&D, hoje no
   Sults.
   > "Um ROI estimado num painel de diretoria vira decisão errada. Preferimos o
   > card dizer que não tem fonte."
3. A **conta do turnover** aberta: `8 ÷ ((61 + 62) ÷ 2 = 61,5) × 100 = 13,01%`.
   > "Headcount médio é a média entre o início e o fim da janela — a conta que a
   > diretoria confere no papel."

### Organograma

**Tela:** `/organograma`
📸 `docs/demo/09-organograma-headcount-e-vagas.png`

- **Realizado 62 · Aprovado 64 · 2 posições em aberto.** A lacuna de 2 é
  visível e imune a filtro.
- A estrutura é **montada da relação gestor→liderado vigente**: "não existe
  organograma digitado à mão; mudar o gestor na ficha muda esta tela."
- As **2 vagas abertas** aparecem penduradas no gestor que as requisitou
  (Marcos, Matriz Centro), com o prazo-alvo.
- Filtros por **unidade** (5) e **cargo** (15) destacam sem esconder a cadeia
  até a diretoria.
- Honestidade explícita na tela: **"aprovado" aqui não é quadro aprovado
  formal** — o sistema não tem orçamento de headcount com vigência, então
  "aprovado" significa "posições autorizadas hoje", derivado das requisições.

### Metas — fechando o fio

**Persona `rh@`** · **Tela:** `/metas`
📸 `docs/demo/03-metas-farois-indicadores.png`

| Indicador | Meta | Atual | Farol |
| --- | --- | --- | --- |
| % de folhas fechadas no prazo | 98% | **100%** | 🟢 |
| % de vagas fechadas no prazo | 80% | **100%** | 🟢 |
| % de ativos com ASO válido | 75% | **77,4%** | 🟢 |
| Adesão à pesquisa de clima | 70% | **75,8%** | 🟢 |
| Adesão ao check-in diário | 70% | **68,3%** | 🔴 |
| eNPS | 30 | **25,5** | 🔴 |
| % de entrevistas de desligamento realizadas | 90% | **71,4%** (5 de 7) | 🔴 |
| % de admissões com documentação no prazo | 95% | **66,7%** | 🔴 |
| Períodos de férias vencidos | 0 | **5** | 🔴 |

> "O prazo da demanda do começo, o ASO, a entrevista de desligamento, a adesão
> ao check-in, o eNPS da pesquisa — tudo vira indicador aqui, apurado do dado
> real. Ninguém digita esses números."

Três pontos de venda:

1. **Nenhuma meta é fixa no sistema.** Clique **Alterar meta** — o RH define.
2. **Alterar meta não sobrescreve a anterior**: cria versão nova com início de
   vigência. "Período já apurado continua avaliado pela meta que valia na época.
   Ninguém melhora o trimestre passado baixando a meta hoje."
3. Metas podem ser **por unidade**: veja "Adesão ao check-in" com Filial Norte
   55%, Oeste 65%, Sul 75%, Matriz 80%.

### Se sobrar 1 minuto: o clima que ninguém tinha visto

**Tela:** `/clima/painel` 📸 `docs/demo/02-clima-queda-filial-norte.png`

Média geral **3,9** com 1.692 respostas — "olhando só isso, está tudo bem". Role
para **Média por unidade**: **Filial Norte com selo EM QUEDA, 2,5 nos últimos 7
dias contra 3,7 antes (−1,2)**. "A média da rede escondia. Nenhum gestor abriu
chamado; o sistema mostrou." Só aparecem unidades com **5+ respondentes**.

---

## 7. Fechamento (1 min)

> "Quatro ideias, e é o que eu queria que ficasse:
> 1. **Cada um vê o que a função exige.** O gestor vê a falta, não o motivo
>    médico. A recrutadora vê a vaga, não a ficha.
> 2. **Todo número é explicável.** A folha mostra a conta faixa a faixa; o
>    painel executivo mostra a conta de cada card; onde não há fonte, está
>    escrito que não há.
> 3. **O histórico não é reescrito.** Folha fechada não reabre, meta antiga não
>    some, modelo de avaliação e RCF ficam congelados na versão que valia.
> 4. **O feedback do RH virou funcionalidade em uma onda de trabalho** — e o que
>    não deu para fazer está na lista, com o motivo."

---

## Blocos extras — se sobrar tempo ou se perguntarem

### Recrutamento e seleção (`recrutador@` → `/recrutamento`)

Requisição → vaga → kanban → oferta → admissão. **5 requisições** (1 aguardando
decisão, 1 reprovada **com motivo escrito**), **2 vagas abertas** + 1 fechada,
**21 candidaturas** (16 ativas). A seleção termina na oferta aceita e a
**admissão começa exatamente ali** — o candidato não é redigitado.

### Avaliação 360 — a máquina recomenda, o humano decide (`rh@` → `/avaliacoes`)

**34 ciclos** (18 decididos, 10 consolidados, 4 abertos, 2 em avaliação). Filtre
por **Decididas** e procure um caso com o selo **"divergente da recomendação"**:
a faixa recomendava plano de recuperação, a decisão foi manter na função, com
justificativa obrigatória.

> "A nota não decide nada sozinha. A faixa é recomendação; a decisão é de uma
> pessoa, tem nome, data e justificativa obrigatória quando diverge. Protege o
> colaborador de uma nota injusta e protege a empresa numa reclamatória."

O **modelo fica congelado na abertura do ciclo** — mudar pesos depois não
reescreve avaliação feita.

### Admissões (`dp@` → `/admissoes`)

**3 processos em preparação**, checklist versionado e o **prazo do contrato de
experiência** (dia 45 / dia 90) calculado. "O sistema avisa antes de a
experiência vencer — que é quando a empresa perde o prazo de decidir." (Era o
"alerta dos 45 dias" do documento dela: já existia.)

### Desligamentos (`dp@` → `/desligamentos`)

**2 em andamento**, com o **prazo do art. 477** monitorado, devoluções pendentes
de EPI/equipamento e status da entrevista. O indicador usa **só o status**, nunca
o conteúdo das respostas.

### Saúde e segurança (`dp@` → `/sst`)

Painel de vencimento de ASO (**57 ASOs** monitorados), entregas de EPI com
ciência digital e CATs. Restrições clínicas do ASO são **cifradas** — mesmo
tratamento do afastamento.

### Benefícios (`dp@` → `/beneficios`)

Catálogo com elegibilidade e adesões, e o ponto que amarra tudo: a **adesão vira
demanda** para o DP efetivar, e o desconto efetivado **vira variável na folha**
(origem "Benefício" na competência 07/2026).

### Documentos e ciência (`funcionario@` → `/documentos`)

**53 documentos**. Dê ciência em um ao vivo. "Fica gravado o **hash** do
documento no momento do aceite — se o arquivo for trocado depois, dá para provar
qual versão a pessoa leu." É a "confirmação de leitura" que ela pediu no bloco
de comunicação interna.

### Férias (`dp@` → `/ferias`)

📸 `docs/demo/06-ferias-vencidas-art-137.png` — **5 vencidas (dobro, art. 137),
6 vencendo em 30 dias, 4 em 60, 1 em 90**, com dias até o limite por pessoa.

---

## O que ainda NÃO está pronto — diga antes que perguntem

Seja explícito. Na tela de Metas várias linhas aparecem como **"sem dados"** e
alguém vai reparar.

### Bloqueado por decisão de compra ou terceiro

| Módulo | Situação | O que falta |
| --- | --- | --- |
| **Ponto / espelho de ponto** | Não implementado | Depende de **contratar o relógio/solução de ponto (REP-P)** e definir a integração. Os indicadores "% de espelhos fechados no prazo" e "Horas extras sobre horas trabalhadas" já estão no catálogo, esperando a fonte. |
| **eSocial / FGTS Digital / DCTFWeb** | Não implementado | Depende de **certificado digital e-CNPJ (A1)** e de homologação no ambiente restrito do governo. O sistema já guarda a matrícula eSocial de cada pessoa. |
| **Treinamento & Desenvolvimento (LMS)** | Fora do escopo | Hoje vive no **Sults**. Nosso lado é **integrar** (histórico de treinamento na ficha, horas, custo), não construir. Sem isso não há **ROI de treinamento** nem "treinados por curso/setor". |

### Falta de dado derivado dos itens acima

| Item | Situação |
| --- | --- |
| **Absenteísmo completo** | O painel executivo calcula **1,31%** a partir dos **afastamentos registrados**. Falta e atraso avulsos dependem do Ponto — e o indicador "Absenteísmo" da Central de Metas, que é definido em horas, segue "sem dados" de propósito. |
| **Turnover mensal** (indicador) | O painel executivo dá turnover de 12 meses; a versão mensal do catálogo ainda não está plugada. |
| **Cálculo de rescisão** | O processo controla prazo do art. 477, devoluções e entrevista; o **valor** da rescisão não é calculado. |
| **13º e férias na folha** | A folha calcula a competência mensal (salário, HE, INSS, IRRF, benefícios, FGTS). |
| **Envio de e-mail/push** | As notificações são internas (sino + página). Integração com e-mail é trabalho pequeno, mas não foi feito. |

### Pedidos dela que ficaram para as próximas ondas

| Item | Por que não entrou agora |
| --- | --- |
| **Onboarding estruturado** (trilha 90 dias, responsável por item, pesquisa) | Temos checklist de admissão com prazos; falta a trilha pós-admissão. Extensão do que existe. |
| **PCCS completo** (trilhas de carreira, critérios de promoção) | Entregamos a peça que trava dinheiro: **faixa salarial com exceção justificada** na promoção. Trilha de carreira e critério formal de promoção são o próximo passo. |
| **Comunicação interna / mural** | O GED já faz documento + **ciência com hash**. Falta a camada de mural/news/eventos. |
| **9 Box e sucessão** | A avaliação 360 já produz o eixo de **desempenho**; falta o eixo de **potencial** e a matriz. O organograma já diz que linha de sucessão por cargo é a evolução registrada dele. |
| **Reconhecimento** (entre colegas, badges, Valores Fast) | Não existe nada ainda. Os 9 Valores Fast já estão no modelo da avaliação — é a base natural. |
| **Banco de currículos reaproveitável** | Temos candidatos com consentimento; falta busca e reaproveitamento em vagas futuras. |
| **Processos trabalhistas (contencioso)** | Precisa de **decisão de escopo**: entra no Fast Pessoas ou não? |

### A pergunta de escopo que não é técnica

**Fast Pessoas × Sults.** A analista escreveu que pediu à TI para abrir os temas
de DP dentro do Sults, "porque lá registra essas solicitações que hoje fica tudo
picado por boca, zap, sults, email". Se os dois entregarem canal de
solicitações, a empresa terá dois canais únicos — que é o mesmo que nenhum.

> "Isso não é problema técnico, é decisão de vocês: o Sults fica como
> universidade/treinamento e o Fast Pessoas assume o DP/RH? Ou dividimos por
> tema? Preciso dessa definição antes de os dois caminhos avançarem."

Frase de encerramento sugerida para a seção:

> "Prefiro mostrar o que falta agora do que vocês descobrirem depois. Ponto e
> eSocial não são 'a gente esqueceu': dependem de compra e de certificado
> digital. O resto do ciclo — admissão, ficha, RCF, férias, afastamento,
> benefício, folha mensal, avaliação, clima, pesquisa, promoção, desligamento —
> está funcionando com dado de verdade, como vocês viram."

---

## Perguntas prováveis e resposta pronta

**"Isso substitui a folha do escritório de contabilidade?"**
Ainda não. Hoje calcula a competência mensal e mostra a conta aberta, o que
serve para **conferir** o que o escritório manda e responder o colaborador na
hora. Substituir exige rescisão, 13º, férias e eSocial — e uma competência
rodando em paralelo por alguns meses.

**"Por que a Diretora de Pessoas não vê o custo de pessoal?"**
Porque nesta configuração ela não tem a chave `folha.ver`. Não é limitação
técnica: é a composição de perfis que está gravada. Se a diretoria deve ver, o
administrador marca a chave na tela `/perfis` e a mudança fica na trilha. O
importante é que o card **não invente** um número aproximado para quem não tem a
chave.

**"O gestor consegue ver o salário da equipe?"**
Não. Depende da chave `rh.posicao.ver`, que o gestor não tem — e o portal do
gestor não traz remuneração em nenhum bloco. Quem tem a chave gera registro na
trilha ao abrir.

**"E se alguém do RH bisbilhotar a ficha de um colega?"**
Se tiver a permissão, abre — e fica registrado quem abriu, quando e de quem, em
`audit.leitura_sensivel` (554 registros nesta base). O controle é por
rastreabilidade, não por impedir o trabalho. E, depois da segregação, quem é só
de R&S **não abre**.

**"A recrutadora realmente não consegue? Nem digitando o endereço?"**
Não. A tela devolve ela para a home e a API responde 403. No caso de documentos,
se ela informar o identificador de outra pessoa, a resposta vem com a pasta
**dela** — o parâmetro é ignorado, não obedecido.

**"Quem responde a avaliação? É 360 de verdade?"**
Hoje é **líder → liderado** (experiência nos dias 45 e 90, e desempenho).
Autoavaliação e pares não estão no modelo v1. O modelo é configurável em
pilares, indicadores e pesos, e fica congelado por ciclo.

**"E se a gente discordar da faixa da avaliação?"**
A faixa é recomendação; a decisão é humana, exige justificativa quando diverge e
fica registrada com nome e data.

**"Na transferência de unidade, por que a pessoa aparece no organograma sob o
gerente da unidade antiga?"**
Porque a transferência move a **lotação**, e trocar o **líder direto** é ato do
DP na ficha — são duas coisas separadas de propósito (transferir de unidade não
implica necessariamente mudar de chefe). Está registrado como evolução: fazer a
aprovação sugerir também a troca de gestor.

**"Dá para mudar as perguntas do check-in ou da pesquisa?"**
Sim, catálogo versionado. Mudar a pergunta cria versão nova; as respostas
antigas continuam ligadas à pergunta que foi realmente feita.

**"A pesquisa é anônima de verdade?"**
Sim, e a tela explica como: os comentários chegam sem unidade, sem data e sem
ordem de envio, e nenhum recorte com menos de 5 respostas é publicado. A adesão
é contada, a resposta individual não é exibida para ninguém.

**"Quantas pessoas cabem?"**
A demo tem 70. O modelo de dados e as consultas não têm limite prático nessa
ordem de grandeza; o gargalo seria o banco, e são consultas simples com índice.

**"E se eu apagar sem querer?"**
As tabelas de histórico são *append-only* (trigger no banco impede alteração e
exclusão): transição de demanda, resposta de avaliação, item de folha, ciência de
documento. O que se corrige, se corrige criando registro novo.

**"Onde ficam os arquivos?"**
Hoje no próprio banco (BYTEA, limite de 10 MB), com hash SHA-256 de cada
arquivo. O repositório isola o armazenamento para trocar por object storage
depois. Documento marcado como **sensível** (advertência, ASO) sai do payload de
quem não tem a chave, e a leitura autorizada gera trilha. Atenção: o que é
**cifrado na aplicação** é o dado clínico (campo de saúde do afastamento e
restrições do ASO); o arquivo do GED não é cifrado — se isso for requisito, é um
ajuste a fazer.

**"Precisa de internet?"**
É web, com PostgreSQL. Roda em servidor interno ou em nuvem — a demo está
rodando local.

**"Quanto tempo levou?"**
O feedback chegou em 29/07 e esta versão é do dia seguinte. Vale dizer, porque
mostra que o custo de atender o RH é baixo **quando o desenho já está certo**:
quase nada aqui foi tabela nova — foram visões novas sobre dado que já existia.

---

## Se algo der errado ao vivo

| Sintoma | O que fazer |
| --- | --- |
| Mensagem vermelha "Não foi possível entrar" ao logar em conta com 2FA | Normal: o campo do código apareceu na mesma tela. Preencha o código e entre. |
| Código 2FA recusado | O código dura 30 s. Rode `node --env-file=.env db/codigo-2fa.js <email>` de novo e digite rápido; se estourar, espere a virada e pegue um código novo. |
| Tela em branco ou "server error" | Você está em modo dev. F5 resolve. Da próxima vez, `npm run build && npm run demo`. |
| Porta 3001 ocupada | Feche o `npm run dev` que ficou aberto, ou suba com `npm start` (porta 3000) e ajuste as URLs. |
| Uma tela fica em "Carregando…" | O banco caiu ou o `.env` não está no lugar. Confira o terminal do servidor. |
| Você mexeu demais nos dados | `npm run db:demo` (~100 s) e recomece. Aviso: derruba as sessões abertas. |
| Sessão expirou | A sessão dura 8 h. Entre de novo. |
| Aprovou a promoção e quer mostrar de novo | Ela não volta a pendente (é histórico). Rode o reset, ou mostre pelas já aplicadas. |

**Plano de contingência (se a demo ao vivo não for possível):**
apresente pelos screenshots de `docs/demo/`, na ordem
**04 → 17 → 05 → 01 → 10 → 11 → 15 → 18 → 12 → 16 → 14 → 13 → 07 → 08 → 09 →
03 → 02 → 06**. Ela cobre o roteiro inteiro na mesma sequência dos blocos 2 a 6.

---

## Screenshots de apoio

Em `docs/demo/` — para slides ou para o plano de contingência. Todos gerados no
**build de produção** com dado real da demo, na sessão da persona indicada.

| Arquivo | Tela | Persona | Bloco |
| --- | --- | --- | --- |
| `01-folha-memoria-de-calculo.png` | Folha 06/2026, memória do INSS aberta | dp | 3 |
| `02-clima-queda-filial-norte.png` | Painel de clima, Filial Norte em queda | diretoria | 6 |
| `03-metas-farois-indicadores.png` | Central de metas com faróis | rh | 6 |
| `04-demandas-fila-do-dp.png` | Fila do DP com atrasadas e SLA | dp | 2 |
| `05-ficha-colaborador-linha-do-tempo.png` | Ficha, linha do tempo | dp | 2 |
| `06-ferias-vencidas-art-137.png` | Painel de vencimento de férias | dp | extra |
| `07-painel-executivo-diretoria.png` | Dashboard executivo (custo BLOQUEADO) | diretoria | 6 |
| `08-painel-executivo-custo-de-pessoal.png` | Mesmo painel, com custo de pessoal | dp | 6 |
| `09-organograma-headcount-e-vagas.png` | Organograma, aprovado × realizado | diretoria | 6 |
| `10-portal-do-gestor.png` | Portal do gestor, 7 blocos | gestor | 4 |
| `11-portal-do-colaborador.png` | Portal do colaborador, 8 blocos | funcionario | 4 |
| `12-rcf-do-cargo-imprimivel.png` | RCF imprimível do cargo Vendedor(a) | recrutador | 5b |
| `13-pesquisa-de-clima-resultado-enps.png` | Resultado da pesquisa anual com eNPS | rh | 5e |
| `14-promocao-aguardando-a-diretoria.png` | Promoção pendente + cadeia de aprovação | diretoria | 5d |
| `15-recrutador-home-segregada.png` | Home da recrutadora — o que **não** existe | recrutador | 5a |
| `16-relatorios-aniversariantes-e-diversidade.png` | Aniversariantes e diversidade | rh | 5c |
| `17-ficha-rcf-do-cargo-e-salario-sensivel.png` | Ficha: RCF do cargo + salário sensível | dp | 2 / 5b |
| `18-recrutador-lista-de-colaboradores-so-ela.png` | `/colaboradores` da recrutadora: uma linha, ela mesma | recrutador | 5a |

> **Não há screenshot da tela `/perfis`**: ela exige o papel `admin`, que nenhuma
> persona de demonstração tem (ver seção 0). Se quiser levá-la em slide, entre
> com a sua conta de administrador e capture na hora.
