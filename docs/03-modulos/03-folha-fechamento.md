# Folha de pagamento e fechamento (rh_folha) — motor de cálculo próprio, competência como máquina de estados e transição paralelo-até-paridade

> Revisado em 2026-07-24 (v2) após decisões do usuário. Substitui integralmente a v1
> ("esteira de conferência e fechamento sobre a Nasajon"), cuja premissa caiu: **não haverá
> integração com o Nasajon — a folha passa a ser calculada pelo sistema próprio** (decisão
> definitiva, risco assumido e registrado no log de decisões). O Nasajon permanece apenas como
> sistema oficial durante a transição (sombra) e como referência funcional do que a folha
> própria precisa cobrir. A transmissão das obrigações (eSocial, FGTS Digital, DCTFWeb) fica
> no **módulo 12 (eSocial e obrigações fiscais, domínio `fiscal/`)** — este módulo referencia,
> não duplica.
> **Status: PROPOSTA revisada — nada é definitivo até validação expressa do usuário e do DP/RH. Fase sem código.**

**Fase sugerida:** Trilha F paralela do roadmap v2 (9–15 meses; o gate é **paridade comprovada, não calendário**): F1 motor mínimo (folha mensal ordinária) → F2 cobertura completa (médias, 13º, férias na folha, rescisão, provisões) → F3 sombra/paridade contra o Nasajon → F4 fiscal em produção restrita (módulo 12) → F5 cutover. Insumos da Fase 0: levantamento completo de rubricas e convenções coletivas hoje parametrizadas no Nasajon (referência funcional), protótipos HTML da esteira de fechamento e do painel de divergências da sombra, provisionamento do PostgreSQL dedicado com restore testado. Restrição de calendário: **cutover nunca entre novembro e janeiro** (13º + férias coletivas + IRRF anual concentram risco).

## Objetivo

Calcular e fechar a folha das 5 unidades da Fast **dentro do sistema próprio**, ponta a ponta: consolidar as variáveis da competência a partir dos módulos internos (ponto via REP-P contratado, afastamentos, férias, admissão/desligamento, benefícios, lançamentos manuais), **calcular** proventos, descontos, bases e encargos com catálogo de rubricas versionado e tabelas legais oficiais versionadas com vigência, produzir **memória de cálculo explicável item a item**, forçar conferência com resolução obrigatória de divergências, registrar aprovação com segregação de funções e 2FA, congelar o resultado em **snapshot imutável** ligado às versões de regra vigentes, gerar e publicar holerites com ciência digital e entregar ao módulo 12 (fiscal) o snapshot que alimenta eSocial, FGTS Digital e DCTFWeb. Durante a transição, o módulo roda **em sombra**: o Nasajon continua oficial, os resultados são comparados rubrica a rubrica por competência, e o cutover só ocorre após paridade comprovada e aprovação registrada.

O que este módulo **não** faz: não transmite obrigações (módulo 12); não registra marcação de ponto (REP-P de mercado, módulo de ponto); não é integração com o Nasajon — a importação de resultados do Nasajon na sombra é **conferência por export manual, temporária, que morre no cutover**.

## Funcionalidades

### MVP (Trilha F — F1: folha mensal ordinária; F3: sombra)

**1. Catálogo de rubricas próprio, versionado com vigência (`rubrica_versao`)**
- Cadastro dono: código próprio, descrição, natureza (provento | desconto | encargo_patronal | informativa), fórmula/regra de cálculo parametrizada (valor fixo, percentual sobre base, quantidade × valor, tabela), **incidências** (INSS, IRRF, FGTS, DSR, médias de férias/13º/rescisão), rubrica do eSocial correspondente (S-1010, insumo do módulo 12), vigência rascunho → ativa → encerrada. Regra alterada = **versão nova com vigência**, nunca update no histórico; competência fechada referencia a versão usada, para sempre.
- Carga inicial a partir do levantamento das rubricas hoje usadas no Nasajon (Fase 0) + de-para Nasajon ↔ próprio (o de-para vive na sombra e é o que permite comparar rubrica a rubrica).

**2. Tabelas legais oficiais, versionadas com vigência (`tabela_legal_versao`)**
- INSS (faixas progressivas + teto), IRRF (faixas, dedução por dependente, desconto simplificado), salário-família, salário mínimo, tetos; FGTS (alíquotas por tipo de vínculo); encargos patronais (INSS patronal 20%, RAT × FAP por estabelecimento, terceiros/Sistema S conforme FPAS).
- Atualização é **processo com dono e alerta**: nova tabela publicada (normalmente virada de ano) entra como versão nova com vigência; competência calculada referencia a versão por ID. Alerta n8n se uma competência abre sem tabela vigente para o período.
- Parâmetros de convenção coletiva **por unidade/sindicato** (`parametro_convencao_versao`): piso, reajuste com data-base, adicionais (percentual de hora extra acima do legal, adicional noturno, quebra de caixa etc.), benefícios obrigatórios — também versionados com vigência.

