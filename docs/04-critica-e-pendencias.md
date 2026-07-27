# Crítica de completude e pendências

> Gerado em 2026-07-24 por análise multi-agente sobre as fontes
> "Fast-RH - Conhecimento a Migrar.md" e "Ficha-Conhecimento-Portal-para-RH.md".
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**

## Avaliação geral do crítico

O desenho é maduro, coerente e incomum em qualidade: os critérios de corte (nunca calcular folha, nunca registrar ponto, nunca transmitir eSocial) são respeitados em todos os módulos, o anonimato do clima é estrutural de ponta a ponta, e os próprios detalhamentos apontam honestamente atritos com a arquitetura consolidada. As lacunas reais concentram-se em três famílias: (1) fluxos ENTRE módulos sem dono — o desligamento não tem detalhamento próprio apesar de ser consumido por folha, benefícios, SST, 360 e ponto; e o caminho de ESCRITA de dados mestres de volta à Nasajon (promoção/reajuste → S-2206) não está desenhado em lugar nenhum, o que quebra o fluxo admissão→alteração→folha; (2) contradições entre "decisão fechada" e pendências reais — a identidade 1:1 com o portal está marcada fechada mas depende de validar a população sem login; (3) mecanismos transversais sem fase/dono — tabela de dono único por campo, entidade feriado, motor de anonimização/temporalidade, gestão da chave pgcrypto e o processo interino de direitos LGPD. Nenhuma lacuna invalida a arquitetura; todas são endereçáveis antes ou durante a Fase 0/1, e várias já foram sinalizadas pelos próprios módulos sem, porém, terem sido incorporadas de volta ao roadmap consolidado — esse "loop de retorno" é o que precisa fechar antes da apresentação.

## Lacunas encontradas — gravidade ALTA

### Desligamento sem módulo detalhado

O domínio rh_admissao_desligamento só tem detalhamento do lado ADMISSÃO. O desligamento é consumido por praticamente todos os módulos (folha: rescisão e prazo do art. 477; benefícios: cancelamentos e aviso art. 30/31 da Lei 9.656; SST: devolução de EPI, ASO demissional, estabilidades de cipeiro e acidentado; 360: decisão vs flag; ponto: apuração final; núcleo: desativação do usuário na mesma transação; entrevista de desligamento identificada), mas não existe detalhamento próprio de funcionalidades, entidades, máquina de estados e riscos do processo de desligamento — apesar de ser o item 4 da Fase 2 e um fluxo com prazo legal duro (10 dias, art. 477 §6º).

**Ação sugerida:** Produzir o detalhamento do módulo de desligamento no mesmo padrão dos demais (funcionalidades, entidades, regulatório, riscos, perguntas abertas) antes do início da Fase 2, consolidando as obrigações já espalhadas nos outros módulos (art. 477, art. 30/31, EPI, estabilidades, entrevista, revogação transacional de acesso, rescisão como competência extraordinária).

### Fluxo de escrita de dados mestres para a Nasajon (promoção, reajuste, alteração cadastral/contratual)

O conector Nasajon v1 é só leitura. Promoções, reajustes salariais, mudanças de jornada e alterações cadastrais nascem no Fast Pessoas (posicao_colaborador, escala_colaborador), mas a Nasajon precisa desses dados para calcular a folha e transmitir S-2205/S-2206. Nenhum módulo desenha esse caminho de volta — nem como API, nem como digitação assistida com conferência (que existe para férias/afastamentos/pré-admissão, mas não para posição/salário). Salário alterado aqui e não refletido lá = folha paga errada, e a conciliação de leitura só detecta depois. Agravante: a 'tabela de dono único por campo' é regra fixa da camada de integrações, mas nenhuma fase do roadmap a tem como entregável com dono e prazo — ela aparece apenas como pergunta aberta do núcleo.

**Ação sugerida:** Incluir no mapeamento Nasajon da Fase 0 a pergunta explícita sobre escrita de alterações contratuais/cadastrais (ou o plano B de digitação assistida com pendência rastreada, como nas férias); e promover a tabela de dono único por campo a entregável formal da Fase 0/1, com dono nomeado, cobrindo salário, cargo, jornada, endereço e dependentes.

### Decisão de identidade marcada como fechada, mas pendente de validação real

A decisão 'sistema.usuarios como fonte única; colaborador 1:1' está registrada como 'Nada — decisão fechada', porém o próprio núcleo lista como risco nº 1 (e pergunta aberta nº 1) a existência de colaboradores sem usuário no portal (operacional de loja, afastados longos, temporários), dizendo textualmente que é 'o único ponto em que a arquitetura consolidada precisa de um esclarecimento'. O módulo de demandas repete o mesmo risco (self-service falha na base). Há contradição entre o status da decisão e a dependência de validação externa não resolvida.

**Ação sugerida:** Reclassificar a decisão como 'fechada condicionada a': medir na Fase 0 a população sem login por unidade e validar com quem administra o portal a criação de usuários 'ativos sem credencial de login'. Sem essa resposta, a Fase 1 pode nascer com buraco de cobertura na espinha dorsal.

### 13º e folhas especiais sem data-alvo no roadmap

