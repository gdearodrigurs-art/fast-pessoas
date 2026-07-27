# Controle de Ponto (domínio `rh_ponto`) — marcação via REP-P contratado, jornadas, escalas/turnos, tratamento de marcações, espelho, banco de horas e fechamento mensal de ponto

> **Revisado em 2026-07-24 (v2) após decisões do usuário.** Substitui a proposta v1 (gerada por análise multi-agente sobre "Fast-RH - Conhecimento a Migrar.md" e "Ficha-Conhecimento-Portal-para-RH.md") e segue a Arquitetura v2 (`docs/02-arquitetura.md`).
> **Decisões fechadas que este módulo obedece:** (a) REP-P de mercado CONTRATADO — Pontomais é a candidata líder da cotação, com API verificada — usado SOMENTE para marcação e arquivos fiscais AFD/AEJ; nunca desenvolver registrador próprio; a opção "módulo de ponto da Nasajon" deixou de existir. (b) Espelho, tratamento, escalas/jornadas, banco de horas e fechamento são do NOSSO sistema, via API/webhooks do fornecedor. (c) As horas fechadas alimentam a **FOLHA PRÓPRIA** (domínio `rh_folha`), não mais a Nasajon — que sobrevive apenas como fonte de comparação na sombra (`nasajon_sombra`, exports manuais). (d) Stack Next.js + TypeScript + Node.js com PostgreSQL dedicado na SaveinCloud; identidade e papéis próprios na Fase A.
> **Status: especificação funcional — fase sem código.**

**Fase sugerida:** Fase 2 do roadmap v2 (4–6 meses), depois de admissão e afastamentos e antes do fechamento de férias/desligamento consumirem apuração. Preparação na Fase 0: cotação e contratação do REP-P (Pontomais líder; critérios abaixo), RIPD (biometria/geolocalização), levantamento das convenções coletivas por unidade, protótipo HTML do fluxo de ajuste validado com DP/RH. **Gate de pronto:** um mês de espelho conciliado com a fonte sem divergência não explicada — pré-condição para a fase de sombra da folha própria (trilha F3). Escalas com rodízio/troca de plantão, alertas quase-tempo-real e painel gerencial ficam para evolução (final da Fase 2 / Fase 3), atrás de feature flag.

## Objetivo

Ser a camada de GESTÃO do ponto — nunca o registrador nem o programa legal de tratamento (PTRP). O registro fica no REP-P homologado contratado (Portaria MTP 671/2021 torna qualquer registrador próprio, inclusive "coletor", software regulado — por isso a decisão de nunca construir um). O Fast Pessoas:

- **importa** as marcações via API/webhooks do fornecedor, com staging, validação e conciliação por carga;
- **consolida** o espelho contra a jornada vigente (versionada, com vigência);
- **orquestra** o workflow auditado de tratamento de marcações, com efetivação no sistema de origem quando a API do fornecedor permitir (critério de cotação) e reimportação verificada;
- **mantém** o banco de horas por eventos, conciliado com a fonte;
- **executa** o fechamento mensal como máquina de estados com snapshot imutável;
- **entrega** as variáveis apuradas (sempre em horas, nunca em R$) para a **folha própria** (`rh_folha`), que faz todo o cálculo monetário; a transmissão fiscal (eSocial etc.) é do domínio `fiscal/`, após o cutover da trilha F.

Durante o paralelo da folha (Nasajon oficial, folha própria em sombra), o DP continua alimentando a Nasajon pelo processo atual; as horas fechadas aqui alimentam a folha em sombra e ajudam a comprovar a paridade. Valor central para o DP: eliminar a caça manual a pendências (marcação ímpar, falta sem justificativa, banco a vencer) e dar ao gestor visão da equipe sem planilha.

## Funcionalidades

### MVP (Fase 2)

**1. Jornadas versionadas (`jornada_versao`)**
- Cadastro de modelos de jornada: 5x2, 6x1, 12x36, turnos fixos; horários por dia da semana, intervalos (com flag de pré-assinalação), tolerâncias de marcação (padrão CLT art. 58 §1º: 5 min por marcação / 10 min dia, parametrizável por convenção coletiva), parâmetros de adicional noturno (janela 22h–5h, hora reduzida 52min30s — apuração em horas; a valoração é do motor da folha própria), regra de DSR.
- Ciclo rascunho → ativa → encerrada, com vigência, responsável e referência à convenção coletiva aplicável. Sem recálculo retroativo: espelho antigo fica ligado à versão da época ("fechado não reabre").
- 100% administrável pelo DP (chave `ponto.jornada.configurar`), sem dev.

