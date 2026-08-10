---
review: benefits-inversion (ondas H1/H2/H5/H6)
commit: 8b7ff93
reviewed: 2026-08-10
depth: deep
files_reviewed: 9
files_reviewed_list:
  - db/migrations/0055_beneficio_e_ato_do_dp_com_valor_da_pessoa.sql
  - db/migrations/0056_dependente_pelo_proprio_colaborador.sql
  - src/dominios/beneficios/servico.ts
  - src/dominios/beneficios/esquemas.ts
  - src/app/api/beneficios/adesoes/solicitar/route.ts
  - src/dominios/portais/colaborador-servico.ts
  - src/dominios/portais/colaborador-esquemas.ts
  - src/app/api/portais/colaborador/dependentes/route.ts
  - src/app/api/portais/colaborador/dependentes/[id]/route.ts
  - src/app/portal-colaborador/portal-colaborador.tsx
findings:
  blocker: 0
  warning: 3
  info: 0
  total: 3
status: issues_found
---

# Review H1/H2/H5/H6 — inversão de benefícios + dependentes pelo colaborador

**Stance:** adversarial. Cada eixo do pedido foi tratado como suspeito até prova
em contrário. O veredito honesto: **nenhum blocker**. As seis frentes de foco
(IDOR, alvo da sessão, backfill da 0055, dinheiro NUMERIC, CPF fora do fio, 410
autenticado) estão sólidas e são apoiadas por prova. Restam três WARNINGs — dois
de robustez/dado e um de lacuna funcional.

---

## As seis frentes de foco — verificação (sem achado que as derrube)

**1. IDOR nos dependentes — DEFENDIDO.**
- Leitura (`GET`/`listarMeusDependentes`) filtra no servidor por
  `colaborador_id` da sessão (`colaborador-servico.ts:372`,
  `beneficios/repositorio.ts:940 WHERE colaborador_id = $1`).
- `PATCH`/`DELETE` reconferem o dono **dentro da transação, com a linha
  travada**: `linhaDoTitular` (`colaborador-servico.ts:400-410`) chama
  `buscarDependenteParaAtualizar` que faz `SELECT ... FOR UPDATE`
  (`repositorio.ts:976-982`) e compara `atual.colaborador_id !== colaboradorId`
  antes de escrever, tudo sob `comTransacao` que emite `BEGIN`/`COMMIT` de verdade
  (`lib/banco.ts:27-33`) — o lock sobrevive até o fim. Não há janela TOCTOU.
- Id de outra pessoa e id inexistente devolvem **o mesmo 404**
  (`colaborador-servico.ts:407`) — ausência, não máscara; `/dependentes/48` não
  revela que 48 existe.

**2. Nenhuma das quatro operações aceita `colaborador_id` — CONFIRMADO.**
Os esquemas de entrada do portal (`colaborador-esquemas.ts:401-420`) não têm o
campo; o alvo do INSERT sai de `colaboradorIdDoUsuario(sessao.usuario_id)`
(`colaborador-servico.ts:471`) e a tela envia só `{nome, nascimento, parentesco}`
(`portal-colaborador.tsx:508`). O furo `?colaborador_id=999` não tem por onde
nascer.

**3. Backfill da 0055 — vigência-correto e aborta com segurança.**
A subconsulta primária escolhe a versão cuja janela contém a **data de início da
adesão** (`0055:120-127`: `inicio_vigencia <= a.inicio AND (fim_vigencia IS NULL
OR fim_vigencia >= a.inicio) ORDER BY inicio_vigencia DESC`), nunca a ativa de
hoje; o fallback pega a versão mais antiga (`ORDER BY inicio_vigencia ASC`). Se
sobrar linha nula, o bloco `DO` faz `RAISE EXCEPTION` com os ids **antes** do
`SET NOT NULL` (`0055:168-185`), dentro do `BEGIN...COMMIT` — a migração inteira
reverte. Não inventa dinheiro.

**4. Dinheiro — NUMERIC e não-negativo nas duas pontas.**
API: `esquemaEfetivacaoAdesao` exige `valor` e `desconto` via `esquemaDinheiro`
com `.min(0)` (`beneficios/esquemas.ts:66,231-234`) — o caminho `?? valor_padrao`
foi removido do serviço (`servico.ts:874-877`). DB: `rh.adesao.valor/desconto`
são `NUMERIC(12,2) CHECK (... >= 0)` (`0009:95-96`) e passam a `NOT NULL`
(`0055:188-189`). Tríplice fechamento (esquema, serviço, banco).

**5. CPF fora do fio, e rastro de leitura correto.**
`projetarDependente` devolve só `cpf_informado: boolean`, nunca o número
(`colaborador-servico.ts:351-367`); a trilha grava "informado"/"removido"
(`diffDependente:445-450`). Titular lendo o próprio não gera
`audit.leitura_sensivel` — correto, a trilha existe para dado de terceiro
(`colaborador-servico.ts:456-460`), e o caminho do DP que grava a leitura não foi
tocado.

**6. Rota 410 exige permissão antes de responder.**
`exigirPermissao("adesao.solicitar")` roda **antes** do `throw ErroHttp(410)`
(`solicitar/route.ts:20-25`); chamador não autenticado recebe 401/403, não o 410.
Não vaza para anônimo.

