# Testing Patterns

**Analysis Date:** 2026-08-10

## Test Framework

**Runner:**
- Node.js built-in test runner: `node:test`
- No external test framework (Jest, Vitest, Mocha)
- Built-in assertion library: `node:assert/strict`

**Config:**
- TypeScript compilation: `tsconfig.testes.json`
- Compiler target: `es2023`, CommonJS module output
- Output directory: `.tmp-testes/`
- Compiled before execution

**Run Commands:**
```bash
npm test                 # Compile TypeScript + run all tests (~2-3 seconds)
npm run lint            # ESLint check
npm run lint -- --fix   # Auto-fix lint violations
```

**Test Command Details:**
```json
"test": "tsc -p tsconfig.testes.json && node --test \".tmp-testes/tests/**/*.test.js\""
```
- TypeScript compilation is incremental (`.tsbuildinfo` file preserves state)
- Tests run from compiled `.tmp-testes/` directory, not source
- Pattern matches: `.test.js` files in compiled output

## Test File Organization

**Location:**
- All test files in `fast-pessoas/tests/` directory
- Never co-located with source (separate `tests/` folder)

**Naming Convention:**
- Pattern: `<domain>.test.ts`
- Examples: `ponto.test.ts`, `folha.test.ts`, `beneficios.test.ts`, `colaboradores.test.ts`
- One file per domain/major component

**Current Test Files:**
- `baterias.test.ts` — Regression suite for calculated payroll
- `beneficios.test.ts` — Benefits eligibility rules boundary tests
- `colaboradores.test.ts` — Employee domain tests
- `folha.test.ts` — Payroll calculation motor tests (~150 lines)
- `pesquisas.test.ts` — Survey domain tests
- `ponto.test.ts` — Point/timecard calculation motor tests
- `regras-lint.test.ts` — ESLint rule validation
- `sonda.test.ts` — Diagnostic/probe tests
- `sst.test.ts` — Occupational health tests
- `vigencia-na-data.test.ts` — Validity/effectivity window tests

**Compilation:**
- Only files imported by tests are compiled (tree-following by tsc)
- Avoids compiling entire project; only test dependencies included
- Keeps test cycle fast (~2-3 seconds)

## Test Structure

**Test Suite Syntax:**
Using Node's built-in `test()` function (no describe equivalent):

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

test("test name — what it should do", () => {
  // arrange
  const input = ...;
  // act
  const result = ...;
  // assert
  assert.equal(result, expected);
});
```

**Test Execution Order:**
- Tests run in file order
- Sequential (not parallel) by default
- Each test is independent; no global state between tests

**Nested Tests (if needed):**
Node's test runner supports nested tests but this codebase uses flat structure per file.

## Fixtures and Test Data

**Pattern:** Fixture functions at top of test file:

From `tests/folha.test.ts:34-111`:
```typescript
// Named fixture creators
const PARAMETROS: ParametrosFolhaMotor = {
  id: 1,
  aliquota_fgts: 8,
  divisor_mensal_horas: 220,
  carga_semanal_referencia_minutos: 2640, // 44 h/semana
};

const TABELA_INSS: TabelaInssMotor = {
  id: 1,
  faixas: [
    { ate_centavos: 163_100, aliquota: 7.5 },
    { ate_centavos: 293_357, aliquota: 9 },
    // ...
  ],
};

// Factory function for complex objects
function montarRubrica(
  codigo: string,
  name: string,
  natureza: NaturezaRubrica,
  tipo_calculo: TipoCalculo,
  parametro: number | null,
  incide: boolean
): RubricaMotor {
  proximaVersao += 1;
  return { rubrica_versao_id: proximaVersao, /* ... */ };
}

