# Ficha de Transferência — Conhecimento do Portal → novo Sistema de RH/DP

> **O que é isto:** dossiê autocontido com o conhecimento acumulado sobre o Portal de Vendas
> da Fast (repo `DCSEmpresarial/application`) e sobre o método de trabalho, **curado pelo que
> é relevante** para construir o novo sistema de RH/DP. Cole no início do projeto novo (ou no
> arquivo de contexto/memória dele) para não reexplicar tudo do zero.
>
> **Escopo do projeto novo:** sistema completo de RH — Avaliação 360, controle de ponto,
> controle de clima, controle de folha, fechamento de folha, histórico do funcionário, e o
> que mais DP/RH precisar.
>
> **Data de corte:** 20/07/2026. Verificar no repositório antes de assumir que algo continua igual.

---

## 1. Ponto de partida honesto: o que o portal tem e o que não tem

- **NÃO existe** no portal hoje: folha, ponto, clima, avaliação (a 360 é iniciativa à parte da
  btime — ver §5), nem qualquer integração com sistema de RH. Do lado **funcional** de RH, é greenfield.
- **EXISTE e é ouro reaproveitar:** a **plataforma** — autenticação, RBAC, RLS, auditoria,
  cadastro de usuários, multiunidade, tema, primitivos de UI. Não reconstrua isso; herde.

A primeira decisão estratégica do projeto novo é justamente essa: **o sistema de RH é um
módulo dentro do portal, ou um app separado que reusa a base de identidade/RBAC do portal via
SSO?** Os dois caminhos são válidos; a escolha define o resto. (A btime, na 360, foi por app
separado com stack própria — e isso trouxe divergência visual; ver §5.)

---

## 2. Stack e arquitetura do portal (o que herdar)

**Monorepo.** Front e back convivem.

| Camada | Tecnologia |
|---|---|
| Front | Next.js 16 (App Router) · React 19 · Emotion · TypeScript |
| Back | FastAPI · Python 3.12 · asyncpg (driver assíncrono) · Redis |
| Banco | PostgreSQL com **RLS por transação** (`SET LOCAL app.usuario_id/organizacao_id`) |
| Integrações | SAP Service Layer (via usuário INTEGRADOR) · NFC-e Focus · PipeRun · HANA (BI) · n8n (webhooks/e-mail/2FA) |
| Migrations | SQL numeradas em `docs/banco/` (já passou de 113) |

**Padrão de domínio no backend** — `backend/app/dominios/<dominio>/`, 4 camadas fixas:
`rotas.py` (orquestra, fina) → `servico.py` (regra de negócio) → `repositorio.py` (queries
asyncpg, prepared statements — concatenar SQL é proibido) → `esquemas.py` (Pydantic).
O transversal fica em `nucleo/`: `banco.py` (pool + transação por request), `rbac.py`,
`seguranca.py` (JWT em cookie httpOnly + 2FA), `redis_cliente.py`.

**Front** — `src/features/<dominio>/` (um domínio por pasta, nomes pt-BR), primitivos
reutilizáveis em `src/components/ui` (Input, InputMoeda, Select, SelectBusca, CampoData,
CampoAnexos, Modal, ModalConfirmacao, Tabela, BadgeStatus, Avatar…), cliente HTTP único em
`src/services/api.ts` (timeout, refresh silencioso de sessão no 401).

**Convenções de código** (valem no projeto novo para manter coerência):

- Rotas e domínios em **pt-BR**; pastas técnicas de infra em inglês (`components`, `hooks`, `lib`).
- **Poucos comentários** — só onde o "porquê" não é óbvio.
- Cores **sempre por token semântico** (`theme.colors.semantic.*`) para funcionar claro/escuro.
- Moeda e data **sempre** via `Intl.NumberFormat`/`DateTimeFormat` pt-BR.
- Imports por barrel e alias `@/…`.

---

## 3. O que o portal já tem que toca RH (não reconstruir)

