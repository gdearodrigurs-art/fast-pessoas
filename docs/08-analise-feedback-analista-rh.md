# Análise do feedback da analista de RH

> Recebido em 2026-07-29 sobre o resumo executivo de funcionalidades (versão anterior
> ao estado atual do sistema). Comentários em vermelho no documento devolvido.
> Este documento separa: (a) o que ela pediu e **já existe**, (b) o que é **lacuna real**,
> (c) o que é **decisão a tomar**.
>
> **A análise abaixo é o texto original de 29/07 e foi preservada como estava** —
> vale como registro do que foi diagnosticado antes de mexer em código. O que
> mudou desde então está **só na seção 9**, que virou o placar de execução:
> as ondas D e E foram implementadas em 29–30/07 e os itens 1 a 5 da "Onda D"
> mais o Dashboard Executivo da "Onda E" estão **entregues e demonstráveis**
> (roteiro: `docs/07-roteiro-demonstracao.md`, bloco 5).

## Resumo em uma frase

O feedback é de alta qualidade e contém **um achado de segurança legítimo** (segregação de
acesso do time de R&S), **dois gaps de dado cadastral que travam relatórios inteiros**
(data de nascimento e gênero), **um fluxo de negócio real que não desenhamos** (promoção e
transferência com aprovação em cadeia) e **uma lista de 10 módulos** que, em boa parte,
são extensões naturais do que já está construído — e alguns já existem sob outro nome.

---

## 1. O achado sério: o time de R&S enxerga o histórico de DP

**O que ela escreveu:**
> "A equipe de R&S não deve ter acesso aos históricos de DP (como cargos, salários,
> headcount, motivos de desligamento ou advertências). Essas informações são sigilosas,
> privadas e não impactam a atração de novos talentos."

**Ela está certa, e o problema existe hoje.** Conferido no banco: o papel `rh` acumula
as chaves de recrutamento (`rs.gerir`, `rs.ver`, `rs.parecer.ver`) **e também**
`rh.colaborador.ver`, `rh.colaborador.editar`, `desligamento.ver`, `afastamento.ver`,
`admissao.ver`, `ferias.administrar`, `rh.ocorrencia.registrar`, `sst.ver`.

Ou seja: **quem recruta vê a ficha, os afastamentos, os desligamentos e as ocorrências de
todo o quadro.** Não é o que ela quer, e não é o que a LGPD recomenda (minimização).

**O que já está protegido** (a arquitetura acertou aqui): salário (`rh.colaborador.sensivel.ver`
é só DP/diretoria), motivo de desligamento (`desligamento.motivo.ver`, só DP/diretoria),
conteúdo clínico de afastamento e ASO (só DP, com trilha de leitura).

**Causa raiz:** temos 6 papéis fixos (funcionário, gestor, rh, dp, diretoria, admin) e o
papel `rh` virou um balaio. A permissão é por chave no banco — o mecanismo está certo —,
mas a composição papel→chave está congelada em migration e não há tela para o administrador
montar perfis.

**Correção proposta** (baixo custo, alto valor — a arquitetura já suporta):
1. Criar os papéis que ela descreve: **`recrutador`** (só o domínio de R&S + leitura mínima
   de cargo/vaga, sem ficha, sem desligamento, sem afastamento) e **`lider_td`**
   (Treinamento & Desenvolvimento — ver item 2).
2. Rebaixar o papel `rh` atual para o que sobra (clima, avaliação, feedbacks) ou dividi-lo.
3. **Tela de perfis**: administrador compõe papel × chaves sem depender de migration.
   É o que transforma o RBAC em ferramenta de gestão, não em configuração de dev.

---

## 2. O contraponto que ela mesma faz: Líder de T&D precisa de MAIS acesso

> "Diferente do recrutamento, o líder de T&D precisa de uma visão estratégica conectada ao
> DP. Atuando como Business Partner, ele necessita desses dados para desenhar planos de
> sucessão, calcular o ROI dos treinamentos e estruturar programas baseados em dados reais
> de headcount e cargos."

Observação madura: ela não pede "menos acesso para todo mundo", pede **acesso desenhado por
função**. O papel `lider_td` precisa de headcount, cargos, estrutura e resultado de avaliação
— mas provavelmente **não** de salário individual nem de conteúdo clínico.

Isso reforça o item 1: o problema não é "apertar", é **modelar perfis por função real**.

---

## 3. Dois campos que faltam e travam relatórios inteiros

Ela pediu no bloco de relatórios: *aniversariantes; quantidade de homens, mulheres, pais,
mães, filhos, crianças até 12 anos; diversidade*.

