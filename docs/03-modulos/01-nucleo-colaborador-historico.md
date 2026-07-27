# Núcleo: ficha do colaborador e histórico/linha do tempo (rh_colaboradores)

> **Revisado em 2026-07-24 (v2) após decisões do usuário.** Gerado originalmente em 2026-07-24 por análise
> multi-agente sobre as fontes "Fast-RH - Conhecimento a Migrar.md" e "Ficha-Conhecimento-Portal-para-RH.md";
> reescrito para a arquitetura v2 (app próprio e separado na Fase A, stack Next.js + TypeScript + Node.js,
> PostgreSQL dedicado na SaveinCloud, folha própria com transição em sombra, identidade própria).
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**

**Fase sugerida:** Fase 1 (2–3 meses) — primeiro artefato de dados do sistema, entregue cedo ao DP/RH logo após a fundação da Fase 0, no mesmo lote da autenticação própria, das demandas e do clima diário. Evoluções na Fase 2 (checklists de admissão/desligamento, afastamentos cifrados, dependentes completos, eventos automáticos de ponto/folha/360, assinatura eletrônica) e Fase 3 (organograma visual, Card do Colaborador, tela de trilha de leitura, resumo por IA, painéis de cota, fila LGPD). O núcleo também é pré-requisito da trilha F (folha própria): é a fonte cadastral do motor de cálculo.

## Objetivo

Ser a espinha dorsal do Fast Pessoas: uma ficha única por colaborador (1:1 com o **usuário próprio do app** — na Fase A a identidade é do próprio sistema, sem dependência do portal) e uma linha do tempo append-only que registra todo fato relevante da vida funcional — da admissão ao desligamento — em que todos os demais módulos (ponto, folha própria, 360, clima, férias, documentos, demandas, fiscal) penduram seus eventos. Incorpora o modelo de pessoas validado no Fast-Agente (ocorrências, feedback formal 90d, ações abertas, 9 Valores Fast como catálogo de referência) sobre a fundação técnica própria do app (papéis validados no backend, RLS via SET LOCAL onde couber, audit em duas trilhas só-INSERT por GRANT, versionamento com vigência, escrita transacional) — **nada é herdado do portal na Fase A**; os padrões são implementados no stack Next.js/TypeScript/Node + PostgreSQL dedicado.

Mudança estrutural da v2: com a decisão de folha própria, o núcleo deixa de ser "espelho operacional de um cadastro cuja fonte de verdade é a Nasajon" e passa a ser, após o cutover da trilha F, **a própria fonte de verdade cadastral e contratual da empresa** — inclusive para o eSocial. Isso eleva as exigências de completude de dados, imutabilidade e temporalidade desde o desenho.

## Funcionalidades

### MVP (Fase 1 — entra no gate 1→2)

**1. Autenticação e cadastro de usuários próprios (identidade da Fase A)**
- Cadastro de usuários do próprio app com papéis **funcionario / gestor / rh / dp / admin**; criação de acessos em lote pelo DP/admin na carga inicial (decisão do usuário: criar acesso para todos não é problema).
- Login por e-mail corporativo ou matrícula + senha (para população sem e-mail); reset de senha; bloqueio por tentativas; **2FA obrigatório para dp, rh e admin**; sessão com timeout mais curto para papéis elevados.
- Escopo contido: é a identidade suficiente para a Fase A, não um módulo de identidade corporativa. O mapeamento com o portal (SSO, correspondência de contas) é da **Fase B** e não deve vazar para este desenho.
- Papel "gestor" **não é atributo do usuário**: deriva exclusivamente de relacao_gestor com vigência (o papel no login habilita as telas; o alcance sobre pessoas vem da relação vigente).

