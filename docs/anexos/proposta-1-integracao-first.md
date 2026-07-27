# Fast RH Hub — Integração Primeiro (orquestração sobre Nasajon)

> Gerado em 2026-07-24 por análise multi-agente sobre as fontes
> "Fast-RH - Conhecimento a Migrar.md" e "Ficha-Conhecimento-Portal-para-RH.md".
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**

## Visão geral

## Visão geral

**Tese da proposta:** o novo sistema de RH/DP da Fast **não é um sistema de folha nem de ponto** — é uma **camada de orquestração, experiência do colaborador e dados qualitativos** montada sobre os motores regulados que já existem (Nasajon para folha/DP legal; registrador de ponto homologado de mercado para marcações). Tudo que tem CLT, eSocial ou Portaria 671 no caminho é **integrado, nunca reimplementado**. Tudo que o Nasajon não cobre — histórico qualitativo do colaborador, avaliação 360, clima, workflows de aprovação, documentos com ciência digital — é construído nativamente, herdando a plataforma já validada do Portal de Vendas.

**Forma do sistema:**

```
Portal de Vendas (identidade/SSO/RBAC) ──┐
                                          │ SSO + chaves de permissão
Colaborador/Gestor/RH/DP ──► Front Next.js ──► API FastAPI (dona única da lógica)
                                          │            │
                                          │            ├─► PostgreSQL RH (instância dedicada,
                                          │            │    RLS, audit append-only, regra versionada)
                                          │            ├─► Nasajon (folha/DP: fonte de verdade legal)
                                          │            ├─► Ponto homologado REP-P (marcações)
                                          │            ├─► n8n (notificações/alertas)
                                          │            └─► DW SAP (read-only, enriquecimento analítico)
```

**Divisão de responsabilidades (o coração da lente Integração Primeiro):**

| Camada | Responsável | O que faz |
|---|---|---|
| Cálculo legal (folha, rescisão, 13º, férias-valores, encargos, eSocial) | **Nasajon** | Calcula e transmite. Nenhuma linha de cálculo trabalhista no sistema novo. |
| Marcação de ponto (validade jurídica, AFD/AEJ) | **REP-P homologado de mercado** (ou módulo Nasajon, se homologado — descoberta da Fase 0) | Registra e trata marcações conforme Portaria 671. |
| Processo, aprovação, conferência, prazo | **Fast RH Hub** | Esteira de fechamento, workflows de ajuste/férias/admissão/rescisão, alertas, checklists. |
| Dados qualitativos e experiência | **Fast RH Hub** | Linha do tempo do colaborador, 360, clima, feedback 90d, GED/ciência digital, demandas. |
| Identidade e permissão | **Portal de Vendas** (via SSO) | Login, 2FA, cargos, chaves RBAC. |

**Por que esta forma:** para 3 devs, o custo de oportunidade é o recurso mais escasso. Cada mês gasto reimplementando o que o Nasajon já faz (com passivo trabalhista embutido) é um mês a menos nos módulos onde o sistema novo gera valor exclusivo — a espinha dorsal do histórico, a 360 da btime e o clima anônimo, que **nenhum fornecedor entrega pronto no contexto Fast**. A proposta respeita integralmente os princípios inegociáveis das duas fontes: PostgreSQL transacional como fonte única do que é nosso, auditoria append-only garantida por GRANT no banco, versionamento de regra com vigência, API dona única da lógica, RBAC/RLS herdados do portal e LGPD por design (minimização, clima estruturalmente anônimo, trilha de acesso a dado sensível).

## Plataforma e stack

## Plataforma e stack

**Decisão de plataforma: app separado que herda identidade/RBAC do portal via SSO.** Não é módulo dentro do monorepo do portal (dado sensível de RH não compartilha app/deploy com o comercial; blast radius contido) e não é app 100% independente (repetiria o erro da btime: dois logins, dois RBACs, duas identidades visuais para 3 devs manterem). Repositório próprio, deploy próprio, mas **mesmos padrões técnicos e mesmo design system** do portal.

**Stack (posição fechada, não "depende"):**