**2. Escalas e calendário**
- `escala_colaborador`: vínculo colaborador × jornada com vigência (nova linha, nunca UPDATE). Admissão cria a escala inicial; desligamento a encerra.
- `feriado` por âmbito (nacional/estadual/municipal/unidade) — as 5 unidades podem ter feriados municipais distintos.
- Regras por `tipo_vinculo` desde o dia 1: CLT bate ponto; estagiário com jornada própria (Lei 11.788, sem HE); PJ e cargos art. 62 (confiança/externo) marcados como isentos de controle — o espelho não gera ocorrência para eles.

**3. Importação de marcações (conector `integracoes/ponto/`)**
- Via primária: **webhooks do fornecedor** (recebimento quase-tempo-real) + **API de marcações** em job assíncrono de reconciliação periódica (webhooks perdidos não podem virar buraco). Job com estado e log, nunca no caminho síncrono de tela. Plano B por escrito: AFD/arquivo em batch (layout Portaria 671) — muda o transporte, não a arquitetura.
- Staging por carga → validação → `marcacao_importada` (read-only por GRANT), com snapshot imutável do payload bruto, hash e NSR.
- Correlação pela **matrícula própria** do Fast Pessoas, via mapa de-para `colaborador × identificador no fornecedor` (`mapa_colaborador_rep`), mantido pelo DP. A matrícula Nasajon é campo informativo, usado apenas na conferência da sombra da folha — nunca chave.
- Conciliação a cada carga com relatório de divergência e fila de resolução (marcação órfã, colaborador desconhecido no de-para, lacuna de NSR).

**4. Espelho de ponto**
- Consolidação diária e por competência contra a jornada vigente do dia: horas trabalhadas, noturnas, extras, atrasos, faltas, intervalos — sempre em TEMPO, nunca em valor.
- Ocorrências automáticas: marcação ímpar, dia sem marcação, atraso/saída antecipada acima da tolerância, HE acima de 2h/dia (art. 59), intervalo não usufruído, indício de interjornada < 11h (art. 66) — cada uma com status pendente/tratada/abonada.
- Afastamentos e férias (módulos internos, entregues antes do ponto na Fase 2) refletem automaticamente: dia afastado não vira falta.
- Visões: funcionário (só o seu), gestor (equipe via `relacao_gestor` vigente), DP/RH (todos), com pendências em destaque — acesso imposto no backend (RLS via SET LOCAL onde couber; senão autorização no repositório coberta pela matriz de testes papel × recurso no CI).
- Conciliação contínua com o apurado do software de tratamento do fornecedor (PTRP): divergência não explicada entra em fila e bloqueia o fechamento.

**5. Tratamento de marcações (workflow sobre `rh_demandas`)**
- Solicitação de ajuste (inclusão de marcação esquecida, desconsideração, abono de falta/atraso) pelo funcionário ou pelo DP, com justificativa obrigatória e anexo via GED (atestado de saúde segue o fluxo de afastamento: cifrado em aplicação, gestor vê período, nunca CID).
- Etapas de aprovação parametrizáveis (gestor e/ou DP), cada transição na trilha de auditoria.
- **Efetivação no sistema de origem**: via API de tratamento do fornecedor quando existir (critério de cotação — verificar na Pontomais antes de assinar); na ausência, execução manual na UI do fornecedor registrada com protocolo → reimportação → verificação automática de que o ajuste refletiu. Isso mantém o AEJ e a validade jurídica no PTRP do fornecedor — o Fast Pessoas nunca "conserta" ponto só no próprio banco.

**6. Fechamento mensal de ponto**
- Máquina de estados da competência de ponto: aberta → em tratamento → conciliada → fechada.
- Bloqueios de fechamento: ocorrência pendente não tratada, divergência de conciliação não explicada, ajuste aprovado não efetivado/reimportado.
- No fechamento: snapshot imutável (marcações + espelho + versões de jornada vigentes + hash), geração de `variavel_folha` em quantidade de horas (HE 50/100, noturnas, faltas/atrasos em horas, DSR perdido) com origem rastreada, consumida pela **folha própria** (`rh_folha`) na competência. Fechado não reabre; correção é evento novo na competência seguinte, auditado.
- Durante o paralelo da trilha F: as mesmas variáveis alimentam o cálculo em sombra; a Nasajon (oficial) segue recebendo os insumos pelo processo manual atual do DP até o cutover — não há integração.
- Ciência digital do espelho pelo funcionário (padrão GED: hash + quem/quando), reaproveitando o mecanismo de `ciencia`.