**3. Motor de cálculo com memória de cálculo**
- Pipeline determinístico por colaborador dentro da competência: (1) salário contratual + variáveis da coleta → proventos; (2) DSR sobre variáveis quando incidente; (3) bases de INSS/IRRF/FGTS conforme incidências das rubricas; (4) descontos legais (INSS progressivo, IRRF com deduções) e autorizados (pensão, consignado, benefícios); (5) encargos patronais (não saem no líquido, saem no custo); (6) líquido.
- **Cada item calculado grava memória de cálculo** (`calculo_item`): rubrica_versao usada, base, quantidade/referência, tabela_legal_versao aplicada, valores intermediários (ex.: cálculo por faixa do INSS), resultado. Qualquer valor de holerite é explicável e auditável item a item — requisito de defesa em fiscalização e reclamatória, e insumo da comparação na sombra.
- Recálculo sempre gera **nova execução** (`calculo_execucao` com contador de iteração); nunca sobrescreve a anterior. Cálculo é job assíncrono, nunca no caminho síncrono de tela.
- Proporcionalidades do MVP: admissão/desligamento no meio do mês (saldo de dias), afastamentos que suspendem/reduzem remuneração (só período e tipo entram — **CID/documento de saúde jamais transita para a folha**), faltas e atrasos vindos do espelho de ponto fechado.

**4. Competência como máquina de estados**
- Estados: `aberta → calculo → conferencia → aprovada → fechada → paga → obrigacoes_transmitidas`. Transições só para frente; única volta permitida é `conferencia → calculo` (correção de variável ou parâmetro gera nova execução de cálculo, com contador de iteração). Após `fechada`, **NUNCA reabre** — correção é evento novo (folha complementar, registrada como tal).
- `paga`: registro do pagamento efetuado (data, meio, responsável; ver pergunta aberta sobre arquivo bancário). `obrigacoes_transmitidas`: estado alimentado **pelo módulo 12** quando os eventos periódicos da competência estão aceitos com recibo — este módulo só lê o status consolidado.
- Cada transição grava no audit (quem, quando, de/para, justificativa quando aplicável) e dispara notificação n8n aos papéis interessados (**payload sem valores**).
- Tipo de folha no MVP: `mensal`. A mesma máquina serve às folhas especiais na evolução (campo `tipo_folha`).

**5. Calendário de fechamento por competência (versionado)**
- Marcos parametrizáveis com vigência: corte de ponto, prazo de lançamento de variáveis, data de cálculo, data de aprovação, data de pagamento (5º dia útil ou o praticado), dia 20 (FGTS Digital), prazos do eSocial (espelhados do módulo 12). Alimenta alertas n8n de marco vencendo/vencido e a janela de congelamento de deploy em dias críticos.

**6. Coleta e consolidação de variáveis (proveniência obrigatória)**
- Consolidação automática por origem interna, com proveniência rastreada em cada variável: **espelho de ponto FECHADO** (horas extras por faixa, adicional noturno, faltas, atrasos, DSR descontado — dados tratados no nosso módulo de ponto sobre a marcação do REP-P contratado), afastamentos do período, férias que caem na competência, admissões e desligamentos do período, adesões/descontos de benefícios, comissões (somente se confirmadas no DW — senão lançamento manual).
- Lançamento manual de variáveis avulsas (prêmio, desconto autorizado, pensão alimentícia, consignado) pelo analista de DP, sempre com rubrica do catálogo, origem "manual", anexo justificativo opcional e trilha.
- Checklist de pré-cálculo (gate da transição `aberta → calculo`): todos os espelhos de ponto fechados; zero ajustes de ponto pendentes (ou justificados um a um); afastamentos registrados; desligamentos com processo iniciado; nenhum colaborador ativo sem lotação/jornada/salário vigente; tabelas legais e convenções vigentes para o período. Só com checklist 100% (ou exceção justificada e auditada) o cálculo é liberado.
- Trava de estado: variáveis read-only quando a competência sai de `aberta` (exceto pelo ciclo de correção controlado) e definitivamente após `fechada`.

