# Coding Conventions

**Analysis Date:** 2026-08-10

## Language & Naming

**Primary Language:** TypeScript (src/)

**Portuguese Naming Throughout:**
- File names and module structure use Portuguese domain language
- Module pattern: `esquemas.ts` (types & validation), `repositorio.ts` (database), `servico.ts` (business logic), `calculo.ts` (pure engines)
- Examples: `beneficios/esquemas.ts`, `ponto/repositorio.ts`, `folha/calculo.ts`

**Identifier Conventions:**
- **Functions:** camelCase (e.g., `criarSessao`, `apurarPonto`, `calcularFolha`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `DURACAO_SEGUNDOS`, `HOJE_SP`)
- **Types/Interfaces:** PascalCase (e.g., `PayloadSessao`, `EntradaMotor`, `ResultadoMotor`)
- **Type arrays/tuples:** `as const` pattern for strict type inference
  - Example: `export const STATUS_ADESAO = ["ativa", "suspensa", "cancelada"] as const;`
- **Rótulo maps:** `ROTULOS_<DOMAIN>` pattern for display labels
  - Example: `ROTULOS_CATEGORIA`, `ROTULOS_STATUS_ADESAO`, `ROTULOS_PARENTESCO`

## Import Organization

**Order of Imports:**
1. Node.js built-ins (e.g., `import { test } from "node:test"`)
2. External packages (e.g., `zod`, `pg`, `next/*`, `react/*`)
3. Relative imports from `src/lib/`
4. Relative imports from `src/dominios/`
5. Local domain imports (same directory)

**Path Aliases:**
- Use `@/` prefix for src-relative imports
- Example: `import { esquemaCriacaoDependente } from "@/dominios/beneficios/esquemas"`

**No Default Exports:**
- All exports are named exports
- This enables tree-shaking and precise dependency tracking

## Code Style

**Formatting:**
- Built into eslint-config-next (Next.js conventions)
- No separate Prettier configuration; eslint enforces style
- 2-space indentation (implicit, inherited from Next.js defaults)

**Linting Rules:**
- ESLint 9 with Next.js core + TypeScript configs
- Compiled TypeScript for tests via `tsconfig.testes.json`

## Three Enforced Business Rules (ESLint)

These are custom rules in `fast-pessoas/eslint-regras/` that enforce critical business logic. They appear in every code review because the cost of violating them has been measured in production.

### Rule 1: `literal-em-formulario` — Forms Never Start Chose

**Problem it solves:** Fields with hardcoded business values send data to POST without user action. Days-off and bonuses sent to POST without interaction; turnover hardcoded at 20% for the normal case.

**What it catches:**
- Number literal in `useState()` outside of {0, 1, -1}
  - ✓ `useState(0)`, `useState(1)`, `useState(-1)` — interface neutrals
  - ✗ `useState(30)`, `useState(220)`, `useState(0.2)` — business values
- Non-empty literal in `defaultValue` attribute
  - ✗ `defaultValue="anual"`, `defaultValue={20}`
  - ✓ `defaultValue=""`, `defaultValue={0}`

**Apply when:** Every form component. Start empty. Bring values from parameters.

### Rule 2: `acesso-por-chave` — Access by Permission Key, Never by Role Name

**Problem it solves:** 2FA exigido by role name. A checkbox could grant access to 70 confidential files because role → permission mapping is edited in real time by admin, but the code checked role names against a hardcoded list.

**What it catches:**
- `papel === "dp"` — ✗ (role comparison)
- `sessao.papel !== "admin"` — ✗ (role comparison)
- `switch (sessao.papel) { case "gestor": }` — ✗ (role switch)
- `["admin", "dp"].includes(sessao.papel)` — ✗ (role in list)

**What it allows:**
- `aba === "admin"` — ✓ (not papel, just word collision)
- `nivel === "diretoria"` — ✓ (workflow step, not papel)
- Anti-lockout checks in `usuarios/servico.ts` — ✓ (exempted, prevents admin lockout)

**Apply when:** Every access decision inside routes. Query by `sistema.tem_permissao(sessao.usuario_id, "chave.especifica")`.

### Rule 3: `sem-parsefloat` — No parseFloat in Domain or Seeders

**Problem it solves:** Preventive rule. `parseFloat("1,5")` silently returns 1 (should be 150 centavos). Summing time in float once returned 346.90999999999997.

**What it catches:**
- `parseFloat(value)` anywhere in code
- `const parse = parseFloat; parse(x)` — deferred calls too
- `Number.parseFloat(value)`, `globalThis.parseFloat(value)`

**Why it applies:**
- Money lives in centavos (integer)
- Time lives in minutos (integer)
- `parseFloat` invites float into integer-only domains

**Apply when:** All domain code in `src/dominios/` and seeding in `db/semear/`.

## Data Representation

**Money:**
- Always centavos (integer)
- Schema validation rounds to 2 decimal places: `Math.round(valor * 100) / 100`
- Formula applies: `valor * 100` to store, `valor / 100` to display
- Example in `beneficios/esquemas.ts:63-68`:
```typescript
function esquemaDinheiro(frase: string) {
  return z.number()
    .transform((valor) => Math.round(valor * 100) / 100);
}
```

