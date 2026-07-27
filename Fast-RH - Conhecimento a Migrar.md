# Ficha de conhecimento — o que migrar do projeto Fast-Agente para o novo Sistema de RH

Documento de transferência de conhecimento. Reúne o que aprendemos construindo o
Fast-Agente / portal de atividades e que é **relevante para o novo sistema de RH**
(avaliação 360, ponto, clima, folha, fechamento de folha, histórico do funcionário).

Organizado em: (1) o que **reaproveitar**, (2) o que **NÃO repetir**, (3) armadilhas
técnicas já conhecidas, (4) recomendações específicas para RH.

---

## PARTE 1 — Ativos e conhecimento que valem migrar

### 1.1. O "módulo de pessoas" JÁ é meio RH pronto
Construímos um módulo de gestão de pessoas que se sobrepõe muito ao que um RH precisa.
Vale portar o **modelo de dados e as regras**, não o código (que era baseado em Gist):

- **Ficha do colaborador:** nome, papel/cargo, retrato atual, contexto histórico, status,
  data de entrada no time, `ultimo_feedback_formal`.
- **Os 9 Valores Fast** (framework de competências da empresa) — servem de base para a
  **avaliação 360**: resultado, velocidade, determinação, desenvolvimento, disciplina,
  resiliência, colaboração, comunicação, reconhecimento. Cada um pontuado 1–5, com nota
  de contexto e data. Já existe um documento com os descritores de cada nível
  (`fast_kb_valores_fast.md`) — é a régua de avaliação, migrar tal e qual.
- **Ocorrências:** registro datado de fatos (positivo/negativo/neutro/alerta), com
  impacto, causa provável, ação combinada e valores relacionados. É o histórico factual
  que alimenta 360 e histórico do funcionário.
- **Ações abertas por pessoa** (acompanhamento com prazo e status).
- **Feedback formal:** histórico + a regra do **ciclo de 90 dias** (alerta quando passa do
  período recomendado). Isso é processo de RH pronto.
- **Entrevista de criação de ficha** já desenhada (papel + retrato + passada pelos 9 valores).

> Reaproveitar: o schema `colaboradores`, `valores_fast`, `ocorrencias`, `acoes_abertas`,
> `feedback_formal` (já existe DDL PostgreSQL em `backend/schema.sql` do projeto atual).

### 1.2. A arquitetura-alvo que já validamos (use desde o dia 1 no RH)
```
Usuário ──(app/agente)──► lógica/IA ──► Conector (ferramentas) ──┐
                                                                  ├─► API ─► PostgreSQL
Usuário ──(navegador)───► Portal web ────────────────────────────┘
```
- **PostgreSQL** como fonte única (a empresa já tem o dedicado na SaveinCloud, sem custo extra).
- **API (Node/Next.js)** dona de TODAS as regras e do controle de acesso — único caminho
  que escreve no banco.
- **Portal Next.js + TypeScript** para as telas (o time domina esse stack).
- Opcional: **assistente Claude via conector MCP** para partes conversacionais (ex: um
  agente de DP que responde dúvidas do funcionário, coleta clima, lembra de bater ponto).

### 1.3. Modelo de controle de acesso (crítico para RH)
Decidido e validado: **cada pessoa vê só o que é dela; papéis com visão ampliada.**
No RH isso é ainda mais sério (folha, avaliações, ponto são sensíveis). Migrar o padrão:
- Papel por usuário (`funcionario`, `gestor`, `rh`, `dp`, `admin`).
- A API valida acesso em TODA chamada; a camada de cima nunca decide acesso.
- Dado sensível de folha/avaliação: acesso mínimo por papel + trilha de auditoria.

### 1.4. Módulo de Demandas (pessoa → pessoa) — reaproveitável
Já construímos demandas entre pessoas (solicitante → executor, com status, prazo,
prioridade). No RH serve para: solicitações de documentos, aprovações de férias/ponto,
pendências DP → funcionário. Schema `demandas` pronto em `backend/schema.sql`.

### 1.5. Dados e contexto organizacional
- **Cultura de registro** já criada (gestores registrando o dia) — base para adesão ao ponto/clima.
- **Data Warehouse SAP (SAP_MIRROR)** disponível via conector: vendas, compras, financeiro,
  estoque. Relevante para **folha/financeiro** (integração de custos, centros de custo) —
  vale mapear o que já existe lá antes de recriar.

---

## PARTE 2 — O que NÃO repetir (lições que custaram caro)

### 2.1. NUNCA usar um Gist/arquivo JSON como banco
O sistema atual guardava dados num GitHub Gist e o agente escrevia JSON direto. Resultado:
**perda de dados 4×** (o agente sobrescrevia o arquivo e, em falha, apagava histórico),
recuperações trabalhosas via histórico de revisões (que expira em 30 revisões), e nenhuma
consulta/transação. Em RH — com folha e ponto — isso seria catastrófico e provavelmente ilegal.
**Comece com banco relacional de verdade. Sem exceção.**

### 2.2. Gravação SEMPRE append/transacional — nunca "reescrever a coleção"
A causa raiz das perdas foi **substituir o conjunto inteiro** a cada escrita. Regra de ouro
para o RH: toda escrita é **INSERT/UPDATE de item, dentro de transação**; nada de "ler tudo,
montar de novo, gravar por cima". Para dados de RH, adicionar **trilha de auditoria**
(quem mudou o quê, quando) — em folha/ponto isso é obrigatório, não opcional.