**7. Banco de horas**
- Saldo por evento (crédito/débito, nunca saldo mutável), amarrado a `acordo_banco_horas_versao` com vigência (individual escrito: compensação em 6 meses, art. 59 §5º; coletivo: 1 ano, §2º). Sem acordo vigente, HE não credita — vai para pagamento via variável de folha.
- Extrato para o funcionário, visão de equipe para o gestor, alerta de saldo a vencer (n8n/WhatsApp).
- Conciliado com a fonte (PTRP) a cada carga; divergência entra na fila.

**8. Alertas via n8n + WhatsApp Cloud API / e-mail (referências, nunca dado sensível no payload)**
- Marcação faltante D+1, pendência de tratamento perto do corte, prazo de fechamento (amarrado ao calendário da competência de folha), banco de horas a vencer.

### Evolução (pós-MVP)

- **Escalas complexas**: rodízio de turnos, troca de plantão entre colegas com aprovação, planejador de escala com validação preventiva de interjornada e DSR (7º dia).
- **Alertas quase-tempo-real** (dependem da frequência de webhooks/API do fornecedor): interjornada em risco, 2h de HE estourando no dia — no MVP os alertas são D+1 por natureza da consolidação.
- **Gestão ativa de compensação**: sugestão de folga para queimar banco, simulação de saldo na data-alvo.
- **Painel gerencial de horas** (Fase 3, people analytics): HE e absenteísmo por unidade/centro de custo, cruzamento com custo (DW só analítico, nunca no caminho crítico).
- **Autosserviço móvel ampliado**: acompanhamento de solicitação, espelho no celular. A marcação móvel em si (geolocalização/biometria) é feature do fornecedor REP-P — entra como critério de cotação, nunca desenvolvimento próprio.
- **Relatório de fiscalização**: pacote AFD/AEJ + espelhos + trilhas por período, para atender auditor fiscal do trabalho a partir dos snapshots.

## Entidades de dados

Schema `rh` (salvo indicação); datas em UTC; parametrizadoras com vigência; escrita transacional; auditoria só-INSERT garantida por GRANT.

**`jornada_versao`** — modelo de jornada versionado: tipo (5x2/6x1/12x36/turno), grade de horários por dia da semana, intervalos (duração, flag pré-assinalado), tolerâncias (por marcação/dia), parâmetros de adicional noturno, regra de DSR, ref. convenção coletiva, status (rascunho/ativa/encerrada), vigência, responsável. Relação: 1:N com `escala_colaborador`.

**`escala_colaborador`** — colaborador × `jornada_versao`, vigência início/fim, motivo (admissão, mudança de turno...). Nova linha a cada mudança; base do espelho ("jornada vigente no dia").

**`feriado`** — data, nome, âmbito (nacional/UF/município/unidade), unidade opcional.

**`acordo_banco_horas_versao`** — âmbito (individual: ref. colaborador + documento no GED / coletivo: ref. convenção), prazo de compensação, limites, vigência, status. Sem acordo vigente → HE não credita banco.

**`mapa_colaborador_rep`** — de-para colaborador (matrícula própria) × identificador do colaborador no fornecedor REP-P, com vigência; mantido pelo DP; marcação sem de-para cai na fila de conciliação.

**`marcacao_staging`** (camada de integrações) — payload bruto por carga/webhook, hash, lote, status de validação/conciliação, log de carga na auditoria.

**`marcacao_importada`** — colaborador (resolvido pela matrícula própria via `mapa_colaborador_rep`), timestamp UTC + fuso de origem, NSR, identificador do REP/equipamento, tipo, hash, ref. lote. **Read-only por GRANT** — snapshot do fato jurídico; jamais editada (ajuste gera nova marcação na origem, reimportada).

**`espelho_ponto_dia`** — colaborador, data, ref. às marcações consideradas, ref. `jornada_versao` aplicada, apuração em minutos (trabalhado, noturno, extra, atraso, falta, intervalo), status (ok/pendente/tratado), ref. afastamento/férias quando o dia é coberto.