**2. Ficha do colaborador (visão única da pessoa)**
- Ficha 1:1 com o usuário próprio do app (`usuario_id` único). A ficha carrega o dado de RH; o usuário carrega credencial e papel.
- **Matrícula PRÓPRIA como chave de negócio**: gerada pelo sistema, única, imutável, nunca reaproveitada. Ao lado dela existem dois outros identificadores com papéis distintos: a **matrícula Nasajon** (casa resultados na conferência da folha em sombra e é a origem da matrícula eSocial dos legados — ver item abaixo) e a **matrícula eSocial** (campo persistente da ficha).
- **Matrícula eSocial (campo persistente `matricula_esocial`)**: no eSocial, todo evento não periódico posterior (S-2205, S-2206, S-2230, S-2299) precisa referenciar a MESMA matrícula declarada no S-2200 que consta no RET (Registro de Eventos Trabalhistas). Para **admitidos pré-cutover**, essa matrícula é a transmitida pela Nasajon: o campo é alimentado pela **reconstrução do RET** (download dos eventos do próprio eSocial, previsto no spike do módulo 12) e **conferido contra a matrícula Nasajon** importada. Para **admitidos pós-cutover**, matrícula eSocial = matrícula própria (declarada no S-2200 transmitido por nós). Consequência direta: a matrícula Nasajon **não é meramente informativa nem morre no cutover** — para os colaboradores legados ela vira **dado fiscal permanente**, sem o qual o transmissor próprio não consegue gerar um S-2299 (ou qualquer evento não periódico) válido.
- Campos mínimos no MVP: matrícula própria, **tipo_vinculo desde o dia 1** (CLT, estagiário, aprendiz, PJ, temporário — com regras condicionais por tipo: estagiário sem banco de horas, PJ fora de folha etc.), data de admissão, status (ativo, afastado, desligado, suspenso), retrato atual e contexto histórico (campos narrativos portados do Fast-Agente), data do último feedback formal (derivada, não digitada).
- **Dados civis e contratuais completos por etapas**: o MVP aceita ficha com o mínimo, mas o sistema controla a completude (checklist de campos exigidos pelo eSocial: CPF, NIS/PIS, data de nascimento, endereço, CTPS, dados bancários, categoria do trabalhador — e, para admitidos pré-cutover, **matrícula eSocial confirmada contra o RET reconstruído**). **Regra de gate: colaborador só entra na folha sombra (trilha F, etapa F3) com a ficha 100% completa — incluída a matrícula eSocial.** Painel de completude cadastral para o DP.
- **Entrevista de criação de ficha** portada do Fast-Agente como fluxo guiado: papel/cargo + retrato + passada pelos 9 Valores (no MVP como formulário estruturado em etapas; a versão conversacional por IA é Fase 3).
- Visão em abas: Resumo | Linha do tempo | Cargo e remuneração | Ocorrências e feedbacks | Documentos | Ações abertas. O conteúdo de cada aba é filtrado pelo papel do usuário **no backend** (ausência de dado, não máscara).

**3. Linha do tempo (evento_colaborador) — o coração do módulo**
- Tabela **append-only** (garantida por GRANT no Postgres, não por disciplina). Cada evento: tipo, data do fato, payload JSONB **validado por schema versionado por tipo no backend Node/TypeScript**, referência à entidade de origem (tabela + id), resumo legível já resolvido (rótulos, nunca IDs crus), autor e origem (manual | módulo | importação sombra).
- Tipos no MVP: admissão, alteração cadastral relevante, promoção/mudança de cargo, reajuste salarial, transferência de unidade/lotação, mudança de gestor, ocorrência, feedback formal, advertência, afastamento (registrado pelo DP no MVP; módulo próprio cifrado na Fase 2 — sem CID no núcleo), férias (registro manual no MVP; módulo na Fase 2), treinamento (registro manual), desligamento.
- Regra estrutural: a linha do tempo é **projeção para consulta, nunca base de cálculo**. Todo evento nasce de uma entidade de origem e é reconstruível a partir dela. A folha própria NUNCA lê a linha do tempo: lê as entidades de origem via snapshot de competência.
- Filtros por tipo, período e sensibilidade; eventos sensíveis (advertência, salário) só aparecem para quem tem a chave — e a exibição grava trilha de leitura.

**4. Ocorrências (modelo Fast-Agente)**
- Registro datado de fatos: classificação (positivo/negativo/neutro/alerta), descrição, impacto, causa provável, ação combinada, **valores Fast relacionados** (N:N com o catálogo dos 9 Valores). Gestor registra sobre sua equipe (via relacao_gestor vigente); DP/RH sobre qualquer um.
- Subtipo formal **advertência/suspensão disciplinar**: gera documento no GED com ciência (assinatura digital por hash no MVP; evolução para assinatura eletrônica contratada — Clicksign/ZapSign/D4Sign — na Fase 2), evento na linha do tempo, e é dado sensível (chave própria de leitura + trilha).
- Ocorrência alimenta a 360 (pilar Fit Cultural) como insumo de consulta do avaliador — nunca entra no cálculo automaticamente.

**5. Feedback formal com cadência de 90 dias (modelo Fast-Agente)**
- Registro estruturado de feedback (data, participantes, resumo, acordos), atualiza `ultimo_feedback_formal` da ficha.
- **Alerta de cadência**: parametrizável (padrão 90 dias), notificação via n8n (WhatsApp Cloud API + e-mail transacional) ao gestor quando vencido; painel para RH com semáforo de cadência por equipe.

**6. Ações abertas por pessoa (modelo Fast-Agente)**
- Acompanhamento com responsável, prazo e status (aberta, em andamento, concluída, cancelada); nasce de ocorrência, feedback ou avulsa; alerta de vencimento via n8n; visível na ficha e em painel por gestor.

**7. Cargos, CHA e remuneração**
- **cargo + cargo_versao**: descrição e **CHA estruturado** (conhecimentos, habilidades, atitudes) com vigência (rascunho→ativa→encerrada) — insumo direto do pilar de 40% da 360. Cargo FUNCIONAL ≠ papel de ACESSO do app (funcionario/gestor/rh/dp/admin); a distinção é explícita na UI.
- **tabela_salarial_versao**: faixas por cargo com vigência; alteração nunca recalcula o passado.
- **posicao_colaborador**: histórico de cargo + salário + motivo por vigência — nova linha, nunca UPDATE; cada mudança gera evento na linha do tempo e trilha de auditoria. Salário só visível com chave `rh.salario.ver` (leitura logada). **A posição vigente é o salário-base que a folha própria consome via snapshot de competência** — mudança retroativa de posição é caso de recálculo controlado na folha, nunca edição silenciosa.

