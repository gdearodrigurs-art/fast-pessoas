# Requirements (PRDs)

Synthesized from classified PRDs: `docs/03-modulos/05-avaliacao-360.md` and
`docs/03-modulos/11-desligamento.md`. Both carry `Status: PROPOSTA — nada definitivo` (not locked).
No competing-acceptance overlap detected between the two PRDs (distinct scopes: 360 evaluation vs offboarding).

Note: many module docs that also contain requirement-like "Funcionalidades/MVP" sections were classified
SPEC (technical contracts dominate) and are recorded in constraints.md. Their PRD-flavored functionality
lists are secondary signals there.

---

## REQ-360-auditoria-btime
- source: docs/03-modulos/05-avaliacao-360.md (Item 0)
- description: Primeira tarefa do design (antes de qualquer protótipo): pedir ao usuário o código-fonte e spec da btime e auditá-los criticamente (pilares, pesos 30/40/30, indicadores do Dever, CHA, descritores 1–5, faixas/flags, ciclos, regras escondidas).
- acceptance: Entregável "aproveitar vs corrigir" com cada decisão registrada no log; defaults só valem como partida até a auditoria confirmá-los/substituí-los; postura cética.
- scope: avaliação 360, design, btime

## REQ-360-modelo-administravel
- source: docs/03-modulos/05-avaliacao-360.md (MVP 1)
- description: CRUD de modelo_avaliacao_versao (rascunho → ativa → encerrada) configurável pelo RH sem dev: pilares/pesos, indicadores, escala 1–5, faixas/flags, periodicidade, prazos.
- acceptance: Versão ativada é imutável; mudança gera nova versão válida só para ciclos abertos depois; ciclo aberto congela a versão. Validação na ativação: soma dos pesos = 100%, faixas contíguas cobrindo 0–100%, todo pilar com ≥1 indicador. Sem recálculo retroativo.
- scope: avaliação 360, versionamento com vigência

## REQ-360-fit-cultural-9-valores
- source: docs/03-modulos/05-avaliacao-360.md (MVP 2)
- description: Catálogo dos 9 Valores Fast com descritores por nível 1–5 (de fast_kb_valores_fast.md), exibidos como régua na tela de resposta.
- acceptance: Descritores versionados junto com o modelo (mudança = nova versão); auditoria btime valida completude.
- scope: avaliação 360, fit cultural

## REQ-360-pilar-cha
- source: docs/03-modulos/05-avaliacao-360.md (MVP 3)
- description: Indicadores do pilar CHA derivam do CHA estruturado da cargo_versao vigente do avaliado na abertura do ciclo (não digitados por ciclo).
- acceptance: Cargo sem CHA estruturado bloqueia a geração da avaliação com pendência visível ao RH.
- scope: avaliação 360, CHA, cargo_versao

## REQ-360-pilar-dever-origem-rastreada
- source: docs/03-modulos/05-avaliacao-360.md (MVP 4)
- description: Indicadores objetivos do Dever alimentados por módulos internos: assiduidade/atrasos do ponto (espelho fechado, REP-P), licenças/afastamentos como ausência computável (nunca CID), advertências/ocorrências da linha do tempo.
- acceptance: Sem módulo-fonte maduro, lançamento manual pelo DP com origem marcada e justificativa — nunca silencioso. Conversão indicador→nota 1–5 parametrizada no modelo, calculada só no backend.
- scope: avaliação 360, pilar Dever, integração ponto/afastamentos

## REQ-360-ciclos-experiencia-desempenho
- source: docs/03-modulos/05-avaliacao-360.md (MVP 5)
- description: Ciclos de Experiência (marcos 45d/90d gerados na admissão, amarrados às datas do contrato) e Desempenho (semestral). Geração por relacao_gestor vigente na abertura.
- acceptance: Alerta antecipado parametrizável (default 10 dias) para gestor+DP antes do vencimento do contrato. Painel de exceções (liderado sem gestor vigente, gestor desligado) com resolução obrigatória. Filtro por tipo_vinculo parametrizado.
- scope: avaliação 360, ciclos, contrato de experiência