O item 5 da Fase 2 cobre apenas folha mensal ordinária. O suporte a 13º (1ª parcela até 30/11, 2ª até 20/12) e à rescisão como competência extraordinária está na 'evolução', sem data amarrada ao mês de go-live. O próprio módulo de folha aponta isso como ponto fraco do roadmap (risco 9), mas a arquitetura consolidada e o roadmap não foram atualizados. Como a Fase 2 dura 6–9 meses, é quase certo que o primeiro novembro em produção chega antes de a 'evolução' estar pronta — 13º viraria urgência não planejada num módulo com prazo legal duro.

**Ação sugerida:** Amarrar no roadmap consolidado uma regra explícita: se o cutover da esteira de folha ocorrer até agosto, tipo_folha 13o_1a/13o_2a entram no mesmo release; se depois, o mês-sombra é agendado para não colidir com nov/dez e o 13º do primeiro ano roda 100% no processo atual, com decisão registrada no log.

## Lacunas encontradas — gravidade MÉDIA

### Critério de cotação do REP-P sem API de efetivação de ajuste

Os critérios fixos de cotação da Fase 0 (arquitetura consolidada) citam integração Nasajon e API de marcações/espelho, mas não API de EFETIVAÇÃO/tratamento de ajuste — exatamente o que a regra inegociável 'efetivação sempre no sistema de origem + reimportação' exige. O módulo de ponto aponta isso como lacuna (risco 2, precedente Sults); sem essa API, todo ajuste vira dupla digitação na UI do fornecedor, violando a regra de dono único. Falta também a cláusula de reexportação retroativa de período já tratado (risco 7) nos critérios consolidados.

**Ação sugerida:** Atualizar os critérios de cotação do REP-P na Fase 0: (1) API de marcações/espelho, (2) API de tratamento/efetivação de ajuste com protocolo, (3) cláusula contratual de exportação AFD/AEJ e reexportação retroativa. Precificar a ausência do item 2 na comparação entre fornecedores.

### Canal externo de admissão fora da arquitetura consolidada (4ª credencial, superfície pública, RIPD)

O módulo de admissão introduz elementos que a arquitetura consolidada não prevê: uma quarta credencial de banco (app_admissao_externa) — a arquitetura afirma 'mesmo banco, três credenciais' —, a primeira superfície pública do monorepo (link tokenizado com upload de documentos por titular externo) e um RIPD específico que não consta da lista da Fase 0 (que cita apenas ponto e clima). O próprio módulo reconhece que 'a arquitetura não previu explicitamente'.

**Ação sugerida:** Incorporar formalmente à arquitetura consolidada: 4ª role/pool com grants mínimos, revisão de segurança dedicada como gate do go-live da admissão digital, e RIPD do canal externo no mesmo pacote de RIPDs da Fase 0 (ou como pré-requisito registrado da Fase 2 item 1).

### Entidade `feriado` sem dono e na fase errada

A tabela `feriado` está modelada no contexto ponto (Fase 2, entrega 2), mas é consumida antes e por vários módulos: demandas quer SLA em dias úteis já na Fase 1 (o módulo aponta a inconsistência no risco 3), férias valida o art. 134 §3º (início vedado 2 dias antes de feriado/DSR), folha calcula marcos por dia útil (5º dia útil) e SST conta o prazo da CAT em D+1 útil. Não há dono definido para manter o calendário (feriados municipais das 5 unidades) nem fonte oficial.

**Ação sugerida:** Antecipar `feriado` para a fundação da Fase 1 como dado transversal (fora do domínio ponto), com dono operacional definido (DP) e fonte por município/unidade; registrar no log a decisão sobre SLA de demandas (dias corridos no MVP ou úteis desde já).

### Direitos do titular LGPD sem processo interino entre Fase 1 e Fase 3

A fila formal de direitos do titular (art. 18/19) só chega na Fase 3, mas dados pessoais reais entram em produção na Fase 1 (ficha, salário, ocorrências, advertências) e o dever de atender acesso/correção/eliminação — com prazo de 15 dias para acesso — vale desde o primeiro dia. Nenhum documento define como esses pedidos são atendidos no interim (quem recebe, como se responde, como se comprova).

**Ação sugerida:** Definir na Fase 0, junto com o parecer do DPO, um processo interino documentado (ex.: tipo de demanda genérico + procedimento manual do DP com evidência no GED) e registrá-lo no RIPD, até a fila formal da Fase 3 assumir.

### Motor de temporalidade/anonimização sem dono nem fase

A tabela de temporalidade por categoria existe como artefato da Fase 0, e o padrão 'eliminação = anonimização do domínio' é regra consolidada — mas nenhum módulo detalha o MECANISMO: o job de anonimização de candidatos reprovados (~6 meses), de participacao_pesquisa (~2 anos), de demandas triviais e de colaboradores após o fim da guarda. O módulo de admissão avisa que sem job testado 'o módulo nasce em débito LGPD', mas o job não pertence a nenhuma fase/domínio.

