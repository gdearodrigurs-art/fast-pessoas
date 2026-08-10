# Requirements: Fast Pessoas — Da demo ao uso real

**Defined:** 2026-08-10
**Core Value:** O trabalho do DP é fazer, não olhar — sustentar a operação semanal real do DP/RH da Fast com dados reais.

> Escopo deste ciclo apenas (ondas restantes de docs/17, itens 2–8). O que já foi construído
> e committado (fundação, ponto/banco de horas, estrutura Onda I, benefícios Onda H, sweeps 0/0b)
> está em PROJECT.md → Requirements → Validated e **não** se repete aqui.

## v1 Requirements

### Padrão Modelo (catálogo → modelo → regra)

- [ ] **MODL-01**: Uma tela reutilizável do padrão catálogo (esquerda) → modelo (direita) → regra que escolhe (embaixo), desenhada uma vez e replicada nos domínios
- [ ] **ADMS-01**: Checklist de admissão personalizável por tipo de vínculo (PJ ≠ CLT), montado a partir de catálogo de itens (documentos, ASO, contrato, acessos, uniforme, onboarding) — chave + índice único, sem tabela nova (L2)
- [ ] **RECR-01**: Etapa "Pesquisa social" no kanban de recrutamento, antes da Oferta, com anexo e resultado aprovado / não aprovado (L1)
- [ ] **RECR-02**: Modelos de processo de recrutamento versionados, selecionáveis por vaga
- [ ] **CLIM-01**: Perguntas do check-in de clima como catálogo administrável, com continuidade e regra de edição versionada
- [ ] **AVAL-01**: Avaliação por cargo — o cargo escolhe o `modelo_avaliacao_versao`; o ciclo carrega um conjunto de modelos, não um só

### Folha — três visões e OLAC (Onda J)

- [ ] **FOLH-01**: Três visões de conferência da competência — por provento, por pessoa e por centro de custo
- [ ] **FOLH-02**: Totais e quebras por centro de custo **e** por registro/empresa
- [ ] **FOLH-03**: Filtros das três dimensões (registro, lotação, centro de custo) na competência
- [ ] **OLAC-01**: Espelhamento com a contabilidade externa (OLAC/Castor) — Fase 1 por arquivo: exportação das movimentações internas e importação do que vem de fora; toda movimentação lá espelha aqui

### Disciplinar + Posse (cobre N2)

- [ ] **DISC-01**: Medidas disciplinares — a cadeia como sugestão (não portão), medida preventiva com desfecho obrigatório
- [ ] **DISC-02**: Ciclo do documento que exige assinatura — prazo → assinou / recusou / testemunhas — forma reutilizável
- [ ] **POSS-01**: Registro de posse/custódia — EPI já dá hoje (consulta ao índice existente); ativos ganham tabela nova com tipo e quantidade
- [ ] **COND-01**: Ciência do Código de Conduta e Regulamento Interno no primeiro acesso — bloqueia até aceitar, exige rolar o documento, nova versão reabre a ciência para todos, registro com hash e data (via o ciclo DISC-02); quem não dá ciência deixa de ficar pendente para sempre (N2)

### Visibilidade em camadas (Onda K)

- [ ] **VISI-01**: Acesso ao salário pela sub-árvore recursiva do organograma (`WITH RECURSIVE`) — a pessoa vê o salário de todos abaixo dela no seu ramo, descendo até o fim, e nada lateral
- [ ] **VISI-02**: Permissão por registro em ocorrências — o gestor vê o disciplinar da própria equipe sem expor suspensão a quem abre qualquer ficha
- [ ] **CADS-01**: Telefone e e-mail corporativo em `rh.colaborador`
- [ ] **CADS-02**: Ficha pública mínima (nome, cargo, telefone, e-mail, líder atual, unidade) — vale também para a lista, não só para a ficha
- [ ] **CADS-03**: Nível hierárquico no cargo + regra de quem vê o quê
- [ ] **CADS-04**: Diversidade no padrão IBGE — campos autodeclarados além de gênero

### Painel executivo — filtro lateral

- [ ] **PNEX-01**: Filtro lateral aplicado às 24 consultas do painel — cada cartão honra o filtro OU marca visivelmente que não filtra; nunca ignora em silêncio
- [ ] **PNEX-02**: Cartões que batem no piso de anonimato (clima, eNPS, diversidade) exibem "recorte pequeno demais" em vez de vazar; paginação substitui o `LIMIT 500` que trunca calado

### Pesquisa com público-alvo (Onda M)

- [ ] **PESQ-01**: Ao criar a pesquisa, selecionar quem é elegível a responder (unidade, cargo, centro de custo, empresa ou seleção manual)
- [ ] **PESQ-02**: Público-alvo vale para pesquisa anual, pulse e eNPS
- [ ] **PESQ-03**: Adesão medida sobre o público-alvo, não sobre a empresa inteira