## REQ-360-execucao-consolidacao-flag
- source: docs/03-modulos/05-avaliacao-360.md (MVP 6, 7)
- description: Execução líder→liderado (nota 1–5 por indicador com descritor, comentários), salvamento parcial, envio explícito; após envio respostas imutáveis. Consolidação no backend: nota por pilar → % → faixa → flag_recomendacao, gravada imutável com referência à versão do modelo.
- acceptance: Correção só por reabertura via evento auditado (nunca UPDATE silencioso). Flag é recomendação; nenhum status muda por flag.
- scope: avaliação 360, consolidação, flag

## REQ-360-decisao-humana
- source: docs/03-modulos/05-avaliacao-360.md (MVP 8)
- description: Para toda flag, registro obrigatório de decisao_humana (decisor, decisão, se diverge, justificativa, data).
- acceptance: Justificativa obrigatória se divergir. Decisão de desligamento não executa nada aqui — referencia/dispara processo_desligamento. Transição auditada.
- scope: avaliação 360, decisão humana

## REQ-360-devolutiva-ciencia-timeline-audit
- source: docs/03-modulos/05-avaliacao-360.md (MVP 9, 10, 11)
- description: Registro de devolutiva + ciência do colaborador com hash SHA-256 (padrão GED); evento_colaborador "avaliação concluída"; audit em duas trilhas (alteração + leitura de nota bruta) só-INSERT por GRANT desde o dia 1.
- acceptance: Devolutiva gera feedback_formal e zera cadência 90d. Nota bruta/resultado individual grava trilha de leitura. Colaborador vê o que a política liberar (mínimo faixa + devolutiva).
- scope: avaliação 360, GED, auditoria

## REQ-desligamento-tipos-versionados
- source: docs/03-modulos/11-desligamento.md (MVP 1)
- description: Tabela versionada de tipos de desligamento (pedido, sem/com justa causa, acordo 484-A, término de experiência, término temporário; extensível). Cada tipo carrega atributos de processo com vigência e mapeamento para o motivo eSocial do S-2299.
- acceptance: Nunca enum rígido. Base de cálculo em valor é exclusiva do motor de folha (módulo 03); atributos aqui orientam checklist, alertas e evento fiscal.
- scope: desligamento, tipos, eSocial

## REQ-desligamento-gate-estabilidades
- source: docs/03-modulos/11-desligamento.md (MVP 2)
- description: Verificação automática de estabilidades ANTES de iniciar (acidentário art.118, cipeiro, pré-aposentadoria CCT); gestante não é automatizável → item humano obrigatório com declaração.
- acceptance: Resultado por estabilidade livre|condicionado|bloqueado. Override só com justificativa obrigatória + parecer registrado (chave de aprovação, 2FA) — decisão humana auditada.
- scope: desligamento, estabilidades, gate

## REQ-desligamento-maquina-estados
- source: docs/03-modulos/11-desligamento.md (MVP 3)
- description: Máquina de estados iniciado → aviso → cumprimento/indenização → exame_demissional → devoluções → rescisão → homologação/pagamento → encerrado; terminais cancelado e (evolução) revertido.
- acceptance: Transições só para frente, cada uma no audit + notificação n8n/WhatsApp sem dado sensível. Gates de checklist; exame e devoluções podem correr em paralelo. Pode nascer de decisão 360, demanda do gestor, pedido do colaborador ou término de contrato a termo.
- scope: desligamento, workflow