**8. Relação gestor→liderado e lotação**
- **relacao_gestor com vigência**: fonte exclusiva da política "gestor vê equipe" (RLS via SET LOCAL onde couber; senão autorização no repositório coberta pela matriz de testes papel × recurso no CI) e da 360; troca de gestor encerra vigência e abre outra (evento na linha do tempo). Validação de ciclos e de liderado sem gestor ativo.
- **lotacao**: unidade × centro de custo com vigência (centro de custo validado contra o DW na Fase 0 antes de uso além do analítico). A lotação alimenta a folha própria (apropriação de encargos por unidade/CC) e as convenções coletivas por unidade.

**9. GED mínimo (documento + ciência)**
- Upload em storage privado com URL assinada curta, hash SHA-256, tipo, classificação de sensibilidade e categoria de temporalidade; **ciência digital** (quem, quando, hash no momento — padrão btime). Documento de saúde NÃO entra aqui (pertence a afastamentos, cifrado em aplicação, Fase 2).

**10. Admissão a desligamento — registro (não workflow)**
- No MVP, admissão e desligamento são **eventos registrados** na linha do tempo com dados essenciais (datas, motivo de desligamento, tipo). O desligamento na ficha exige e dispara a **desativação do usuário próprio do app na mesma transação**. Os checklists completos (prazos do art. 477, devoluções, entrevista) são o módulo rh_admissao_desligamento da Fase 2, que consome este núcleo. A decisão construir vs contratar admissão digital (Gupy Admissão / Unico People) é da Fase 0 e não muda este núcleo: qualquer que seja a escolha, o resultado final é a ficha criada aqui.

**11. Carga inicial e conferência (sem conector)**
- **Não existe conector Nasajon.** A carga inicial nasce de **exports manuais do Nasajon (relatórios/planilhas)** importados em staging descartável + digitação assistida pelo DP: importa → confere na fila de divergências → confirma → ficha criada com matrícula própria nova (a matrícula Nasajon entra na ficha e, para os legados, alimenta/confere a matrícula eSocial — dado fiscal permanente, ver ficha do colaborador).
- Relatório de órfãos usuário × ficha (usuário ativo sem ficha, ficha sem usuário) como verificação permanente.
- Durante a sombra da folha, novos imports manuais servem SÓ para conferência de resultados — conferência, não integração; o staging `nasajon_sombra/` é temporário e morre no cutover.

### Evolução (Fases 2 e 3)

- **Fase 2**: checklists de admissão/desligamento (módulo próprio sobre demandas); afastamentos com dado de saúde cifrado em aplicação refletindo na ficha (gestor vê período, nunca CID); **dependentes completos — antecipados dentro da Fase 2 porque a folha própria precisa deles para IRRF e a SST/eSocial para S-2230**; eventos automáticos vindos de ponto (REP-P Pontomais via API/webhooks), férias, fechamento da folha própria e 360; assinatura eletrônica contratada no fluxo disciplinar e de ciência; GED completo com painel de vencimento de documentos.
- **Fase 3**: organograma visual e controle de quadro/headcount (projeções de relacao_gestor e lotacao); Card do Colaborador (360, nasce privado); tela de relatório de acessos a dado sensível (a trilha já é gravada desde a Fase 1); resumo do histórico por IA ("conversa, nunca calcula"); painéis de cota aprendiz/PCD e TCE de estagiários; fila LGPD de direitos do titular via demandas; entrevista de ficha conversacional. **Fase B da plataforma**: mapeamento usuário do app × usuário do portal (a ficha não muda; muda a autenticação).

## Entidades de dados

Schema `rh`, salvo indicação. Banco: PostgreSQL dedicado na SaveinCloud; pools segregados (`app_rh`, `app_folha`, `app_clima`) com GRANTs mínimos por schema.

### usuario (schema `seguranca`)
Identidade própria da Fase A: `email` (nullable — login alternativo por matrícula), `hash_senha`, `papel` (enum: funcionario, gestor, rh, dp, admin), `dois_fatores_habilitado` (obrigatório para dp/rh/admin), `ativo`, `bloqueado_ate`, `criado_em`. Sem dado de RH aqui. Na Fase B ganha coluna de mapeamento com a conta do portal (desenho futuro).