Domínios existentes que o sistema de RH **consome ou reaproveita**, não recria:

| Domínio no portal | Para o RH serve como |
|---|---|
| `usuarios` + RBAC no banco | Base de identidade e permissão. Já tem **8 cargos** (migration `72-rbac-8-cargos`), `sistema.tem_permissao(uid, chave)`, papel `admin_ti` como superusuário. |
| `perfil`, `avatar`, `foto-perfil` | Perfil do colaborador, foto. |
| `metas` (comercial) | Precedente de meta por pessoa/escopo — modelo relevante p/ avaliação de desempenho. |
| `gamificacao`, `ranking`, `conquistas`, `recompensas` | Engajamento/reconhecimento — adjacente a **clima** e a trilhas de desenvolvimento. |
| `monitoramento`, schema `audit` | Auditoria já existe como padrão do portal (ver §6). |
| Multiunidade / organização | O portal já opera com 5 unidades e escopo por organização — o RH é naturalmente multiunidade. |

**RBAC/RLS** são o ativo mais valioso a herdar: em RH, "vendedor vê o seu, gestor vê a equipe,
RH vê tudo, auditor só lê" é exatamente o modelo que o portal já resolve no banco.

---

## 4. Integrações que importam para RH (o mapa)

> **Origem da informação:** os nomes abaixo vêm do **discovery da btime** para a Avaliação 360
> (documento TO-BE + mockup), **não** do portal — o portal ainda não integra nenhum deles.
> Validar contrato/endpoint/versão antes de depender.

- **Nasajon** — sistema de folha/DP da empresa. No discovery da 360 é a fonte de **faltas,
  atrasos, licenças e advertências**. Para os módulos de **folha e ponto**, é o candidato a
  **fonte de verdade** — provavelmente você **integra**, não reimplementa o cálculo de folha
  (ver alerta em §9).
- **Sults** — módulo de universidade/treinamento. Fonte de **trilhas e histórico de
  treinamento** (relevante para desenvolvimento e histórico do funcionário). Ressalva do
  discovery: **não havia API do módulo universidade** — links eram inseridos manualmente.
- **SAP / DW (SAP_MIRROR)** — o data warehouse de vendas está acessível (somente leitura:
  vendas, compras, financeiro, estoque, margem). **Cuidado:** dado de **RH não está nesse DW**
  — ele é de vendas/financeiro. Útil no máximo para cruzar desempenho comercial × avaliação.
- **n8n** — orquestrador de webhooks já usado no portal (2FA, e-mail). Reutilizável para
  notificações de RH (alerta de ponto, aviso de fechamento, etc.).

---

## 5. Avaliação 360 — estado do conhecimento (já é um dos módulos)

A 360 foi tocada pela **btime** (consultoria externa), com **discovery + spec funcional
(TO-BE) + mockup HTML clicável**. O que já sabemos:

**Modelo de negócio:**

- 3 pilares — **Dever** (30%), **Desenvolvimento/CHA do cargo** (40%), **Fit Cultural**
  (9 valores, 30%). Escala 1–5, pesos parametrizados pelo RH.
- Faixas de resultado (flags): 0–40% desligar/recuperar · 40–60% atenção · 60–80% desenvolver
  p/ liderança · 80–100% sucessão. **A flag é recomendação; a decisão é humana e exige
  justificativa se divergir.**
- **Rollout faseado por feature flag**: Fase 1 líder→liderado (MVP), Fase 2 feedback/PDI/Card,
  Fase 3 360 completo (pares, autoavaliação). Arquitetura 360-nativa desde o início.
- Ciclos: Experiência (45/90 dias) e Desempenho (semestral a partir do dia 1 da admissão).
- **Toda regra é dado administrável pelo RH** (pilares, indicadores, pesos, faixas,
  periodicidade) sem depender de dev — e mudança vale só para ciclos abertos depois dela.

**Cuidados que a btime já mapeou (bons, manter):**

