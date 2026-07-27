# Workflows e demandas DP↔funcionário (domínio `rh_demandas`)

> Revisado em 2026-07-24 (v2) após decisões do usuário. Substitui integralmente a v1
> (gerada por análise multi-agente sobre "Fast-RH - Conhecimento a Migrar.md" e
> "Ficha-Conhecimento-Portal-para-RH.md"). Alinhado à arquitetura v2
> (`docs/02-arquitetura.md`): app próprio e separado na Fase A, stack Next.js +
> TypeScript + Node.js com PostgreSQL dedicado na SaveinCloud, sem integração Nasajon.
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**

**Fase sugerida:** Fase 1 (núcleo do motor + solicitações de documentos/declarações + pendências DP→funcionário + aprovação simples) — é, por decisão registrada, o primeiro módulo transacional e parte da entrega cedo ao DP/RH: risco regulatório zero e serve para o time consolidar os padrões da casa (papel validado no backend, RLS via `SET LOCAL`, audit só-INSERT, vigência) no stack Next.js/Node. Critério de pronto do gate 1→2: DP usando demandas em produção, audit e autorização por papel cobertos pela matriz de testes papel × recurso no CI. Handlers de efetivação (férias, ajuste de ponto, promoção, benefícios), SLA em dias úteis e delegação: Fase 2, na ordem do roadmap de cada domínio alvo. Fila LGPD, relatórios de SLA e abertura conversacional por IA: Fase 3.

## Objetivo

Ser o motor transacional genérico de solicitações, aprovações e pendências entre funcionário, gestor e DP/RH — cada demanda com solicitante→executor, tipo, status, prazo e prioridade (modelo portado do Fast-Agente, modelo e regras, nunca o código), com etapas de aprovação, trilha de auditoria completa e notificações via n8n (e-mail transacional como canal padrão; WhatsApp Cloud API para o que for urgente). É deliberadamente o primeiro módulo transacional do sistema: risco regulatório próximo de zero, consolida os padrões inegociáveis no stack Next.js/TypeScript/Node e vira a espinha operacional sobre a qual os fluxos regulados (férias, ajuste de ponto, promoções, benefícios, fila LGPD) penduram nas fases seguintes. Regra estrutural: a demanda ORQUESTRA, o domínio alvo EFETIVA — este módulo nunca escreve em tabela de outro domínio.

## Funcionalidades

## MVP (Fase 1)

### Catálogo de tipos de demanda (parametrização pelo RH/DP, sem dev)
- Tipo de demanda com: nome, categoria (documento/declaração, pendência DP→funcionário, solicitação genérica), descrição orientativa ao solicitante, **campos do formulário definidos como schema (JSONB validado)**, SLA, prioridade padrão, fila executora padrão, **template de etapas de aprovação (0..n, sempre lineares)**, classificação de sensibilidade, flag exige-anexo, quem pode abrir, **canais de notificação por gatilho (e-mail padrão; WhatsApp só para gatilhos urgentes)**.
- **Versionado com vigência** (rascunho→ativa→encerrada, padrão inegociável da arquitetura): demanda aberta congela a versão do tipo vigente na abertura; mudar formulário/SLA/aprovação = nova versão, sem efeito retroativo.

### Abertura
- Self-service pelo funcionário (só tipos habilitados ao seu papel).
- Pelo gestor em nome de liderado; pelo DP em nome de qualquer colaborador (**beneficiário ≠ solicitante** — cobre também colaborador ainda sem acesso ao app, abertura assistida).
- Pendência DP→funcionário: DP abre demanda cujo executor é o próprio colaborador (ex.: "entregar comprovante de residência"), com prazo e cobrança automática.

### Máquina de estados única e fixa
`aberta → em_analise → aguardando_aprovacao → aprovada | reprovada → em_execucao → concluida`, com desvios `devolvida_ao_solicitante` (pendência de informação, volta ao fluxo) e `cancelada` (pelo solicitante antes da execução; pelo DP com motivo obrigatório). **Concluída não reabre — reabertura é nova demanda vinculada à original** (mesmo princípio de "fechado não reabre").

### Aprovações
- Etapas lineares resolvidas na abertura: aprovador por **gestor imediato via `relacao_gestor` vigente**, por chave RBAC (ex.: qualquer usuário com papel `rh`) ou usuário nomeado.
- Decisão aprovar/reprovar; **justificativa obrigatória na reprovação**; cada decisão gravada com autor e timestamp UTC no audit.
- Reatribuição administrativa de aprovador/executor pelo DP, sempre com motivo registrado (mitigação MVP para aprovador ausente).