**Time:**
- Always minutos (integer)
- Noturnal hour reduction is 3150 seconds (not 3600)
- Tolerance in entrada/saída measured in minutes
- Example in `ponto/calculo.ts`: `hora_noturna_segundos: 3150`

**Dates:**
- Format: `AAAA-MM-DD` string (ISO 8601)
- Civil dates read in `America/Sao_Paulo` timezone
- Helper: `rh.hoje()` function returns date string in SP timezone
- Example in `beneficios/repositorio.ts:17`: `const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date"`

## Error Handling

**Error Types:**

`ErroHttp` (from `src/lib/sessao.ts:12`):
```typescript
export class ErroHttp extends Error {
  constructor(
    public readonly status: number,
    mensagem: string
  ) {
    super(mensagem);
    this.name = "ErroHttp";
  }
}
```

`ErroHttpCampo` (field-specific, thrown with field name):
```typescript
throw new ErroHttpCampo(400, "Mensagem", "nome_do_campo");
```

**Error Handling Pattern:**
```typescript
try {
  // business logic
} catch (erro) {
  return responderErro(erro);
}
```

**Guard Functions:**
- `exigirSessaoValida(sessao)` — validates session exists and 2FA complete
- `exigirVigenciaNaoFutura(cliente, data)` — prevents future-dated records
- Guards are pure where possible (no cookie/db) to enable testing

## Comments

**When to Comment:**

Comments document **cost**, not code. From `AGENTS.md`:
> "Cada uma tem um defeito real que a pagou. O detalhe está em [docs/14-mapa-de-eixos.md]; o número no comentário é o que impede alguém de apagar o teste por achar que é detalhe."

**Format:**
- Cost (production impact) documented in file headers
- Test comments cite the onda/issue that forced the test to exist
- Exemplary comment from `tests/ponto.test.ts:21-24`:
```typescript
// Cada `test` que cita um valor em reais reproduz defeito que ESTEVE em
// produção neste projeto. O número no comentário é o que ele custou — é o que
// impede alguém de apagar o caso por achar que é detalhe de relógio.
```

**JSDoc/TSDoc:**
- Used sparingly for public APIs
- Example from `src/lib/vigencia.ts:14-30`: long business-rule justification as comment block

## Module Design

**Barrel Files (index.ts):**
- Used in some domains but sparse
- Prefer direct imports by necessity (tree-shaking)

**File-to-Responsibility:**
- `esquemas.ts`: Zod validation schemas + types derived from schemas + type arrays (as const) + label maps
- `repositorio.ts`: SQL queries + type mapping (LinhaX → DomainX) + data access layer
- `servico.ts`: Business logic + validation gates + transaction orchestration
- `calculo.ts` (when present): Pure functions, no side effects, testable independently

**Exports Pattern:**
```typescript
// esquemas.ts
export const STATUS_ADESAO = ["ativa", "suspensa", "cancelada"] as const;
export type StatusAdesao = (typeof STATUS_ADESAO)[number];
export const esquemaNovaRegra = z.object({...});
export type NovaRegra = z.infer<typeof esquemaNovaRegra>;

// repositorio.ts
export async function buscarBeneficio(cliente, id): Promise<BeneficioComRegra>
export async function atualizarStatusAdesao(cliente, adesaoId, status)

// servico.ts
export async function criarDependente(sessao, pode, ajuste)
export async function cancelarAdesao(sessao, adesaoId, motivo)
```

## Validation (Zod)

**Pattern:**
- Schema definition in `esquemas.ts`
- Type derived with `z.infer<typeof schema>`
- Validation at entry points (routes, service functions)
- `.safeParse()` for recoverable errors, `.parse()` for catastrophic

**Example from `beneficios/esquemas.ts:51-80`:**
```typescript
const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");

function esquemaDinheiro(frase: string) {
  return z.number()
    .min(0, "Valor não pode ser negativo")
    .max(9_999_999, "Valor acima do limite")
    .transform((valor) => Math.round(valor * 100) / 100);
}
```

## The Ten Axes (Embedded Conventions)

The codebase enforces 10 cross-cutting business rules via code review and lint. These are not style; they are consequences of production failures:

1. **pessoa × vínculo** — One person can have multiple contracts. Count people, not contracts.
2. **identidade de lugar** — Location identified by ID, never by name.
3. **tempo civil** — Civil time always in `America/Sao_Paulo` timezone.
4. **decisão de acesso** — Access by permission key, never role name (enforced: `acesso-por-chave` lint rule).
5. **dinheiro** — Centavos inteiro. Divisor, fator, teto from database, never hardcoded (enforced: `sem-parsefloat`).
6. **tempo trabalhado** — Minutos inteiro. Noturnal hour = 3150 seconds, reduced (not 3600).
7. **onde o filtro mora** — Filter in server query, not client JavaScript.
8. **rastro de leitura** — Reading sensitive data logs to `audit.leitura_sensivel` with actual permission key.
9. **nada chumbado** — Limits, deadlines, lists, percentages are admin-configurable. Nothing born hardcoded (enforced: `literal-em-formulario`).
10. **vigência** — Dated records valid only within window. Read by date, not status.

Detailed map: `docs/14-mapa-de-eixos.md`.

---

*Convention analysis: 2026-08-10*