| Camada | Escolha | Justificativa |
|---|---|---|
| Front | Next.js (App Router) + React + TypeScript + Emotion | Convergência das duas fontes; o time domina; design system do portal (tokens semânticos, `#d21217`, Instrument Sans/Lora, claro/escuro). |
| Back | **FastAPI + Python 3.12 + asyncpg + Redis** | Herda os módulos transversais prontos do portal (`nucleo/`: banco.py, rbac.py, seguranca.py com JWT httpOnly + 2FA, redis_cliente.py). Reimplementar RLS+RBAC+audit+vigência em Node custa mais e reintroduz risco em código de segurança. |
| Banco | **PostgreSQL em instância dedicada** (SaveinCloud, já disponível sem custo extra), credenciais e roles exclusivas | Segregação real do dado sensível; nenhuma credencial do portal alcança salário/saúde/avaliação. Backup automático desde o dia 1. |
| Integração/automação | n8n (webhooks, e-mail, alertas) — já operado pela empresa | Canal único de notificação; nada de script local por máquina (lição Fast-Agente §2.4). |
| Migrations | SQL numeradas em `docs/banco/`, no molde do portal (113+) | Rastreabilidade de schema. |

**Padrões estruturais herdados do portal (obrigatórios em todo domínio):**

- Backend em 4 camadas fixas: `rotas.py` (fina) → `servico.py` (regra) → `repositorio.py` (asyncpg, prepared statements — concatenar SQL proibido) → `esquemas.py` (Pydantic). Domínios nomeados em pt-BR.
- **RLS por transação** (`SET LOCAL app.usuario_id / app.organizacao_id`) em toda query.
- **Schema `audit` só-INSERT** (sem GRANT de UPDATE/DELETE ao usuário da aplicação), diff campo a campo com rótulo legível resolvido, UTC no armazenamento e `America/Sao_Paulo` explícito na exibição.
- **Versionamento de regra com vigência** (rascunho→ativa→encerrada, sem recálculo retroativo) no molde do domínio `imposto` (migrations 53/84/91).
- Front: `src/features/<dominio>/`, primitivos de `src/components/ui`, cliente HTTP único, `Intl` pt-BR para moeda/data.

**Camada de integração (componente novo, específico desta proposta):** um domínio `integracoes/` no backend com um **conector por sistema externo** (nasajon, ponto, sults, dw), cada um com: contrato tipado (Pydantic), estratégia primária (API) e **plano B de arquivo/batch** (importação CSV/planilha com validação e log de carga), tabela de staging por entidade importada, e **conciliação com relatório de divergência** (o que veio ≠ o que temos). Toda carga gera evento no audit. Esse desenho garante que, se a API do Nasajon for mais pobre que o esperado, o sistema degrada para troca de arquivos sem mudar a arquitetura.

**IA (Claude via MCP), opcional e fora do caminho crítico:** agente de DP conversacional para dúvidas, resumo de histórico para o gestor e lembretes — no padrão já validado "IA conversa, backend guarda e calcula". Nunca calcula, nunca decide acesso.

**Deploy:** SaveinCloud, ambientes de homologação e produção separados, segredos exclusivamente no servidor (variáveis de ambiente/secret manager). Método de trabalho: protótipo HTML standalone com tokens do portal → validação com DP/RH → código só com autorização expressa.

## Modelo de domínio

## Modelo de domínio (entidades por módulo)

### Núcleo de pessoas — a espinha dorsal (primeiro artefato de dados do projeto)