**`ocorrencia_ponto`** — tipo (marcação ímpar, sem marcação, atraso, HE excedente, interjornada, intervalo), dia, status (pendente/tratada/abonada), ref. ao `ajuste_ponto` ou `afastamento` que a resolveu.

**`ajuste_ponto`** — tipo (inclusão/desconsideração/abono), solicitante, justificativa, anexo (ref. `documento` no GED), etapas de aprovação (motor de `rh_demandas`), status (solicitado → aprovado → **efetivado na origem** [protocolo ou id da chamada de API] → reimportado/verificado), cada transição na auditoria.

**`competencia_ponto`** — máquina de estados (aberta → em tratamento → conciliada → fechada), período, calendário de corte, ref. aprovação e `snapshot_fechamento_ponto` (imutável: hash do conjunto marcações + espelhos + versões de regra vigentes). Alimenta 1:N `variavel_folha` (domínio `rh_folha`) com origem rastreada, em horas — insumo do motor da folha própria (e do cálculo em sombra durante a trilha F).

**`banco_horas_evento`** — colaborador, data, minutos (±), origem (espelho/ajuste/compensação/ajuste de conciliação), ref. `acordo_banco_horas_versao`, data de vencimento do crédito. Saldo é projeção (soma), nunca coluna mutável.

**Transversais reutilizados:** `audit` em duas trilhas (transição de ajuste e fechamento = alteração; leitura de anexo de saúde = leitura de sensível), `documento`/`ciencia` (anexos e ciência do espelho), `relacao_gestor` (escopo de equipe), `afastamento` e `programacao_ferias` (cobertura de dias), `evento_colaborador` (projeção na linha do tempo: advertência por falta, mudança de escala).

## Papéis e permissões

Papéis PRÓPRIOS do app na Fase A (`funcionario`/`gestor`/`rh`/`dp`/`admin`), validados no backend em toda rota; 2FA obrigatório para `dp`, `rh` e `admin`. RLS via SET LOCAL no Postgres onde couber; onde não couber, autorização na camada de repositório coberta por matriz de testes papel × recurso no CI. Payload minimizado: espelho alheio não entra na resposta de quem não pode ver (ausência, não máscara). Mapeamento com o portal corporativo é assunto da Fase B.

| Papel | Vê | Faz |
|---|---|---|
| **funcionario** | Só o próprio espelho, extrato de banco de horas e status das próprias solicitações | Solicita ajuste/abono com justificativa e anexo; dá ciência digital no espelho mensal |
| **gestor** | Espelho e pendências da equipe — derivado exclusivamente de `relacao_gestor` vigente, nunca de flag manual; **não vê** anexos de saúde (vê período do afastamento, nunca CID) | Aprova 1º nível de ajuste (`ponto.ajustar.aprovar`); acompanha banco de horas da equipe |
| **dp** | Todos os espelhos, filas de conciliação e pendências, mapa de-para do fornecedor | Trata marcações, solicita/aprova ajustes de ofício, mantém `mapa_colaborador_rep`, prepara jornadas em rascunho, conduz a competência até "conciliada" |
| **rh** | Tudo do DP + configuração | Ativa `jornada_versao` e `acordo_banco_horas_versao` (`ponto.jornada.configurar`); executa o fechamento (`ponto.fechar` — sob 2FA, pois alimenta a folha própria) |
| **admin** | Nada funcional de ponto por padrão — acesso de plataforma; leitura de dado de RH só por chave explícita e logada | Operação técnica (conector, filas, reprocessamento de carga — sempre auditado) |

Leitura de auditoria/snapshots para fins de auditoria interna: chave dedicada (`rh.auditar`, 2FA), somente leitura, atribuível a quem o DP/RH designar — sem papel exclusivo na Fase A.

Chaves novas: `ponto.equipe.ver`, `ponto.ajustar.solicitar`, `ponto.ajustar.aprovar`, `ponto.tratar` (DP), `ponto.jornada.configurar`, `ponto.fechar` (2FA), `ponto.exportar_fiscalizacao` (evolução). Toda transição de ajuste e de fechamento na trilha de alteração; abertura de anexo de saúde na trilha de leitura.

## Integrações

