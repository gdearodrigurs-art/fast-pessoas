<!-- refreshed: 2026-08-10 -->
# Architecture

**Analysis Date:** 2026-08-10

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                     HTTP Request / Client                           │
└────────────────────────────────┬────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Request Middleware (proxy.ts)                       │
│          JWT Session Validation + 2FA State Enforcement             │
│              `src/proxy.ts`                                          │
└────────────────────────────────┬────────────────────────────────────┘
                                  │
        ┌─────────────────────────┴─────────────────────────┐
        ▼                                                    ▼
┌──────────────────────────────┐           ┌──────────────────────────┐
│    App Router Pages          │           │    API Route Handlers    │
│  `src/app/**/*.tsx`          │           │  `src/app/api/**/*.ts`   │
│  - User-facing UI            │           │  - Validate input        │
│  - Server components         │           │  - Check permissions     │
│  - Data fetching             │           │  - Call service layer    │
└──────────────┬───────────────┘           └────────────┬─────────────┘
               │                                        │
               └────────────────┬─────────────────────┬─┘
                                ▼
                  ┌─────────────────────────────────┐
                  │  Domain Service Layer           │
                  │  `src/dominios/<domain>/...`    │
                  │  - Business logic               │
                  │  - Validation (Zod schemas)     │
                  │  - Permission checks            │
                  │  - Audit trail registration     │
                  └──────────────┬──────────────────┘
                                 │
                                 ▼
                  ┌─────────────────────────────────┐
                  │  Domain Repository Layer        │
                  │  `src/dominios/<domain>/...`    │
                  │  - SQL queries                  │
                  │  - Data transformation          │
                  │  - Database interactions        │
                  └──────────────┬──────────────────┘
                                 │
                                 ▼
            ┌────────────────────────────────────────┐
            │      Shared Library (src/lib/)         │
            │  - banco.ts (transaction pool)         │
            │  - sessao.ts (JWT management)          │
            │  - http.ts (error handling)            │
            │  - auditoria.ts (change tracking)      │
            │  - vigencia.ts (validity windows)      │
            │  - cifra.ts (encryption)               │
            └────────────────┬─────────────────────┘
                             │
                             ▼
                ┌──────────────────────────────┐
                │  PostgreSQL Database         │
                │  - RLS (Row-Level Security)  │
                │  - Audit triggers            │
                │  - Change tracking           │
                │  - Transactional integrity   │
                └──────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Request Middleware | Authenticate via JWT; gate free routes; enforce 2FA flow | `src/proxy.ts` |
| API Routes | Accept HTTP requests; validate payloads; call service layer | `src/app/api/**/*.ts` |
| Pages/UI | Render server-side React components; fetch data via API | `src/app/**/*.tsx` |
| Services | Business logic, domain rules, permission enforcement | `src/dominios/<domain>/servico.ts` |
| Repositories | SQL queries, row-level transformations, persistence | `src/dominios/<domain>/repositorio.ts` |
| Schemas | Type definitions, validation rules via Zod | `src/dominios/<domain>/esquemas.ts` |
| Database Pool | Connection pooling, transaction management, user context | `src/lib/banco.ts` |
| Session Manager | JWT creation, verification, cookie handling | `src/lib/sessao.ts` |
| Error Handling | Custom error classes for HTTP responses | `src/lib/http.ts` |
| Audit Trail | Record of all data changes with user context | `src/lib/auditoria.ts` |

## Pattern Overview

**Overall:** Strict three-layer domain-driven architecture with clear separation between HTTP handling, business logic, and data access.

**Key Characteristics:**
- **Layered isolation**: API routes do NOT access repositories directly; must go through services
- **Domain-driven design**: Each domain (beneficios, colaboradores, etc.) contains its own esquemas, servico, and repositorio
- **Zod validation at boundaries**: All external input validated via Zod schemas before reaching business logic
- **Transaction-scoped user context**: All database writes execute via `comTransacao(usuarioId)` which sets `app.usuario_id` for RLS
- **Permission keys over role names**: Access control via `temPermissao("chave.especifica")` not by role name
- **Append-only mutations**: Migrations are immutable; data changes tracked in audit tables

