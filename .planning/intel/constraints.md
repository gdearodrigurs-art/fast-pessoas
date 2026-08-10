# Constraints (SPECs)

Synthesized from classified SPECs (10 module specs). All carry `Status: PROPOSTA` (not locked), but
technical contracts dominate. Where a SPEC touches a decision fixed by a higher-precedence locked ADR,
the ADR governs (see INGEST-CONFLICTS.md, INFO/auto-resolved). No SPEC contradicts a higher-precedence ADR.

Type legend: api-contract | schema | nfr | protocol.

---

## Núcleo do colaborador e histórico (rh_colaboradores)
- source: docs/03-modulos/01-nucleo-colaborador-historico.md
- type: schema
- content: Ficha 1:1 do colaborador; linha do tempo append-only (evento_colaborador, payload JSONB validado por tipo); matrícula própria (chave interna) + campo persistente matricula_esocial para legado (RET). Entidades: colaborador, tipo_vinculo, usuario (1:1), evento_colaborador, ocorrencia, feedback_formal, acao_aberta, cargo/cargo_versao (CHA), tabela_salarial_versao, posicao_colaborador, empregador/estabelecimento_versao, relacao_gestor (vigência), lotacao, dependente. Carga inicial via Nasajon (referência). Matriz papel × recurso.

## Controle de ponto (rh_ponto)
- source: docs/03-modulos/02-ponto.md
- type: schema
- content: Importa marcações do REP-P (Pontomais); jornadas versionadas (jornada_versao: 5x2, 6x1, 12x36), escalas/calendário (escala_colaborador, feriado por município/unidade), marcacao_importada (staging+conciliação), arquivo_fiscal_ponto (AFD/AEJ), espelho_ponto, ocorrencia_ponto, ajuste_ponto (solicitação→aprovação→efetivação auditada), banco_horas. Variáveis de ponto alimentam diretamente o motor de folha próprio. Apuração e visões são nossas; só a marcação depende do REP-P.

## Folha de pagamento e fechamento (rh_folha)
- source: docs/03-modulos/03-folha-fechamento.md
- type: schema
- content: Motor de cálculo próprio. Catálogo de rubricas versionado (rubrica/rubrica_versao — nenhuma rubrica sem versão), tabela_legal_versao (INSS/IRRF/salário-família), parametro_convencao (CCT por unidade). competencia_folha como máquina de estados: aberta → calculo → conferencia → aprovada → fechada → paga → obrigacoes_transmitidas (fechada nunca reabre). variavel_folha (origem rastreada), calculo_item (memória de cálculo + versões usadas), provisao, snapshot_fechamento (imutável), holerite (gerado internamente). comparacao_sombra/divergencia_sombra (vive até o cutover). Tipos: mensal, adiantamento, 13º 1ª/2ª, férias, rescisão, complementar.
- note: Ponto de atenção (docs/14-mapa-de-eixos.md, eixo dinheiro): existe um segundo motor de folha copiado à mão em db/semear/10-folha-sst.js sem espelho mecanizado; descompasso de precisão em aplicarPercentual (2 casas vs NUMERIC(10,4)).

## Benefícios (rh_beneficios)
- source: docs/03-modulos/04-beneficios.md
- type: schema
- content: VT, VR/VA, plano de saúde/odonto, convênios. Catálogo, elegibilidade versionada, adesão/cancelamento, movimentacao_operadora (Flash/Swile/iFood via conector). Descontos entram como variavel_folha do motor próprio. Papéis/permissões e enquadramento regulatório (arts. 30/31 no desligamento). Cancelamentos + aviso art. 30/31 no checklist de desligamento.

## Clima (rh_clima)
- source: docs/03-modulos/06-clima.md
- type: nfr
- content: Check-in diário (pergunta_checkin versionada, resposta_checkin: 5 emojis + texto opcional), agregado_clima (série por unidade/equipe), alerta_clima. Modelo de anonimato: schema isolado por GRANT (app_clima sem SELECT em identidade); piso de agregação k (ver eixo pessoa×vínculo/nada-chumbado). Chave de permissão clima.resposta.individual.ver. Decisão de anonimato 2026-07-27. Lembrete via n8n.

## Workflows e demandas (rh_demandas)
- source: docs/03-modulos/07-workflows-demandas.md
- type: protocol
- content: Motor transacional genérico de solicitações/aprovações/pendências. Entidades: tipo_demanda (SLA versionado congelado na abertura), demanda, etapa_aprovacao, evento_demanda. Máquina de estados fixa, schema JSONB, contratos de handlers, RBAC. Notificações n8n; GED. Motor de: documentos, ajuste de ponto, férias, benefícios, pendências DP↔funcionário, fila LGPD.

## Férias e afastamentos (rh_ferias_afastamentos)
- source: docs/03-modulos/08-ferias-afastamentos.md
- type: schema
- content: periodo_aquisitivo (vencida = dobro), programacao_ferias (workflow sobre demandas, fracionamento legal), tipo_afastamento, afastamento (atestado/CID cifrado; gestor vê período, nunca CID). Cálculo de férias é do motor próprio. Gera S-2230 pelo transmissor. Integra ponto (módulo 02), folha (módulo 03), demandas (módulo 07).

## Admissão digital (rh_admissao)
- source: docs/03-modulos/09-recrutamento-admissao.md
- type: protocol
- content: processo_admissao, ficha_cadastral_admissao, link_admissao; coleta de documentos, exame, contrato, checklist; efetivação transacional em colaborador (cria usuário na mesma transação) e eventos eSocial S-2200/S-2190. GED. Decisão construir × contratar (Gupy/Unico) explicitamente em aberto (Fase 0). Contrato de experiência amarrado ao ciclo 45/90d.
- note: Bidirectional cross-ref com docs/03-modulos/13-recrutamento-selecao.md (ver INGEST-CONFLICTS.md, INFO cycle B).

## eSocial e obrigações digitais (domínio fiscal/) — transmissor próprio
- source: docs/03-modulos/12-esocial-obrigacoes.md
- type: api-contract
- content: Canal fiscal próprio: gera, assina, transmite e monitora eventos. evento_esocial (fila por tipo S-1000/1005/1010/1020, não periódicos S-2190/2200/2205/2206/2230/2299, periódicos S-1200/1210/1299, S-3000, SST S-2210/2220/2240) com estados pendente→assinado→transmitido→aceito/rejeitado, XML gerado, recibo/protocolo arquivado. transmissao_fgts_digital, declaracao_dctfweb, certificado_digital (metadados; material em secret manager), obrigacao_competencia (agenda de compliance com SLA por prazo — eSocial dia 15, FGTS Digital dia 20, DCTFWeb). folha/ calcula, fiscal/ transmite — comunicação por snapshot fechado de competência.

## Recrutamento e seleção (rh_recrutamento)
- source: docs/03-modulos/13-recrutamento-selecao.md
- type: schema
- content: requisicao_vaga (aprovação + headcount), vaga (derivada de cargo/CHA com faixa salarial), candidato, candidatura, pipeline kanban (etapas configuráveis + pareceres), oferta (dentro da banda), banco de talentos, quadro autorizado. LGPD titular externo (retenção do banco de talentos). Aprovado dispara a admissão digital automaticamente (fecha requisição → seleção → admissão → colaborador). Decisão construir × comprar em aberto.
- note: Bidirectional cross-ref com docs/03-modulos/09-recrutamento-admissao.md (ver INGEST-CONFLICTS.md, INFO cycle B).