- **LGPD por design**: o "Card do Colaborador" nasce privado; dado sensível (advertências,
  licenças, notas brutas, decisão de desligamento) fica **estruturalmente fora** do que é
  compartilhável.
- **Ciência digital** com hash substitui assinatura física.

**Alerta de integração/visual:** o mockup da btime usa stack e identidade visual **diferentes
do portal** (teal/indigo, fontes Inter/Space Grotesk; o portal é vermelho `#d21217`,
Instrument Sans/Lora). Se a 360 for viver dentro do sistema de RH que segue o portal, **precisa
ser re-skinada**. Decisão pendente: aproveitar o trabalho da btime (pedir o TO-BE e o código)
ou refazer no padrão do portal. **Recomendação registrada anteriormente:** a spec/discovery da
btime é o ativo de valor; o HTML é reproduzível rápido.

---

## 6. Padrões técnicos que valem migrar (a "inteligência" de método)

Estes padrões foram desenhados/validados nesta sessão e são **diretamente aplicáveis** aos
módulos de RH, vários deles críticos:

**1. Log de auditoria append-only** (crítico para histórico do funcionário e folha)

- Nunca edita nem apaga; cada ação grava uma linha imutável.
- Verbos padronizados numa constante única (evita "editou"/"editar" espalhados).
- **Diff campo a campo** na edição, gravando o **rótulo legível já resolvido** (não IDs crus),
  para o log continuar auto-explicativo mesmo se o dado mudar depois.
- **Fuso:** gravar em **UTC**, exibir com `timeZone: "America/Sao_Paulo"` **explícito** (sem
  isso, servidor em UTC mostra horário 3h adiantado).
- Imutabilidade real vem do banco: tabela **só INSERT**, sem GRANT de UPDATE/DELETE ao usuário
  da aplicação (schema `audit` do portal já faz isso).

**2. Versionamento de regra com vigência** (crítico para folha e avaliação)

- Regra (tabela de cálculo, pesos, rubricas) é **versionada**: cada versão tem vigência,
  responsável, status (rascunho→ativa→encerrada).
- **Sem recálculo retroativo**: cálculo antigo fica ligado à versão da época; ativar nova versão
  encerra a anterior. Fechamento de folha de um mês **não pode** mudar quando a regra muda depois.
- O portal já faz isso no domínio `imposto` (migrations 53/84/91) — é o molde.

**3. RBAC no banco + RLS por transação** — herdar do portal, não inventar paralelo.
Permissão por chave (`folha.fechar`, `ponto.ajustar`, `avaliacao.configurar`, `rh.auditar`),
exposta como dependency na rota. Dado sensível nunca sai do backend para o front.

**4. Ocultação de dado sensível por perfil** — o front recebe só o que a rota autoriza;
componentes internos (salário, avaliação bruta, advertência) jamais no payload de quem não pode ver.

**5. Cache com TTL + chave legível** (se houver consulta externa cara) — chave humana/auditável,
TTL separado por volatilidade do dado, invalidação manual além da automática. (Padrão desenhado
para a calculadora de frete; reaproveitável se algum módulo consultar API externa.)

---

## 7. Método de trabalho (como conduzimos aqui — replicar)

- **Protótipo primeiro, código depois.** Cada ferramenta nasceu como **HTML standalone,
  arquivo único, sem dependências, dados em `localStorage`**, com **acesso simulado por seletor**
  (ex.: vendedor × gerente) e seguindo os **tokens do design system do portal**. Serve para
  validar fluxo/tela com o usuário real **antes** de escrever qualquer linha no repositório —
  erro de fluxo é 100× mais barato de corrigir nessa fase.
- **Validar antes de integrar.** Prototipar → testar com quem usa → só então codar.
- **Repositório do portal é read-only** até autorização **expressa** para desenvolver. Nada de
  commit/push/branch/migration sem o "pode codar".