**REP-P homologado contratado (conector `integracoes/ponto/`) — a integração central. Pontomais é a candidata líder (API verificada na pesquisa, `docs/05-pesquisa-mercado.md`); confirmação na cotação da Fase 0.**
- Entrada primária: webhooks de marcação + API de marcações e de apurado/espelho do PTRP do fornecedor, com job de reconciliação periódica. Plano B por escrito: AFD/AEJ e arquivos de apurado em batch (layouts da Portaria 671) — troca o transporte, não a arquitetura.
- Saída: chamadas de efetivação de ajuste, se o fornecedor expuser API de tratamento — **critério explícito de cotação**; sem ela, efetivação manual na UI do fornecedor com protocolo registrado (dupla digitação a precificar na escolha).
- Contrato de dados versionado (schemas TypeScript/validação em runtime) em `docs/integracoes/`; staging por entidade; conciliação com fila de divergência a cada carga; snapshot imutável — o histórico legal vive no nosso banco mesmo trocando de fornecedor. **Cláusulas contratuais requisito de contratação:** exportação completa de AFD/AEJ + histórico na saída e reexportação retroativa de período já tratado.

**Folha própria (`rh_folha` + `fiscal/`)**
- O ponto NÃO calcula valor: no fechamento grava `variavel_folha` (horas) com origem rastreada; o motor da folha própria valora (rubricas versionadas) e o domínio `fiscal/` transmite as obrigações (eSocial, FGTS Digital, DCTFWeb) após o cutover da trilha F.
- Consistência de insumo fiscal: a jornada contratual informada em S-2200/S-2206 deve ser coerente com `jornada_versao`/`escala_colaborador` — tabela de dono único por campo define a fonte.

**Nasajon (somente sombra — sem integração)**
- Não existe conector: a Nasajon não tem API pública de folha. Enquanto for a folha oficial, o DP continua alimentando-a pelo processo atual; os resultados dela entram por exports/relatórios manuais em `nasajon_sombra/` apenas para comparação de paridade. O ponto não envia nem recebe nada da Nasajon; a matrícula Nasajon é campo informativo de conferência.

**Módulos internos**
- `rh_colaboradores`: colaborador (matrícula própria, `tipo_vinculo`), `relacao_gestor`, `lotacao`, `evento_colaborador` (linha do tempo).
- `rh_demandas`: motor do workflow de ajuste/abono com etapas de aprovação e avisos.
- `rh_admissao_desligamento`: admissão cria a escala inicial e o registro no `mapa_colaborador_rep` (cadastro do colaborador no fornecedor é passo do checklist de admissão); desligamento encerra a escala e dispara a apuração final para a rescisão (calculada na folha própria).
- Afastamentos/férias: cobertura de dias no espelho (por isso entram antes no roadmap); atestado cifrado, chave de permissão própria.
- `rh_documentos`: anexos de ajuste e ciência do espelho com hash.
- `rh_folha`: calendário da competência, consumo das variáveis, comparação em sombra.

**n8n + WhatsApp Cloud API / e-mail transacional** — dispara e nunca decide/armazena: alertas de marcação faltante, pendência, prazo de fechamento, banco a vencer; payload só com referências (autorização no acesso), nunca dado sensível.

**DW SAP** — nada no caminho crítico; apenas analítico na Fase 3 (HE × centro de custo), se granularidade confirmada.

## Regulatório

**Portaria MTP 671/2021**
- REP-P exige registro no INPI, atestado técnico, comprovante de marcação ao trabalhador e geração de AFD; o programa de tratamento (PTRP) exige AEJ. **Por isso o desenho não constrói nem registrador nem PTRP**: ambos são do fornecedor homologado contratado; o Fast Pessoas é camada de gestão. A regra "efetivação do ajuste no sistema de origem + reimportação" existe exatamente para que o AEJ oficial continue sendo gerado pelo PTRP do fornecedor — nosso banco guarda o snapshot e a trilha, não substitui o documento legal.
- Guarda: snapshots imutáveis de AFD/AEJ/apurado no nosso banco (o histórico sobrevive à troca de fornecedor), com categoria própria na tabela de temporalidade (documentos de jornada: vigência do contrato + prescrição trabalhista de 5 anos, art. 7º XXIX CF; retenção definida com o jurídico).