**Ação sugerida:** Criar um item transversal explícito (Fase 2, junto do primeiro dado com prazo curto — candidatos ou participação de clima): rotina de retenção/anonimização parametrizada pela tabela de temporalidade, com log auditado por execução e teste de anonimização no CI, com dono de código definido (sugestão: domínio próprio ou rh_documentos).

### Gestão do ciclo de vida da chave pgcrypto

Dados de saúde (CID, ASO com guarda legal de 20 anos pós-desligamento) são cifrados em aplicação com chave em secret manager, mas nenhum documento trata de rotação da chave, custódia/escrow, recuperação em desastre e — crítico — se o restore mensal testado do backup inclui teste de DECIFRAÇÃO com a chave da época. Perda da chave = perda irreversível de documento com obrigação legal de guarda de 20 anos; o restore testado sem decifração dá falsa segurança.

**Ação sugerida:** Acrescentar à fundação da Fase 0 uma política mínima de gestão de chaves (versionamento de chave por período, escrow com dupla custódia, procedimento de rotação sem recifrar histórico ou com recifração planejada) e incluir 'decifração de amostra de dado de saúde' no checklist do teste mensal de restore.

### Lacuna de ciclos 45/90d entre admissão digital e a 360

Admissão digital entra no item 1 da Fase 2 e a 360 só no item 6: todo admitido nesse intervalo (potencialmente muitos meses) terá contrato de experiência sem ciclo 45/90 no sistema, num fluxo com prazo legal irreversível (90 dias e o contrato vira indeterminado). O módulo de 360 aponta a lacuna e propõe mitigações (ciclos retroativos na ativação ou mini-fluxo de decisão de experiência junto da admissão), mas o roadmap consolidado não incorporou nenhuma delas.

**Ação sugerida:** Decidir e registrar no roadmap: ou os ciclos são criados retroativamente na ativação da 360 (com varredura obrigatória — o mecanismo de gatilho por data já existe no desenho da admissão), ou um mini-fluxo 'decisão de experiência com registro' entra junto com a admissão digital. Definir também quem monitora os prazos 45/90 no intervalo (alerta já na admissão).

## Lacunas encontradas — gravidade BAIXA

### GED completo sem detalhamento próprio

rh_documentos é domínio de primeira classe na arquitetura (schema de código próprio), mas seu detalhamento vive diluído no núcleo ('GED mínimo') e o 'GED completo com painel de vencimento de documentos' (Fase 2) não pertence a nenhum módulo detalhado — não há dono claro para categorias documentais, painel de vencimento (inclusive CNH/documentos com validade), assinatura qualificada via integração e a criação antecipada das categorias SST (gancho da Fase 1 sugerido pelo módulo SST).

**Ação sugerida:** Atribuir dono explícito ao rh_documentos e listar o escopo do 'GED completo' da Fase 2 (categorias, painel de vencimento, integração de assinatura, categorias SST antecipadas) num detalhamento curto, mesmo que sem módulo dedicado.

### Complementos de clima ainda não registrados na arquitetura (log scrubbing e escrita bipool)

O módulo de clima identifica dois detalhamentos que a arquitetura consolidada não explicita: (1) canal lateral fora do banco — logs de aplicação/APM/backups podem religar resposta a sessão, exigindo log scrubbing nas rotas de resposta como item de release; (2) a escrita em dois pools deliberadamente não transacional (trade-off aceito). Ambos estão marcados pelo próprio módulo como 'devem ser registrados no log de decisões', mas não constam da arquitetura nem do checklist consolidado.

**Ação sugerida:** Registrar os dois pontos no log de decisões e adicionar 'log scrubbing verificado nas rotas de resposta de clima' ao checklist de release do módulo, junto do teste de reidentificação já previsto.

### Treinamentos (Fase 3) sem detalhamento e com dependência dupla não resolvida

O módulo de treinamentos aparece só como linha da Fase 3 ('Sults se API confirmada, senão manual + NRs ligadas a SST'), sem detalhamento, mas tem tentáculos em módulos detalhados: PDI da 360 usa treinamento como evidência, SST exige reciclagens NR com validade e certificado, e o onboarding da admissão lista treinamentos obrigatórios. Se a API do Sults não for confirmada (verificação da Fase 0), o 'registro manual' precisa de um mínimo de modelo de dados que hoje não existe em lugar nenhum.

**Ação sugerida:** Definir desde já a entidade mínima de treinamento/certificado (colaborador, tipo, data, validade, evidência no GED) como parte do núcleo ou do SST, para que 360, SST e onboarding tenham onde pendurar registros manuais mesmo sem o conector Sults.

### variavel_folha sem confirmação de suporte a provento/estorno

O módulo de benefícios aponta (risco 9) que a arquitetura consolidada fala em 'descontos sempre via variavel_folha', mas benefícios geram também proventos/estornos (devolução de desconto indevido após divergência de fatura). O desenho de rh_folha suporta naturezas pela rubrica do catálogo, mas ninguém confirmou formalmente que variavel_folha comporta sinal/tipo provento vindo de benefícios — o ajuste é pequeno se feito agora e retrabalho se descoberto na Fase 3.

**Ação sugerida:** Confirmar no desenho de rh_folha (antes do protótipo da esteira, Fase 0) que variavel_folha aceita natureza provento/estorno com origem 'beneficio', e registrar no log de decisões.