- **Erros e melhorias** encontrados no repo vão para um arquivo de **sugestões**, não para dentro do repo.
- **Log de decisões**: decisões técnicas/de produto e o **porquê** são registrados antes de a
  conversa comprimir (skill `decision-logger`). Migrar esse hábito para o projeto novo.
- **Estilo de comunicação** do usuário (skill `tamdor-comunicacao`, global): direto e técnico,
  sem elogio de abertura, aponta erro na hora com base e alternativa. Vale no projeto novo também.

---

## 8. Design system (para os protótipos do RH ficarem visualmente coerentes)

- **Primária:** `#d21217` (vermelho Fast), hover `#bd1015`.
- **Tokens semânticos** claro/escuro: background, surface, text, textMuted, border, success,
  warning, danger, info — sempre via variável, nunca hex cru em componente que deve inverter.
- **Fontes:** Instrument Sans (texto), Lora (secundária). Mono só para dado técnico.
- **Moeda/data:** `Intl` pt-BR. Números em coluna: `tabular-nums`.
- **Gráficos** (se houver dashboard de clima/folha): usar paleta validada para daltonismo/
  contraste — vermelho `#b91c1c`/azul `#3b82f6` (claro), `#ef4444`/`#3b82f6` (escuro); nunca
  depender só de cor (rótulo numérico sempre presente).

---

## 9. Alertas de domínio — onde o RH é DIFÍCIL (não subestimar)

O RH não é um CRUD. Os pontos abaixo mudam prazo, risco e a decisão "construir × integrar":

- **Folha e ponto = alta complexidade regulatória.** CLT, **eSocial**, **Portaria MTP 671/2021**
  (registro de ponto/REP, tratamento de marcações), convenções coletivas por categoria,
  proventos/descontos/encargos, 13º, férias, rescisão. Errar tem **passivo trabalhista**.
  → **Fortíssima recomendação:** folha provavelmente se **integra** (Nasajon ou equivalente),
  não se reimplementa. Avaliar isso **antes** de qualquer linha de código.
- **LGPD pesada.** RH concentra dado sensível: saúde (atestados), **biometria** (ponto),
  avaliações, advertências, salário. Privacidade por design, minimização, trilha de acesso,
  base legal. Isto é requisito, não "nice to have".
- **Imutabilidade e auditoria são obrigatórias**, não opcionais — fechamento de folha, ajuste
  de ponto, registro de avaliação: tudo precisa de trilha (§6.1) e de versão de regra (§6.2).
- **Clima** costuma exigir **anonimato** (pesquisa de clima identificável enviesa a resposta) —
  desenho de dado oposto ao resto do RH; separar desde o início.
- **Histórico do funcionário** é a espinha que amarra tudo (admissão, cargos, avaliações,
  ocorrências, treinamentos, folha) — modelar a linha do tempo do colaborador cedo, porque
  todo módulo pendura nela.

---

## 10. Primeiros passos sugeridos no projeto novo

1. Decidir a **plataforma**: módulo no portal × app separado com SSO/RBAC do portal (§1).
2. Modelar primeiro o **histórico/ficha do funcionário** — é o eixo de que os módulos dependem (§9).
3. Para **folha e ponto**: mapear Nasajon (o que expõe via API, o que é fonte de verdade) e
   decidir **integrar × construir** antes de prototipar (§4, §9).
4. Para **avaliação 360**: pedir à btime o **TO-BE e o código**; decidir reaproveitar × refazer
   no padrão do portal (§5).
5. Trazer para o projeto novo os padrões de **auditoria append-only** e **versionamento de
   regra** desde a fundação (§6) — são baratos no início e caríssimos de retrofitar.
6. Manter o método: **protótipo standalone → validar com DP/RH → codar só com autorização** (§7).

---

*Fim da ficha. Fontes deste conhecimento: análise read-only do repo `DCSEmpresarial/application`;
documento TO-BE e mockup da Avaliação 360 (btime); decisões registradas em
`00_contexto/decisoes_arquiteturais.md` do projeto "artefatos auxiliar".*