## REQ-desligamento-aviso-previo-e-art477
- source: docs/03-modulos/11-desligamento.md (MVP 4, 5)
- description: Registro de modalidade de aviso prévio + projeção de datas (30 + 3/ano, máx 90, só a favor do empregado). Data-limite do art. 477 §6º (10 dias) calculada por processo, regra de contagem versionada.
- acceptance: Valor do aviso indenizado é rubrica do motor de folha, nunca deste módulo. Semáforo + alertas escalonados (D-7, D-3, D-1, vencido → escala ao RH). Aviso trabalhado sinaliza redução do art. 488 ao ponto. Comunicação no GED com ciência digital.
- scope: desligamento, aviso prévio, prazo legal

## REQ-desligamento-exame-devolucoes-beneficios
- source: docs/03-modulos/11-desligamento.md (MVP 6, 7, 8)
- description: ASO demissional como item de checklist (dispensa como decisão humana; conteúdo clínico cifrado); devolução de EPIs/ativos com condição e termo com ciência digital; cancelamento de benefícios e aviso arts. 30/31 Lei 9.656 com ciência registrada.
- acceptance: Item não devolvido: desconto só se autorizado por escrito, lançado como variável da competência de rescisão (valor no motor). Aviso de manutenção do plano contributário em dispensa sem justa causa com prazo de opção e prova de entrega.
- scope: desligamento, ASO, devoluções, benefícios

## REQ-desligamento-rescisao-competencia-extraordinaria
- source: docs/03-modulos/11-desligamento.md (MVP 9, 10)
- description: O processo abre competência extraordinária tipo_folha=rescisao em competencia_folha ligada ao processo; consolida insumos (apuração final de ponto, saldo de férias, variáveis, verbas do tipo). O módulo não calcula verba — a rescisão em valor vive em rh_folha.
- acceptance: Durante a sombra (F1–F4), Nasajon oficial; TRCT importado manualmente e rescisão própria em sombra (comparacao_sombra). Após cutover (F5), rescisão própria é oficial; TRCT gerado e publicado no GED com ciência.
- scope: desligamento, folha própria, transição

## REQ-desligamento-efetivacao-revoga-acesso
- source: docs/03-modulos/11-desligamento.md (MVP 11)
- description: A efetivação é transição única: colaborador.status → desligado + data_desligamento + desativação do usuário do app na MESMA transação + revogação de sessões + encerramento das vigências abertas (escala, relacao_gestor, lotacao) + evento na linha do tempo.
- acceptance: Nada por webhook/job — app e RH são a mesma base. Job diário alerta desligado com usuário ainda ativo (órfão crítico). Fase B: desativa também o portal.
- scope: desligamento, identidade, revogação de acesso

## REQ-desligamento-entrevista-indicador
- source: docs/03-modulos/11-desligamento.md (MVP 12)
- description: Entrevista de desligamento estruturada (roteiro versionado), conduzida por RH (nunca o gestor que desligou); indicador oficial "% de entrevistas realizadas" nasce no MVP. Pedido da Diretoria de Pessoas (2026-07-27).
- acceptance: Oferta obrigatória e auditada; participação voluntária. Processo não encerra com entrevista pendente — só estado terminal (realizada|recusada|não realizada com motivo). Meta na Central de Metas (versionada, nada fixo em código). Respostas com acesso restrito; indicador usa só status, nunca conteúdo.
- scope: desligamento, entrevista, indicador oficial

## REQ-desligamento-decisao-vs-flag-e-esocial
- source: docs/03-modulos/11-desligamento.md (MVP 13, 14)
- description: A flag da 360 é recomendação; o processo referencia decisao_humana e registra decisor/data/motivo. S-2299/S-2298 gerados a partir do snapshot da rescisão + motivo eSocial do tipo, enfileirados em evento_esocial (transmissão pelo módulo 12).
- acceptance: Nenhum desligamento nasce automático de nota/flag (regra estrutural). Durante a sombra, transmissor oficial é o Nasajon (confirmação manual pelo DP); após cutover, módulo 12 transmite com certificado próprio. Legado referencia matrícula eSocial do RET, não a matrícula própria.
- scope: desligamento, 360, eSocial S-2299/S-2298