- **`colaborador`** — 1:1 com o usuário do portal (identidade vem do SSO; aqui só o que é de RH): matrícula Nasajon (chave de correlação com a folha), retrato, contexto histórico, status, datas. **Campo `tipo_vinculo` desde o dia 1** (CLT, estagiário, aprendiz, PJ, temporário) — retrofitar depois atinge ponto, folha e 360.
- **`cargo`** — descrição + **CHA estruturado** (insumo direto do pilar de 40% da 360). **`posicao_salarial`** com vigência (histórico de cargo/salário; o valor oficial vem do Nasajon, aqui fica o espelho versionado).
- **`hierarquia`** — relação gestor→liderado **com vigência** (quem respondia a quem, quando). Sem isso, nem "gestor vê equipe" nem a 360 Fase 1 funcionam. + `unidade` e `centro_custo` por colaborador.
- **`evento_linha_tempo`** — tabela append-only que unifica a linha do tempo: admissão, mudança de cargo/salário, ocorrência, feedback, afastamento, férias, avaliação, advertência, treinamento, desligamento. Todo módulo **pendura** eventos aqui; é a materialização do "histórico como espinha dorsal".
- Portados do Fast-Agente (modelo, não código): **`ocorrencia`** (fato datado, tipo, impacto, causa, ação, valores relacionados), **`feedback_formal`** (ciclo-alvo de 90d com alerta, parametrizável), **`acao_aberta`** (prazo/status), **`treinamento`** (manual/importado — Sults sem API confirmada).

### Ponto (integração — nada de marcação própria)

- **`espelho_ponto`** (importado do REP-P/Nasajon por competência: marcações tratadas, jornada, saldo), **`ocorrencia_ponto`** (atraso/falta/extra classificada), **`solicitacao_ajuste`** (workflow colaborador→gestor→DP com trilha; o ajuste efetivo é feito no sistema de origem e reimportado), **`jornada_escala`** versionada por colaborador/unidade (5x2, 6x1, 12x36; feriados municipais por unidade) — cadastro local para dar contexto ao espelho e alimentar alertas.

### Folha e fechamento (esteira de conferência, não de cálculo)

- **`competencia`** (mês/unidade), **`etapa_fechamento`** (coleta de variáveis → envio ao Nasajon → prévia → conferência → aprovação → publicação), **`variavel_mensal`** (faltas, extras, comissões do DW, descontos de benefícios — o pacote que vai ao Nasajon), **`divergencia`** (apontamento prévia × esperado, com resolução), **`snapshot_folha`** (resultado importado do Nasajon, **imutável**, ligado à versão de regra vigente), **`holerite_publicado`** (com ciência digital). Aprovação de fechamento exige chave `folha.fechar` e grava no audit.

### Avaliação 360 (spec btime como especificação funcional)

- **`modelo_avaliacao`** versionado com vigência: pilares (Dever 30 / CHA 40 / Fit Cultural 30), indicadores, pesos, faixas — 100% administrável pelo RH; mudança vale só para ciclos abertos depois. **`ciclo`** (Experiência 45/90d; Desempenho semestral), **`avaliacao`** e **`resposta`** (escala 1–5), **`flag_resultado`** + **`decisao_humana`** (justificativa obrigatória se divergir da flag), **`pdi`**. Os 9 Valores Fast com descritores (`fast_kb_valores_fast.md`) são o conteúdo do pilar Fit Cultural. Card do Colaborador nasce privado; advertências/licenças/notas brutas estruturalmente fora do compartilhável. Feedback 90d e ocorrências **alimentam** a avaliação, mas são processo separado.

### Clima (schema fisicamente isolado, desenho oposto ao resto)

- **`pesquisa`**, **`pergunta`**, **`resposta_anonima`** — **sem FK para colaborador**, só atributos agregáveis (unidade, ciclo), sem timestamp preciso; **`participacao`** em tabela desconectada (registra QUE respondeu, nunca O QUE). Schema próprio sem grant de JOIN com identidade; k-anonimato ≥5 nos recortes; agregação só no backend. eNPS e enquetes anônimas vivem aqui.

### Demandas e workflows (portado do Fast-Agente, estendido)

- **`demanda`** (solicitante→executor, status, prazo, prioridade) + **`etapa_aprovacao`** (cadeia gestor→DP) + transições auditadas + notificação n8n. É o motor genérico de: ajuste de ponto, férias, documentos, benefícios, admissão/rescisão e solicitações LGPD de titular.

### Complementos (lacunas cobertas)