Conferido: `rh.colaborador` tem matrícula, CPF, nome, vínculo, admissão, status — **não tem
data de nascimento nem gênero**. Sem esses dois campos:
- **Aniversariantes** é impossível.
- **Diversidade** (relatório que ela pede no dashboard executivo) é impossível.
- Pais/mães/filhos: **parcialmente possível** — `rh.dependente` tem nascimento e parentesco,
  então "crianças até 12 anos" já é calculável.

**Correção:** migration acrescentando `data_nascimento` (obrigatório para novos) e `genero`
(autodeclarado, opcional, com opção de não informar — LGPD: dado sensível quando usado para
perfilamento; usar só em agregado). Custo baixo, destrava três relatórios.

---

## 4. Um fluxo de negócio real que não desenhamos: promoção e transferência

> "Aprovação de promoção do líder para a diretoria, autorização de transferência de líder
> para a diretoria e automaticamente com a aprovação o DP e Treinamento já ficam cientes
> providenciando os trâmites. **Hoje ocorre de forma aleatória em canais diversos ou sem canal.**"

Isto é o mais valioso do documento depois do item 1: é uma **dor operacional concreta**, com
o fluxo já descrito por quem vive o processo.

**O que temos:** o motor de demandas (solicitante → aprovação → execução, com prazo, trilha e
notificação) e o histórico de posição (`posicao_colaborador` com vigência, que já registra
mudança de cargo e salário).

**O que falta:** os **tipos de demanda** "Promoção" e "Transferência de unidade", com:
- cadeia de aprovação **líder → diretoria** (hoje o motor só tem aprovação de gestor direto);
- na aprovação, **efeito automático**: cria a nova posição vigente, notifica **DP e T&D**, e
  registra o evento na linha do tempo;
- vínculo com a faixa salarial do cargo destino (o controle de enquadramento que ela cita no
  PCCS — proposta fora da faixa exige justificativa, igual já fazemos na oferta de vaga).

Estimativa: é uma extensão do que existe, não um módulo novo. **Alto valor, custo médio.**

---

## 5. A tensão do clima — decisão a revisitar

> "O check-in diário é excelente, mas não substitui: pesquisa anual, eNPS, pulse survey,
> plano de ação."

Registro honesto: o desenho original previa exatamente isso (pesquisas periódicas + eNPS +
planos de ação por unidade). Em 2026-07-27 a decisão foi **simplificar para o check-in diário**.
A analista, independentemente, apontou a lacuna.

**Não é erro de execução — é o custo conhecido de uma decisão consciente.** O check-in diário
resolve tendência e sinal precoce; a pesquisa estruturada resolve diagnóstico e plano de ação.
São complementares. Vale reabrir a decisão com essa evidência externa em mãos.

---

## 6. Módulos sugeridos — o que já existe, o que é extensão, o que é novo

| Item que ela pediu | Situação real |
|---|---|
| **ATS**: requisição, aprovação, pipeline, entrevistas, carta proposta, integração com admissão | ✅ **Já existe e completo** — inclusive a integração automática (oferta aceita cria colaborador + processo de admissão na mesma transação) |
| Banco de currículos | 🟡 Parcial — temos candidatos com consentimento; falta busca/reaproveitamento em vagas futuras |
| **Alertas de término dos 45 dias** | ✅ **Já existe** (prazos 45/90 com alerta no painel de admissões) |
| **Organograma** (automático, vagas em aberto, headcount aprovado × realizado) | 🟡 **Os dados já existem** (`relacao_gestor` com vigência) — falta só a tela. Headcount aprovado × realizado precisa do conceito de "quadro aprovado", que não temos |
| **Onboarding** (trilha 90 dias, checklist por área, responsáveis, pesquisa) | 🟡 Temos checklist de admissão com prazos; falta trilha pós-admissão, responsável por item e pesquisa de onboarding |
| **PCCS** (trilhas de carreira, faixas, critérios de promoção, enquadramento) | 🟡 Temos cargos com CHA e faixas salariais versionadas; faltam trilhas de carreira, critérios de promoção e controle de enquadramento |
| **Portal do Gestor** (equipe, férias, avaliações, pendências, turnover, alertas) | 🟡 As telas existem por permissão, mas **não há um painel consolidado** — hoje o gestor navega módulo a módulo |
| **Portal do Colaborador** (dados, solicitações, benefícios, documentos, férias, avaliações, PDI) | 🟡 Mesma situação — tudo existe, falta a visão única |
| **Dashboard Executivo** (turnover, headcount, custo, tempo de contratação, absenteísmo, promoções, diversidade, ROI, clima, performance) | 🟡 Temos a Central de Metas com indicadores e faróis; falta o painel executivo com essa composição |
| **Comunicação interna** (comunicados, políticas, news, eventos, confirmação de leitura) | 🟡 O GED já faz documento + **ciência com hash** (= confirmação de leitura); falta a camada de mural/comunicado |
| **Reconhecimento** (entre colegas, premiações, Valores Fast, ranking, badges) | 🔴 **Novo** — não existe nada. Os 9 Valores Fast já estão no modelo da avaliação 360, seria a base natural |
| **9 Box / Sucessão** (matriz, pessoas-chave, sucessores, risco de perda) | 🔴 **Novo** — mas a avaliação 360 já produz o eixo de desempenho; falta o eixo de potencial e a matriz |
| **LMS / Universidade Corporativa** (trilhas, certificados, provas, obrigatórios, reciclagens) | 🔴 **Fora do escopo atual** — ela mesma diz "Hoje Sults, podemos continuar". Nosso lado seria **integrar** (histórico de treinamento na ficha), não construir |
| **Pesquisa de clima estruturada** (anual, eNPS, pulse, plano de ação) | 🔴 Cortado por decisão em 27/07 — ver item 5 |
| **Processos trabalhistas** (quantidade, no relatório) | 🔴 **Novo** — não existe nenhum registro de contencioso |
| **Relatórios**: treinados por setor/curso/função | 🔴 Depende do LMS/Sults |
| **Relatórios**: aniversariantes, homens/mulheres, diversidade | 🔴 Bloqueado pelos campos faltantes — ver item 3 |
| **Relatórios**: afastamentos médicos e motivos | 🟡 Temos o dado (cifrado). Atenção LGPD: relatório **agregado** por tipo é aceitável; expor motivo individual não |