### Execução (fila do DP)
- Fila por unidade/escopo com ordenação por vencimento e prioridade; analista assume (claim), trata, conclui com entrega ou devolve com pendência descrita.
- Entrega de documento/declaração: **exclusivamente via GED** (`rh.documento` com hash SHA-256), com ciência digital opcional conforme o tipo. Nada de anexo solto fora do GED.

### Interação e transparência
- Comentários com visibilidade dupla: pública (solicitante vê) × interna (só DP/RH).
- Timeline da demanda (projeção de eventos append-only): transições, decisões, comentários, anexos, notificações.
- Painéis: "Minhas demandas" (funcionário), "Aprovações pendentes" (gestor), "Fila do DP" (analista), visão consolidada (papel `rh`).

### Prazo, prioridade e notificação
- Vencimento calculado pelo SLA do tipo; badge de atraso; ordenação da fila por criticidade.
- Notificações via n8n (abertura, atribuição, aprovação pendente, decisão, prazo D-1 e vencido, conclusão): **e-mail transacional é o canal padrão de todos os gatilhos; WhatsApp Cloud API reservado aos gatilhos urgentes** (prazo vencido, aprovação parada, pendência crítica DP→funcionário), por ter custo por mensagem. Mapeamento gatilho→canal parametrizado no tipo de demanda. **Payload mínimo: id da demanda + link; dado sensível jamais no payload** (regra fixa da camada de integrações).

### Integração com a espinha dorsal
- Demanda concluída de tipos relevantes gera `evento_colaborador` na linha do tempo do beneficiário (resumo legível resolvido + referência à demanda).

## Evolução (Fase 2)
- **Handlers de efetivação por tipo** — contrato interno: demanda aprovada → chamada ao serviço do domínio alvo → efetivação transacional lá → evento. Fluxos: **férias** (`programacao_ferias`, com validações legais no handler), **ajuste de ponto** (`ajuste_ponto` no domínio `rh_ponto` — o tratamento é nosso; a marcação original do REP-P permanece imutável, com AFD/AEJ preservados no registrador contratado), **promoção/reajuste** (`posicao_colaborador`, nova linha por vigência), **adesão a benefício**, itens de checklist de admissão/desligamento que geram pendências.
- SLA em **dias úteis** com calendário de feriados por unidade (depende da entidade `feriado` do contexto ponto — ver riscos).
- **Delegação de aprovação com vigência** (gestor de férias/afastado) e escalonamento automático por atraso (notifica nível acima).
- Modelos de documento padrão por tipo (ex.: declaração de vínculo gerada de template, se o DP validar o conteúdo).

## Evolução (Fase 3)
- **Fila LGPD de direitos do titular** (art. 18/19): tipos dedicados com prazo legal, ligados ao relatório de acessos a dado sensível extraído do audit.
- Relatórios de SLA, volume e gargalo por tipo/unidade/executor, alimentando o people analytics.
- Abertura e consulta conversacional via agente de DP (IA/MCP) — **IA conversa e registra, nunca decide nem aprova**.
- Etapas condicionais simples (ex.: aprovação extra se reajuste > X%) — somente se demanda real comprovada; até lá, manter estritamente linear.

## Entidades de dados

Todas no schema `rh` do PostgreSQL dedicado (SaveinCloud), escrita transacional, trilha no `audit` (só-INSERT por GRANT), datas em UTC.

### `tipo_demanda` + `tipo_demanda_versao` (parametrizador, versão com vigência)
- `tipo_demanda`: identidade estável (slug, categoria, ativo).
- `tipo_demanda_versao`: nome exibido, descrição, **schema do formulário (JSONB, validado por schema declarativo no backend Node/TypeScript — ex.: JSON Schema/Zod, definição no design técnico)**, SLA (valor + unidade dias corridos/úteis), prioridade padrão, fila executora padrão, template de etapas (ordem + tipo de aprovador), classificação de sensibilidade, exige_anexo, papéis que podem abrir, canais de notificação por gatilho, status (rascunho→ativa→encerrada), vigência, responsável.