- **Férias:** `periodo_aquisitivo` (espelhado do Nasajon), `programacao_ferias` (workflow sobre demandas), painel de vencimento com alerta (férias vencida = pagamento em dobro). Cálculo de valores no Nasajon.
- **Admissão/rescisão:** `processo_admissao` e `processo_desligamento` como checklists com prazo legal (contrato de experiência 45/90d amarrado ao ciclo de Experiência da 360; rescisão com contagem do art. 477 e **gatilho de revogação de acessos no RBAC do portal**). S-2200/S-2299 transmitidos pelo Nasajon.
- **Afastamentos:** `afastamento` na linha do tempo (tipo, período, documento); atestado com acesso restrito a DP (fora do que gestor vê). Alimenta ponto (não acusar falta indevida) e férias.
- **GED/documentos:** `documento` pendurado na ficha + **`ciencia_digital`** (hash, padrão btime) + trilha de acesso no audit. Holerites e informes de rendimento importados do Nasajon e publicados aqui. Assinatura qualificada via integração externa só quando exigida.
- **Benefícios:** `beneficio`, `adesao`, `dependente` (dado de terceiro — LGPD); pedidos via demandas; descontos viram `variavel_mensal` para o Nasajon.
- **SST (fase 3):** `aso` com vencimento e convocação, `cat`, entrega de EPI com ciência. Transmissão dos eventos SST fica com a clínica/Nasajon — mapear quem envia hoje já na Fase 0.

## Integrações

## Integrações e fontes de verdade

**Princípio:** cada dado tem **um único dono**; o resto é espelho com conciliação. Dupla digitação é tratada como bug de processo.

| Sistema | É fonte de verdade de | O RH Hub faz |
|---|---|---|
| **Portal de Vendas (SSO)** | Identidade, login, 2FA, cargos e chaves RBAC, unidades | Consome via SSO; concede as chaves novas de RH (`folha.fechar`, `ponto.ajustar`, `avaliacao.configurar`, `rh.auditar`...). Desligamento no RH dispara revogação de acesso no portal. |
| **Nasajon** | Cadastro legal do empregado (matrícula, contrato, salário oficial), cálculo de folha, férias (valores), 13º, rescisão, afastamentos legais, eSocial | Envia variáveis do mês (esteira de fechamento), importa resultado (snapshot imutável), holerites, períodos aquisitivos, afastamentos. Conciliação com relatório de divergência a cada carga. |
| **REP-P homologado de mercado** (ou módulo de ponto do Nasajon, se homologado) | Marcações de ponto, tratamento conforme Portaria 671, AFD/AEJ | Importa espelho de ponto e ocorrências; hospeda o workflow de solicitação de ajuste (execução do ajuste no sistema de origem, reimportação); alertas via n8n. **Nunca** desenvolve marcação própria, nem como "coletor". |
| **Sults** | Trilhas e conclusões de treinamento — **se e quando houver API** (discovery registrou que não havia) | Até confirmação formal: registro manual/importação de treinamentos na ficha. Não bloqueia 360 nem histórico. |
| **SAP / DW (SAP_MIRROR)** | Nada de RH. Vendas/financeiro, somente leitura | Enriquecimento analítico: resultado comercial × pilar Dever da 360; comissões como variável do fechamento; validar centros de custo antes de qualquer uso além disso. **Fora do caminho crítico.** |
| **n8n** | — (orquestrador) | Todas as notificações: atraso de feedback 90d, férias vencendo, etapa de fechamento pendente, ASO a vencer, contrato de experiência acabando. |
| **Fast RH Hub (o sistema novo)** | Histórico qualitativo (ocorrências, feedback, ações), 360 e seus modelos versionados, clima (anônimo), demandas/workflows, checklists de admissão/rescisão, GED/ciência digital, hierarquia gestor-liderado, cargos com CHA, jornadas/escalas cadastrais | É o dono do **processo** e da **experiência**; espelha o legal, nunca o recalcula. |

**Fluxos mestres (direção da escrita):**

1. **Admissão:** RH Hub abre o processo (checklist, documentos, ciência) → DP registra no Nasajon (S-2200 é do Nasajon) → RH Hub importa matrícula e ativa a ficha + acessos via portal.
2. **Fechamento mensal:** RH Hub consolida variáveis (ponto, faltas, afastamentos, benefícios, comissões DW) → envia ao Nasajon (API ou arquivo) → importa prévia → conferência com apontamento de divergências → aprovação auditada → importa resultado final como snapshot → publica holerites com ciência.
3. **Ajuste de ponto:** colaborador solicita no RH Hub → gestor/DP aprovam com trilha → ajuste executado no sistema de ponto → reimportação confirma → divergência aberta se não bater.
4. **Desligamento:** RH Hub roda o checklist (prazo art. 477, exame, devoluções, entrevista) → Nasajon calcula rescisão e transmite S-2299 → RH Hub registra decisão com justificativa versus flag da 360 e revoga acessos.