**7. Conferência interna com divergência de resolução obrigatória**
- Geradas automaticamente: variação do líquido acima de limiar % configurável vs competência anterior; colaborador ativo sem cálculo ou desligado com cálculo; rubrica com valor zerado onde havia variável; base negativa ou acima do teto sem justificativa; soma dos itens ≠ líquido (checagem de consistência do próprio motor).
- Divergência manual: analista marca item suspeito com descrição.
- Todo desfecho registrado: `aceita` (com justificativa) ou `corrigida` (dispara `conferencia → calculo`). Trava: transição para `aprovada` bloqueada com qualquer divergência aberta.

**8. Aprovação e fechamento com segregação de funções**
- Quem opera o cálculo não aprova: aprovação exige chave `folha.fechar` + **2FA** (obrigatório para papéis dp/rh/admin na Fase A), por usuário distinto do que disparou a execução final.
- Ao aprovar: **snapshot imutável** do fechamento (variáveis, itens com memória de cálculo, bases, totais por unidade/CC, divergências e desfechos, **referências por ID às versões de regra usadas** — rubricas, tabelas legais, convenções, calendário, jornadas), com hash, só-INSERT garantido por GRANT. O snapshot é o histórico legal, a fonte do módulo 12 e a única base de analytics.

**9. Holerite gerado pelo sistema**
- Geração própria (layout com salário base, proventos, descontos, bases, FGTS do mês, líquido) → GED com hash SHA-256, classificação sensível, visibilidade exclusiva do titular; ciência digital registrada (quem, quando, hash); todo acesso grava trilha de leitura; n8n notifica "holerite disponível" (sem valores). Contestação vira demanda (rh_demandas) roteada ao DP.
- Na sombra, holerites próprios **não são publicados aos colaboradores** — o oficial é o do Nasajon; os nossos ficam restritos ao DP para comparação.

**10. Transição — paralelo até paridade (capítulo dedicado; domínio temporário `nasajon_sombra/`)**
- **Princípio:** o Nasajon continua o sistema oficial (calcula, paga, transmite) enquanto a folha própria roda em sombra sobre as mesmas variáveis. Importação dos resultados do Nasajon por **relatórios/exports manuais** (analítico por colaborador × rubrica) — é conferência, não integração: carga em staging com hash e snapshot do arquivo bruto, upload manual pelo DP.
- **Comparação rubrica a rubrica:** via de-para Nasajon ↔ catálogo próprio, por colaborador e competência: valor a valor, bases (INSS/IRRF/FGTS), líquido e totais. Tolerância de arredondamento parametrizada (proposta: R$ 0,01 por item; a confirmar com o DP).
- **Painel de divergências da sombra:** toda diferença acima da tolerância vira registro com classificação obrigatória: `erro_motor_proprio` (corrigir motor/parâmetro), `erro_nasajon` (comunicar DP — acontece), `diferenca_de_regra` (interpretação divergente — decidir e registrar no log), `de_para_incompleto`. Métrica de paridade por competência: % de itens idênticos, nº de colaboradores 100% idênticos, divergências abertas.
- **Critério de cutover (proposta a validar):** N competências consecutivas com paridade total dentro da tolerância — proposta: **2 competências limpas consecutivas, incluindo ao menos um ciclo com férias e um com rescisão** — + aprovação formal registrada (usuário + responsável do DP, no log de decisões). Nunca entre novembro e janeiro. Sem paridade comprovada, não há cutover — o prazo se move, não o critério.
- **Pós-cutover:** o que morre no cutover é o **importador de conferência** — o domínio `nasajon_sombra/` (importação, de-para de rubricas, comparação) é desativado, com dados retidos conforme temporalidade. A **matrícula eSocial** dos colaboradores legados, porém, **não morre**: a matrícula que a Nasajon declarou no S-2200 (e que consta no RET) é dado fiscal **permanente** — todos os eventos não periódicos futuros desses colaboradores (S-2205, S-2206, S-2230, S-2299) precisam referenciá-la para sempre. É a **matrícula eSocial persistente** definida no módulo 01, que vive no cadastro do colaborador, fora da sombra. **Matrícula PRÓPRIA é a chave interna** desde o dia 1 — o que existe só dentro da sombra é a correlação de conferência (de-para de rubricas e resultados), não a matrícula eSocial.
- Custo assumido: a sombra dobra parte do trabalho do DP por algumas competências — combinar antecipadamente escopo e mês de início com o gestor do DP.

### Evolução (Trilha F — F2 em diante; obrigatória ANTES do cutover no que toca 13º, férias e rescisão)