## Layers

**Presentation (Request Entry):**
- **Purpose**: Accept HTTP requests, authenticate, route to handlers
- **Location**: `src/proxy.ts` (middleware), `src/app/api/**/*.ts` (endpoints), `src/app/**/*.tsx` (pages)
- **Contains**: Request validation, permission checks, HTTP error responses
- **Depends on**: Session management (`src/lib/sessao.ts`), domain services
- **Used by**: HTTP clients (browsers, other services)

**Domain Business Logic:**
- **Purpose**: Implement domain-specific rules, enforce constraints, coordinate state changes
- **Location**: `src/dominios/<domain>/servico.ts` (one per domain: beneficios, colaboradores, demandas, etc.)
- **Contains**: Business operations (create, update, cancel), validation, audit trail registration, permission enforcement
- **Depends on**: Repositories (same domain), shared libraries (`src/lib/*`), schemas (same domain)
- **Used by**: API routes, other services for cross-domain operations

**Data Access (Persistence):**
- **Purpose**: Execute SQL, transform rows into domain types, handle database constraints
- **Location**: `src/dominios/<domain>/repositorio.ts` (one per domain)
- **Contains**: SELECT queries, INSERT/UPDATE/DELETE statements, row mapping functions
- **Depends on**: Database pool (`src/lib/banco.ts`), domain schemas
- **Used by**: Domain services

**Shared Infrastructure:**
- **Purpose**: Provide cross-cutting concerns to all layers
- **Location**: `src/lib/`
- **Contains**: 
  - `banco.ts` - PostgreSQL connection pool, `comTransacao()` wrapper
  - `sessao.ts` - JWT token creation/verification, `exigirPermissao()` guard
  - `http.ts` - Error classes (`ErroHttp`, `ErroHttpCampo`, `ErroHttpConfirmavel`), error serialization
  - `auditoria.ts` - `registrarAlteracao()` for change tracking
  - `vigencia.ts` - `exigirVigenciaNaoFutura()` for validity window enforcement
  - `cifra.ts` - Encryption/decryption utilities
  - `ficha-de-colaborador.ts` - Employee record helpers
  - `sql-vinculo.ts` - Binding helpers
- **Used by**: All layers

**Data Storage:**
- **Purpose**: Persist state with audit trail, enforce RLS, maintain referential integrity
- **Location**: PostgreSQL database (schema `rh`)
- **Contains**: 23 domain tables, audit tables, RLS policies, triggers

## Data Flow

### Primary Request Path (API Endpoint)

1. **HTTP Request arrives** → `proxy.ts` middleware intercepts (`src/proxy.ts`)
2. **Authenticate** → Verify JWT in cookie; redirect to `/entrar` if invalid; enforce 2FA if required
3. **Route to API Handler** → Dispatch to `src/app/api/<domain>/route.ts` or specific endpoint
4. **Validate Input** → Call `esquema<Operacao>.safeParse()` to validate request body via Zod
5. **Check Permission** → Call `exigirPermissao("chave.especifica")` to verify user has required permission key
6. **Call Service** → Invoke `src/dominios/<domain>/servico.ts` function with validated data and session
7. **Business Logic Executes** → Service enforces domain rules, validates constraints, may call repositories
8. **Persist Changes** → Service calls `comTransacao(sessao.usuario_id, async (client) => { ... })`
   - Transaction starts
   - `SET LOCAL app.usuario_id = $1` sets row-level security context
   - Service calls repository methods via the passed `client`
   - Repository executes SQL with RLS automatically applied
   - Audit triggers on database record all changes with user context
   - Transaction commits
9. **Respond** → Return `Response.json({ data })` or error response

### Server Component Data Fetch

1. **React Server Component** → Page at `src/app/<path>/page.tsx` renders
2. **Fetch Data** → Call API endpoint via `fetch()` or direct service function
3. **Serialize Response** → Server serializes data, sends to browser as HTML/JSON
4. **Render** → Client receives HTML and renders

**State Management:**
- **Session**: Stored in httpOnly cookie `fp_sessao`, signed JWT with user_id, papel, name, pendente_2fa
- **Permissions**: Loaded from database on login; stored in session payload
- **Mutable state**: Stored in PostgreSQL only; no in-memory cache for shared state
- **UI state**: React component state (client-side); reset on page navigation