**Gate obrigatório (Fase 0, antes de qualquer desenho de módulo):** mapear formalmente a API do Nasajon (autenticação, entidades, escrita de variáveis, exportação de resultado e holerite, status de eventos eSocial), verificar se há módulo de ponto homologado, e obter da btime o TO-BE e o código da 360. Todo conector nasce com **plano B de arquivo/batch** e os contratos com fornecedores devem ter **cláusula de exportação de dados**.

## Segurança e LGPD

## Segurança e LGPD

**RBAC** — herdado do portal, não reinventado: permissão por chave no banco (`sistema.tem_permissao`), exposta como dependency na rota FastAPI. Chaves novas de RH: `rh.ficha.ver_equipe`, `rh.ficha.ver_todos`, `rh.sensivel.saude` (atestados — só DP), `ponto.ajustar`, `ponto.aprovar`, `folha.variaveis`, `folha.fechar`, `folha.publicar`, `avaliacao.configurar`, `avaliacao.decidir`, `clima.configurar`, `clima.agregados`, `rh.auditar` (só leitura de trilha), `ged.publicar`, `lgpd.titular`. Os papéis do Fast-RH (funcionario/gestor/rh/dp/admin) viram composições de chaves, não um modelo paralelo.

**RLS por transação** — `SET LOCAL app.usuario_id/app.organizacao_id` em toda query; "cada pessoa vê só o que é dela; gestor vê a equipe (via `hierarquia` vigente); RH/DP veem o escopo do papel; auditor só lê". A camada de cima nunca decide acesso — a API valida em toda chamada.

**Segregação física** — instância PostgreSQL dedicada ao RH, roles e credenciais exclusivas; nenhuma credencial do portal alcança o banco de RH. Backup automático testado (restore ensaiado) desde o dia 1. Segredos só no servidor.

**Auditoria** — schema `audit` só-INSERT (imutabilidade por GRANT, não por disciplina), diff campo a campo com rótulo resolvido, UTC + exibição America/Sao_Paulo. Cobre **escrita** (ajuste de ponto, etapa de fechamento, nota, ocorrência, transição de demanda) **e leitura de dado sensível** (quem abriu salário, atestado, avaliação de quem, quando) — trilha de acesso é requisito, não extra.

**Anonimato de clima (estrutural, não por política)** — schema fisicamente separado; respostas **sem FK para colaborador** e sem timestamp preciso; participação em tabela desconectada; k-anonimato ≥5 em todo recorte (real com 5 unidades); agregação exclusivamente no backend; grant que impede JOIN com identidade. Nenhum DBA reidentifica porque o dado não existe ligado.

**Minimização** — o payload de cada rota contém só o que aquela chave autoriza: salário, nota bruta, advertência e atestado jamais trafegam para quem não pode ver (padrão de ocultação do portal). Card do Colaborador da 360 nasce privado; dado sensível estruturalmente fora do compartilhável.

**Governança LGPD operacional** — decidida na Fase 1 como arquitetura: tabela de temporalidade por categoria de dado (trabalhista 5–30 anos conforme tipo; candidato muito menos), base legal mapeada por tratamento, **RIPD antes de implementar** ponto (biometria no fornecedor) e clima. Dados de dependentes (terceiros) com tratamento próprio. Fila de direitos do titular via módulo de demandas e relatório de acessos a dado sensível a partir do audit entram como funcionalidade na Fase 3. Conflito imutabilidade × eliminação resolvido por design: audit guarda rótulos/diffs necessários à obrigação legal, e a anonimização atinge as tabelas de negócio, nunca por UPDATE no audit (expurgo por política de retenção documentada).

**Ciência digital** — hash para holerites, políticas, advertências e comunicados (valor probatório com custo baixo); assinatura qualificada via integração só onde a lei exige.