## Decisões que ainda dependem de validação externa

- **Plataforma: módulo de RH dentro do monorepo do Portal de Vendas (Fast Pessoas)** — pendente de: Parecer do DPO/jurídico aceitando segregação lógica demonstrável (grants + pgcrypto + trilhas) como defesa LGPD suficiente; se exigir segregação física, executa-se o plano de saída para a instância SaveinCloud dedicada.
- **Stack de backend: FastAPI + Python 3.12 + asyncpg + Redis (padrão do portal)** — pendente de: Validação honesta da proficiência dos 3 devs em Python na Fase 0. Condição de reversão registrada: só reconsiderar Node se comprovado que ninguém sustenta Python — e mesmo assim portando os padrões, nunca improvisando.
- **Folha: integrar Nasajon; fechamento = esteira de conferência, nunca cálculo próprio** — pendente de: Mapeamento formal da API Nasajon na Fase 0 (autenticação, entidades, escrita de variáveis, exportação de resultado/holerite, status eSocial). Plano B já desenhado: troca de arquivos/batch com validação de layout — muda o transporte, não a arquitetura.
- **Ponto: nunca desenvolver registrador próprio (nem 'coletor'); contratar REP-P homologado** — pendente de: Verificar na Fase 0 se a Nasajon tem módulo de ponto homologado; RIPD antes da contratação se a solução usar biometria; levantar convenções coletivas do comércio por unidade antes de modelar jornadas/escalas.
- **Avaliação 360: spec TO-BE da btime como especificação funcional; interface refeita no design system do portal** — pendente de: Pedido formal à btime do TO-BE e do código na Fase 0. Se não entregar: a spec se reconstrói a partir da ficha do portal §5 + descritores do Fast-Agente (custo de semanas, não meses).
- **Clima: anonimato estrutural por desenho de dados, no schema rh_clima isolado** — pendente de: Nada estrutural — decisão fechada. Resta o RIPD formal e a revisão de desenho de cada pesquisa antes da publicação.
- **Identidade: sistema.usuarios do portal é a fonte única; colaborador é entidade de RH 1:1** — pendente de: Nada — decisão fechada. Executar as migrations de chaves/perfis na Fase 0.
- **Banco: mesma instância PostgreSQL do portal, com segregação por role/pool/GRANT + cifração** — pendente de: Mesmo gatilho da decisão de plataforma: parecer DPO/jurídico. Risco residual assumido e registrado: comprometimento total do host atinge tudo.
- **Auditoria em duas trilhas + versionamento de regra com vigência na fundação (Fase 0/1, nunca retrofit)** — pendente de: Nada — decisão fechada; entra como critério de gate da Fase 1 (audit e RLS verificados por teste automatizado no CI).
- **Camada de integrações formal como estrutura de código nomeada (domínio integracoes/)** — pendente de: Fase 0: contrato da API Nasajon; verificação formal de API do módulo universidade do Sults (até lá, treinamento é registro manual/importação); validar se centros de custo existem no DW antes de qualquer uso além do analítico.
- **DW SAP (SAP_MIRROR): enriquecimento analítico read-only, fora do caminho crítico** — pendente de: Validar na Fase 0 se centros de custo e comissões existem no DW com granularidade utilizável.

## Perguntas abertas para DP/RH, por módulo

### Núcleo: ficha do colaborador e histórico/linha do tempo (rh_colaboradores)

1. Existem hoje colaboradores SEM usuário no portal (operacional, lojas, afastados, temporários)? Quantos? Todos podem ganhar usuário — inclusive "sem acesso de login"? (destrava o risco nº 1)
2. Quais tipos de vínculo existem de fato na Fast hoje (CLT, estagiário, aprendiz, PJ, temporário, diretor estatutário?) e quais regras cada um dispensa (ponto, folha, 360, benefícios)?
3. A matrícula Nasajon é única entre as 5 unidades ou reinicia por estabelecimento/CNPJ? Recontratação gera matrícula nova? (define a chave de correlação e o tratamento de readmissão na linha do tempo)
4. Tabela de dono único por campo: para cada campo cadastral, quem é a fonte — Nasajon ou Fast Pessoas? Onde o DP digita HOJE cada dado (para eliminar dupla digitação, não criar)?
5. Gestor pode ver salário da própria equipe? E o histórico salarial? Quem além de DP/RH vê advertências? (calibra as chaves rh.salario.ver e rh.ocorrencia.sensivel.ver)
6. Fluxo disciplinar atual: quem aplica advertência/suspensão, quem assina, como tratam recusa de assinatura e testemunhas? Jurídico aceita ciência digital com hash como prova? (validação jurídica antes do protótipo)
7. Carga de histórico retroativo: quanto do passado importar na ficha (só posição atual + admissão, ou histórico de cargos/salários/afastamentos)? O que existe só em papel e vale digitalizar no GED com qual prioridade?
8. Cadência de feedback: os 90 dias do Fast-Agente valem para toda a empresa ou variam por área/senioridade? O alerta vai para o gestor, para o RH ou ambos?
9. Existe catálogo de cargos formalizado hoje (com descrição/CHA) ou o desenho dos cargos e da tabela salarial é trabalho novo do RH que precisa acontecer DURANTE a Fase 1?
10. Centros de custo: o DP usa os mesmos códigos do financeiro/DW? Lotação por centro de custo é necessária no MVP ou basta unidade?
11. Dependentes: o DP precisa deles na Fase 1 (IRRF, plano de saúde) ou o mínimo pode esperar a Fase 2 com benefícios?
12. Entrevista de criação de ficha do Fast-Agente (papel + retrato + 9 valores): o RH quer mantê-la obrigatória para todo colaborador novo ou só para cargos de liderança?
13. Quem administra os descritores dos 9 Valores daqui em diante (RH edita com vigência)? Há intenção de revisá-los antes de virarem régua oficial da 360?