// Helper for test variant
function folha(ajuste: Ajuste): ResultadoMotor {
  return calcularFolha({
    dependentes_irrf: 0,
    carga_semanal_minutos: null,
    variaveis: [],
    rubricas: CATALOGO,
    tabela_inss: TABELA_INSS,
    tabela_irrf: TABELA_IRRF,
    parametros: PARAMETROS,
    ...ajuste,
  });
}
```

**Fixture Location:**
- Fixtures at top of test file (after imports, before first `test()`)
- Named with domain language (PARAMETROS, TABELA_INSS, montarRubrica)
- Comments explain source when copied from seed data

**Test Data Ownership:**
- Fixtures are owned by each test file
- Shared test utilities in `tests/` if needed (not yet created)
- Seed data in migrations (`db/migrations/`) used as source of truth

## Mocking

**Approach: Minimal**
- Tests avoid mocking where possible
- Pure functions tested with fixtures (no DB, no HTTP)
- Motors and calculations are pure: `calcularFolha()`, `apurarPonto()`

**When Mocking is Needed:**
- Database calls: Tests that touch `repositorio.ts` skip (integration/e2e)
- HTTP requests: Integration tests only
- External services: Not tested in unit suite

**Current Practice:**
- No mocking library in use (`sinon`, `jest.mock`, etc.)
- No mock objects or spies
- Fixtures replace mocks by providing typed, structured test data

**What NOT to Mock:**
- Business logic (motors/engines)
- Validation schemas
- Utility functions
- The system under test

## Test Types

**Unit Tests (Pure Functions):**
- Motors: `calcularFolha()`, `apurarPonto()`, `agruparMarcacoesPorDia()`
- Validation boundaries: Schema `.safeParse()` tests
- Pure utility functions
- Location: `tests/folha.test.ts`, `tests/ponto.test.ts`

**Integration Tests (Not in Suite):**
- Would require database connection
- Not run in `npm test` (would slow gate to >10s)
- Would require test database setup
- Run separately if needed (db/provas/...)

**E2E Tests:**
- Not present in this suite
- Could be added to `tests/` if needed
- Would require running Next.js server

**Test Scope Decision:**
The suite is designed to run in ~2-3 seconds without database or server. Tests that need those are excluded intentionally.

## Common Patterns

### Async Testing

Node's `test()` automatically handles async:

```typescript
test("description", async () => {
  const result = await someAsyncFunction();
  assert.equal(result, expected);
});
```

No special `done()` callback needed.

### Error Testing (Positive Case)

Validate that valid input is accepted:

```typescript
test("regra que começa hoje continua sendo aceita", () => {
  const analise = esquemaNovaRegra.safeParse(regra(hojeNaOperacao()));
  assert.equal(analise.success, true);
  assert.equal(analise.data?.inicio_vigencia, hojeNaOperacao());
});
```

### Error Testing (Negative Case)

Validate that invalid input is rejected:

```typescript
test("regra de elegibilidade com vigência no futuro é recusada", () => {
  const analise = esquemaNovaRegra.safeParse(regra("2027-01-01"));
  assert.equal(analise.success, false);
  assert.equal(analise.error?.issues[0].path[0], "inicio_vigencia");
});
```

### Regression Tests

Tests that name production bugs they prevent:

From `tests/ponto.test.ts` header comments:
```typescript
// Cada `test` que cita um valor em reais reproduz defeito que ESTEVE em
// produção neste projeto. O número no comentário é o que ele custou — é o que
// impede alguém de apagar o caso por achar que é detalhe de relógio.
```

Example test:
```typescript
test("uma escala inteira de plantões noturnos: 105 h de relógio viram 120 h noturnas", () => {
  // A conta do defeito, na escala em que ele apareceu: 1.050 h contra 1.200 h
  // somando os 10 plantonistas.
  const dias = montarDias("2026-03-01", 30, (_, indice) =>
    indice % 2 === 0
      ? { dia_de_escala: true, marcacoes: plantaoNoturno(indice * 10) }
      : {}
  );
  const r = apurarPonto(entrada(jornadaPlantao(), dias));
  assert.equal(valorDe(r, "noturno_250"), 1_200_00); // 120 hours in minutes × 100
});
```

### Boundary Tests

From `tests/beneficios.test.ts:44-71`:
```typescript
test("o futuro começa amanhã: um dia à frente já é recusado", () => {
  // A fronteira é o ponto onde a guarda meia-boca passava despercebida: quem
  // testasse com "2026-08-01" veria verde e concluiria que a trava existe.
  const amanha = somarDias(hojeNaOperacao(), 1);
  const analise = esquemaNovaRegra.safeParse(regra(amanha));
  assert.equal(analise.success, false);
});
```

### Calculation Motor Tests

From `tests/folha.test.ts:145-160`:
```typescript
function itemDe(resultado: ResultadoMotor, codigo: string): ItemMotor | undefined {
  return resultado.itens.find((item) => item.codigo === codigo);
}

function valorDe(resultado: ResultadoMotor, codigo: string): number {
  return itemDe(resultado, codigo)?.valor_centavos ?? 0;
}

function memoriaDe(resultado: ResultadoMotor, codigo: string): Record<string, unknown> {
  const item = itemDe(resultado, codigo);
  assert.ok(item, `item ${codigo} não foi gravado`);
  return item.memoria;
}
```

These helpers extract values from complex calculation results for assertions.

## Coverage

**Requirements:**
- No explicit coverage target enforced
- Coverage not measured in CI

**Philosophy:**
- Pure functions have natural coverage via calculation tests
- Motors (`folha/calculo.ts`, `ponto/calculo.ts`) are 100% by design (all branches exercised)
- Repository and service layer untested in this suite (integration-level concern)

**If Coverage is Needed:**
Use Node's built-in coverage reporting:
```bash
node --test --test-coverage
```

## Test Independence

**Isolation:**
- No shared global state between tests
- Each test creates its own fixtures
- Tests can run in any order (though they run sequentially)

**Fixture Reuse:**
- Shared fixture objects are `const` (immutable)
- Factories create new instances per test variant
- No test modifies fixture data

**Example Pattern:**
```typescript
// Shared fixture — used by multiple tests, never modified
const PARAMETROS: ParametrosFolhaMotor = { /* ... */ };

// Each test uses it in a new context
test("test 1", () => {
  const r1 = folha({ salario_base_centavos: 300_000 });
});

test("test 2", () => {
  const r2 = folha({ salario_base_centavos: 500_000 });
});
```

## Assertion Style

**Strict Assertions:**
```typescript
import assert from "node:assert/strict";
```

**Common Assertions:**
```typescript
assert.equal(actual, expected, "message")
assert.deepEqual(obj1, obj2)
assert.ok(value, "should be truthy")
assert.throws(() => { /* code */ }, Error)
assert.rejects(Promise.reject(...))
```

**Zod Parsing Assertions:**
```typescript
const analise = schema.safeParse(data);
assert.equal(analise.success, true);
assert.equal(analise.data.field, expectedValue);
assert.equal(analise.error?.issues[0].path[0], "fieldName");
```

## ESLint Rule Tests

The custom ESLint rules have their own test file: `tests/regras-lint.test.ts`

Tests verify that each rule catches intended violations and allows intended exceptions.

## Performance Notes

**Gate Speed:**
- Total execution: ~2-3 seconds
- Increment over typical build: <2 seconds
- Goal: Developer feedback within 3 seconds

**Why Fast:**
- No database
- No network calls
- No server startup
- Pure calculations only
- Incremental compilation via `.tsbuildinfo`

---

*Testing analysis: 2026-08-10*