- **Médias de remuneração variável:** médias de horas extras, adicionais e comissões para férias, 13º e rescisão, conforme CLT/convenção. Exige **histórico de remuneração** — na estreia, importar histórico do Nasajon (export manual) ou acumular na sombra; decidir na Fase 0 (pergunta aberta).
- **13º salário** (`tipo_folha`: `13o_1a`, `13o_2a`): 1ª parcela até 30/11 (ou com férias, se solicitado), 2ª até 20/12 com ajuste de médias e encargos; avos proporcionais por admissão/afastamento. Precisa estar coberto e comprovado na sombra antes do cutover.
- **Férias na folha:** integração com o módulo de férias — abono pecuniário, 1/3 constitucional, médias, pagamento 2 dias antes do gozo (art. 145) com trava de calendário; recibo no GED com ciência.
- **Rescisão** (`tipo_folha`: `rescisao`, competência extraordinária pendurada no `processo_desligamento`): verbas rescisórias por modalidade de desligamento (saldo de salário, aviso prévio indenizado/trabalhado com proporcional por ano, férias vencidas + proporcionais + 1/3, 13º proporcional, baixas e multa de FGTS — o recolhimento/multa opera via FGTS Digital no módulo 12); **monitoramento do prazo do art. 477 §6º (10 dias)** com alerta escalonado; TRCT gerado pelo sistema; eventos de desligamento (S-2299) via módulo 12.
- **Adiantamento quinzenal** (se existir na Fast — pergunta aberta) e **folha complementar** (correções pós-fechamento como competência própria).
- **Autônomos, estagiários, aprendizes e pró-labore:** RPA e recolhimentos de contribuintes individuais, bolsa-estágio, particularidades de aprendiz — só após a folha CLT estável.
- **Provisões calculadas** (13º, férias + 1/3, encargos sobre provisões) por competência, para a contabilidade — agora calculadas pelo próprio motor, não importadas.
- **Custo por centro de custo:** projeção do snapshot × lotação vigente; total (salários + encargos + provisões) por unidade/CC/competência; somente agregado, com mínimo de N colaboradores por célula para quem não tem chave de folha.
- **Informe de rendimentos anual (IRPF)** gerado pelo sistema a partir dos snapshots do ano, publicado no GED com ciência.
- **Analytics de folha:** evolução de custo, horas extras por unidade, comparativos — sempre sobre snapshot, nunca sobre staging/execuções intermediárias.
- **Arquivo bancário de pagamento (CNAB) ou registro manual de pagamento:** em aberto — depende de como o pagamento é operado hoje (pergunta ao DP); no MVP, registro manual da data/meio de pagamento no estado `paga`.

**Explicitamente fora deste módulo:** transmissão de eSocial/FGTS Digital/DCTFWeb e gestão de certificado digital (módulo 12); registro de marcação de ponto (REP-P contratado + módulo de ponto); qualquer integração automática com o Nasajon (não existe API pública de folha; a sombra é export manual e temporária).

## Entidades de dados

### Domínio `rh_folha` (PostgreSQL dedicado SaveinCloud; pool `app_folha`; audit só-INSERT por GRANT)