### colaborador
1:1 com `seguranca.usuario` (`usuario_id` único). Campos: `matricula` (**própria, gerada pelo sistema, única, imutável — chave de negócio**), `matricula_nasajon` (nullable; casa registros na conferência da sombra e, para os legados, é origem/conferência da matrícula eSocial — **dado fiscal permanente, não morre no cutover**), `matricula_esocial` (**persistente — a matrícula declarada no S-2200 que consta no RET**: para admitidos pré-cutover, alimentada pela reconstrução do RET — spike do módulo 12 — e conferida contra a matrícula Nasajon; para admitidos pós-cutover, igual à matrícula própria; referência obrigatória de todo S-2205/S-2206/S-2230/S-2299 do colaborador), `tipo_vinculo` (tabela de tipos com atributos, não enum rígido: clt, estagiario, aprendiz, pj, temporario, extensível), `data_admissao`, `status` (ativo, afastado, desligado, suspenso), `data_desligamento` (nullable), `retrato_atual` (texto), `contexto_historico` (texto), `ultimo_feedback_formal` (derivado), bloco de **dados civis/contratuais para eSocial** (CPF, NIS/PIS, nascimento, endereço, CTPS, dados bancários, categoria eSocial — com indicador de completude e gate para a folha sombra). Relações: 1:N com evento_colaborador, ocorrencia, feedback_formal, acao_aberta, posicao_colaborador, lotacao, documento, dependente; N:1 lógica com relacao_gestor (como liderado e como gestor).

### evento_colaborador (append-only por GRANT)
`colaborador_id`, `tipo_evento` (enum controlado), `data_fato`, `payload` JSONB **validado por schema versionado por tipo (backend Node/TypeScript)**, `entidade_origem` (tabela + id), `resumo_legivel` (rótulos resolvidos), `sensibilidade` (publica_interna | restrita | sensivel — atributo do TIPO, não escolha do autor), `autor_id`, `origem` (manual | modulo | importacao_sombra), `criado_em` (UTC). Projeção para consulta; reconstruível da origem; nunca base de cálculo.

### ocorrencia
`colaborador_id`, `data_fato`, `classificacao` (positivo/negativo/neutro/alerta), `descricao`, `impacto`, `causa_provavel`, `acao_combinada`, `registrado_por`, `eh_disciplinar` (bool; se sim: subtipo advertência/suspensão + FK para documento com ciência). N:N com valor_fast via **ocorrencia_valor**.

### valor_fast (catálogo, dado de referência)
Os 9 Valores (resultado, velocidade, determinação, desenvolvimento, disciplina, resiliência, colaboração, comunicação, reconhecimento) com **descritores por nível 1–5 migrados tal e qual de `fast_kb_valores_fast.md`**, versionados com vigência. Vive no núcleo como catálogo; é consumido por ocorrências (valores relacionados) e pela 360 (régua do pilar Fit Cultural 30% — esqueleto btime revisado criticamente no design do módulo).

### feedback_formal
`colaborador_id`, `gestor_id`, `data`, `resumo`, `acordos`, `proximos_passos`; dispara atualização de `ultimo_feedback_formal`. Parâmetro de cadência (90d default) em tabela de parâmetros versionada.

### acao_aberta
`colaborador_id`, `origem` (ocorrencia_id | feedback_id | avulsa), `descricao`, `responsavel_id`, `prazo`, `status`, `concluida_em`.

### cargo / cargo_versao
cargo: identidade estável. cargo_versao: `descricao`, `cha` (JSONB estruturado: conhecimentos, habilidades, atitudes com pesos — insumo dos 40% da 360), `vigencia_inicio/fim`, `status` (rascunho→ativa→encerrada), `responsavel`. Sem recálculo retroativo ("fechado não reabre").

### tabela_salarial_versao
Faixas por cargo (`cargo_id`, faixa/nível, valor), vigência e status idem. Leitura exige `rh.salario.ver` + trilha.

### posicao_colaborador
Histórico por vigência: `colaborador_id`, `cargo_id`, `salario`, `motivo` (admissão, promoção, mérito, enquadramento, transferência), `vigencia_inicio/fim`. Nova linha, nunca UPDATE; gera evento + audit. É a fonte do salário-base no snapshot de competência da folha própria.

### relacao_gestor
`gestor_id`, `liderado_id`, `vigencia_inicio/fim`. Fonte exclusiva do "gestor vê equipe" e da 360. Sem flag manual de gestor. Organograma é projeção (Fase 3).

### lotacao
`colaborador_id`, `unidade_id`, `centro_custo` (validado contra DW na Fase 0), `vigencia_inicio/fim`. Insumo da apropriação contábil da folha própria e das convenções por unidade.

### documento / ciencia (domínio rh_documentos, consumido pelo núcleo)
documento: `colaborador_id`, `tipo`, `caminho_storage` (privado, URL assinada curta), `hash_sha256`, `classificacao_sensibilidade`, `categoria_temporalidade`. ciencia: `documento_id`, `usuario_id`, `data`, `hash_no_momento`. Evolução Fase 2: referência à assinatura eletrônica contratada.

### dependente (MVP mínimo; completo na Fase 2 — pré-requisito da folha própria)
`colaborador_id`, nome, parentesco, data_nascimento, CPF (obrigatório para IRRF), flags IRRF/plano. Dado de terceiro (inclusive menor) — base legal e temporalidade próprias. **A trilha F (etapa F2, cobertura completa) depende de dependentes saneados.**