## Fases

## Roadmap em fases

### Fase 0 — Descobertas e protótipos (4–6 semanas, nenhuma linha de código de produto)

- **Mapear a API do Nasajon** (autenticação, entidades, escrita de variáveis, exportação de folha/holerite, status eSocial) e verificar **módulo de ponto homologado**; se não houver, cotar REP-P de mercado com integração Nasajon. Definir plano B (arquivo/batch) por integração.
- **Pedir formalmente à btime o TO-BE e o código da 360.** Verificar com o fornecedor do Sults a existência de API do módulo universidade. Mapear quem transmite os eventos SST hoje (clínica × Nasajon).
- Definir o contrato de **SSO com o portal** e as chaves RBAC novas. RIPD inicial (ponto/clima). Tabela de temporalidade por categoria de dado.
- **Protótipos HTML standalone** (tokens do portal, acesso simulado por seletor) das telas críticas: ficha/linha do tempo, esteira de fechamento, espelho de ponto, ciclo de avaliação. Validar com DP/RH antes de codar.

**Por que primeiro:** as decisões 3 e 4 (folha/ponto) dependem do que o Nasajon expõe; desenhar módulo sobre API que não existe é o erro Sults repetido em escala.

### Fase 1 — Fundação (≈3 meses): plataforma + espinha dorsal

- Plataforma: SSO, RBAC/RLS, schema `audit`, migrations, molde de domínio em 4 camadas, backup, ambientes.
- **Núcleo de pessoas:** colaborador (com `tipo_vinculo`), cargo com CHA, posição/salário com vigência, **hierarquia gestor-liderado com vigência**, unidades/centros de custo, `evento_linha_tempo`, ocorrências, feedback 90d, ações abertas.
- **Conector Nasajon v1 (leitura):** importar cadastro/matrículas, afastamentos e períodos aquisitivos, com staging e conciliação.
- **Demandas** portado (base genérica de workflow) + notificações n8n.

**Por que nesta ordem:** todas as fontes convergem — todo módulo pendura na linha do tempo; e a 360 e o "gestor vê equipe" dependem da hierarquia. É o menor conjunto que já entrega valor visível (ficha viva + histórico + demandas).

### Fase 2 — Operação de DP (≈6 meses, incremental por módulo)

1. **Jornadas/escalas cadastrais + espelho de ponto** importado + workflow de ajuste com trilha + alertas.
2. **Afastamentos** na linha do tempo (atestado restrito a DP) — junto do ponto, para não acusar falta indevida.
3. **Férias:** programação/aprovação sobre demandas + painel de vencimento com alertas.
4. **Esteira de fechamento v1:** variáveis → Nasajon → prévia → conferência → aprovação auditada → snapshot imutável → **GED com holerites e ciência digital** (entra junto, é a entrega visível ao funcionário).
5. **Admissão e rescisão** como checklists com prazos legais e gatilho de revogação de acessos.
6. **Avaliação 360:** modelo versionado + ciclo de Experiência (45/90d, amarrado ao contrato de experiência) primeiro; Desempenho semestral em seguida; 9 Valores como Fit Cultural.
7. **Clima v1:** schema isolado, pesquisa + eNPS com k-anonimato.

**Por que nesta ordem:** segue a dependência operacional do mês do DP (ponto → afastamentos → férias → fechamento) e entrega o fechamento — o coração do DP — só depois que suas entradas existem. 360 e clima fecham a fase porque dependem da hierarquia e da cultura de uso já criada.

### Fase 3 — Expansão (contínua)

- **Benefícios completo** (movimentação para operadoras e conciliação; adesões já na Fase 2 via demandas).
- **SST:** vencimento de ASO com convocação, CAT, entrega de EPI com ciência.
- **Painel de obrigações** (agenda de compliance: eSocial, FGTS Digital, DCTFWeb, 13º) com status por competência — alimentado por API do Nasajon se houver, senão confirmação manual do DP.
- **People analytics:** turnover, absenteísmo, horas extras, custo por centro de custo, headcount, painel de vencimentos; cruzamento DW SAP × 360 (com veto a cruzamentos individuais vedados pela LGPD). Obs.: desde a Fase 1 todo módulo nasce emitindo os eventos/datas que esses indicadores precisam.
- **R&S mínimo** (requisição de vaga → headcount → alimenta admissão; pipeline completo via ATS de mercado se o volume justificar), **mural com ciência**, fila LGPD de titular, organograma visual e controle de quadro.