- **`rubrica_versao`** — código próprio, descrição, natureza (provento | desconto | encargo_patronal | informativa), regra de cálculo parametrizada, incidências (INSS/IRRF/FGTS/DSR/médias), código eSocial correspondente, vigência (rascunho → ativa → encerrada), autor. Alteração = nova versão; competências referenciam versão por ID.
- **`tabela_legal_versao`** — tipo (inss | irrf | salario_familia | salario_minimo | fgts | inss_patronal | rat_fap | terceiros), faixas/alíquotas/valores (JSONB validado por tipo), vigência, fonte oficial (norma/portaria), autor da carga.
- **`parametro_convencao_versao`** — unidade/sindicato, data-base, piso, adicionais e regras específicas, vigência, documento da convenção no GED.
- **`calendario_fechamento_versao`** — marcos parametrizáveis com vigência (corte de ponto, variáveis, cálculo, aprovação, pagamento, FGTS dia 20, prazos eSocial espelhados do módulo 12).
- **`competencia_folha`** — ano/mês, `tipo_folha` (mensal | 13o_1a | 13o_2a | rescisao | complementar | adiantamento — MVP só mensal), escopo (unidades), estado (máquina de estados), execução de cálculo corrente, referências por ID às versões vigentes, timestamps de cada transição. Única por (competência, tipo, escopo).
- **`variavel_folha`** — FK competência + colaborador, rubrica (FK versão), quantidade/referência, valor, **origem rastreada** (ponto | afastamento | ferias | admissao_desligamento | beneficio | comissao_dw | manual) + FK à entidade de origem, anexo (GED), status, autor. Read-only fora de `aberta`.
- **`calculo_execucao`** — FK competência, iteração, disparado por, timestamps, status (executando | concluida | erro), hash dos parâmetros de entrada. Nova execução a cada recálculo; nenhuma é sobrescrita.
- **`calculo_item`** — FK execução + colaborador, rubrica_versao, base, quantidade/referência, valor, **memória de cálculo** (JSONB: tabela_legal_versao aplicada, faixas percorridas, valores intermediários), bases acumuladas (INSS/IRRF/FGTS) e líquido no registro-resumo por colaborador. Nunca editado.
- **`divergencia_conferencia`** — FK competência + execução, tipo (variacao_liquido | colaborador_sem_calculo | calculo_sem_vinculo | valor_zerado | base_inconsistente | manual), severidade, item(ns) referenciado(s), desfecho obrigatório (aceita + justificativa | corrigida + FK nova execução), autor do desfecho. Trava a aprovação enquanto aberta.
- **`aprovacao_fechamento`** — FK competência, aprovador (≠ operador da execução final), 2FA verificado, timestamp, hash do snapshot.
- **`snapshot_fechamento`** — imutável (só-INSERT por GRANT): variáveis, itens finais com memória de cálculo, bases, totais por unidade/CC, divergências e desfechos, IDs de todas as versões de regra usadas, hash. Histórico legal; fonte do módulo 12; única base de analytics.
- **`pagamento_competencia`** — FK competência, data, meio (manual | cnab — evolução), responsável, comprovante (GED). Alimenta o estado `paga`.
- **`holerite`** — FK competência + colaborador, FK `documento` (GED, hash, sensível), FK `ciencia`; visível só ao titular; leitura gera trilha. Flag `publicado` (falso durante a sombra).
- **`provisao_competencia`** (evolução) — FK competência + colaborador, tipo (13o | ferias_terco | encargo_provisao), valor calculado, FK execução.
- **`custo_centro_custo`** (evolução) — projeção materializada do snapshot × lotação: competência, unidade, CC, totais agregados; sem valor individual; mínimo de N colaboradores por célula.

### Domínio temporário `nasajon_sombra/` (morre no cutover; dados retidos por temporalidade)

- **`importacao_sombra`** — FK competência, arquivo bruto (GED) + hash, layout/origem do export, autor do upload, status de processamento.
- **`item_sombra`** — projeção do export: matrícula Nasajon, rubrica Nasajon, referência, valor, bases, líquido.
- **`de_para_rubrica`** — rubrica Nasajon ↔ rubrica_versao própria; incompleto = divergência automática.
- **`de_para_matricula`** — matrícula Nasajon ↔ matrícula própria (a chave interna do sistema é a PRÓPRIA). Atenção: este de-para de **conferência** morre no cutover, mas a **matrícula eSocial persistente** do colaborador legado (declarada pela Nasajon no S-2200/RET) é dado fiscal permanente e vive no cadastro do colaborador (módulo 01), não aqui — eventos não periódicos futuros (S-2205/S-2206/S-2230/S-2299) a referenciam para sempre.
- **`comparacao_sombra`** — FK competência: resultado item a item (identico | divergente | so_proprio | so_nasajon), delta, métricas de paridade agregadas.
- **`divergencia_sombra`** — FK comparação, classificação obrigatória (erro_motor_proprio | erro_nasajon | diferenca_de_regra | de_para_incompleto), desfecho, autor.
- **`parecer_paridade`** — por competência: % paridade, divergências remanescentes e justificativas, parecer do DP; base formal do critério de cutover.

**Relações-chave:** `variavel_folha` sempre aponta para a entidade interna de origem (espelho_ponto, afastamento, programacao_ferias, processo_desligamento, adesao) — proveniência é obrigatória. `competencia_folha` e `snapshot_fechamento` referenciam versões de regra **por ID de versão, nunca "a atual"**. O módulo 12 consome exclusivamente `snapshot_fechamento` (nunca execuções intermediárias) e devolve o status consolidado que habilita `obrigacoes_transmitidas`. Holerites/recibos vivem no GED (rh_documentos). Chave de pessoa: **matrícula própria** (colaborador 1:1 com usuário próprio da Fase A).

## Papéis e permissões

Papéis próprios da Fase A (`funcionario`, `gestor`, `rh`, `dp`, `admin`), validados **no backend Node** a cada requisição; RLS via `SET LOCAL` no Postgres onde couber, senão autorização na camada de repositório coberta por matriz de testes papel × recurso no CI. 2FA obrigatório para `dp`, `rh` e `admin`. Pool `app_folha` segregado — os pools dos demais domínios não têm GRANT sobre as tabelas de folha.