Legenda: ✅ existe · 🟡 parcial/extensão · 🔴 novo

---

## 7. Risco estratégico que o feedback revela: sobreposição com o Sults

> "Eu pedi para TI abrir esses temas dentro do DP no **SULTS** porque lá registra essas
> solicitações que hoje fica tudo picado por boca, zap, sults, email."

Ela está resolvendo **a mesma dor** (canal único de solicitações) **em outra ferramenta**,
em paralelo. Se o Fast Pessoas entregar solicitações e o Sults também, a empresa terá dois
canais únicos — que é o mesmo que nenhum.

**Isto não é problema técnico, é decisão de escopo** e precisa de alinhamento antes que os
dois caminhos avancem. As perguntas: o Sults fica só como LMS (universidade/treinamento) e o
Fast Pessoas assume todo o DP/RH? Ou dividimos por tema? Quem decide?

---

## 8. Termo a esclarecer

**"RCF do cargo/função"** — ela pede na ficha do colaborador. Não identifiquei o significado
com segurança (Requisitos do Cargo e Função? Registro de Cargo e Função?). Temos o **CHA**
(Conhecimento, Habilidade, Atitude) versionado no cargo. **Perguntar a ela** se RCF é o mesmo
conceito com outro nome ou um documento formal distinto.

---

## 9. Priorização recomendada — e o placar de execução

> Atualizado em 2026-07-30, depois das ondas D e E. Legenda:
> ✅ entregue e demonstrável · 🟡 parcial · ⬜ não começou.

### Entregue (ondas D e E, 29–30/07/2026)