---

## Warnings

### WR-01: A tela do portal não tem campo de CPF — o colaborador não consegue informar/corrigir/remover o CPF do dependente

**Arquivo:** `src/app/portal-colaborador/portal-colaborador.tsx:508`,
formulário `610-652`
**Cenário de falha:** O backend e o esquema suportam CPF por completo
(`esquemaMeuDependenteNovo.cpf`, `esquemaMeuDependenteEdicao.cpf`,
`inserirDependente`, `atualizarDependente`), e o comentário de projeto promete
que "para conferir o colaborador redigita; para tirar, limpa o campo"
(`colaborador-esquemas.ts:179-189`). Mas o formulário só coleta
`{ nome, nascimento, parentesco }` — **não existe input de CPF**. Consequência:
todo dependente cadastrado pelo próprio colaborador nasce com `cpf = null` e
nunca pode receber CPF por esta porta. Como o CPF do dependente é insumo de
eSocial/IRRF, o autosserviço entrega um cadastro pela metade — e a lista sequer
mostra `cpf_informado` (`portal-colaborador.tsx:566-597`), então o usuário não vê
que falta. Isso contradiz o desenho documentado e transfere de volta ao DP
exatamente o passo que a H5 queria eliminar.
**Correção:** acrescentar um `<input aria-label="CPF (opcional)">` opcional ao
formulário, ligá-lo ao estado, incluí-lo em `corpo` (enviando string vazia = "não
informado" para permitir remoção na edição), e exibir "CPF informado" na linha da
lista a partir de `dependente.cpf_informado`. O contrato de servidor já aceita
tudo isso sem mudança.

### WR-02: `nascimento` sem limite superior — data futura ou absurda é aceita no autosserviço

**Arquivo:** `src/dominios/portais/colaborador-esquemas.ts:381-386` (`esquemaData`);
DB `db/migrations/0009_beneficios.sql` (`nascimento DATE NOT NULL`, sem CHECK)
**Cenário de falha:** `esquemaData` valida só formato e parseabilidade — não que
a data seja passada nem plausível. Agora que a escrita é do próprio interessado,
sem o DP no caminho, um colaborador pode gravar `nascimento` no futuro
(`2035-01-01`) ou absurdamente antigo. O efeito fiscal é limitado (a consulta de
IRRF conta `d.nascimento <= competência`, `folha/repositorio.ts:452`, então data
futura apenas **deixa de contar** — auto-prejuízo, não exploit), mas é sujeira de
dado que só aparece meses depois no eSocial. Observação: o esquema do DP tem a
mesma lacuna (`beneficios/esquemas.ts:267`), logo isto **não é regressão** — mas a
H5 amplia a superfície ao abrir a escrita para 60+ usuários sem revisão.
**Correção:** adicionar `.refine((v) => v <= hojeSaoPaulo(), "Nascimento não pode
ser no futuro")` ao `esquemaData` (ou um esquema de nascimento dedicado). A régua
de "hoje" no fuso de exibição já existe em `hojeSaoPaulo()`.

### WR-03: `excluirDependente` faz DELETE cru, sem tratar a FK autorreferente `origem_dependente_id`

**Arquivo:** `src/dominios/beneficios/repositorio.ts:1014-1019`; FK em
`db/migrations/0048_transferencia_entre_empresas.sql:342`
**Cenário de falha:** `rh.dependente.origem_dependente_id REFERENCES
rh.dependente(id)` (sem `ON DELETE`, logo `NO ACTION`). Na transferência entre
empresas, o dependente do vínculo novo aponta para o do vínculo antigo. No fluxo
atual isto é **inalcançável** pelo portal — o colaborador só apaga dependente do
vínculo corrente (o mais novo), e o corrente nunca é origem de cópia, então o
DELETE nunca bate na FK; a defesa de escopo por si já protege. Mas
`excluirDependente` não envolve o DELETE em tratamento de violação de constraint:
se um dia o invariante mudar (nova ordem de cópia, dependente compartilhado), a
exclusão vaza um erro de banco cru como 500 em vez de um 409 com mensagem. É
robustez latente, não bug ativo.
**Correção:** envolver o DELETE no mesmo padrão de `violacaoUnica`/erro-de-FK já
usado em `efetivarAdesao` (`servico.ts:888-896`) e devolver 409 ("Este dependente
está vinculado a outro registro e não pode ser removido por aqui") em vez de
propagar o erro do PostgreSQL.

---

## Nota de contexto (não é achado)

- **`dependente.proprio.manter` × H1:** a 0056 concede a chave copiando os papéis
  que hoje têm `adesao.solicitar` (`0056:83-86`), com trava anti-vazio
  (`0056:91-103`). A chave `adesao.solicitar` continua existindo e concedida (a
  própria rota 410 a exige, e o portal a usa como gate do bloco de benefícios), então
  a cópia acha os papéis. O `dp` só recebe a chave se tiver `adesao.solicitar`; se
  não tiver, o bloco de dependentes do portal do DP fica oculto, mas o DP mantém a
  via própria (`/api/beneficios/dependentes`). Efeito de exibição, não de segurança.

---

_Reviewed: 2026-08-10 · Reviewer: Claude (gsd-code-reviewer) · Depth: deep_