**CLT**
- Art. 74 §2º: registro obrigatório para estabelecimento com mais de 20 empregados — confirmar contagem por unidade. Art. 62: exceções (externo/confiança) modeladas por flag de isenção via `tipo_vinculo`/cargo, nunca improvisadas.
- Art. 58 §1º (tolerâncias 5/10 min), art. 59 (HE máx. 2h/dia; banco de horas: acordo individual escrito 6 meses §5º, coletivo 1 ano §2º — o módulo **bloqueia crédito sem acordo vigente**), art. 59-A (12x36), art. 66 (interjornada 11h — ocorrência automática), art. 67 (DSR), art. 71 (intrajornada, com pré-assinalação parametrizável), art. 73 (adicional noturno, hora reduzida — apurado em horas; valor é da folha própria).
- Convenções coletivas do comércio por unidade: parâmetros (tolerância, banco, jornadas especiais) vivem em `jornada_versao`/`acordo_banco_horas_versao` com vigência e referência à norma — levantadas ANTES de modelar (regra do roadmap, Fase 0).

**eSocial**
- Durante o paralelo da trilha F, a transmissão oficial segue com a Nasajon (processo atual do DP, fora do sistema). Após o cutover, a transmissão é do domínio `fiscal/` próprio, com certificado digital: o ponto garante a consistência dos insumos (jornada contratual coerente com S-2200/S-2206; afastamentos alimentam S-2230 via módulo de afastamentos). O ponto em si não transmite nada.

**LGPD**
- Biometria (categoria especial) fica no fornecedor REP-P; **nunca importamos template biométrico** — só NSR + timestamp + identificador (minimização no schema). RIPD antes da contratação se a solução usar biometria; idem para geolocalização se houver marcação móvel.
- Atestados: cifrados em aplicação, chave de permissão própria, gestor vê período e nunca CID; abertura na trilha de leitura.
- Espelho é dado pessoal: acesso mínimo imposto no backend (RLS/SET LOCAL onde couber + matriz de testes); payload minimizado por ausência. Duas trilhas de auditoria (só-INSERT por GRANT) cobrem alteração (ajustes, fechamento, versões de jornada) e leitura de sensível.
- Imutabilidade × eliminação: resolvida por anonimização do domínio ao fim da temporalidade, nunca UPDATE na auditoria.

## Dependências

**Fase 0 (bloqueantes de desenho detalhado):** cotação e contratação do REP-P — Pontomais como candidata líder — com critérios fixos: API de marcações e de apurado/espelho verificadas em sandbox, webhooks, **API de efetivação de tratamento/ajuste**, marcação móvel com geolocalização (se o DP confirmar a necessidade), cláusula de exportação AFD/AEJ + histórico e de reexportação retroativa; RIPD de ponto (biometria/geolocalização); levantamento das convenções coletivas por unidade; protótipo HTML do fluxo de ajuste e do espelho aprovado por DP/RH; PostgreSQL dedicado provisionado com backup + PITR e restore testado.

**Fase 1 (pré-requisitos técnicos):** autenticação e cadastro próprios com papéis (`funcionario`/`gestor`/`rh`/`dp`/`admin`, 2FA para dp/rh/admin); `colaborador` com matrícula própria e `tipo_vinculo`; `relacao_gestor` com vigência; motor de `rh_demandas` (workflow de ajuste); GED mínimo (anexo + ciência); auditoria em duas trilhas.

**Fase 2 (ordem obrigatória):** admissão e afastamentos ANTES do ponto — sem afastamento no ar, o espelho acusa falta indevida.

**Dependentes do ponto:** a **trilha F da folha própria** consome `variavel_folha` do fechamento de ponto — o gate "um mês de espelho conciliado sem divergência não explicada" é pré-condição da fase de sombra (F3); desligamento usa a apuração final; people analytics (Fase 3) consome espelhos e banco.

## Riscos