| # | Item | Onde ver | Prova |
|---|---|---|---|
| 1 | ✅ **Segregação de perfis** — papéis `recrutador` e `lider_td` criados, papel `rh` rebaixado (as 5 chaves de R&S saíram dele), **tela `/perfis`** compondo papel × chave sem migration | migration `0019_perfis.sql`, `/perfis` | Conferido no build de produção, 14 rotas × 7 personas: a home da recrutadora não traz Colaboradores/Folha/Desligamento/Afastamento/SST/Relatórios/Clima individual/Painel executivo; digitando a URL, a **tela redireciona** e a **API responde 403**; `/colaboradores` abre com **uma linha — ela mesma**; ficha de terceiro responde **"Colaborador não encontrado"** (ausência, não "acesso negado"); `colaborador_id` de terceiro em `/api/documentos` é **ignorado** e devolve a pasta do próprio. Roteiro bloco 5a. |
| 2 | ✅ **Líder de T&D com acesso desenhado** — estrutura, ficha, avaliação, relatórios e painel executivo; **sem** salário, saúde, motivo de desligamento e parecer de seleção | papel `lider_td` (18 chaves) | Roteiro bloco 5a |
| 3 | ✅ **`data_nascimento` e `genero`** (autodeclarado, com "não informar") + **relatórios de aniversariantes, diversidade, composição familiar e headcount**, com supressão de recorte < 5 | migration `0020`, `/relatorios` | 6 aniversariantes em julho, 0 fichas sem nascimento, 2 recortes de gênero suprimidos. Roteiro bloco 5c. |
| 4 | ✅ **Promoção e transferência** — tipos de demanda com **cadeia líder → diretoria**, efeito automático em transação (nova posição/lotação vigente + evento na linha do tempo + **notificação a DP e T&D**) e **controle de faixa com exceção justificada** | migration `0021`, `/demandas` → aba Promoções | 1 promoção **aguardando a diretoria** (DEM-0066), 2 aplicadas, 1 transferência; DEM-0064 com selo "Fora da faixa — com exceção". Roteiro bloco 5d. |
| 5 | ✅ **Organograma** automático da `relacao_gestor` vigente, com **headcount aprovado × realizado** e vagas abertas penduradas no gestor | `/organograma` | Realizado 62 · aprovado 64 · 2 posições abertas; a tela declara que "aprovado" ≠ quadro aprovado formal. |
| 6 | ✅ **Portal do Gestor e Portal do Colaborador** (consolidação) | `/portal-gestor`, `/portal-colaborador` | 7 e 8 blocos; afastado mostra só o fato; portal do colaborador sem remuneração. Roteiro bloco 4. |
| 7 | ✅ **Dashboard Executivo** (era Onda E) — headcount, turnover, custo de pessoal, tempo de contratação, absenteísmo, promoções, diversidade, clima/eNPS, performance, **cada card com "A CONTA"** | migration `0026`, `/painel-executivo` | Custo de pessoal **BLOQUEADO** para quem não tem `folha.ver` (sem valor mascarado); ROI de treinamento **SEM FONTE**. Roteiro bloco 6. |
| 8 | ✅ **RCF do cargo** completo nos 15 cargos, versionado, **imprimível** e repetido dentro da ficha — o termo do item 8 foi esclarecido com ela antes de implementar | migration `0020`, `/cargos/[id]/rcf` | Roteiro bloco 5b |
| 9 | ✅ **Pesquisa de clima estruturada** (item 5 — decisão reaberta): pesquisa anual + pulse + **eNPS** + comentário anônimo + **plano de ação**, convivendo com o check-in diário | migration `0022`, `/pesquisas` | Anual encerrada: adesão 75,8%, eNPS +25,5, pior pergunta "feedback do líder" 2,64, Filial Leste eNPS −50, 2 planos de ação. Roteiro bloco 5e. |

**Custo real:** quase nada foi tabela nova — foram **visões novas sobre dado que já
existia**, como previa a análise. As exceções (migrations 0019 a 0022 e 0026) são
pequenas e estão listadas acima.

### Não entregue — próximas ondas

| Item | Situação | Observação |
|---|---|---|
| **Onboarding estruturado** (trilha 90 dias, responsável por item, pesquisa) | 🟡 | Checklist de admissão com prazos 45/90 já existe; falta a trilha pós-admissão. |
| **PCCS completo** (trilhas de carreira, critérios formais de promoção) | 🟡 | A peça que trava dinheiro entrou: faixa salarial com exceção justificada na promoção. Falta trilha e critério. |
| **Comunicação interna / mural** | 🟡 | GED já faz documento + ciência com hash (= confirmação de leitura). Falta a camada de mural/news/eventos. |
| **9 Box e sucessão** | ⬜ | Eixo de desempenho já sai da avaliação 360; falta o eixo de potencial e a matriz. O organograma registra a linha de sucessão como sua evolução natural. |
| **Reconhecimento** (entre colegas, badges, Valores Fast) | ⬜ | Os 9 Valores Fast já estão no modelo da avaliação — base natural. |
| **Banco de currículos reaproveitável** | 🟡 | Candidatos com consentimento existem; falta busca e reaproveitamento. |
| **Integração com T&D/Sults** | ⬜ | Bloqueia ROI de treinamento e "treinados por curso/setor". Os blocos ficaram na tela, vazios e explicados. |
| **Ponto (REP-P) e eSocial/FGTS Digital** | ⬜ | Bloqueados por **compra** e por **certificado e-CNPJ A1** — não por engenharia. |
| **Processos trabalhistas (contencioso)** | ⬜ | Depende da decisão de escopo abaixo. |

### Decisões do usuário/diretoria (não técnicas)

- ~~Reabrir ou não a pesquisa de clima estruturada (item 5)~~ → **decidido: reaberta e
  entregue**, convivendo com o check-in diário.
- **Fronteira Fast Pessoas × Sults (item 7)** — ainda aberta, e agora mais urgente:
  o Fast Pessoas já entrega canal único de solicitações. Precisa de definição antes
  de os dois caminhos avançarem. Está no roteiro como pergunta explícita à diretoria.
- **Contencioso trabalhista entra no escopo?** — ainda aberta.