### Staging sombra (domínio nasajon_sombra/ — temporário, morre no cutover)
`stg_export_colaborador`, `stg_export_resultado_folha` (e afins conforme relatórios disponíveis): snapshot imutável por import manual (arquivo + hash + data), log de carga no audit, fila de divergências (`divergencia_conferencia`: campo, valor sistema × valor Nasajon, status de resolução, dono do campo). Uso: carga inicial e conferência de paridade — nunca fluxo operacional.

### Transversal
`audit` (schema próprio): trilha de alteração (diff campo a campo com rótulo resolvido, UTC + America/Sao_Paulo na exibição) e **trilha de leitura de dado sensível** (salário, advertência, documento sensível) — ambas só-INSERT garantido por GRANT, desde a Fase 1, implementadas no stack Node/Postgres (nada herdado de plataforma).

## Papéis e permissões

Papéis do app (Fase A): **funcionario, gestor, rh, dp, admin** — validados no backend em toda rota; RLS via SET LOCAL onde couber, senão autorização na camada de repositório coberta por **matriz de testes papel × recurso no CI**. Chaves finas (`rh.salario.ver`, `rh.ocorrencia.sensivel.ver`, `rh.documento.sensivel.ver`, `rh.cargo.gerir`, `rh.colaborador.desligar`, `rh.auditar`) são capacidades concedíveis dentro dos papéis, com concessão registrada.

| Ação / dado | funcionario | gestor (via relacao_gestor vigente) | dp | rh | admin |
|---|---|---|---|---|---|
| Ver própria ficha (dados básicos, linha do tempo não sensível, próprios documentos, próprio salário) | Sim | — | Sim | Sim | Leitura logada |
| Ver ficha da equipe (retrato, contexto, linha do tempo não sensível) | — | Sim | Sim | Sim | Leitura logada |
| Ver salário da equipe | — | **Padrão: não** (chave `rh.salario.ver` concedível por decisão registrada) | Sim (logado) | Sim (logado) | Leitura logada |
| Registrar ocorrência / feedback / ação | — | Sobre sua equipe | Sim | Sim | — |
| Ver ocorrência disciplinar (advertência) | A própria (com ciência) | **Só as que registrou ou da sua equipe com chave `rh.ocorrencia.sensivel.ver`** | Sim (logado) | Sim (logado) | Leitura logada |
| Editar dados cadastrais da ficha | Solicita via demandas | — | Sim (auditado) | Sim | — |
| Criar/alterar cargo, CHA, tabela salarial (versões com vigência) | — | — | Propõe | Ativa (`rh.cargo.gerir`) | — |
| Alterar posição/salário de colaborador | — | — | Sim (auditado) | Aprova | — |
| Gerir relacao_gestor e lotação | — | — | Sim | Sim | — |
| Registrar desligamento (desativa usuário próprio na mesma transação) | — | — | Sim (`rh.colaborador.desligar`, 2FA) | Sim | — |
| Upload/ver documento sensível | Os próprios | — | `rh.documento.sensivel.ver` (2FA, logado) | Idem | Leitura logada |
| Criar/gerir usuários e papéis do app | — | — | Cria funcionário/gestor | Idem | Sim (todos os papéis) |
| Consultar trilhas de auditoria | — | — | — | `rh.auditar` (2FA) | `rh.auditar` (2FA) |

Regras estruturais: autorização é do backend (API dona única — o front nunca decide); payload minimizado — dado sensível **ausente** do JSON de quem não pode ver, nunca mascarado; "gestor" deriva exclusivamente de relacao_gestor com vigência; **2FA obrigatório para os papéis dp, rh e admin** e para as chaves `rh.auditar`, `rh.documento.sensivel.ver`, `rh.colaborador.desligar`; toda leitura de salário/advertência/documento sensível grava trilha de leitura desde a Fase 1 (tela de consulta só na Fase 3); pools segregados — `app_clima` e `app_folha` sem GRANT sobre tabelas do `rh` além do estritamente consumido (folha lê snapshot, não tela).

## Integrações e fronteiras

**Identidade (própria — não há portal na Fase A)**
- `seguranca.usuario` é a fonte de identidade do app; ficha 1:1 via `usuario_id`. Desligamento desativa o usuário **na mesma transação**. Criação de acessos em massa na carga inicial (DP/admin).
- **Fase B**: incorporação ao portal corporativo (mesmo stack Next.js/Node/Postgres — integração, não reescrita). As alegações das fontes sobre "herdar RLS/audit/RBAC do portal" descrevem possivelmente o MCP do SAP e serão **re-verificadas na Fase B**; nada aqui conta com elas.

**Folha própria (domínio rh_folha — o núcleo é a fonte cadastral)**
- Fornece por **snapshot imutável de competência**: matrícula própria, tipo_vinculo (elegibilidade), posição vigente (salário-base), lotação/centro de custo (apropriação e convenção por unidade), status e afastamentos (para não acusar falta indevida), dependentes (IRRF), datas de admissão/desligamento.
- A folha nunca lê tela nem linha do tempo; consome snapshot. Divergência de snapshot é erro de fechamento, não de ficha.