## Key Abstractions

**Domain Module:**
- **Purpose**: Self-contained business domain with clear boundaries
- **Examples**: `src/dominios/beneficios/`, `src/dominios/colaboradores/`, `src/dominios/demandas/`
- **Pattern**: esquemas.ts (types) + servico.ts (logic) + repositorio.ts (queries)
- **Count**: 23 domains (admissao, afastamentos, avaliacao, beneficios, clima, colaboradores, demandas, desligamento, documentos, estrutura, ferias, folha, identidade, indicadores, notificacoes, organograma, painel-executivo, pesquisas, ponto, portais, recrutamento, sst, usuarios)

**Zod Schema:**
- **Purpose**: Define and validate request/response types at boundaries
- **Examples**: `esquemaCriacaoBeneficio`, `esquemaEfetivacaoAdesao`, `esquemaAtualizacaoColaborador`
- **Pattern**: All external input validated before reaching business logic
- **Location**: `src/dominios/<domain>/esquemas.ts`

**Service Function:**
- **Purpose**: Execute a business operation with full validation and audit
- **Pattern**: `async function operarAlgo(sessao: PayloadSessao, dados: TipoDados): Promise<Resultado>`
- **Guarantees**: Returns only after transaction committed; throws ErroHttp on constraint violations
- **Example**: `efetivarAdesao()` in `src/dominios/beneficios/servico.ts`

**Repository Query:**
- **Purpose**: Execute SQL and transform result rows into domain types
- **Pattern**: `async function buscarAlgo(cliente: PoolClient, criterio: tipo): Promise<Resultado>`
- **Receives**: `PoolClient` from `comTransacao()` so queries participate in transaction
- **Example**: `buscarAdesaoResumo()` in `src/dominios/beneficios/repositorio.ts`

**Error Class:**
- **Purpose**: Communicate structured errors back to HTTP client
- **Types**:
  - `ErroHttp(status, mensagem)` - Generic error
  - `ErroHttpCampo(status, mensagem, campo)` - Field-specific error (e.g., validation)
  - `ErroHttpConfirmavel(status, mensagem, confirmacao, detalhe?)` - Requires user confirmation (409)
- **Pattern**: Throw from service; caught by API handler; serialized by `responderErro()`

**Transaction Context:**
- **Purpose**: Ensure user-scoped RLS and audit trail for all mutations
- **Pattern**: `await comTransacao(usuarioId, async (client) => { /* queries */ })`
- **Guarantees**: Atomicity, user context via `app.usuario_id`, automatic audit on INSERT/UPDATE/DELETE
- **Location**: `src/lib/banco.ts`

## Entry Points

**Web Server (Next.js App Router):**
- **Location**: `src/app/layout.tsx` - Root layout with session context
- **Triggers**: HTTP request to any route
- **Responsibilities**: Render pages, handle API routes, manage session cookies

**Authentication/Authorization Middleware:**
- **Location**: `src/proxy.ts`
- **Triggers**: Every request before routing
- **Responsibilities**: Verify JWT, enforce free routes, gate 2FA flow

**Home Page (after auth):**
- **Location**: `src/app/page.tsx`
- **Triggers**: GET /
- **Responsibilities**: Query permissions, render dashboard with allowed modules

**API Endpoints:**
- **Location**: `src/app/api/<domain>/<operation>/route.ts`
- **Pattern**: POST, GET, PUT methods with specific signatures
- **Example**: `POST /api/beneficios/adesoes` → `src/app/api/beneficios/adesoes/route.ts`