_Detalhe: `03-modulos/01-nucleo-colaborador-historico.md`_

### Controle de Ponto (domínio `rh_ponto`) — marcação, jornadas, escalas/turnos, tratamento de marcações, espelho, banco de horas e fechamento mensal de ponto

1. Como o ponto é registrado HOJE em cada unidade (REP-C físico, planilha, nada)? Quem faz o tratamento e em qual software? Existe passivo de espelhos antigos a preservar?
2. A Nasajon possui módulo de ponto homologado (REP-P/PTRP) e com API? (Pergunta nº 1 da Fase 0 — define o fornecedor.)
3. Headcount CLT por unidade (>20 empregados → obrigatoriedade do art. 74 §2º)? Quem são as exceções do art. 62 (externos, cargos de confiança) e quem decide essa classificação?
4. Quais convenções coletivas se aplicam a cada unidade (sindicatos/municípios) e o que dizem sobre tolerância, banco de horas, 12x36 e jornadas especiais?
5. Existe banco de horas hoje? Com acordo individual ou coletivo? Qual prazo de compensação? Como validar o saldo inicial a migrar?
6. Há necessidade de marcação móvel com geolocalização (vendedores externos, entregas)? Define critério de cotação do REP-P e escopo do RIPD.
7. Pré-assinalação de intervalo é praticada/desejada?
8. Fluxo de aprovação de ajuste: gestor apenas, DP apenas, ou dois níveis? Prazo interno de tratamento dentro do mês?
9. Qual o corte da competência de ponto (mês civil ou ex.: 21–20) e quantos dias entre fechamento de ponto e envio de variáveis à folha?
10. Feriados municipais das 5 unidades: quem mantém o calendário e qual a fonte oficial?
11. O jurídico exige ciência mensal formal do funcionário no espelho? Aceita ciência digital com hash (padrão já usado na 360/GED)?
12. Política para atestado de horas (abono parcial do dia) e para saída antecipada autorizada pelo gestor — quem pode conceder e com que registro?

_Detalhe: `03-modulos/02-ponto.md`_

### Folha de pagamento e fechamento (rh_folha) — esteira de conferência e fechamento sobre a Nasajon

1) Processo atual: como funciona o mês do DP hoje, passo a passo? Quem digita o quê na Nasajon, em que datas (corte de ponto, envio, conferência, pagamento)? Existe dupla conferência hoje? 2) Nasajon: existe API para escrita de lançamentos/variáveis? Exportação de prévia calculada (formato)? Exportação de holerite (PDF/dados) e informe de rendimentos? Status de eSocial/FGTS/DCTFWeb consultável? Qual layout batch de importação ela aceita como plano B? Existe módulo "Meu RH"/portal do funcionário já contratado? 3) Data de pagamento praticada (5º dia útil?) e existe adiantamento quinzenal? Existe PLR? 4) Comissões: entram na folha? De onde vêm hoje (DW, planilha)? Quem calcula o DSR sobre comissão (precisa ser a Nasajon)? Centros de custo existem na Nasajon e batem com o DW? 5) Quais são as divergências mais comuns na conferência de hoje e qual variação de líquido o DP considera alarmante (para calibrar o limiar automático)? 6) Provisões (13º, férias, encargos): a contabilidade consome relatório da Nasajon hoje? O painel precisa exibir ou basta arquivar? 7) Quem aprova o fechamento hoje e aceitam a segregação remeter ≠ aprovar com 2FA? Quem pode autorizar exceção de checklist? 8) Convenções coletivas por unidade: sindicatos, datas-base, pisos, adicionais — quem parametriza na Nasajon e como o DP fica sabendo de reajuste de convenção? 9) Descontos administrados por terceiros (consignado, pensão alimentícia, vale-transporte): quem lança hoje e em que sistema? 10) Contestação de holerite: qual o fluxo atual quando o colaborador discorda de um valor e qual o prazo de resposta praticado? 11) Rescisão: quem monta o TRCT hoje e em quanto tempo a Nasajon devolve o cálculo (cabe nos 10 dias do art. 477 com folga)? 12) Aceitam o mês-sombra (rodar um ciclo em paralelo, com trabalho dobrado) e em que mês do ano seria menos pior executá-lo (evitar novembro/dezembro)?

_Detalhe: `03-modulos/03-folha-fechamento.md`_