**Fiscal (domínio fiscal/ — transmissor próprio, pós-cutover)**
- Os eventos não periódicos do eSocial (S-2200 admissão, S-2205 alteração cadastral, S-2206 alteração contratual, S-2299 desligamento) nascem de fatos registrados NESTE núcleo e são transmitidos pelo domínio fiscal com certificado digital próprio — **somente após o cutover da trilha F**; durante a sombra, quem transmite é a Nasajon.
- Para **colaborador legado** (admitido pré-cutover), todo evento não periódico referencia a **matrícula eSocial** do RET (originalmente transmitida pela Nasajon no S-2200), nunca a matrícula própria — o campo persistente `matricula_esocial` da ficha é o que torna essa referência possível; sua completude é pré-condição de qualquer transmissão própria para legados.
- O núcleo responde pela **qualificação cadastral** (CPF × NIS × data de nascimento consistentes) via painel de completude.

**Ponto (REP-P de mercado — Pontomais candidata líder)**
- O REP-P contratado faz SÓ marcação e AFD/AEJ. O núcleo fornece ao módulo de ponto (Fase 2): matrícula própria como chave nos webhooks/API, tipo_vinculo (elegibilidade de ponto), lotação e status/afastamentos. Espelho, tratamento, escalas e banco de horas são do nosso sistema. Nunca registrador próprio.

**Nasajon (sombra temporária — conferência, não integração)**
- Sem conector e sem API: **imports manuais de relatórios/exports** para carga inicial e para comparação de resultados da folha sombra. `matricula_nasajon` na ficha casa registros nessa conferência **e** é a origem/conferência da matrícula eSocial dos legados — por isso **não é descartável no cutover** (vira dado fiscal permanente na ficha). Descartável no cutover é apenas o staging do domínio `nasajon_sombra/`. Nasajon permanece a **referência funcional** do que a folha própria precisa cobrir (rubricas, convenções) — levantamento na Fase 0.

**Demandas (mesmo lote da Fase 1)**
- Alterações cadastrais solicitadas pelo funcionário viram demanda para o DP; ações abertas podem gerar demanda.

**360 (Fase 2 — esqueleto btime revisado criticamente)**
- O núcleo fornece: CHA da cargo_versao vigente (pilar 40%), catálogo valor_fast com descritores (pilar 30%), relacao_gestor (quem avalia quem), ocorrências como insumo de consulta, ciclo de experiência amarrado à data de admissão e tipo_vinculo. Pedir o código btime ao usuário no início do design do módulo.

**n8n + WhatsApp Cloud API + e-mail transacional (dispara, nunca decide/armazena)**
- Alertas: feedback 90d vencido, ação aberta vencida, divergência de conferência pendente, documento a vencer, completude cadastral pendente. **Payload sem dado sensível** — só referências (link com autorização no acesso).

**Assinatura eletrônica (Clicksign/ZapSign/D4Sign — Fase 2)**
- Ciência disciplinar e documentos evoluem do hash interno para assinatura eletrônica contratada; o GED guarda a referência e o comprovante.

**Treinamento** — registro manual na linha do tempo no MVP; integração com plataforma externa fora de escopo por ora.

**DW SAP** — o núcleo não depende do DW. Único toque: validação (Fase 0) de que centros de custo usados em lotacao existem lá com granularidade utilizável, para o analítico da Fase 3 e a apropriação da folha.

## Regulatório

**CLT / trabalhista**
- Registro de empregado (art. 41 CLT): **durante a sombra, o registro legal e o eSocial permanecem na Nasajon** — a ficha é espelho operacional e a conferência garante que espelho e oficial não divirjam silenciosamente. **Após o cutover da trilha F, o Fast Pessoas passa a ser o registro oficial do empregado** — por isso a ficha nasce com completude controlada, imutabilidade (linha do tempo + versões com vigência) e temporalidade desde a Fase 1.
- Advertências/suspensões: prova documental com ciência do empregado — atendido por documento no GED com hash + ciência digital datada + evento imutável na linha do tempo; evolução para assinatura eletrônica contratada na Fase 2. Testemunha/recusa de assinatura: campo previsto no fluxo disciplinar. Validação jurídica antes do protótipo.
- Temporalidade: documentos trabalhistas com guarda de 5 a 30+ anos conforme categoria — cada documento nasce com `categoria_temporalidade`; backups etiquetados por política de retenção. "Fechado não reabre; correção é evento novo."
- Contrato de experiência: data de admissão + tipo_vinculo alimentam o ciclo 45/90d da 360 (Fase 2) — o prazo legal do contrato é controlado pelo checklist de admissão.

**eSocial (mudança central da v2)**
- A transmissão é **do domínio fiscal/, não deste núcleo** — mas os eventos não periódicos nascem de fatos daqui (admissão, alteração cadastral/contratual, desligamento). Até o cutover, nenhuma transmissão própria; após o cutover, o núcleo é a fonte dos dados transmitidos, e a **qualificação cadastral** (consistência CPF/NIS/nascimento) vira responsabilidade operacional do DP apoiada pelo painel de completude. O SPIKE de eSocial da Fase 0 (webservices, certificado, leiautes, produção restrita) antecede qualquer desenho fino do fluxo fiscal.