**Database Migrations:**
- **Location**: `src/db/migrations/NNNN_*.sql` (append-only)
- **Triggers**: Manual via `npm run db:migrar` or deployment
- **Responsibilities**: Schema changes, audit table creation, RLS policies

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js). Database queries run sequentially within transactions. Long-running operations (batch imports) risk timeout; should be queued.
- **Global state:** No module-level singletons except connection pool (`src/lib/banco.ts`). Session lives in cookie, not memory.
- **Circular imports:** Avoided via strict layering: App → Dominios → Lib. No reverse dependencies.
- **Database connection limit:** Pool maxed at 10 connections (`src/lib/banco.ts`). Concurrent API handlers share the pool.
- **Middleware routing:** `proxy.ts` runs BEFORE Next.js routing; intercepts all paths except static assets. Cannot selectively bypass via route-level middleware.
- **User context scope:** `SET LOCAL app.usuario_id` is transaction-scoped; resets when transaction commits. RLS policies depend on this being set in every write.

## Anti-Patterns

### Accessing repository directly from API route

**What happens:** API handler imports and calls repository function without going through service layer.

**Why it's wrong:** Bypasses business logic validation, permission checks, and audit trail registration. Changes won't be logged.

**Do this instead:** Always call the service layer function. If one doesn't exist, add it to `src/dominios/<domain>/servico.ts`. Example: Instead of:
```typescript
// WRONG
const repositorio = await buscarAdesao(client, id);
```
Do:
```typescript
// RIGHT
const adesao = await buscarAdesaoResumo(sessao, id);
```

### Storing mutable application state in module scope

**What happens:** Service or repository declares a module-level variable and mutates it to track state across requests.

**Why it's wrong:** Next.js can create multiple worker processes; state changes visible to one worker won't be visible to another. State becomes non-deterministic.

**Do this instead:** Persist all mutable state to PostgreSQL. Read fresh on each request. Example: Instead of:
```typescript
// WRONG
let adesoesCacheadas: Map<number, Adesao> = new Map();
```
Do:
```typescript
// RIGHT
const adesoes = await buscarAdesoesDoColaborador(client, colaboradorId);
```

### Bypassing permission checks for "convenience"

**What happens:** Service function calls repository without checking `temPermissao()` first, assuming "it's internal."

**Why it's wrong:** Cross-domain service calls may reach the function; permission check is the only gate preventing unauthorized cross-domain access.

**Do this instead:** Every public service function checks permissions. Example:
```typescript
// WRONG
export async function cancelarAdesao(sessao, id) {
  const adesao = await buscarAdesaoParaAtualizar(client, id);
  // ... no permission check
}
```
Do:
```typescript
// RIGHT
export async function cancelarAdesao(sessao, id) {
  const sessao = await exigirPermissao("adesao.cancelar");
  const adesao = await buscarAdesaoParaAtualizar(client, id);
  // ...
}
```

### Hardcoding config values in code

**What happens:** Limit, threshold, or policy written as literal number in service or schema.

**Why it's wrong:** AGENTS.md axis #9 forbids this: "nada chumbado" — limits and policies must be administrable by the UI. Changes require code release.

**Do this instead:** Store in database as administrable records. Query at runtime. Example: Instead of:
```typescript
// WRONG
const MAX_ADESOES = 10;
if (totalAdesoesAtuais >= MAX_ADESOES) throw new Error("Limite");
```
Do:
```typescript
// RIGHT
const limite = await buscarLimiteAdesoes(client);
if (totalAdesoesAtuais >= limite) throw new Error("Limite");
```

### Using floating-point arithmetic for money

**What happens:** Division or multiplication on money amounts results in rounding error.

**Why it's wrong:** AGENTS.md axis #5: centavo **inteiro**. Even tiny errors compound across thousands of records.

**Do this instead:** Work in cents (integers). Divisor, factor, and teto queried from database. Example:
```typescript
// WRONG
const desconto = valor * 0.1;

// RIGHT
const desconto = Math.floor((valor * percentualDesconto) / 100);
```

### Using database time (`CURRENT_DATE`) instead of operation time

**What happens:** Query uses `CURRENT_DATE` or `now()` at query time to determine "today."

**Why it's wrong:** AGENTS.md axis #3: "hoje" is in `America/Sao_Paulo` time zone. Database might be in UTC. Time-sensitive operations (payroll, benefits) get wrong date.

**Do this instead:** Use `rh.hoje()` function which applies the correct time zone. Example: Instead of:
```sql
-- WRONG
WHERE data >= CURRENT_DATE

-- RIGHT
WHERE data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
```

---

*Architecture analysis: 2026-08-10*