### 2.3. Não deixar lógica de negócio "na mão" da camada de IA/cliente
Cálculo de datas (semana), escape de JSON, etc. estavam duplicados em 4 lugares e divergiam.
**A API é a dona única da lógica.** Cálculos sensíveis de RH (horas, faltas, proventos,
descontos) devem viver num único lugar testado — nunca no prompt do agente nem no front.

### 2.4. Não depender de scripts locais por máquina
Instaladores, scripts PowerShell e lembretes por máquina deram muito atrito (antivírus,
GPO corporativa, encoding). No RH, prefira **web + backend central**; nada que exija instalar
e manter script na máquina de cada funcionário.

---

## PARTE 3 — Armadilhas técnicas já mapeadas (economize o retrabalho)

- **Antivírus (Avast) bloqueia PowerShell** que faz loop + rede + lê credenciais (heurística
  de comportamento, falso positivo). Outro motivo para não usar scripts locais.
- **PowerShell 5.1 + acentos:** todo `.ps1` com acento precisa de BOM UTF-8, senão vira mojibake.
- **CDN único = ponto de falha:** o portal quebrou quando o `unpkg.com` caiu. Se usar libs via
  CDN, ter fallback (jsdelivr/cdnjs) — ou empacotar no build (melhor).
- **Associação de arquivo:** `.html` associado ao Word abre "em branco". Servir como web app, não arquivo.
- **Token com escopo excessivo circulando:** o token do GitHub tinha acesso admin total e
  vazava em vários lugares. No RH, **segredos no servidor** (variáveis de ambiente/secret manager),
  nunca embutidos em cliente ou repo.
- **GitHub Gist history expira** (30 revisões / poucos dias com volume alto) — não serve de backup.
  RH precisa de **backup automático do PostgreSQL** desde o dia 1.

---

## PARTE 4 — Recomendações específicas para o Sistema de RH

### 4.1. Mapa domínio → o que reusar
| Módulo do RH | Reaproveita do Fast-Agente | Novo (construir) |
|---|---|---|
| **Avaliação 360** | 9 Valores Fast + ocorrências + feedback formal + ciclo 90d | Fluxo 360 (pares/gestor/auto), pesos, ciclos |
| **Histórico do funcionário** | ficha + ocorrências + feedback + ações abertas | Documentos, admissão/demissão, cargos/salário |
| **Controle de clima** | cultura de registro + coleta conversacional | Pesquisas periódicas, eNPS, anonimato |
| **Controle de ponto** | — | Marcação, jornada, banco de horas, geolocalização |
| **Folha / fechamento** | integração financeiro (DW SAP) | Proventos/descontos, rubricas, cálculo, eSocial |
| **Demandas DP↔funcionário** | módulo de demandas pronto | Aprovações, workflow |

### 4.2. Princípios inegociáveis para RH (mais rígidos que no projeto atual)
1. **Banco relacional + transações + auditoria** desde o início (dados com efeito legal/financeiro).
2. **Backup automático** do banco (folha e ponto não podem "sumir").
3. **Controle de acesso e privacidade** por papel, com trilha (LGPD: dado de funcionário é sensível).
4. **Lógica centralizada e testada** (cálculo de folha/ponto é onde erro custa dinheiro e processo).
5. **Nada de arquivo-como-banco, nada de escrita por sobrescrita.**

### 4.3. Onde a IA (Claude) agrega no RH
Não como banco nem como regra de folha (isso é backend determinístico), mas como **camada de
conversa e apoio**: coletar clima em linguagem natural, preparar avaliações 360 a partir do
histórico, responder dúvidas de DP, resumir o histórico de um funcionário para o gestor,
lembrar de pendências. Mesmo padrão validado: **IA conversa, backend guarda e calcula.**

### 4.4. Stack e time (já estabelecidos)
- **Next.js + TypeScript, Node.js, PostgreSQL (SaveinCloud).** Time de 3 devs.
- Reaproveitar a estrutura de projeto do `backend/` do Fast-Agente como **molde** (API +
  conector + portal + migração + testes já existem como referência de como organizar).

---

## Onde estão os artefatos originais (para consulta)
Repositório `fast-agente` (privado), pasta `backend/`:
- `schema.sql` — DDL das tabelas (colaboradores, valores, ocorrências, feedback, demandas…).
- `ESPEC-BACKEND.md` / `ESPEC-DEMANDAS.md` — contratos e regras.
- `api-referencia/` — API Node de referência.
- `base-conhecimento/fast_kb_valores_fast.md` — descritores dos 9 valores (régua de avaliação).
- `modulos/pessoas.md` — regras do módulo de pessoas / entrevista / feedback 90 dias.

**Resumo em uma frase:** migre o *modelo de pessoas e a régua de valores* (é RH pronto), migre
as *lições de integridade e arquitetura* (banco de verdade, append, API dona da lógica,
acesso por papel), e **não** migre nada da camada Gist/scripts — no RH, com folha e ponto,
os erros do projeto atual seriam graves demais para repetir.