| Papel | Vê | Faz |
|---|---|---|
| **funcionario** | Apenas os próprios holerites, informes e recibos (payload minimizado: dado de terceiro nunca entra na resposta) | Dá ciência digital; abre demanda de contestação de holerite |
| **gestor** | NADA de valores de folha por padrão — nem da equipe. Evolução: custo agregado do seu CC somente com chave própria (`folha.custo_cc.ver`), nunca valor individual | Aprova ajustes de ponto da equipe (insumo pré-folha), no módulo de ponto |
| **dp** | Competência inteira: variáveis, execuções, memória de cálculo, divergências, catálogo de rubricas, sombra (chaves `folha.operar`, `folha.variavel.lancar`, `folha.rubrica.editar`, `sombra.operar`) | Opera a esteira: checklist, lançamentos, disparo de cálculo, resolução de divergências, upload da sombra, publicação de holerites. NÃO aprova o fechamento da execução que disparou |
| **rh** (responsável) | Tudo do dp + painéis | Aprova o fechamento — chave `folha.fechar` + 2FA; autoriza exceções de checklist com justificativa; assina o parecer de paridade junto do usuário |
| **admin** | Administra usuários/papéis/chaves; **não vê valores de folha** — holerite/salário exigem chave funcional, não técnica; acesso DBA nominal e logado | Operação de plataforma |

**Regras transversais:** duas trilhas de audit desde o dia 1 — alteração E **leitura de dado sensível** (quem viu salário/holerite de quem). Segregação de funções: calcular ≠ aprovar. Edição de rubrica e de tabela legal gera versão nova auditada (nunca update). Sessão com timeout mais curto para dp/rh/admin. Payload minimizado: ausência, não máscara. Notificações n8n/WhatsApp jamais carregam valores.

## Integrações

**Módulo 12 — eSocial e obrigações fiscais (`fiscal/`) — a jusante, o principal**
- Comunicação por **snapshot imutável de competência**: a folha entrega `snapshot_fechamento` (fechada/paga); o módulo 12 monta e transmite os eventos periódicos (S-1200/S-1210/S-1299), FGTS Digital e DCTFWeb com certificado digital próprio, e devolve o status consolidado (recibos) que habilita `obrigacoes_transmitidas`. Cadastro de rubricas (S-1010) alimentado pelo catálogo próprio. Detalhes de fila, estados, recibos, produção restrita e certificado: **ver módulo 12 — não duplicado aqui**.

**Módulos internos (a montante)**
- Ponto (`rh_ponto`): espelho FECHADO → variáveis de horas extras, faltas, DSR, adicional noturno. A marcação vem do **REP-P contratado (Pontomais, candidata líder) via API/webhooks**; tratamento, escalas e banco de horas são nossos. Espelho não fechado = gate de cálculo bloqueado.
- Admissão/desligamento: proporcionais de admissão; rescisão (evolução) pendura no `processo_desligamento`.
- Afastamentos: só período e tipo entram na variável; **CID/documento de saúde jamais transita para folha** (dado de saúde cifrado no módulo de origem).
- Férias: programações que caem na competência; recibo no GED.
- Benefícios: descontos de adesão (operadores Flash/Swile/iFood no módulo próprio; aqui só chega o desconto consolidado).
- GED (`rh_documentos`): holerites, recibos, TRCT, informes — ciência e trilha de leitura.
- Demandas (`rh_demandas`): contestação de holerite.

**Nasajon — SOMENTE sombra (temporário, export manual)**
- Sem API pública de folha; nenhuma integração automática. Upload manual de relatórios/exports pelo DP para o domínio `nasajon_sombra/`, com staging, hash e snapshot do bruto. Morre no cutover.

**DW SAP (read-only, fora do caminho crítico)**
- Comissões como variável de coleta somente se confirmada granularidade utilizável; centros de custo para o painel de custo somente se validados. Nenhum estado da esteira depende do DW.

**n8n + WhatsApp Cloud API / e-mail transacional (dispara, nunca decide nem armazena)**
- Alertas de marco de calendário, checklist pendente, divergência crítica, tabela legal vencendo, fechamento aprovado, holerite disponível, prazo art. 477. **Payload sem valores nem dado sensível.**

## Regulatório

A v2 **assume o risco regulatório do cálculo** (decisão registrada no log). O desenho responde com: tabelas legais versionadas com fonte oficial, memória de cálculo item a item, sombra até paridade e homologação do DP em cada regra.