### `demanda` (núcleo)
- Número legível sequencial; FK **`tipo_demanda_versao`** (congela a regra da época); `solicitante_usuario_id` (usuário próprio do app — cadastro da Fase A); `beneficiario_colaborador_id` (pode diferir do solicitante); unidade/lotação do beneficiário (denormalizada para RLS e fila); `executor_atribuido` (nulo até claim); status; prioridade; `prazo_limite` (calculado, editável pelo DP com motivo); **payload JSONB validado contra o schema da versão do tipo**; `referencia_dominio` + `referencia_id` (aponta a entidade efetivada pelo handler — ex.: `programacao_ferias`); origem (web / abertura assistida DP / IA futura); `demanda_origem_id` (reabertura vinculada); datas (aberta_em, concluida_em); motivo de cancelamento.

### `etapa_aprovacao`
- FK demanda; ordem; `tipo_aprovador` (gestor_imediato | chave_rbac | usuario_nomeado); `aprovador_resolvido_usuario_id` (resolvido na abertura via `relacao_gestor` vigente); status (pendente/aprovada/reprovada); justificativa (obrigatória na reprovação); decidida_por; decidida_em.

### `evento_demanda` (append-only — timeline)
- FK demanda; tipo (transição, decisão, comentário, atribuição, anexo, notificação, reatribuição); autor; texto/payload; **visibilidade (publica | interna_dp)**; criado_em. É projeção para a tela; a trilha legal fica no `audit` com diff e rótulo resolvido.

### `anexo_demanda`
- Liga demanda ↔ `rh.documento` (GED); papel do anexo (requisito do solicitante | entrega do DP); anexo sensível herda classificação e grava **trilha de leitura**.

### `delegacao_aprovacao` (Fase 2)
- Delegante, delegado, vigência, escopo (tipos abrangidos); auditada.

### `notificacao_demanda`
- Log de disparos n8n: gatilho, **canal (email | whatsapp)**, referência (id/link, nunca conteúdo), status do disparo, tentativas, timestamps. Falha de n8n nunca bloqueia a transação da demanda. O log por canal também dá visibilidade do custo das mensagens WhatsApp.

### Relações-chave
- `demanda.beneficiario` → `rh.colaborador` (1:1 com o usuário próprio do app); resolução de aprovador → `rh.relacao_gestor` vigente; anexos → `rh.documento`; conclusão relevante → `rh.evento_colaborador`; tudo → `audit` (duas trilhas: alteração + leitura de dado sensível).

## Papéis e permissões

Autenticação e cadastro **próprios do app (Fase A)** — papéis base `funcionario` / `gestor` / `rh` / `dp` / `admin`, 2FA obrigatório para `dp`/`rh`/`admin`; mapeamento com o portal corporativo fica para a Fase B. Chaves RBAC finas por migration na Fase 0; **todo papel/chave é validado no backend Node (guard/middleware nas rotas da API), nunca só na interface**.

| Papel | Pode |
|---|---|
| **Funcionário** (`funcionario`) | Abrir demanda dos tipos habilitados; ver/comentar/cancelar (antes da execução) **as próprias** (solicitante ou beneficiário); anexar; dar ciência em entrega. Nunca vê comentários internos. |
| **Gestor** (`gestor`) | Tudo do funcionário + abrir em nome de liderado; **aprovar etapas onde é aprovador resolvido**; ver demandas da equipe — derivação exclusiva de `rh.relacao_gestor` vigente, nunca flag manual. Não vê payload sensível que o tipo restrinja ao DP. |
| **DP** (`dp` — analista) | Fila da sua unidade/escopo: assumir, executar, devolver, concluir, reatribuir com motivo, ajustar prazo com motivo, cancelar administrativamente; ver comentários internos; abrir pendência DP→funcionário e demanda em nome de terceiro. |
| **RH** (`rh` — gestão) | Tudo do analista + visão consolidada de todas as unidades + **configurar tipos de demanda** (criar/ativar versão com vigência, incluindo canais de notificação por gatilho). |
| **Auditoria** (chave `rh.demanda.auditar`, atribuível a usuário nomeado) | Leitura integral (demandas, etapas, timeline, trilhas) sem nenhuma ação de escrita; toda leitura auditada. Sem papel dedicado na Fase A — é chave RBAC. |
| **Admin** (`admin`) | Sem acesso funcional a conteúdo de demandas por padrão; superusuário só de plataforma (usuários, papéis, parâmetros). Acesso DBA nominal e logado. |

Chaves: `rh.demanda.abrir`, `rh.demanda.abrir_para_terceiro`, `rh.demanda.aprovar`, `rh.demanda.executar`, `rh.demanda.ver_equipe`, `rh.demanda.ver_todas`, `rh.demanda.configurar`, `rh.demanda.cancelar_administrativo`, `rh.demanda.auditar`.