### Preparação para uso real (Onda N)

- [ ] **IMPT-01**: Importadores de carga inicial — RCF/cargos, unidades e locais de trabalho, headcount e dados cadastrais — viabilizando a carga em etapas (layout a combinar com o Diego)
- [ ] **GOLV-01**: Seeder / dados de fundação completos (catálogo de rubricas, checklist default, modelo de avaliação default, empresa/estabelecimento/CC exemplo) para o sistema abrir pronto para dados reais
- [ ] **GOLV-02**: Corrigir o corte do balde anônimo de pesquisas para America/Sao_Paulo antes da primeira pesquisa real (o `DEFAULT date_trunc` corta às 21h de Brasília e enfraquece o anti-reidentificação)

## v2 Requirements

<!-- Reconhecidos e diferidos; não estão no roadmap deste ciclo. -->

### Padrão Modelo — aplicações caras

- **MODL-02**: EPI e ASO por cargo — o único par onde o erro tem consequência fiscal (conversa própria)
- **MODL-03**: Cadeia de aprovação por valor / N níveis — mexe em autoridade e dinheiro; hoje a cadeia é fixa em 2 níveis

### Plataforma e folha oficial

- **PLAT-01**: Incorporação ao portal corporativo (Fase B) — inclui N3 (check-in de clima como pop-up no portal de vendas)
- **FOLH-04**: Cutover da folha própria para oficial após paridade comprovada
- **ESOC-01**: Transmissão eSocial em produção com certificado e-CNPJ próprio

## Out of Scope

Explicitamente excluído deste ciclo. Documentado para evitar scope creep.

| Feature | Reason |
|---------|--------|
| Fase B (portal) e clima pop-up (N3) | Diferido por ADR; depende da plataforma incorporada |
| Cutover da folha para oficial | Nasajon segue oficial; cutover só com paridade e fora de nov–jan (terceiro/tempo) |
| Transmissão eSocial ao vivo | Depende de certificado e-CNPJ + homologação restrita (terceiro) |
| Registrador de ponto próprio | Proibido (Portaria MTP 671/2021); REP-P homologado só para marcação |
| Correção retroativa dos baldes anônimos já gravados | Exigiria desligar a imutabilidade de tabela de pesquisa — o que a trava existe para impedir (pendência #6) |

## Dependencies (bloqueios de terceiros — não são requisitos, mas travam entrega)

| # | Assunto | Dono | Trava |
|---|---------|------|-------|
| 1 | Transferência entre CNPJs: rescisão ou continuidade | Guilherme | férias, aviso prévio |
| 2 | Saldo de banco de horas na transferência | Guilherme | fechamento contábil entre CNPJs |
| 3 | Limite concessivo de férias: 11 ou 12 meses | Guilherme | alerta de "dobro" na tela do titular |
| 4 | Folha: 5º dia corrido ou útil | Guilherme | indicador de prazo de fechamento |
| 5 | **Lista de rubricas + layout dos importadores** | **Diego** | **folha completa e a Fase 7 (IMPT-01)** |
| 6 | Balde anônimo já gravado com corte errado | Guilherme | nada hoje; conta na implantação (GOLV-02) |
| 7 | Benefício na transferência entre CNPJs: critério ainda barra | Guilherme | quem perde benefício ao mudar de CNPJ |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MODL-01 | Phase 1 | Pending |
| ADMS-01 | Phase 1 | Pending |
| RECR-01 | Phase 1 | Pending |
| RECR-02 | Phase 1 | Pending |
| CLIM-01 | Phase 1 | Pending |
| AVAL-01 | Phase 1 | Pending |
| FOLH-01 | Phase 2 | Pending |
| FOLH-02 | Phase 2 | Pending |
| FOLH-03 | Phase 2 | Pending |
| OLAC-01 | Phase 2 | Pending |
| DISC-01 | Phase 3 | Pending |
| DISC-02 | Phase 3 | Pending |
| POSS-01 | Phase 3 | Pending |
| COND-01 | Phase 3 | Pending |
| VISI-01 | Phase 4 | Pending |
| VISI-02 | Phase 4 | Pending |
| CADS-01 | Phase 4 | Pending |
| CADS-02 | Phase 4 | Pending |
| CADS-03 | Phase 4 | Pending |
| CADS-04 | Phase 4 | Pending |
| PNEX-01 | Phase 5 | Pending |
| PNEX-02 | Phase 5 | Pending |
| PESQ-01 | Phase 6 | Pending |
| PESQ-02 | Phase 6 | Pending |
| PESQ-03 | Phase 6 | Pending |
| IMPT-01 | Phase 7 | Pending |
| GOLV-01 | Phase 7 | Pending |
| GOLV-02 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-10*
*Last updated: 2026-08-10 after ingest (new-project-from-ingest)*