## Riscos

## Riscos da proposta e mitigações

1. **API do Nasajon insuficiente ou inexistente** (risco central da lente Integração Primeiro). *Mitigação:* gate na Fase 0 antes de qualquer desenho de módulo; camada de integração nasce com plano B de arquivo/batch por conector (a arquitetura não muda, só o transporte); cláusula contratual de exportação de dados. *Sinal de alarme:* se nem troca de arquivos for viável, o fechamento vira esteira com passos manuais confirmados — ainda assim melhor que cálculo próprio.

2. **Dependência de fornecedores / lock-in** (Nasajon, REP-P, Sults). *Mitigação:* snapshots imutáveis de tudo que é importado (o histórico vive no nosso banco, não só no deles); contratos com cláusula de exportação; precedente Sults tratado como regra — **nenhuma integração é assumida sem contrato de API validado**.

3. **Dupla entrada de dados RH Hub × Nasajon** (cadastro em dois lugares corrói confiança e gera divergência de folha). *Mitigação:* dono único por campo definido em tabela de fluxos mestres (esta proposta já fixa a direção); conciliação automática a cada carga com relatório de divergência e fila de resolução; matrícula Nasajon como chave de correlação única.

4. **Time de 3 devs sem proficiência em Python/FastAPI.** *Mitigação:* validar honestamente na Fase 0; o molde do portal (4 camadas, nucleo/ pronto) reduz o problema a "aprender o padrão", não "criar o padrão"; front permanece no stack que o time domina. *Reversão:* só reconsiderar Node se comprovado que ninguém sustentará Python — e mesmo assim portando os padrões (RLS, audit, vigência), nunca improvisando.

5. **btime não entregar TO-BE/código da 360.** *Mitigação:* o modelo de negócio essencial (pilares, pesos, faixas, ciclos, flags, LGPD by design) já está documentado na ficha do portal; a spec se reconstrói a partir dela; o HTML era descartável de qualquer forma. Perde-se semanas, não meses.

6. **Anonimato de clima quebrado por recorte pequeno** (5 unidades = grupos pequenos reais). *Mitigação:* k-anonimato ≥5 imposto no backend (recorte abaixo disso não é exibido, nem para admin); sem FK e sem timestamp preciso por desenho; RIPD antes do primeiro ciclo. *Risco residual aceito:* menos granularidade analítica em unidades pequenas — preferível a enviesar a resposta.

7. **"Integração primeiro" virar "ninguém confere"** (a folha é do Nasajon, o ponto é do REP, e as multas chegam mesmo assim). *Mitigação:* a esteira de fechamento e o painel de obrigações existem exatamente para isso — status por competência, aprovação com dono nomeado e trilha; alerta n8n para prazo sem confirmação.

8. **Escopo do DP crescer para dentro do cálculo** ("já que temos as variáveis, calcula aí a prévia"). *Mitigação:* princípio arquitetural escrito e inegociável — o sistema aponta divergência entre esperado e calculado, mas o número oficial é sempre o do Nasajon; qualquer exceção exige decisão registrada no log de decisões.

9. **Sincronização de identidade tripla (portal × RH Hub × Nasajon)** — admitido/desligado em um e não no outro é falha de segurança e de folha. *Mitigação:* checklists de admissão/rescisão têm as etapas de provisionamento/revogação como itens bloqueantes auditados; conciliação periódica de ativos entre os três sistemas com alerta de órfãos.

10. **Retrofit de auditoria/vigência por pressa** (entregar módulo sem trilha "por enquanto"). *Mitigação:* audit e versionamento estão na Fase 1 como fundação; nenhum domínio novo passa em revisão sem gravar no audit e sem regra versionada onde há parametrização — as duas fontes marcam isso como barato agora e irrecuperável depois.