- **Cálculo próprio:** CLT (jornada, adicionais, DSR — Lei 605/49), INSS (Lei 8.212/91, tabela progressiva), IRRF (RIR/2018, tabela vigente), FGTS (Lei 8.036/90), 13º (Leis 4.090/62 e 4.749/65), férias (CLT arts. 129–145), rescisão (art. 477; modalidades e aviso — Lei 12.506/11), salário-família, convenções coletivas por unidade/sindicato (datas-base, pisos, adicionais). Cada regra parametrizada com vigência e homologada pelo DP antes de valer na sombra.
- **Transmissão fiscal:** eSocial (periódicos, não periódicos, SST), FGTS Digital e DCTFWeb são responsabilidade do **módulo 12**, com certificado digital em secret manager — este módulo apenas entrega o snapshot e monitora o status.
- **Prazos legais monitorados E honrados pelo cálculo próprio:** pagamento até o 5º dia útil (art. 459 §1º); férias pagas 2 dias antes (art. 145); acerto rescisório em 10 dias (art. 477 §6º); FGTS Digital dia 20; marcos do 13º (30/11 e 20/12) — alertas e travas de calendário.
- **Imutabilidade probatória:** snapshot só-INSERT por GRANT, com hash, ligado por ID às versões de regra. "Fechado não reabre; correção é evento novo." Memória de cálculo torna cada valor explicável em fiscalização e reclamatória. Retenção conforme tabela de temporalidade (trabalhista 5 a 30 anos); backup diário + PITR com restore testado.
- **Portaria MTP 671/2021:** marcação em REP-P homologado contratado (nunca registrador próprio); AFD/AEJ ficam com o fornecedor do REP-P e arquivados; a folha só consome espelho fechado — cadeia de validade jurídica preservada.
- **LGPD:** salário/holerite como dado de acesso restrito — minimização (ausência, não máscara), trilha de leitura desde o dia 1, holerite visível só ao titular com ciência por hash, base legal mapeada (execução de contrato + obrigação legal), n8n/WhatsApp proibidos de carregar valores, dado de saúde nunca entra na folha.
- **Ciência digital com hash** para holerites/recibos; assinatura eletrônica avançada/qualificada (Clicksign/ZapSign/D4Sign) onde exigida (ex.: TRCT), via módulo de documentos.

## Dependências

1. **Decisão fechada "folha própria, sem integração Nasajon"** — risco assumido e registrado no log; este desenho a obedece integralmente.
2. **Fase 0:** levantamento completo das rubricas, incidências e convenções hoje no Nasajon (referência funcional e carga inicial do catálogo); definição dos exports do Nasajon utilizáveis na sombra (analítico por colaborador × rubrica); decisão sobre importação de histórico de remuneração (médias); Postgres dedicado provisionado com backup + PITR e restore testado; protótipos HTML da esteira e do painel de sombra; SPIKE eSocial (dependência do módulo 12, que trava o estado final da competência).
3. **Fase 1:** autenticação e cadastro próprios (papéis, 2FA), colaborador com matrícula própria, lotação (unidade × CC), GED mínimo com ciência, demandas, avisos n8n/WhatsApp.
4. **Fase 2:** REP-P contratado e módulo de ponto com espelho conciliado (insumo direto do cálculo); afastamentos; férias; desligamento — a folha consome a saída de todos.
5. **Trilha F interna:** F2 (médias, 13º, férias, rescisão) precisa estar comprovada na sombra antes do cutover; F4 (módulo 12 em produção restrita) precisa estar aprovada antes de a competência própria alcançar `obrigacoes_transmitidas` oficialmente.
6. **Gente:** disponibilidade do DP para a sombra (trabalho dobrado por algumas competências) e para homologar regra a regra; avaliar consultoria/assessoria de DP para revisão independente das parametrizações (recomendado, decisão em aberto).

## Riscos