**LGPD (o núcleo é o maior concentrador de dado pessoal do sistema)**
- Minimização no schema: só campos com finalidade mapeada; dado de saúde estruturalmente fora do núcleo (vive em afastamentos, cifrado em aplicação, Fase 2); base legal por tratamento documentada (execução de contrato de trabalho para a ficha e para a folha; legítimo interesse para retrato/ocorrências de gestão, com registro de avaliação de legítimo interesse).
- Trilha de LEITURA de dado sensível (salário, advertência, documento sensível) desde a Fase 1 — é o que a LGPD exige e a trilha de alteração não cobre.
- Direitos do titular: acesso/correção/eliminação via fila de demandas (Fase 3 formalizada); conflito imutabilidade × eliminação resolvido por **anonimização no domínio** (colaborador e eventos), nunca UPDATE/DELETE no audit.
- Dependente = dado de terceiro (inclusive menor): base legal e temporalidade próprias; coleta mínima no MVP, completa na Fase 2 por exigência da folha.
- Segregação demonstrável: **PostgreSQL dedicado desde o dia 1** (segregação física do portal e de qualquer outro sistema); pools `app_rh`/`app_folha`/`app_clima` com GRANTs mínimos; catálogo de grants como evidência de auditoria.

**Portaria 671 / biometria** — não toca o núcleo diretamente (módulo de ponto com REP-P homologado de mercado, Fase 2); o núcleo apenas garante tipo_vinculo e elegibilidade corretos como insumo. AFD/AEJ são responsabilidade do REP-P contratado.

## Dependências

Depende da fundação da Fase 0 (não retrofitável): **PostgreSQL dedicado na SaveinCloud provisionado com backup diário + PITR e restore TESTADO**; schemas `rh`/`rh_clima`/`seguranca`/`audit`; roles/pools `app_rh`, `app_folha`, `app_clima`; tabelas de audit com as duas trilhas só-INSERT por GRANT; matriz de testes papel × recurso no CI; feature flags. Depende da **autenticação própria** (item 1 do MVP — na frente da ficha no mesmo lote da Fase 1). Depende dos **exports manuais do Nasajon** para a carga inicial — mas a Fase 1 NÃO trava sem eles: a ficha pode nascer com digitação assistida pelo DP e conferir depois. Depende do módulo de demandas (mesmo lote da Fase 1) para o fluxo funcionário→DP de correção cadastral. Depende dos artefatos do Fast-Agente como fonte de modelo (schema colaboradores/ocorrências/feedback/ações como referência, `fast_kb_valores_fast.md` para os descritores) — modelo, nunca código. O levantamento de rubricas/convenções no Nasajon (Fase 0) informa os campos contratuais necessários. É dependência de TODOS os demais módulos: **trilha F/folha própria (fonte cadastral via snapshot)**, fiscal (eventos não periódicos), 360 (CHA, valores, relacao_gestor, admissão), ponto (tipo_vinculo, lotação, afastamentos, matrícula própria), férias, admissão/desligamento, benefícios, SST, analytics.

## Riscos

1. **Cadastro incompleto vira bloqueio da folha própria.** Com o cutover, o núcleo é a fonte oficial do eSocial; campo civil faltante (NIS, CPF de dependente, categoria) bloqueia S-2200/qualificação e trava a paridade da sombra. Mitigação: painel de completude desde a Fase 1, gate "ficha 100% antes da folha sombra", saneamento no cronograma do DP — este é o novo risco número um do prazo da trilha F.
2. **Dupla digitação durante a sombra.** Enquanto o Nasajon for oficial, o DP mantém dois cadastros (Nasajon + Fast Pessoas). É custo assumido e temporário — mitigação: imports manuais assistidos, fila de divergências, prioridade de campos; o risco é a fadiga operacional corroer a qualidade justamente no período em que a paridade é medida.
3. **Qualidade dos exports manuais na carga inicial.** Matrículas duplicadas, grafias divergentes, admissões antigas sem dado completo — sem conector, tudo passa por conferência humana. Mitigação: staging imutável + fila de divergência com resolução obrigatória; esforço de saneamento do DP explícito no cronograma da Fase 1.
4. **Linha do tempo divergir das entidades de origem.** evento_colaborador é projeção; se algum módulo escrever evento sem entidade de origem (ou vice-versa), o histórico legal fica inconsistente. Mitigação: escrita do evento na MESMA transação da entidade de origem, validação de payload por tipo no CI, job de reconciliação projeção × origem.
5. **Vazamento por payload ou por evento mal classificado.** Um evento de reajuste salarial com valor no `resumo_legivel` visível a gestor sem `rh.salario.ver` fura a minimização. Mitigação: sensibilidade é atributo obrigatório do TIPO de evento (não escolha do autor), matriz de testes de autorização papel × recurso no CI cobrindo a linha do tempo, resumo sensível gerado em duas versões (com e sem o dado).
6. **Autenticação própria subdimensionada.** Identidade agora é nossa: reset de senha, bloqueio, 2FA, colaborador sem e-mail — se o fluxo de credenciais falhar, o app inteiro fica inacessível para a ponta. Mitigação: login por matrícula + senha para população sem e-mail, procedimento de reset via DP com registro, 2FA restrito aos papéis elevados para não travar o chão de loja.
7. **Escopo do núcleo inchar e atrasar a Fase 1.** É tentador puxar checklists, dependentes completos e organograma para o MVP. O corte está definido (registro de admissão/desligamento sim, workflow não; dependentes mínimos); qualquer adição exige decisão registrada no log.
8. **relacao_gestor incompleta cega a visão do gestor.** Se equipes ficarem sem gestor vigente cadastrado, gestores não veem ninguém e o painel de feedback 90d fica cego. Mitigação: relatório de "liderado sem gestor vigente" como alerta permanente desde o dia 1 da carga.
9. **Advertência disciplinar mal desenhada vira passivo.** Fluxo com ciência/recusa/testemunha precisa validação jurídica antes do protótipo — registro digital de advertência sem esse rito pode não servir de prova; a evolução para assinatura eletrônica contratada (Fase 2) mitiga, mas não substitui o rito.
10. **Enum de vínculo incompleto.** Se surgir um vínculo não previsto (ex.: diretor estatutário, cooperado), a regra condicional por tipo precisa nascer extensível — por isso tipo_vinculo é tabela de tipos com atributos, não enum rígido no código.