RLS no Postgres via pool `app_rh` com `SET LOCAL app.usuario_id/app.unidade_escopo` em toda transação onde couber; onde o `SET LOCAL` não se aplicar bem ao fluxo Node, a autorização vive no repositório de dados — nos dois casos, coberta pela **matriz de testes papel × recurso no CI** (gate 1→2). Solicitante/beneficiário vê a própria; gestor vê equipe via `relacao_gestor` vigente + onde é aprovador; analista vê a fila do escopo. Payload minimizado: campo sensível **ausente do JSON** de quem não pode ver — ausência, não máscara. Toda leitura de anexo classificado como sensível grava trilha de leitura desde a Fase 1.

## Integrações

### n8n — notificações (única integração externa do MVP)
- Dispara notificações (abertura, atribuição, aprovação pendente, decisão, D-1, vencido, conclusão). **Canal padrão: e-mail transacional** para todos os gatilhos; **WhatsApp Cloud API para gatilhos urgentes** (prazo vencido, aprovação parada além do limite, pendência crítica DP→funcionário) — custo por mensagem justifica a reserva, mapeamento gatilho→canal parametrizado por tipo. **n8n dispara e nunca decide/armazena**; payload = id + link com RBAC no acesso, **zero dado sensível e zero conteúdo da demanda**; disparo assíncrono com log em `notificacao_demanda` — falha de notificação jamais bloqueia a transação. WhatsApp exige templates aprovados pela Meta e opt-in registrado do colaborador (ver perguntas abertas).

### Identidade própria (Fase A, interno)
- Solicitante/aprovador/executor são usuários do **cadastro próprio do app** (colaborador 1:1 com usuário; matrícula própria como chave). Criar acessos para todos os colaboradores não é impedimento (decisão do usuário); a abertura assistida cobre quem ainda não tiver acesso. Notificação in-app do próprio app complementa o e-mail. Mapeamento/unificação com o portal corporativo: Fase B — nada neste módulo pode depender disso.

### GED (`rh_documentos`, interno)
- Todo anexo e toda entrega é `documento` com hash + ciência. Declarações que dependem de dados da folha (informe de rendimentos, holerite, declaração salarial) **não são geradas por este módulo**: enquanto o Nasajon for o oficial (fase de sombra), o DP as obtém lá e **anexa manualmente ao GED** (conferência/entrega, não integração); após o cutover, passam a ser geradas pelo domínio `rh_folha` a partir do snapshot imutável de competência e publicadas no GED. Em ambos os cenários a demanda apenas referencia e entrega.

### Nasajon
- **Nenhuma integração, em nenhuma fase** (decisão do usuário; o Nasajon não tem API pública de folha). Ele aparece apenas como sistema oficial durante a transição e fonte dos documentos que o DP anexa manualmente. Nenhuma chamada, conector ou job aponta para o Nasajon a partir deste módulo.

### Domínios consumidores (Fase 2 — contrato interno de handler)
- `rh_ponto` (ajuste de ponto — tratamento nosso sobre marcação imutável do REP-P), férias (`programacao_ferias`), `posicao_colaborador` (promoção/reajuste), `rh_beneficios` (adesão), `rh_admissao_desligamento` (itens de checklist que abrem pendências). A demanda chama o **serviço** do domínio alvo; a efetivação e suas regras legais vivem lá.

### Fora do caminho de demandas
- REP-P (Pontomais) conversa apenas com o domínio `rh_ponto` — este módulo nunca fala com o registrador. DW/SAP: nunca — fora do caminho de qualquer demanda.

## Regulatório

### LGPD (o peso regulatório real deste módulo)
- **Base legal mapeada por tipo de demanda** no catálogo: execução de contrato (maioria das solicitações), obrigação legal (documentos trabalhistas), legítimo interesse documentado; consentimento só onde couber de fato. O uso de WhatsApp como canal exige base/opt-in próprios e registro do consentimento do canal.
- **Minimização no schema do formulário**: o tipo só pede o que precisa; classificação de sensibilidade por tipo define trilha de leitura e restrição de payload. Anexo de saúde não pertence a este módulo (afastamento tem fluxo próprio com cifração em aplicação) — tipos de demanda não devem coletar dado de saúde; se um anexo sensível entrar, herda cifração/trilha do GED.
- **Temporalidade por categoria**: demanda com relevância trabalhista retém pelo prazo da tabela de temporalidade (5+ anos); solicitações triviais têm prazo menor. Eliminação/anonimização atinge o domínio (`demanda`, `evento_demanda`), **nunca UPDATE no `audit`** — conflito imutabilidade × eliminação resolvido por anonimização de domínio.
- **Direitos do titular (art. 18/19)**: na Fase 3 o próprio motor hospeda a fila LGPD com prazo legal (15 dias para acesso completo), fechando o ciclo: o sistema que registra pendência é o mesmo que comprova atendimento ao titular.