1. **Erro de cálculo próprio gera passivo trabalhista/fiscal — o risco nº 1, assumido.** Mitigações: sombra até paridade comprovada (gate, não prazo), memória de cálculo item a item, tabelas versionadas com fonte oficial, homologação do DP por regra, cutover proibido nov–jan. Registrado no log de decisões.
2. **Tabela legal desatualizada** (virada de ano, reajuste de teto): processo de atualização com dono, alerta de competência sem tabela vigente e bloqueio de cálculo — mesmo assim depende de vigilância humana; definir responsável nominal.
3. **Convenções coletivas subestimadas:** 5 unidades podem significar sindicatos, datas-base e adicionais diferentes; cada convenção é parametrização + teste. Levantamento na Fase 0 é pré-requisito duro.
4. **Exports do Nasajon insuficientes para a sombra** (sem analítico por rubrica): a comparação degrada para totais/líquido, enfraquecendo o critério de paridade — verificar formatos reais com o DP antes de F3; se necessário, comparar por amostragem profunda + totais.
5. **Paridade que nunca fecha** por arredondamento/diferença de critério: definir tolerância explícita (R$ 0,01/item, proposta) e a classificação `diferenca_de_regra` com decisão registrada — senão a sombra vira perseguição de centavos sem fim.
6. **Sombra dobra o trabalho do DP:** sem acordo prévio com o gestor do DP, o paralelo é abandonado na prática e o gate é pulado. Combinar escopo, duração e mês de início.
7. **Dependência do módulo 12:** a folha pode calcular e fechar, mas sem transmissor aprovado em produção restrita não há cutover — atraso no spike/homologação do eSocial arrasta a Trilha F inteira.
8. **Histórico para médias:** férias/13º/rescisão exigem 12 meses de remuneração variável; sem importação de histórico do Nasajon, a folha própria só atinge cobertura completa após acumular histórico na sombra — decidir cedo (Fase 0).
9. **Time Node sem experiência prévia em folha:** domínio denso e punitivo a erro; mitigar com consultoria de DP, casos de teste montados a partir de contracheques reais do Nasajon e a própria sombra como bateria de regressão.
10. **Pagamento pós-cutover em aberto:** hoje o arquivo bancário sai do Nasajon; sem definição (CNAB próprio × pagamento manual via internet banking), o cutover trava no estado `paga`. Pergunta obrigatória ao DP.
11. **Vazamento por agregação** no custo por CC (célula com 1 pessoa): agregação mínima de N colaboradores para quem não tem chave de folha.
12. **Concentração de salários no banco próprio:** mitigado por banco dedicado, pools segregados, GRANT restritivo, duas trilhas de audit, 2FA e backup+PITR testado — ainda assim, alvo de alto valor; disciplina de acesso nominal DBA.

## Perguntas abertas para DP/RH

1. **Rubricas hoje no Nasajon:** relatório completo (código, descrição, natureza, incidências INSS/IRRF/FGTS/médias/DSR) — é a carga inicial do catálogo próprio. Quais rubricas estão ativas de fato e quais são legado morto?
2. **Convenções coletivas por unidade:** quais sindicatos, datas-base, pisos, adicionais diferentes do legal (percentual de HE, noturno, quebra de caixa etc.)? Quem acompanha reajuste de convenção hoje e como fica sabendo?
3. **Particularidades por unidade:** alguma unidade com regime, benefício, adicional ou acordo próprio? RAT/FAP e FPAS por estabelecimento — onde consultar os vigentes?
4. **Exports do Nasajon para a sombra:** quais relatórios existem (analítico por colaborador × rubrica, bases, líquido)? Em que formato (PDF, CSV, TXT)? Dá para exportar histórico de 12+ meses de remuneração variável (médias)?
5. **Processo atual, passo a passo:** como funciona o mês do DP hoje? Quem digita o quê no Nasajon, em que datas (corte de ponto, lançamentos, conferência, pagamento)? Existe dupla conferência?
6. **Pagamento:** como o líquido chega ao banco hoje (arquivo CNAB gerado pelo Nasajon? digitação no internet banking?)? Qual banco? Data praticada é o 5º dia útil? Existe adiantamento quinzenal? PLR?
7. **Comissões:** entram na folha? De onde vêm (DW, planilha)? Como se calcula o DSR sobre comissão hoje?
8. **Descontos de terceiros:** pensão alimentícia, consignado, vale-transporte — quem lança, com que documento, em que sistema?
9. **Contribuintes fora do CLT mensal:** existem autônomos (RPA), estagiários, aprendizes, pró-labore? Quantos e quem processa hoje?
10. **Conferência:** quais são as divergências mais comuns hoje e que variação de líquido é alarmante (calibra o limiar automático)? Que tolerância de centavos aceitam na comparação da sombra?
11. **Fechamento:** quem aprova hoje? Aceitam a segregação calcular ≠ aprovar com 2FA? Quem pode autorizar exceção de checklist?
12. **Sombra:** aceitam rodar o paralelo (trabalho dobrado) por pelo menos 2–3 competências? Qual época do ano seria menos pior para começar (evitando nov–jan no cutover)? Quem do DP será o dono do painel de divergências?
13. **Rescisão:** quem monta o TRCT hoje? O prazo de 10 dias do art. 477 é folgado ou apertado na prática? Homologação sindical é exigida por alguma convenção?
14. **Provisões:** a contabilidade consome relatório de provisões (13º, férias, encargos) do Nasajon hoje? Em que formato precisa receber do sistema próprio?
15. **Histórico:** precisamos importar o histórico de folha do Nasajon (para médias e consulta) ou basta arquivar os relatórios no GED e começar o histórico próprio na sombra?