## Perguntas abertas para DP/RH

1. Quais tipos de vínculo existem de fato na Fast hoje (CLT, estagiário, aprendiz, PJ, temporário, diretor estatutário?) e quais regras cada um dispensa (ponto, folha, 360, benefícios)?
2. **Matrícula própria**: alguma preferência de formato/faixa (numérica sequencial, prefixo por unidade)? Faz diferença para crachá, uniforme ou processos atuais reaproveitar o número Nasajon como matrícula inicial (mantendo-o como matrícula própria) ou começamos numeração nova? Alternativa a considerar: **reaproveitar a numeração de matrícula do Nasajon como matrícula própria eliminaria o de-para (matrícula própria × matrícula eSocial do RET) e o risco de referência cruzada nos eventos não periódicos dos legados — decisão pendente do usuário.**
3. A matrícula Nasajon é única entre as 5 unidades ou reinicia por estabelecimento/CNPJ? Recontratação gera matrícula nova? (define como casar registros na conferência da sombra, o tratamento de readmissão na linha do tempo e a unicidade da **matrícula eSocial** dos legados)
4. **Criação de acessos**: quem cria os usuários (DP? admin de TI?)? Quantos colaboradores não têm e-mail corporativo (login por matrícula + senha)? Como entregar a credencial inicial na admissão e no rollout (presencial, WhatsApp)?
5. **Completude para o eSocial**: o DP consegue exportar do Nasajon hoje todos os dados civis exigidos (NIS, CTPS, endereço, dados bancários, CPF de dependentes) ou parte terá de ser recoletada com o colaborador? Qual o tamanho desse saneamento?
6. Durante a sombra haverá dupla digitação (Nasajon oficial + Fast Pessoas). O DP absorve isso por algumas competências? Quais campos são críticos de manter em dia nos dois lados?
7. Gestor pode ver salário da própria equipe? E o histórico salarial? Quem além de DP/RH vê advertências? (calibra as chaves `rh.salario.ver` e `rh.ocorrencia.sensivel.ver`)
8. Fluxo disciplinar atual: quem aplica advertência/suspensão, quem assina, como tratam recusa de assinatura e testemunhas? Jurídico aceita ciência digital com hash como prova, ou já exigimos assinatura eletrônica contratada desde o MVP?
9. Carga de histórico retroativo: quanto do passado importar na ficha (só posição atual + admissão, ou histórico de cargos/salários/afastamentos)? O que existe só em papel e vale digitalizar no GED com qual prioridade?
10. Cadência de feedback: os 90 dias do Fast-Agente valem para toda a empresa ou variam por área/senioridade? O alerta vai para o gestor, para o RH ou ambos?
11. Existe catálogo de cargos formalizado hoje (com descrição/CHA) ou o desenho dos cargos e da tabela salarial é trabalho novo do RH que precisa acontecer DURANTE a Fase 1?
12. Centros de custo: o DP usa os mesmos códigos do financeiro/DW? Lotação por centro de custo é necessária no MVP ou basta unidade?
13. Dependentes: dado que a folha própria precisa deles para IRRF (trilha F, etapa F2), quando o DP consegue saneá-los — junto da carga inicial ou como esforço separado na Fase 2?
14. Entrevista de criação de ficha do Fast-Agente (papel + retrato + 9 valores): o RH quer mantê-la obrigatória para todo colaborador novo ou só para cargos de liderança?
15. Quem administra os descritores dos 9 Valores daqui em diante (RH edita com vigência)? Há intenção de revisá-los antes de virarem régua oficial da 360?