### Benefícios (rh_beneficios) — VT, VR/VA, plano de saúde/odonto, convênios, elegibilidade, adesão/cancelamento, desconto em folha e faturas de operadoras

1. **Inventário atual:** quais benefícios existem hoje por unidade, com quais operadoras (saúde, odonto, VR/VA, bilhetagem de VT por município), e onde está o cadastro hoje (planilha? Nasajon? papel?).
2. **Nasajon:** como as rubricas de desconto de benefícios são alimentadas hoje (digitação manual? importação?); a Nasajon tem módulo de benefícios/movimentação de operadoras homologado? Quais rubricas já existem (VT, coparticipação, mensalidade dependente)?
3. **PAT:** a Fast é inscrita no PAT? Qual o modelo atual de desconto de VR/VA (percentual, valor fixo, zero)?
4. **Plano de saúde:** é contributário (colaborador paga parte da mensalidade) ou só coparticipação por uso? — define a obrigação dos arts. 30/31 no desligamento. Existe declaração de saúde no processo de adesão, e quem a custodia hoje?
5. **Faturas:** em que formato chegam as faturas de cada operadora (PDF, planilha, portal, API?) e com que defasagem em relação à competência de desconto? Quem confere hoje e contra o quê?
6. **Cortes:** qual a data de corte de movimentação de cada operadora e a data de corte interna de adesão/cancelamento que o DP pratica?
7. **CCTs:** as convenções coletivas das 5 unidades obrigam algum benefício (cesta básica, VA mínimo, seguro de vida)? Há pisos ou percentuais de desconto fixados em CCT?
8. **VT operacional:** como é feita a recarga hoje (portal da concessionária por unidade? centralizada?) e há colaborador com renúncia formal registrada — em que suporte?
9. **Dependentes:** qual documentação a Fast exige por tipo de dependente e por benefício, e há prazo de carência praticado?
10. **Elegibilidade real:** existe hoje diferenciação de benefício por cargo (ex.: gestor tem plano superior)? Por tempo de casa? Estagiário/aprendiz/PJ recebem algo (VT de estagiário é praxe, não obrigação)?
11. **Afastados e férias:** qual a prática atual para VT em férias e para manutenção de plano de saúde em afastamento INSS (quem paga a parte do colaborador — desconto acumulado no retorno, boleto)? — precisa virar regra parametrizada.
12. **Volume:** quantas vidas (titulares + dependentes) por operadora — dimensiona se a conciliação manual assistida basta no início da Fase 3 ou se a automação da movimentação é urgente.

_Detalhe: `03-modulos/04-beneficios.md`_

### Avaliação 360 (rh_avaliacao) — modelo btime: Dever 30% / CHA 40% / Fit Cultural 30%, ciclos de Experiência (45/90d) e Desempenho (semestral), rollout faseado líder→liderado → feedback/PDI/Card → 360 completa

Para o RH/DP da Fast antes de prototipar: (1) Quais são exatamente os indicadores do pilar Dever no TO-BE da btime (faltas, atrasos, advertências, licenças — algo mais? metas?) e qual a régua de conversão de cada um para nota 1–5? (2) O colaborador vê a própria nota bruta por pilar, ou só faixa + devolutiva? E o gestor vê nota bruta da equipe ou só consolidado? (3) Quem registra formalmente a decisão humana sobre a flag — o gestor direto, o RH, ou decisão conjunta com dupla assinatura? Exigir justificativa também quando ACATA flag de desligar? (4) Quais tipos de vínculo entram em cada ciclo (PJ, estagiário, aprendiz e temporário são avaliados? com o mesmo modelo?)? (5) Ciclo de Desempenho: semestral por calendário fixo (todos juntos, ex. jun/dez) ou por aniversário de admissão? Como entra quem foi admitido no meio do ciclo (proporcionalidade? mínimo de dias avaliáveis?)? (6) Contrato de experiência da Fast é 45+45 padrão para todos os cargos, ou varia? Quantos dias de antecedência o alerta deve disparar? (7) O que acontece com avaliação não respondida no prazo (expira e o ciclo consolida sem ela? escala para o gestor do gestor?)? (8) Troca de gestor no meio do ciclo: avalia o gestor da abertura, o atual, ou ambos ponderados? (9) Colaborador com dupla subordinação (matricial entre unidades) — existe hoje? Como avalia? (10) Na Fase 3, pares são anônimos para o avaliado? Autoavaliação entra no cálculo com peso ou é só insumo de conversa? (11) Política de retenção: por quanto tempo manter avaliações de desligados (proposta: mínimo prescricional; validar com DPO)? (12) O RH quer faixas/pesos diferentes por cargo ou unidade (ex.: liderança com pesos próprios), ou um modelo único vale para toda a Fast? (13) Confirmar com a btime: existia regra de nota mínima eliminatória por pilar (ex.: Fit Cultural abaixo de X reprova independente da média)?

_Detalhe: `03-modulos/05-avaliacao-360.md`_

### Controle de Clima (rh_clima) — pesquisas periódicas, pulso, eNPS, dashboards agregados com k-mínimo e planos de ação