1. **Virar programa de tratamento (PTRP) sem querer** — se ajustes forem efetivados apenas no nosso banco, o Fast Pessoas passa a ser o software de tratamento juridicamente relevante, não registrado. Mitigação estrutural já no desenho: efetivação no sistema de origem + reimportação + verificação; inegociável, no checklist de release do módulo.
2. **Fornecedor sem API de efetivação de ajuste** (precedente Sults: módulo sem API descoberto tarde) — a API de marcações da Pontomais foi verificada, mas a de EFETIVAÇÃO de tratamento precisa ser confirmada em sandbox na cotação da Fase 0. Sem ela, o tratamento é feito na UI do fornecedor e o módulo só orquestra/concilia — funciona, mas cria dupla digitação, que deve ser precificada na escolha.
3. **Dupla apuração divergente** — nosso espelho (contra `jornada_versao`) × apurado do PTRP podem divergir por arredondamento/tolerância. Como agora as horas alimentam a folha PRÓPRIA, a divergência contamina o cálculo, não só a conferência. Mitigação: conciliação bloqueante no fechamento; definir na Fase 0 a regra de precedência em divergência explicada (proposta: o apurado do PTRP prevalece para fins legais/AEJ; o nosso espelho, conciliado com ele, é o que alimenta a folha — nunca alimentar com divergência aberta).
4. **Banco de horas sem lastro jurídico** — creditar HE sem acordo escrito vigente invalida o banco e gera passivo. Mitigação: bloqueio estrutural (sem `acordo_banco_horas_versao` vigente, HE vira variável de pagamento) + migração validada do saldo inicial, com aceite formal do DP.
5. **Erro de ponto propaga para a folha própria** — sem a Nasajon como barreira, hora errada vira valor errado no holerite. Mitigação: gate de um mês conciliado antes da sombra; a própria fase de sombra (comparação com a Nasajon por competências) funciona como detector de erro de apuração antes do cutover.
6. **Alertas a posteriori** — consolidação em lote detecta interjornada/HE excedente depois do fato; não impede a infração. Expectativa a alinhar com o DP; alertas quase-tempo-real dependem de webhooks/frequência da API do fornecedor (evolução).
7. **Convenções coletivas heterogêneas nas 5 unidades** — modelar jornada antes do levantamento geraria hardcode errado; o roadmap já condiciona, manter a ordem.
8. **Reimportação incompleta / webhooks perdidos** — se o fornecedor não reexportar período já tratado, ajuste aprovado pode nunca refletir no espelho; e webhook perdido sem reconciliação vira lacuna. Mitigação: cláusula contratual de reexportação retroativa, verificação automática pós-ajuste e job periódico de reconciliação completa contra a API.
9. **Saldo inicial e cutover do banco de horas** — migrar banco de horas e pendências do processo atual sem conferência formal contamina o primeiro fechamento; exigir termo de aceite do saldo migrado, análogo à paridade da folha.
10. **Dependência de fornecedor único (lock-in)** — mitigada pelo snapshot imutável no nosso banco, pelo plano B em arquivo (Portaria 671, formato padronizado) e pelas cláusulas de exportação na contratação.

## Perguntas abertas para DP/RH

1. Como o ponto é registrado HOJE em cada unidade (REP-C físico, planilha, nada)? Quem faz o tratamento e em qual software? Existe passivo de espelhos antigos a preservar?
2. Headcount CLT por unidade (>20 empregados → obrigatoriedade do art. 74 §2º)? Quem são as exceções do art. 62 (externos, cargos de confiança) e quem decide essa classificação?
3. Quais convenções coletivas se aplicam a cada unidade (sindicatos/municípios) e o que dizem sobre tolerância, banco de horas, 12x36 e jornadas especiais?
4. Existe banco de horas hoje? Com acordo individual ou coletivo? Qual prazo de compensação? Como validar o saldo inicial a migrar?
5. Há necessidade de marcação móvel com geolocalização (vendedores externos, entregas)? Define critério de cotação do REP-P (Pontomais oferece — confirmar plano/custo) e escopo do RIPD.
6. Pré-assinalação de intervalo é praticada/desejada?
7. Fluxo de aprovação de ajuste: gestor apenas, DP apenas, ou dois níveis? Prazo interno de tratamento dentro do mês?
8. Qual o corte da competência de ponto (mês civil ou ex.: 21–20) e quantos dias entre fechamento de ponto e disponibilização das variáveis para a folha (própria em sombra e, hoje, para o processo manual da Nasajon)?
9. Feriados municipais das 5 unidades: quem mantém o calendário e qual a fonte oficial?
10. O jurídico exige ciência mensal formal do funcionário no espelho? Aceita ciência digital com hash (padrão GED)?
11. Política para atestado de horas (abono parcial do dia) e para saída antecipada autorizada pelo gestor — quem pode conceder e com que registro?
12. Quem cadastra o colaborador no sistema do fornecedor REP-P na admissão e quem mantém o de-para de identificadores (proposta: DP, como passo do checklist de admissão)?
