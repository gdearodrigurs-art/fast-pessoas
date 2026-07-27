# Fast Pessoas — RH/DP como módulo do Portal (monorepo)

> Gerado em 2026-07-24 por análise multi-agente sobre as fontes
> "Fast-RH - Conhecimento a Migrar.md" e "Ficha-Conhecimento-Portal-para-RH.md".
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**

## Visão geral

## Visão geral e racional

O sistema de RH/DP nasce como um **conjunto de domínios dentro do monorepo do Portal de Vendas** (`DCSEmpresarial/application`), sob o nome interno **Fast Pessoas**. Não é um app novo: é a plataforma do portal — autenticação JWT httpOnly + 2FA, RBAC por chave no banco, RLS por transação, schema `audit` append-only, multiunidade (5 unidades), design system (#d21217, Instrument Sans/Lora, tokens semânticos) — ganhando uma nova área funcional, com **isolamento lógico forte** do dado sensível.

### Racional da escolha

Para um time de 3 devs, o custo dominante não é escrever telas de RH — é construir e manter identidade, permissão, auditoria, tema e infraestrutura. O portal já tem tudo isso em produção real (113+ migrations, 5 unidades operando). A lente "módulo do portal" maximiza a herança:

- **Identidade única**: um login, um cadastro de pessoas, um avatar. O erro da btime (app separado, stack e visual próprios, identidade duplicada) não se repete.
- **Zero reimplementação de plataforma**: RLS, RBAC, audit e versionamento de regra com vigência (molde do domínio `imposto`, migrations 53/84/91) são herdados, não reconstruídos — exatamente o que as duas fontes mandam fazer.
- **Um único padrão de engenharia**: 4 camadas (`rotas → servico → repositorio → esquemas`), prepared statements obrigatórios, domínios em pt-BR, migrations SQL numeradas em `docs/banco/`.

### As três fraquezas reais da lente — e a resposta estrutural

1. **Dado sensível de RH no mesmo banco de vendas.** Resposta: schemas PostgreSQL dedicados (`rh`, `rh_clima`, extensão do `audit`) com **roles e pool de conexão próprios** — a credencial do portal comercial não tem GRANT algum sobre os schemas de RH, e a credencial de RH não alcança clima. A segregação é demonstrável em auditoria LGPD via catálogo de grants, não via promessa.
2. **Acoplamento de deploy.** Resposta: feature flags por módulo, migrations expand/contract (sempre retrocompatíveis) e **janela de congelamento de deploy amarrada ao calendário de fechamento de folha** (dias 25–5 de cada competência, ajustável pelo DP).
3. **RBAC de 8 cargos insuficiente para papéis de RH.** Resposta: o RBAC do portal é dado no banco (`sistema.tem_permissao`), não código — adicionam-se chaves (`rh.*`, `folha.*`, `ponto.*`, `avaliacao.*`, `clima.*`) e perfis (analista_dp, gestor_rh, auditor_rh) por migration. Crucialmente, **cargo funcional de RH (com CHA, salário) é entidade do domínio `rh`, separada do cargo de acesso do RBAC** — não se mistura permissão com plano de carreira.

### Estratégia de construir × integrar (fechada, não "depende")

- **Folha**: a Nasajon permanece o motor de cálculo e o transmissor de eSocial. O módulo de folha do Fast Pessoas é uma **esteira de fechamento** (coleta de variáveis → envio → conferência da prévia → aprovação com trilha → snapshot imutável → publicação de holerites). Nunca calculamos CLT.
- **Ponto**: **nenhuma variante de registrador próprio** (nem "coletor") — Portaria MTP 671/2021 tornaria o time fabricante de software regulado (REP-P, INPI, AFD/AEJ). Contrata-se solução homologada de mercado (verificando primeiro se a Nasajon tem módulo de ponto homologado); o Fast Pessoas hospeda espelho, workflow de ajuste com auditoria e visão do gestor.
- **Avaliação 360**: a spec TO-BE da btime é a especificação funcional (3 pilares Dever 30% / CHA 40% / Fit Cultural 30%, ciclos de Experiência 45/90d e Desempenho semestral, flags como recomendação com decisão humana justificada); o HTML da btime é descartado e as telas se refazem no design system do portal. Os descritores dos 9 Valores Fast (`fast_kb_valores_fast.md` do Fast-Agente) entram tal e qual como régua do pilar Fit Cultural.
- **Espinha dorsal**: a **linha do tempo do colaborador** é o primeiro artefato de dados — todo módulo (admissão, cargo, ponto, folha, avaliação, afastamento, desligamento) pendura eventos nela. O modelo de pessoas do Fast-Agente (ficha, ocorrências, feedback 90d, ações abertas, demandas) é portado como modelo de dados, nunca como código.

### Princípios inegociáveis (herdados das duas fontes, valem para todo domínio)

1. PostgreSQL transacional como fonte única; nenhum dado de RH fora do banco; escrita sempre append/transacional, nunca "reescrever coleção".
2. Auditoria append-only garantida por GRANT do banco (tabela só-INSERT), diff campo a campo com rótulo resolvido, UTC no armazenamento e America/Sao_Paulo explícito na exibição.
3. Versionamento de regra com vigência e **sem recálculo retroativo** para tudo que parametriza cálculo ou avaliação.
4. API (FastAPI) dona única de lógica e autorização; front e IA jamais calculam ou filtram dado sensível.
5. LGPD por design: minimização no payload, anonimato estrutural de clima, trilha de quem **acessou** (não só quem alterou) dado sensível.
6. Backup automático do banco desde o dia 1 (lição das 4 perdas de dados do Fast-Agente).

## Plataforma e stack

## Plataforma e stack

### Stack (herdada do portal, sem forks)

| Camada | Tecnologia | Observação |
|---|---|---|
| Front | Next.js 16 (App Router) + React 19 + TypeScript + Emotion | `src/features/rh/<submodulo>/`, primitivos de `src/components/ui`, cliente único `src/services/api.ts` |
| Back | FastAPI + Python 3.12 + asyncpg + Redis | `backend/app/dominios/rh_<submodulo>/`, 4 camadas fixas |
| Banco | PostgreSQL (mesma instância do portal) com RLS por transação | Schemas novos: `rh`, `rh_clima`; extensão do schema `audit` |
| Integrações | Nasajon (folha/DP), REP-P de mercado (ponto), n8n (notificações/alertas), Sults (treinamento), DW SAP_MIRROR (read-only) | Contratos mapeados na Fase 0 |
| Migrations | SQL numeradas em `docs/banco/` | Continuação da sequência existente; padrão expand/contract |

O time de 3 devs mantém o domínio de Next.js/TypeScript no front (maior parte do trabalho de RH é tela e workflow) e aprende o padrão FastAPI **copiando o molde pronto** do portal (`nucleo/banco.py`, `rbac.py`, `seguranca.py`, `redis_cliente.py` e qualquer domínio existente como referência de 4 camadas) — não escreve infraestrutura nova em Python, escreve domínios sobre infraestrutura testada.

### Organização do código

```
backend/app/dominios/
  rh_colaboradores/    # ficha, linha do tempo, ocorrências, feedback, cargos, organograma
  rh_demandas/         # workflow de solicitações/aprovações (portado do Fast-Agente)
  rh_ponto/            # espelho, ajustes, escalas/jornadas, banco de horas
  rh_folha/            # esteira de fechamento, variáveis, conciliação, holerites
  rh_avaliacao/        # ciclos, modelos versionados, avaliações, PDI (spec btime)
  rh_clima/            # pesquisas e agregação (schema isolado, pool próprio)
  rh_documentos/       # GED, ciência digital com hash
  rh_admissao_desligamento/  # checklists e prazos legais
  rh_beneficios/       # adesões, dependentes (Fase 2/3)
  rh_sst/              # ASO, EPI, CAT (Fase 3)
src/features/rh/...    # espelha os domínios no front, nomes pt-BR
```

### Isolamento lógico dentro do mesmo banco (a decisão central desta lente)

Mesma instância PostgreSQL, **três credenciais de aplicação e três pools asyncpg**:

- `app_portal` (existente): nenhum GRANT sobre `rh`, `rh_clima` ou tabelas de audit de RH.
- `app_rh` (novo): GRANT sobre `rh`; leitura de `sistema.usuarios` apenas via **view mínima** (id, nome, unidade, ativo — sem dado comercial); INSERT-only no `audit`.
- `app_clima` (novo): GRANT apenas sobre `rh_clima`; **sem SELECT em nenhuma tabela de identidade** — o JOIN resposta×pessoa é impossível por permissão, não por disciplina.

Os domínios `rh_*` do backend usam exclusivamente o pool `app_rh` (e `rh_clima` o pool `app_clima`); a dependency de conexão injeta o pool certo por domínio. RLS por transação continua igual ao portal (`SET LOCAL app.usuario_id / app.organizacao_id`), estendida com políticas de RH (ex.: gestor enxerga apenas liderados vigentes via `rh.relacao_gestor`).

Campos de categoria especial (atestados/saúde) são armazenados **cifrados em nível de aplicação** (pgcrypto com chave em secret manager, nunca em repo — lição do token vazado do Fast-Agente); anexos ficam em storage privado com URL assinada de curta duração.

### Deploy e ciclo de release

- **Um deploy só** (é a natureza da lente) — mitigado por: feature flag por módulo de RH (rollout faseado, padrão que a própria btime previu para a 360); migrations sempre retrocompatíveis (expand/contract: nova coluna → backfill → troca de leitura → remoção em release posterior); suíte de testes por domínio como gate de CI com path filters (mudança só em `dominios/rh_*` não roda o pipeline comercial inteiro, e vice-versa).
- **Janela de congelamento**: calendário de fechamento de folha bloqueia deploys em produção nos dias críticos da competência; exceção só com aprovação explícita do DP registrada.
- **Backup**: dump automático diário + WAL/PITR da instância, com teste de restauração mensal documentado. Retenção de backup respeita a tabela de temporalidade trabalhista (ver seção LGPD).
- **Método**: protótipo HTML standalone com dados em localStorage e seletor de papel simulado → validação com DP/RH → só então código no repositório, com autorização expressa (método do §7 do portal, mantido). Log de decisões (`decision-logger`) desde o primeiro dia.

### O que explicitamente NÃO entra na stack

- Nenhum serviço Node no backend (evita dois padrões de API na empresa).
- Nenhum registrador de ponto próprio, nem "coletor".
- Nenhum motor de cálculo de folha, eSocial ou rescisão.
- Nenhum arquivo/planilha como fonte de dado de RH; nenhum script local por máquina de funcionário.
- IA (agente de DP via MCP) apenas como camada conversacional opcional em fase tardia — conversa, resume histórico e lembra pendências; **jamais** calcula, autoriza ou grava fora da API.

## Modelo de domínio

## Modelo de domínio (entidades e relações por módulo)

Convenção: tudo no schema `rh`, exceto clima (`rh_clima`) e auditoria (`audit`). Toda entidade parametrizadora de cálculo/avaliação segue o padrão de **versão com vigência** (rascunho → ativa → encerrada; sem recálculo retroativo). Datas em UTC.

### 1. Núcleo — colaborador e linha do tempo (espinha dorsal, Fase 1)

- **`colaborador`** — 1:1 com `sistema.usuarios` do portal (FK `usuario_id`). Carrega só o que é de RH: matrícula, **tipo_vinculo** (CLT, estagiário, aprendiz, PJ, temporário — desde o dia 1, com regras por tipo), data_admissao, status (ativo, afastado, desligado), unidade, centro_custo, retrato/contexto (portado do Fast-Agente), `ultimo_feedback_formal`.
- **`evento_colaborador`** — a linha do tempo, append-only: tipo (admissão, mudança de cargo, reajuste, ocorrência, feedback, avaliação concluída, afastamento, férias, advertência, desligamento…), data do fato, referência à entidade de origem, resumo legível resolvido. Todo módulo **escreve** aqui; nenhum módulo lê de outro lugar para montar histórico.
- **`ocorrencia`** (fato datado positivo/negativo/neutro/alerta, impacto, causa, ação combinada, valores Fast relacionados), **`feedback_formal`** (com regra de cadência 90d e alerta), **`acao_aberta`** (prazo, status) — modelo portado do `schema.sql` do Fast-Agente.
- **`cargo`** + **`cargo_versao`** — descrição e **CHA** (conhecimentos/habilidades/atitudes) versionados; o CHA é insumo direto do pilar de 40% da 360. **`tabela_salarial_versao`** (faixas/steps com vigência). **`posicao_colaborador`** — histórico de cargo+salário por vigência (nunca UPDATE do valor atual: nova linha, encerra a anterior).
- **`relacao_gestor`** — gestor → liderado **com vigência** (histórico de quem respondia a quem). É a base de "gestor vê a equipe" no RLS e da 360 líder→liderado. Organograma visual é só uma projeção disso (Fase 3).
- **`dependente`** — dado pessoal de terceiro (LGPD própria), usado por benefícios e IR.

### 2. Demandas e workflow (Fase 1)

- **`demanda`** — solicitante → executor, tipo, status, prazo, prioridade (modelo do Fast-Agente), estendida com **`etapa_aprovacao`** (sequência de aprovadores por tipo de demanda) e transições auditadas. É o motor genérico de: solicitação de documento, ajuste de ponto, férias, adesão a benefício, pendência DP→funcionário. Notificações via n8n.

### 3. Documentos / GED com ciência digital (Fase 2, versão mínima na Fase 1)

- **`documento`** — pendurado no colaborador: tipo (contrato, aditivo, termo, advertência, holerite, informe de rendimentos, política), arquivo em storage privado, **hash SHA-256**, classificação de sensibilidade (define quem enxerga: advertência e atestado nunca no payload do gestor comum).
- **`ciencia`** — registro de ciência digital: quem, quando, hash do documento no momento da ciência (padrão btime). Assinatura eletrônica qualificada (Clicksign/gov.br) só por integração e só quando exigida.
- Trilha de **acesso** a documento sensível gravada em `audit`.

### 4. Ponto (Fase 2)

- **`jornada_versao`** (5x2, 6x1, 12x36, intervalos, tolerâncias — versionada), **`escala`** e **`escala_colaborador`** (vigência), **`feriado`** por município/unidade.
- **`marcacao_importada`** — cópia read-only das marcações vindas do REP-P homologado (a fonte jurídica é o REP; aqui é espelho para operação).
- **`espelho_ponto`** — consolidação por colaborador/competência (horas, extras, atrasos, faltas) calculada no backend contra a jornada vigente.
- **`ajuste_ponto`** — workflow: solicitação do colaborador → aprovação do gestor → efetivação, cada transição no `audit`. **`banco_horas`** com saldo por evento (append), alinhado às regras que a Nasajon aplica.

### 5. Folha e fechamento (Fase 2/3) — esteira de conferência, não de cálculo

- **`competencia_folha`** — uma por mês/unidade, com máquina de estados: aberta → coletando variáveis → enviada à Nasajon → prévia recebida → em conferência → aprovada → **fechada** → holerites publicados.
- **`variavel_folha`** — consolidação do mês: ponto (espelho), faltas/afastamentos, férias, benefícios/descontos, comissões (DW, quando aplicável).
- **`retorno_folha`** — resultado importado da Nasajon (rubricas por colaborador); **`divergencia`** — apontamentos da conferência com resolução obrigatória.
- **`aprovacao_fechamento`** — quem aprovou, quando, com trilha; **`snapshot_fechamento`** — cópia imutável (só-INSERT) do resultado fechado, ligada às **versões de regra vigentes** na competência. Folha fechada nunca muda.
- **`holerite`** — documento publicado no GED com ciência/download registrados.

### 6. Avaliação 360 (Fase 2 = líder→liderado; Fase 3 = completa) — spec btime

- **`modelo_avaliacao_versao`** — pilares (Dever 30 / CHA 40 / Fit Cultural 30), indicadores, pesos, faixas de flag, periodicidade — **tudo dado administrável pelo RH**, versionado com vigência; mudança vale só para ciclos abertos depois dela.
- **`ciclo`** (Experiência 45/90d ou Desempenho semestral, por colaborador desde a admissão), **`avaliacao`** (avaliador, avaliado, tipo: líder/par/auto), **`resposta_item`** (escala 1–5), **`resultado_consolidado`**, **`flag_recomendacao`** + **`decisao_humana`** (com justificativa obrigatória quando diverge da flag).
- Pilar Fit Cultural usa **`valor_fast`** + descritores por nível (conteúdo migrado tal e qual de `fast_kb_valores_fast.md`). Pilar Dever pode cruzar metas/resultados do DW (read-only). **`pdi`** (plano de desenvolvimento) na Fase 3, alimentado por treinamentos (Sults/manual).
- **Feedback 90d e ciclo de avaliação são processos separados**: o feedback contínuo (núcleo) alimenta a avaliação, não a substitui; ambos com periodicidade parametrizável.

### 7. Clima (Fase 2) — schema `rh_clima`, desenho oposto ao resto

- **`pesquisa`**, **`pergunta`**, **`resposta_anonima`** — **sem FK para colaborador**; só atributos agregáveis grossos (unidade, ciclo). Sem timestamp fino (grava só a data), sem IP, sem user-agent.
- **`participacao`** (no schema `rh`, desconectado): registra apenas QUE a pessoa respondeu (para cobrança de adesão), nunca O QUE. O grant do role `app_clima` impede JOIN com identidade.
- Agregação exclusivamente no backend com **k-anonimato ≥ 5** (recorte com menos de 5 respondentes não é exibido — real com 5 unidades). eNPS e enquetes anônimas vivem aqui.

### 8. Férias, afastamentos, admissão/desligamento (Fase 2)

- **`periodo_aquisitivo`** (com alerta de vencimento — férias vencidas = pagamento em dobro), **`programacao_ferias`** (workflow gestor→DP sobre demandas, fracionamento legal, conflito de agenda na equipe), aviso/recibo no GED com ciência. Cálculo de valores na Nasajon.
- **`afastamento`** — tipo (atestado, INSS, maternidade…), período, documento com acesso restrito a DP (dado de saúde, cifrado). Reflete no ponto (não gera falta) e nas férias; alimenta a Nasajon para S-2230.
- **`processo_admissao`** — checklist (documentos, exame admissional, acessos, EPI, ciência de políticas), prazo do contrato de experiência amarrado ao ciclo de Experiência da 360; cria o colaborador e o primeiro evento da linha do tempo.
- **`processo_desligamento`** — tipo, contagem regressiva do prazo do art. 477, exame demissional, devoluções, **gatilho automático de desativação do usuário no RBAC do portal**, entrevista de desligamento estruturada (insumo de clima/turnover), registro de decisão vs flag da 360.

### 9. Benefícios (Fase 2 cadastro / Fase 3 movimentação) e SST (Fase 3)

- **`beneficio`**, **`adesao`**, adesão de dependentes; pedidos via demandas; descontos sempre lançados via Nasajon. Movimentação para operadoras na Fase 3.
- **`aso`** (tipo e vencimento com convocação via n8n), **`cat`**, **`epi_catalogo`** + **`epi_entrega`** (com ciência digital). Transmissão dos eventos SST do eSocial permanece com a clínica/Nasajon — o sistema monitora.

### 10. Obrigações e analytics (Fase 3)

- **`obrigacao_competencia`** — agenda de compliance (S-2200, S-2299, folha mensal, FGTS Digital dia 20, DCTFWeb, SST) com status e alerta; alimentada por API da Nasajon se existir, senão confirmação manual do DP.
- Indicadores (turnover, absenteísmo, horas extras, headcount, custo por centro de custo, painel de vencimentos) são **projeções da linha do tempo e dos módulos** — a exigência de Fase 1 é que todo módulo emita os eventos classificados de que os indicadores precisam. Cruzamento individual desempenho × saúde/afastamento é vedado por regra de produto.

## Integrações

## Integrações e fontes de verdade

### Matriz de fonte de verdade (posição fechada)

| Dado | Fonte de verdade | Papel do Fast Pessoas |
|---|---|---|
| Identidade, login, permissão, unidade | **Portal** (`sistema.usuarios` + RBAC) | Consome; ficha de RH referencia 1:1 |
| Ficha, linha do tempo, ocorrências, feedback, cargos/salários, organograma | **Fast Pessoas** (schema `rh`) | Dono |
| Cálculo de folha, encargos, 13º, rescisão, eSocial | **Nasajon** | Envia variáveis, importa resultado, confere, aprova, guarda snapshot imutável |
| Marcação de ponto (valor jurídico, AFD/AEJ) | **REP-P homologado de mercado** | Importa marcações; dono do espelho, ajustes e banco de horas operacional |
| Escalas/jornadas parametrizadas | **Fast Pessoas** | Dono (versionado), alinhado ao que a Nasajon aplica |
| Avaliação 360, clima, PDI, demandas, GED | **Fast Pessoas** | Dono (clima em schema isolado) |
| Treinamento/trilhas | **Sults** (aspiracional) | Registro manual/importação até API confirmada |
| Vendas, comissões, financeiro | **DW SAP (SAP_MIRROR)** | Somente leitura, enriquecimento analítico |
| Notificações/alertas | **n8n** | Canal de saída, nunca guarda dado |

### Nasajon (folha/DP) — a integração crítica

Motor de cálculo e transmissor de eSocial; o Fast Pessoas nunca recalcula. Fluxo mensal: consolida variáveis (ponto, faltas, afastamentos, férias, benefícios, comissões) → envia → importa prévia → conferência com apontamento de divergências → aprovação com trilha → snapshot imutável → publica holerites no GED. **Descoberta obrigatória da Fase 0**: mapear formalmente o contrato da API (autenticação, entidades, escrita de variáveis, exportação de resultado, status de eventos eSocial, existência de módulo de ponto homologado). **Plano B declarado**: troca de arquivos/batch (layout de importação/exportação da Nasajon) — jamais cálculo próprio. Cláusula contratual de exportação de dados é requisito.

### Ponto (REP-P de mercado)

Ordem de avaliação: (1) módulo de ponto da própria Nasajon, se homologado — integração mais curta; (2) REP-P de mercado com API que se integre à Nasajon. O sistema importa marcações (webhook ou polling), monta espelho contra a jornada vigente e roda o workflow de ajuste. Se a solução usar biometria, o RIPD (LGPD) precede a contratação.

### Sults (treinamento)

O discovery da btime registrou que o módulo universidade **não tinha API** (links manuais). Posição: treinamento entra como **registro manual/importação** no histórico do funcionário no MVP; abre-se verificação formal com o fornecedor na Fase 0. Nenhum módulo (nem a 360, nem o histórico) bloqueia por causa do Sults.

### SAP / DW (SAP_MIRROR)

O Fast-RH supunha uso em folha/custos; o portal desmente ("dado de RH não está nesse DW"). Posição: **rebaixado a enriquecimento analítico read-only** — cruzar desempenho comercial × pilar Dever da 360 e relatórios gerenciais. Fora do caminho crítico de qualquer módulo; validar na Fase 0 se centros de custo existem lá antes de qualquer uso adicional.

### n8n

Canal único de notificação: alerta de feedback 90d vencido, férias vencendo, ASO a vencer, contrato de experiência acabando, etapa de fechamento pendente, convocação de pesquisa de clima. Regra: n8n **dispara**, nunca decide nem armazena — a pendência vive no banco, o n8n só entrega.

### Portal (relação interna, já que somos módulo)

- Identidade e RBAC: consumo direto (mesma app), com view mínima de `usuarios` para o pool `app_rh`.
- Desligamento no RH → desativa o usuário no portal automaticamente (mesmo banco, mesma transação — uma vantagem concreta da lente).
- `perfil`/`avatar`/`gamificacao` reaproveitados; `metas` comercial pode alimentar o pilar Dever.
- Auditoria: mesmo schema `audit`, com tabelas novas para RH e para trilha de acesso a dado sensível.

### btime (360)

Não é integração técnica, é insumo: pedir formalmente o **TO-BE e o código** na Fase 0. Aproveita-se a spec integralmente; descarta-se o HTML/stack (teal/indigo, Inter/Space Grotesk) e refaz-se no design system do portal.

## Segurança e LGPD

## Segurança e LGPD

### RBAC — extensão, não redesenho

O mecanismo existente (`sistema.tem_permissao(uid, chave)`, permissão como dependency na rota) é herdado. Adições por migration:

- **Chaves novas**: `rh.ficha.ver_propria`, `rh.ficha.ver_equipe`, `rh.ficha.ver_todas`, `rh.ocorrencia.registrar`, `rh.documento.sensivel.ver`, `ponto.ajustar`, `ponto.aprovar`, `folha.variaveis.editar`, `folha.fechar`, `folha.holerite.publicar`, `avaliacao.configurar`, `avaliacao.responder`, `avaliacao.decidir_flag`, `clima.configurar`, `clima.resultados.ver`, `beneficio.aprovar`, `rh.auditar` (somente leitura de tudo + trilhas), `rh.lgpd.atender_titular`.
- **Perfis novos**: `analista_dp`, `gestor_rh`, `auditor_rh` — compostos das chaves acima. Os papéis do Fast-RH (funcionario/gestor/rh/dp/admin) são absorvidos aqui, não recriados em paralelo.
- **Separação conceitual**: cargo de **acesso** (RBAC) ≠ cargo **funcional** (entidade `rh.cargo` com CHA e salário). "Gestor" para fins de dados não é um cargo — é a relação vigente em `rh.relacao_gestor`, avaliada pelo RLS.

### RLS por transação (herdada e estendida)

`SET LOCAL app.usuario_id / app.organizacao_id` em toda transação, como no portal. Políticas de RH: colaborador enxerga só o que é dele; gestor enxerga liderados **com relação vigente** (subconsulta em `relacao_gestor`); DP/RH conforme chave; unidade como dimensão de escopo. RLS é a segunda linha — a primeira é o serviço não montar o payload; a terceira, os grants por role.

### Segregação física de credencial (resposta ao risco "mesmo banco de vendas")

Três roles de aplicação com três pools: `app_portal` (zero acesso a RH), `app_rh` (schema `rh` + view mínima de usuários + INSERT-only no audit), `app_clima` (só `rh_clima`, **sem acesso a identidade** — o anonimato do clima é imposto por GRANT). Nenhuma credencial de aplicação tem UPDATE/DELETE no `audit`. Acesso humano direto ao banco (DBA) restrito, nominal e logado; dado de saúde cifrado em aplicação (pgcrypto, chave em secret manager) para que nem o acesso DBA trivialize a leitura.

### Auditoria em duas trilhas

1. **Trilha de alteração** (schema `audit`, padrão do portal): append-only garantido por GRANT, verbos padronizados, diff campo a campo com rótulo legível resolvido, UTC + exibição America/Sao_Paulo. Cobre: ajuste de ponto, transição de fechamento, nota e decisão de avaliação, mudança de cargo/salário, cada etapa de admissão/desligamento, toda versão de regra.
2. **Trilha de acesso** (nova, mesma mecânica): quem **visualizou** dado sensível (salário, atestado, advertência, resultado bruto de avaliação), com finalidade da rota. É o que a LGPD exige e a trilha de alteração não cobre. Relatório de acessos por titular sai daqui.

### Anonimato de clima — estrutural, não por política

Resposta sem FK para pessoa; atributos agregáveis grossos apenas (unidade, ciclo); sem timestamp fino/IP/user-agent; participação registrada em tabela desconectada noutro schema (só "respondeu", para adesão); agregação exclusiva no backend com **k ≥ 5** por recorte; role `app_clima` incapaz de JOIN com identidade. Nenhum relatório individual é tecnicamente produzível — é isso que sustenta taxa de resposta honesta e a posição perante a ANPD.

### Minimização e ocultação por perfil

O front recebe apenas o que a rota autoriza (padrão §6.4 do portal): salário, advertência, atestado e nota bruta **nunca** entram no payload de quem não pode ver — não é máscara de tela, é ausência no JSON. O Card do Colaborador da 360 nasce privado (btime): advertências, licenças, notas brutas e decisão de desligamento ficam estruturalmente fora do compartilhável.

### Governança LGPD operacional

- **Tabela de temporalidade por categoria de dado** definida na Fase 1 junto com o modelo (trabalhista 5–30 anos conforme tipo; candidato/currículo prazo curto com consentimento; clima agregado indefinido, resposta bruta expurgável).
- **RIPD** antes de implementar ponto (se biometria) e clima.
- **Direitos do titular** (acesso, correção, relatório de quem acessou) como fila no módulo de demandas (Fase 3), com resposta montada a partir do banco e das trilhas.
- **Conflito imutabilidade × eliminação**: resolvido por desenho — o `audit` guarda diffs com rótulos, e dados pessoais elimináveis vivem nas tabelas de domínio; quando a retenção expira, anonimiza-se o registro de domínio e o audit mantém o fato administrativo sem o dado pessoal.
- **Segredos** exclusivamente no servidor (secret manager/variáveis de ambiente); nada em cliente ou repositório. 2FA herdado do portal obrigatório para perfis com chave `folha.*`, `rh.auditar` e `rh.documento.sensivel.ver`.

## Fases

## Roadmap em fases

### Fase 0 — Descobertas e fundação de plataforma (3–5 semanas, sem código de produto)

Destrava as decisões que moldam tudo; barato agora, caríssimo depois.

- Mapear formalmente a **API da Nasajon** (autenticação, entidades, escrita de variáveis, exportação de resultados, status eSocial) e verificar **módulo de ponto homologado**; definir plano B (batch) por escrito.
- Pedir à **btime** o TO-BE e o código da 360; congelar a spec como documento de requisitos.
- Verificar com o **Sults** a existência de API do módulo universidade.
- **RIPD** de ponto (biometria) e clima; tabela de temporalidade por categoria de dado.
- Plataforma: criar schemas `rh`/`rh_clima`, roles `app_rh`/`app_clima` e pools; chaves e perfis novos no RBAC; tabelas novas no `audit` (incluindo trilha de acesso); feature flags por módulo; janela de congelamento no pipeline; backup com PITR testado.
- Método: protótipos HTML standalone dos fluxos centrais (ficha/linha do tempo, esteira de fechamento, ajuste de ponto) validados com DP/RH.

**Por que primeiro**: nenhum módulo pode ser desenhado sem saber o que a Nasajon expõe (erro Sults não se repete), e a segregação de credenciais/audit não se retrofita.

### Fase 1 — Espinha dorsal (2–3 meses)

- **Ficha do colaborador** (1:1 com usuário do portal) com **tipo de vínculo desde o dia 1** (CLT, estágio, aprendiz, PJ, temporário).
- **Linha do tempo** (`evento_colaborador`) + ocorrências, feedback formal 90d com alerta, ações abertas (modelo do Fast-Agente portado).
- **Cargos com CHA** e histórico de posição/salário por vigência; **tabela salarial versionada**.
- **Organograma lógico**: `relacao_gestor` com vigência (pré-requisito do RLS "gestor vê equipe" e da 360).
- **Demandas/workflow** portado e estendido com etapas de aprovação + n8n — primeiro módulo transacional, risco regulatório zero, valor imediato ao DP.
- GED mínimo: documento + ciência digital com hash.

**Por que nesta ordem**: todas as fontes convergem — o histórico é a espinha que todo módulo pendura; cargos/CHA e relação gestor-liderado são dependências estruturais da 360 e do ponto; demandas dá vitória rápida e treina o time no padrão FastAPI com baixo risco.

### Fase 2 — Operação de DP (6–9 meses, entregas incrementais nesta ordem)

1. **Admissão digital** (checklist, contrato de experiência amarrado ao ciclo 45/90d) e **afastamentos** (com restrição de acesso a saúde).
2. **Escalas/jornadas versionadas + ponto**: importação do REP-P contratado, espelho, ajuste com workflow auditado, banco de horas. Afastamentos antes do ponto para não acusar falta indevida.
3. **Férias**: períodos aquisitivos, painel de vencimento com alertas, workflow de programação, aviso/recibo com ciência.
4. **Desligamento**: checklist com prazo do art. 477, revogação automática de acessos, entrevista de desligamento.
5. **Esteira de fechamento de folha** (v1): coleta de variáveis → envio Nasajon → conferência → aprovação → snapshot imutável → **holerites publicados no GED**.
6. **Avaliação 360 — Fase 1 da btime** (líder→liderado) com modelo versionado e os 9 Valores como Fit Cultural; feedback 90d segue como processo separado que a alimenta.
7. **Clima MVP**: pesquisa anônima estrutural + eNPS, agregação k≥5.
8. **Benefícios (cadastro)**: adesões e dependentes, pedidos via demandas.

**Por que esta ordem**: segue a dependência real do mês do DP — sem admissão/afastamento/escala não há espelho de ponto correto; sem ponto e férias não há variável de folha confiável; a 360 e o clima entram quando a espinha já tem dados; cada item é feature-flagged e entra em produção sozinho.

### Fase 3 — Expansão e inteligência (contínua)

- 360 completa (pares, autoavaliação, Card, PDI) e treinamentos (Sults se houver API; senão manual + NRs obrigatórios ligados a SST).
- Benefícios: movimentação para operadoras e conciliação de descontos.
- **SST**: ASO com convocação, CAT, EPI com ciência; mapeamento de quem transmite eventos SST (clínica × Nasajon) feito já na Fase 0.
- **Painel de obrigações** (agenda de compliance: eSocial, FGTS Digital, DCTFWeb, 13º) com alertas.
- **People analytics**: turnover, absenteísmo, horas extras, custo por centro de custo, painel de vencimentos; cruzamento DW × pilar Dever. Vedado cruzamento individual desempenho × saúde.
- R&S mínimo (requisição de vaga amarrada a headcount; pipeline via ATS de mercado se o volume justificar), mural com ciência de políticas, organograma visual, fila LGPD de direitos do titular, agente de DP conversacional (IA via MCP — conversa, nunca calcula).

**Critério geral de corte**: cálculo legal e transmissão fiscal nunca entram em fase nenhuma — permanecem na Nasajon. Cada fase termina com protótipo validado antes do código e migração revisada antes do deploy.

## Riscos

## Riscos desta proposta e mitigações

### 1. Dado sensível de RH no mesmo banco e app do portal comercial (o risco central da lente) — ALTO

Qualquer vulnerabilidade do portal (SQLi, credencial vazada, dependência comprometida) vira vetor potencial para salário, saúde e avaliações. **Mitigações**: roles/pools segregados (`app_portal` sem GRANT algum em `rh`); RLS + verificação de permissão na rota + montagem de payload no serviço (três camadas independentes); dado de saúde cifrado em aplicação; trilha de acesso a dado sensível; 2FA obrigatório para chaves críticas. **Risco residual assumido**: comprometimento total do host atinge tudo. **Plano de saída registrado**: os schemas próprios, pools próprios e domínios `rh_*` isolados tornam a extração futura para instância separada uma migração de infraestrutura, não uma reescrita — se auditoria LGPD ou incidente exigir, o desenho já está pronto para sair.

### 2. Acoplamento de deploy: release comercial quebra o RH em semana de fechamento — ALTO

**Mitigações**: janela de congelamento amarrada ao calendário de fechamento (bloqueio automatizado no pipeline); migrations expand/contract obrigatórias; feature flags por módulo; testes por domínio como gate com path filters; smoke test pós-deploy nas rotas de RH críticas. **Residual**: incidente de infraestrutura do portal ainda derruba o RH junto — aceito sob a lente, com o plano de saída do risco 1 como válvula.

### 3. Dependência da API da Nasajon (folha e possivelmente ponto) — ALTO

Se a API for insuficiente, a esteira de fechamento não se automatiza. **Mitigações**: mapeamento formal na Fase 0 **antes** de desenhar o módulo (lição Sults); plano B batch/arquivos desenhado desde já; cláusula contratual de exportação de dados; painel de obrigações tolera confirmação manual. **Nunca** migrar para cálculo próprio como resposta à frustração com a API.

### 4. Tentação de construir registrador de ponto "só um coletor" — ALTO

Juridicamente ainda é registro de ponto sob a Portaria 671 (REP-P, INPI, AFD/AEJ); marcação sem validade jurídica é passivo trabalhista direto. **Mitigação**: decisão fechada nesta proposta — solução homologada de mercado, verificando primeiro a Nasajon; o sistema só consome. Qualquer reversão exige nova decisão de arquitetura registrada.

### 5. RBAC/RLS do portal moldado para vendas, não para RH — MÉDIO

"Gestor vê equipe" comercial não é igual a hierarquia de RH com vigência; risco de vazamento por política mal escrita. **Mitigações**: `relacao_gestor` com vigência como única fonte de escopo gerencial; testes automatizados de autorização por perfil (matriz papel × recurso executada no CI); revisão de política RLS como item de checklist de toda migration de RH.

### 6. Curva Python/FastAPI para um time Next.js/Node — MÉDIO

**Mitigações**: molde pronto do portal (nenhuma infraestrutura nova em Python); começar pelo módulo de demandas (baixo risco, alto aprendizado); front (maior volume de trabalho) permanece no stack que o time domina; revisão de código cruzada nas primeiras entregas de cada dev. **Condição de reversão honesta**: se após a Fase 1 ficar comprovado que o time não sustenta Python, a discussão reabre — mas portando os padrões, nunca improvisando.

### 7. Anonimato do clima num banco compartilhado — MÉDIO

Um DBA ou um JOIN mal concedido reidentifica respostas. **Mitigações**: role `app_clima` sem acesso a identidade (anonimato por GRANT); ausência estrutural de FK/timestamp fino; k≥5 no backend; acesso DBA nominal e logado. **Residual**: superusuário do banco tecnicamente alcança tudo — mitigado por logging de sessão administrativa e pelo desenho que não guarda o vínculo (não há o que reidentificar por JOIN; restaria inferência estatística, que o k-anonimato limita).

### 8. Escopo devorador: RH/DP completo com 3 devs — MÉDIO

O levantamento de lacunas mostra que o ciclo de vida CLT é enorme (SST, benefícios, obrigações...). **Mitigações**: fases com critério de corte explícito (cálculo legal nunca entra); método protótipo-primeiro mata erro de fluxo barato; cada item da Fase 2 entra em produção sozinho via flag; painel de obrigações aceita operação manual antes de automação.

### 9. Fontes divergentes gerando regressão de decisão — BAIXO

O Fast-RH propõe Node, app standalone e folha própria; alguém pode reabrir essas discussões no meio do projeto. **Mitigação**: este documento fixa as resoluções (plataforma herda o portal; Fast-Agente contribui modelo de pessoas e lições de integridade; Nasajon calcula; btime especifica a 360; DW é read-only analítico) e o hábito do log de decisões registra qualquer mudança com o porquê — reabertura exige fato novo, não opinião.

### 10. Retenção conflitante no mesmo banco (trabalhista 5–30 anos × comercial) — BAIXO

**Mitigação**: política de retenção e expurgo definida **por schema/categoria** na tabela de temporalidade da Fase 1; backups etiquetados por política; anonimização (não deleção) para conciliar com o audit imutável.