1. Gestor pode ver lista nominal de quem não respondeu, ou apenas % agregado da equipe? (Recomendação: só %; lembrete é automático via n8n. Nominal cria pressão e mata a honestidade.) 2. Resultados agregados serão publicados para todos os funcionários (transparência aumenta adesão) ou restritos a RH/gestores? Configurável por pesquisa — qual o default? 3. Qual a cadência desejada: clima completa anual + pulso trimestral + eNPS semestral? Existe calendário de RH a respeitar (evitar colisão com fechamento de folha e ciclos da 360)? 4. Existe pesquisa de clima anterior (Google Forms, planilha, consultoria)? Há série histórica a preservar e dimensões/perguntas a manter para comparabilidade? 5. Grupos pequenos: aceitam que unidade com < 5 respondentes não apareça isolada, ou preferem definir agrupamentos fixos de unidades antes do primeiro ciclo? 6. Quem participa: só CLT ou também estagiários, aprendizes, PJ e temporários (`tipo_vinculo`)? Terceirizados ficam fora? 7. Comentário de texto livre: DP/RH aceita ficar sem no MVP? Qual apetite de risco para a evolução (com moderação e parecer DPO)? 8. Incentivo à adesão via gamificação do portal: premiar adesão **coletiva** por unidade é aceitável? (Individual é desaconselhado — transforma participação em dado de performance.) 9. Plano de ação: gestor cria e RH homologa, ou RH cria e delega ao gestor? Diretoria vê todos os planos? 10. Quem é o DPO/responsável que assina o RIPD de clima, e qual prazo de retenção aprova para `participacao_pesquisa`? 11. Confirmar fronteira: pesquisa de desligamento fica na entrevista identificada do processo de desligamento (Fase 2, item 4) e fora do clima anônimo — ok para RH?

_Detalhe: `03-modulos/06-clima.md`_

### Workflows e demandas DP↔funcionário (domínio `rh_demandas`)

1. **Catálogo real**: quais solicitações o DP recebe hoje (declaração de vínculo, salarial, informe de rendimentos, cópia de contrato, alteração cadastral, vale-transporte…), com que volume mensal por unidade? Isso define os tipos seed do MVP.
2. **Canal atual**: como essas solicitações chegam hoje (WhatsApp, e-mail, papel, verbal)? Existe algum registro/planilha que sirva de baseline de volume e prazo?
3. **Organização da fila**: o DP atende como fila única centralizada ou por unidade? Quem são os executores por categoria?
4. **SLA praticado × desejado** por tipo de solicitação — e em dias corridos ou úteis? (Decide o item 3 dos riscos.)
5. **Cadeia de aprovação real**: férias e promoções passam por quantos níveis hoje (gestor → RH → diretoria?)? Existe alçada por valor no reajuste? Promoção precisa de aprovação de diretoria?
6. **Declarações**: são geradas pela Nasajon, por modelo Word manual, ou ambos? Quais exigem assinatura formal e qual (carimbo/assinatura qualificada)?
7. **Cobertura de login**: todos os colaboradores das 5 unidades têm usuário ativo no portal hoje (inclusive operação de loja)? Acessam por celular? Qual a proporção sem acesso — para dimensionar a abertura assistida?
8. **Delegação**: quando o gestor sai de férias, quem aprova hoje? Existe regra formal de substituição por unidade?
9. **Pendências DP→funcionário**: quais cobranças recorrentes o DP faz (documentos de admissão, comprovantes, exames)? Com que prazo e qual consequência do não atendimento?
10. **Notificação preferida**: e-mail corporativo existe para todos? Se não, qual canal o n8n deve usar (e-mail pessoal? WhatsApp corporativo?) — com implicação LGPD do canal escolhido.
11. **Retenção**: o jurídico/DPO confirma os prazos de guarda por categoria de demanda para a tabela de temporalidade (trabalhista 5+ anos × trivial)?

_Detalhe: `03-modulos/07-workflows-demandas.md`_

### Férias e Afastamentos (rh_colaboradores/rh_demandas — submódulos `ferias` e `afastamentos` dentro do domínio `rh`)

1) Como o processo de férias roda hoje: quem programa (gestor? DP?), em que ferramenta, e quem digita na Nasajon? 2) A API/contrato da Nasajon expõe períodos aquisitivos, afastamentos e faltas em leitura? Aceita escrita de programação de férias e afastamentos, ou o plano B batch/digitação é definitivo? 3) A Fast aderiu ao programa Empresa Cidadã (maternidade 180d / paternidade 20d)? 4) Como os atestados chegam hoje (papel, WhatsApp do gestor, e-mail ao DP)? Quem registra o CID na Nasajon, e o DP aceita mudar o canal de recepção para o sistema? 5) As convenções coletivas do comércio das 5 unidades têm cláusulas próprias sobre férias, abono ou licenças (dias adicionais, restrição de época)? 6) Férias coletivas são prática real da Fast (ex.: fim de ano)? Com que abrangência — empresa toda, por unidade, por setor? 7) Política de abono pecuniário: é livre a pedido do funcionário ou depende de aprovação? E o adiantamento da 1ª parcela do 13º nas férias é praticado? 8) Quem transmite o S-2230 hoje e com que prazo após o registro do afastamento — há SLA a monitorar? 9) Afastamento longo durante o contrato de experiência suspende o ciclo 45/90d da avaliação 360 (o contrato de experiência se prorroga)? Regra a fechar com DP + jurídico. 10) Estagiários: quem controla o recesso hoje, e ele deve entrar no MVP ou fica para evolução? 11) Existem hoje férias vencidas ou acumuladas na base? (Define se o go-live precisa de um plano de regularização e de que tamanho é o passivo atual.) 12) Qual a granularidade que o gestor pode ver do afastamento da equipe: só "afastado até DD/MM" ou também o grupo (saúde × INSS × licença legal)? Definir com o DPO o rótulo máximo permitido.