### CLT / Portaria 671 (indireto — via handlers, nunca neste módulo)
- Férias: aviso ao empregado com ≥30 dias (art. 135) e pagamento até 2 dias antes (art. 145) são validações do **handler de férias** (Fase 2); a demanda só transporta solicitação/aprovação.
- Ajuste de ponto: a marcação original juridicamente válida nasce no REP-P contratado (Portaria 671, AFD/AEJ do registrador); o **tratamento** é do nosso domínio `rh_ponto`, e aqui ficam a solicitação e a **aprovação auditada** — exatamente a evidência de tratamento de marcação que uma fiscalização pede.
- Ciência digital com hash (padrão validado no material btime) para entregas que exigem comprovação de recebimento.

### eSocial / obrigações fiscais
- Este módulo não calcula, não transmite e não origina evento fiscal. Durante a transição, o Nasajon (oficial) segue respondendo pelas obrigações; após o cutover, a transmissão é do domínio `fiscal/` próprio (eSocial, FGTS Digital, DCTFWeb) alimentado pela folha própria — **nunca por este módulo**. Critério de corte permanente: cálculo legal e transmissão fiscal jamais entram em `rh_demandas`.

### Auditoria defensável
- Toda transição, decisão e reatribuição com autor, justificativa e UTC (+ America/Sao_Paulo na exibição) no `audit` só-INSERT garantido por GRANT — uma aprovação de férias ou promoção contestada em juízo tem cadeia de decisão íntegra e imutável.

## Dependências

- **Fase 0 concluída (fundação)**: PostgreSQL dedicado provisionado na SaveinCloud com backup diário + PITR e restore testado; schemas `rh`/`audit`; pools segregados (`app_rh`); chaves e perfis RBAC por migration; tabelas de audit (incluindo trilha de leitura); feature flags.
- **Autenticação própria da Fase A** operante: cadastro de usuários, papéis `funcionario`/`gestor`/`rh`/`dp`/`admin`, 2FA para `dp`/`rh`/`admin` — sem ela não há solicitante nem aprovador.
- **Núcleo de pessoas (Fase 1, mesmo release)**: `colaborador` 1:1 com usuário próprio (beneficiário), `relacao_gestor` com vigência (resolução de aprovador — sem ela não há aprovação por gestor), lotação/unidade (fila e RLS).
- **GED mínimo** (`documento` + `ciencia` com hash) — pré-requisito para anexos e entregas.
- **Padrão de versionamento com vigência** aplicado a `tipo_demanda_versao` (mesmo padrão inegociável usado em rubricas e tabelas legais da folha).
- **n8n** operante com **e-mail transacional** configurado (canal padrão); **WhatsApp Cloud API** (número corporativo, templates aprovados pela Meta, opt-in) pode entrar depois do e-mail, sem bloquear o MVP.
- **Linha do tempo** (`evento_colaborador`) para projeção de demandas concluídas relevantes.
- **Método**: protótipo HTML standalone (tokens visuais do portal, papel simulado) aprovado por DP/RH antes de qualquer código; repositório read-only até o "pode codar".
- Decisões de plataforma e identidade já fechadas (app próprio e separado na Fase A; autenticação e matrícula próprias) — este módulo as pressupõe.

## Riscos

1. **Over-engineering de motor BPM**: a maior armadilha é transformar isto num workflow engine genérico (etapas condicionais, paralelas, DSL de regras) que 3 devs não sustentam. Mitigação: etapas estritamente lineares, máquina de estados única e fixa, condicionais só na Fase 3 mediante demanda comprovada.
2. **Acoplamento na efetivação**: se a demanda escrever direto em tabelas de ponto/férias/posição, vira lógica duplicada (proibição explícita do Fast-RH §2.3). Regra inegociável: handler chama o serviço do domínio alvo; a demanda guarda só a referência.
3. **SLA em dias úteis sem calendário**: dias úteis pedem calendário de feriados, mas a entidade `feriado` está no contexto ponto (Fase 2). Resolver: MVP com SLA em dias corridos OU antecipar tabela mínima de feriados nacionais para a Fase 1 — decidir e registrar no log de decisões.
4. **Aprovador ausente = fila parada**: delegação só chega na Fase 2; no MVP a mitigação é reatribuição administrativa pelo DP com motivo auditado. Monitorar tempo médio em `aguardando_aprovacao` desde o primeiro dia.
5. **Onboarding de acessos**: com autenticação própria, o self-service depende de criar e distribuir acesso para todos os colaboradores das 5 unidades (decisão do usuário: não é impedimento — mas é esforço operacional real de cadastro, primeiro login e recuperação de senha, inclusive operação de loja por celular). A abertura assistida (beneficiário ≠ solicitante) é o fallback desenhado; medir a cobertura real de acessos antes e durante o rollout.
6. **Payload JSONB sem governança** vira lixo não consultável: validação contra o schema da versão do tipo é obrigatória em toda escrita no backend; mudar formulário = nova versão com vigência, nunca edição da ativa.
7. **Vazamento por notificação**: um dev que inclua conteúdo no payload do n8n fura a LGPD por fora do RBAC — risco maior no WhatsApp, que entrega a mensagem num app de terceiro. Mitigação: teste automatizado no CI que valida o contrato do payload (só id/link) para os dois canais.
8. **Custo e opt-in do WhatsApp**: cada mensagem custa; sem disciplina de gatilhos, a conta cresce e o canal perde valor de "urgente". Mitigação: WhatsApp restrito por parametrização a gatilhos urgentes, log por canal em `notificacao_demanda` para acompanhar volume/custo, opt-in registrado.
9. **Adesão / canal paralelo**: WhatsApp informal e boca a boca continuarão existindo; se o DP atender fora do sistema, o módulo vira cadastro morto. Mitigação de processo: após transição, DP só atende via sistema; medir volume por tipo desde o piloto.
10. **Fadiga de notificação**: excesso de disparos derruba a atenção; prever digest/agrupamento cedo no e-mail e manter o WhatsApp raro por definição.

## Perguntas abertas para DP/RH

1. **Catálogo real**: quais solicitações o DP recebe hoje (declaração de vínculo, salarial, informe de rendimentos, cópia de contrato, alteração cadastral, vale-transporte…), com que volume mensal por unidade? Isso define os tipos seed do MVP.
2. **Canal atual**: como essas solicitações chegam hoje (WhatsApp, e-mail, papel, verbal)? Existe algum registro/planilha que sirva de baseline de volume e prazo?
3. **Organização da fila**: o DP atende como fila única centralizada ou por unidade? Quem são os executores por categoria?
4. **SLA praticado × desejado** por tipo de solicitação — e em dias corridos ou úteis? (Decide o item 3 dos riscos.)
5. **Cadeia de aprovação real**: férias e promoções passam por quantos níveis hoje (gestor → RH → diretoria?)? Existe alçada por valor no reajuste? Promoção precisa de aprovação de diretoria?
6. **Declarações**: hoje são geradas no Nasajon, por modelo Word manual, ou ambos? Quais modelos existem, quais exigem assinatura formal e qual (carimbo/assinatura qualificada)? — Durante a sombra o DP anexará manualmente as oficiais do Nasajon; a resposta também alimenta o que a folha própria precisará gerar após o cutover.
7. **Cobertura de acessos**: o cadastro de usuários é próprio do app — todos os colaboradores das 5 unidades têm e-mail utilizável para primeiro acesso e recuperação de senha (inclusive operação de loja)? Acessam por celular? Qual a proporção que precisará de abertura assistida no início?
8. **Delegação**: quando o gestor sai de férias, quem aprova hoje? Existe regra formal de substituição por unidade?
9. **Pendências DP→funcionário**: quais cobranças recorrentes o DP faz (documentos de admissão, comprovantes, exames)? Com que prazo e qual consequência do não atendimento?
10. **Notificação por canal**: e-mail (corporativo ou pessoal) existe para todos? Quais gatilhos o DP considera de fato urgentes a ponto de justificar WhatsApp (custo por mensagem)? Há número corporativo de WhatsApp e como será colhido o opt-in dos colaboradores — com implicação LGPD do canal escolhido?
11. **Retenção**: o jurídico/DPO confirma os prazos de guarda por categoria de demanda para a tabela de temporalidade (trabalhista 5+ anos × trivial)?