_Detalhe: `03-modulos/08-ferias-afastamentos.md`_

### Recrutamento, Seleção e Admissão Digital (domínios `rh_admissao_desligamento` — MVP — e `rh_recrutamento` — evolução Fase 3)

1. Nasajon: existe API/endpoint de pré-admissão (ou módulo de admissão digital próprio)? Qual o conjunto mínimo de campos, quando a matrícula é gerada e como retorna? Se só houver importação por arquivo, qual layout? (condiciona o conector inteiro)
2. Quem transmite o S-2220 hoje — a clínica de SST ou a Nasajon? Qual clínica atende cada uma das 5 unidades e alguma tem portal/API de agendamento e resultado?
3. Como o contrato de trabalho é assinado hoje (papel? alguma plataforma?) e o jurídico aceita ciência digital com hash para quais documentos? Para quais exigirá assinatura eletrônica avançada/qualificada?
4. Volume de admissões por mês e por unidade, e sazonalidade — dimensiona o MVP e decide o comprar × construir do ATS. Hoje divulgam vagas onde (Indeed, LinkedIn, Gupy, indicação)?
5. Lista real e atual de documentos exigidos por tipo de vínculo (CLT, estagiário, aprendiz, PJ, temporário) e o que as convenções coletivas do comércio de cada unidade acrescentam (exames específicos, uniforme/EPI, acordo de compensação)?
6. Fluxo real de requisição de vaga: quem aprova hoje (gestor → RH → diretoria?), existe headcount autorizado formal por unidade/centro de custo, e reposição segue o mesmo rito que vaga nova?
7. DPO/jurídico: prazo de retenção de candidatos reprovados (proposta 6 meses) e de banco de talentos com consentimento (proposta 12–24 meses) — validar; e o RIPD do canal externo de admissão entra no mesmo pacote dos RIPDs de ponto e clima da Fase 0?
8. Exame admissional: quem agenda hoje (DP central ou o candidato), quem paga, e qual o prazo típico entre aprovação e ASO por unidade — define os SLAs do checklist.
9. Aprendizes e estagiários: quais entidades integradoras/CIEE são usadas, quem emite o TCE hoje e há contrato de cota com instituição?
10. Autodeclaração PCD: como a cota é gerida hoje (laudo? validação médica?) e quem no RH pode ver esse dado?
11. O gestor da vaga pode ver o salário final ofertado ou apenas a faixa? (define o payload minimizado da oferta)
12. Existe intenção de página pública de carreiras no curto prazo? Se sim, ela ficará fora do portal (site institucional) e o módulo só recebe o candidato — confirmar para não nascer requisito de front público no monorepo.

_Detalhe: `03-modulos/09-recrutamento-admissao.md`_

### SST / Saúde Ocupacional (`rh_sst`) — ASO, PCMSO, PGR, CAT, EPIs e monitoramento dos eventos eSocial de SST

1. Quem transmite S-2210, S-2220 e S-2240 hoje, por unidade: a clínica (com qual software — SOC?), a Nasajon, ou o escritório contábil? Há recibos arquivados? 2. Qual(is) clínica(s) ocupacional(is) atendem as 5 unidades — uma só ou uma por município? O contrato tem cláusula de exportação de dados? 3. Existem PGR e PCMSO vigentes por unidade? Quais as datas de emissão/revisão? Quem são os responsáveis técnicos? 4. Qual o grau de risco (CNAE) das unidades — isso dimensiona SESMT e CIPA (NR-4/NR-5); existe CIPA constituída em alguma unidade? 5. Alguém recebe adicional de insalubridade ou periculosidade hoje? Existem laudos? Como isso chega à folha atualmente? 6. Como é feita hoje a ficha de entrega de EPI (papel? planilha?) e quais EPIs o comércio/depósito da Fast realmente usa (empilhadeira → NR-11? estoque em altura → NR-35?)? 7. Já houve CAT nos últimos 5 anos? Quem emitiu e transmitiu? 8. A periodicidade dos exames periódicos está definida no PCMSO por função — a clínica fornece a data do próximo exame no próprio ASO? 9. O médico coordenador emite o relatório analítico anual do PCMSO — quem o recebe e onde é arquivado hoje? 10. Para o DPO: o RIPD do projeto já cobre dado de saúde de SST (retenção de 20 anos × direito de eliminação), ou precisa de adendo específico antes da Fase 3?

_Detalhe: `03-modulos/10-sst-saude-ocupacional.md`_
