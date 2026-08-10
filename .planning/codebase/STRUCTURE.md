# Codebase Structure

**Analysis Date:** 2026-08-10

## Directory Layout

```
fast-pessoas/                           # Main application root
├── src/
│   ├── app/                            # Next.js App Router (pages + API routes)
│   │   ├── api/                        # HTTP API endpoints
│   │   │   ├── admissoes/              # Onboarding domain
│   │   │   ├── afastamentos/           # Leave/absences domain
│   │   │   ├── avaliacoes/             # Appraisals domain
│   │   │   ├── beneficios/             # Benefits domain
│   │   │   ├── colaboradores/          # Employees domain
│   │   │   ├── demandas/               # Requests domain
│   │   │   ├── desligamento/           # Offboarding domain
│   │   │   ├── documentos/             # Documents domain
│   │   │   ├── estrutura/              # Organization structure domain
│   │   │   ├── ferias/                 # Vacation domain
│   │   │   ├── folha/                  # Payroll domain
│   │   │   ├── identidade/             # Authentication domain
│   │   │   ├── indicadores/            # KPIs domain
│   │   │   ├── notificacoes/           # Notifications domain
│   │   │   ├── ponto/                  # Time tracking domain
│   │   │   ├── pesquisas/              # Surveys domain
│   │   │   ├── recrutamento/           # Recruitment domain
│   │   │   ├── sst/                    # Occupational health domain
│   │   │   └── usuarios/               # User administration domain
│   │   ├── admissoes/                  # Onboarding pages
│   │   ├── afastamentos/               # Leave pages
│   │   ├── avaliacoes/                 # Appraisal pages
│   │   ├── beneficios/                 # Benefits pages
│   │   ├── colaboradores/              # Employee pages
│   │   ├── demandas/                   # Request pages
│   │   ├── desligamentos/              # Offboarding pages
│   │   ├── documentos/                 # Document pages
│   │   ├── entrar/                     # Login page
│   │   ├── estrutura/                  # Structure admin pages
│   │   ├── ferias/                     # Vacation pages
│   │   ├── folha/                      # Payroll pages
│   │   ├── meu-ponto/                  # Personal time tracking
│   │   ├── notificacoes/               # Notification pages
│   │   ├── organograma/                # Org chart pages
│   │   ├── painel-executivo/           # Executive dashboard pages
│   │   ├── ponto/                      # Time tracking admin
│   │   ├── portal-colaborador/         # Employee portal pages
│   │   ├── portal-gestor/              # Manager portal pages
│   │   ├── pesquisas/                  # Survey pages
│   │   ├── recrutamento/               # Recruitment pages
│   │   ├── relatorios/                 # Report pages
│   │   ├── sst/                        # Health & safety pages
│   │   ├── usuarios/                   # User admin pages
│   │   ├── configurar-2fa/             # 2FA setup page
│   │   ├── trocar-senha/               # Password change page
│   │   ├── perfis/                     # Role management pages
│   │   ├── cargos/                     # Job titles pages
│   │   ├── clima/                      # Climate/engagement pages
│   │   ├── metas/                      # Goals pages
│   │   ├── layout.tsx                  # Root layout
│   │   ├── page.tsx                    # Home/dashboard page
│   │   ├── cabecalho.tsx               # Header component
│   │   ├── cabecalho.module.css        # Header styles
│   │   ├── globals.css                 # Global styles
│   │   ├── page.module.css             # Home page styles
│   │   ├── botao-sair.tsx              # Logout button component
│   │   ├── sessao-contexto.tsx         # Session context provider
│   │   ├── sino-notificacoes.tsx       # Notification bell component
│   │   ├── filtro-estrutura.tsx        # Structure filter component
│   │   └── favicon.ico                 # Favicon
│   ├── dominios/                       # Business logic organized by domain
│   │   ├── admissao/
│   │   │   ├── esquemas.ts             # Types, validation schemas (Zod)
│   │   │   ├── servico.ts              # Business operations
│   │   │   └── repositorio.ts          # Database queries
│   │   ├── afastamentos/
│   │   │   ├── esquemas.ts
│   │   │   ├── servico.ts
│   │   │   └── repositorio.ts
│   │   ├── avaliacao/
│   │   │   ├── esquemas.ts
│   │   │   ├── servico.ts
│   │   │   ├── repositorio.ts
│   │   │   └── calculo.ts              # Specialized calculation logic
│   │   ├── beneficios/
│   │   │   ├── esquemas.ts
│   │   │   ├── servico.ts
│   │   │   └── repositorio.ts
│   │   ├── clima/
│   │   ├── colaboradores/
│   │   ├── demandas/
│   │   ├── desligamento/
│   │   ├── documentos/
│   │   │   ├── esquemas.ts
│   │   │   ├── servico.ts
│   │   │   ├── repositorio.ts
│   │   │   └── armazenamento.ts        # File storage logic
│   │   ├── estrutura/
│   │   ├── ferias/
│   │   ├── folha/
│   │   ├── identidade/                 # Auth & session domain
│   │   │   └── esquemas.ts             # Session payload types
│   │   ├── indicadores/
│   │   ├── notificacoes/
│   │   ├── organograma/
│   │   ├── painel-executivo/
│   │   ├── pesquisas/
│   │   ├── ponto/
│   │   ├── portais/                    # Portal-specific logic
│   │   ├── recrutamento/
│   │   ├── sst/
│   │   └── usuarios/
│   ├── lib/                            # Shared cross-cutting utilities
│   │   ├── banco.ts                    # PostgreSQL pool, transactions
│   │   ├── sessao.ts                   # JWT session management
│   │   ├── http.ts                     # Error handling classes
│   │   ├── auditoria.ts                # Change auditing
│   │   ├── vigencia.ts                 # Validity windows
│   │   ├── cifra.ts                    # Encryption utilities
│   │   ├── ficha-de-colaborador.ts     # Employee record helpers
│   │   └── sql-vinculo.ts              # SQL binding helpers
│   └── proxy.ts                        # Request middleware (NOT middleware.ts)
├── db/
│   ├── migrations/                     # Schema migrations (append-only)
│   │   ├── 0001_fundacao.sql           # Initial schema
│   │   ├── 0002_nucleo_pessoas.sql     # Core people tables
│   │   ├── 0003_demandas.sql
│   │   ├── 0004_clima.sql
│   │   ├── ... (up to 0020+)
│   ├── lib/
│   │   └── banco.js                    # Database utilities contract
│   ├── semear/                         # Seed data scripts
│   ├── README.md                       # Tools documentation
│   ├── migrar.js                       # Apply migrations
│   ├── migracoes.js                    # Check/allocate migration numbers
│   ├── consultar.js                    # Run SQL queries
│   ├── bancada.js                      # Database per work branch
│   ├── snapshot.js                     # Baseline measurements
│   ├── logar-como.js                   # Create test sessions
│   ├── comparar-personas.js            # Test HTTP response diffs
│   ├── mapa.js                         # Check axis dependencies
│   ├── fechar-onda.js                  # Wave closure
│   ├── servidor.js                     # Local dev server
│   ├── provisionar.sql                 # Database provisioning
│   ├── seed-admin.js                   # Create admin account
│   ├── codigo-2fa.js                   # Generate 2FA code
│   ├── semear-demo.js                  # Populate demo data
│   └── mapa-*.json                     # Dependency and baseline maps
├── eslint-regras/                      # Custom ESLint rules
├── provas/                             # Proof/test evidence
├── tests/                              # Test files (TypeScript)
│   └── **/*.test.ts                    # Unit tests
├── .claude/                            # Agent workspace
├── public/                             # Static assets
├── node_modules/                       # Dependencies (git-ignored)
├── .next/                              # Build output (git-ignored)
├── .tmp-testes/                        # Temporary test build (git-ignored)
├── .tmp-prova/                         # Temporary proof files (git-ignored)
├── AGENTS.md                           # Project rules for agents
├── CLAUDE.md                           # Agent instructions
├── README.md                           # Project overview
├── package.json                        # npm dependencies & scripts
├── package-lock.json                  # Dependency lock
├── tsconfig.json                       # TypeScript config (main)
├── tsconfig.testes.json                # TypeScript config (tests, ES2023 target)
├── tsconfig.prova.json                 # TypeScript config (proof)
├── tsconfig.prova-escala.json          # TypeScript config (scale proof)
├── next.config.ts                      # Next.js configuration
├── eslint.config.mjs                   # ESLint configuration
├── .env                                # Environment: Supabase (presentation)
├── .env.example                        # Example env template
├── .env.local-db                       # Environment: local PostgreSQL
├── .gitignore                          # Git ignore rules
└── next-env.d.ts                       # Next.js type definitions
```

## Directory Purposes

**`src/app/api/<domain>`:**
- Purpose: HTTP POST/GET/PUT/DELETE endpoints for each domain
- Contains: `route.ts` files with request handlers
- Pattern: Validate input → check permission → call service → respond
- Key files: `src/app/api/beneficios/adesoes/route.ts`, `src/app/api/colaboradores/route.ts`

**`src/app/<domain>`:**
- Purpose: Server-rendered pages for each domain
- Contains: `page.tsx` (list/dashboard), `[id]/page.tsx` (detail), `painel-*.tsx` (UI component)
- Pattern: Fetch data from API or service → render HTML
- Key files: `src/app/beneficios/page.tsx`, `src/app/colaboradores/page.tsx`

**`src/dominios/<domain>`:**
- Purpose: Self-contained business domain (people, benefits, payroll, etc.)
- Contains: Three files per domain: esquemas.ts, servico.ts, repositorio.ts
- Pattern: Type definitions → business logic → database queries
- Key files: `src/dominios/beneficios/{esquemas,servico,repositorio}.ts`

**`src/lib`:**
- Purpose: Shared utilities used by all layers
- Contains: Database pool, session management, error handling, audit trail, validation helpers
- Not domain-specific: No `src/lib/beneficios/` or `src/lib/ponto/`
- Key files: `src/lib/banco.ts`, `src/lib/sessao.ts`, `src/lib/http.ts`

**`db/migrations`:**
- Purpose: Schema definitions (append-only, immutable)
- Contains: SQL files numbered `NNNN_description.sql`
- Pattern: One migration per feature/domain addition
- Key files: `0001_fundacao.sql`, `0009_beneficios.sql`

**`db/` (tools):**
- Purpose: Offline database and testing utilities
- Contains: Node.js scripts for migrations, seeding, querying, session generation
- Not deployed: Only used locally or in CI
- Key files: `migrar.js`, `consultar.js`, `logar-como.js`, `comparar-personas.js`

**`eslint-regras/`:**
- Purpose: Custom ESLint rules enforcing project constraints
- Contains: Rule implementations and tests
- Enforces: No hardcoded limits (axis #9), no floating-point money (axis #5), permission keys not roles (axis #4)

**`provas/`:**
- Purpose: Evidence that phase requirements were met
- Contains: Screenshots, SQL outputs, HTTP response captures
- Organized: By wave/phase (onda-i/, onda-h/, etc.)

**`tests/`:**
- Purpose: Unit tests for business logic
- Contains: TypeScript test files (compiled to JS by `tsconfig.testes.json`)
- Pattern: `describe() / it()` using Node.js native test runner
- Run via: `npm test`

## Key File Locations

**Entry Points:**

- `src/proxy.ts` - Request middleware (runs before all routing)
- `src/app/layout.tsx` - Root layout (session context, header, navigation)
- `src/app/page.tsx` - Home/dashboard (permissions check, module links)
- `src/app/entrar/page.tsx` - Login flow (password + 2FA)
- `src/app/api/<domain>/<operation>/route.ts` - Specific API endpoints

**Configuration:**

- `package.json` - npm scripts: `dev`, `build`, `test`, `lint`, `db:migrar`, `db:demo`
- `tsconfig.json` - TypeScript compiler (main, ES2017 target for browsers)
- `tsconfig.testes.json` - TypeScript compiler (tests, ES2023 target)
- `next.config.ts` - Next.js framework config (mostly empty)
- `eslint.config.mjs` - Linter rules (custom rules + Next.js presets)
- `.env` - Environment vars (Supabase, presentation only)
- `.env.local-db` - Environment vars (PostgreSQL local development)

**Core Logic:**

- `src/dominios/beneficios/esquemas.ts` - Benefit types, validation
- `src/dominios/beneficios/servico.ts` - Benefit operations (create, update, cancel)
- `src/dominios/beneficios/repositorio.ts` - Benefit SQL queries
- `src/lib/banco.ts` - Database connection pool, transaction wrapper
- `src/lib/sessao.ts` - JWT creation/verification, session middleware

**Testing:**

- `tests/**/*.test.ts` - Unit tests (compiled to `.tmp-testes/`)
- `tsconfig.testes.json` - Test-specific TypeScript config

**Documentation:**

- `AGENTS.md` - Project rules (10 axes, required tools, workflows)
- `README.md` - Project overview
- `db/README.md` - Database tools documentation

## Naming Conventions

**Files:**

- `esquemas.ts` - Type definitions and Zod validation schemas
- `servico.ts` - Business logic and domain operations
- `repositorio.ts` - SQL queries and data access
- `calculo.ts` - Specialized calculation logic (rare; only in avaliacao)
- `armazenamento.ts` - File storage logic (in documentos)
- `*.module.css` - CSS modules for component styling
- `[id]/page.tsx` - Dynamic route for a specific record (e.g., `/colaboradores/42`)

**Directories:**

- `src/app/api/<domain>/` - API endpoints for a domain (mirrors dominios structure)
- `src/app/<domain>/` - UI pages for a domain (mirrors dominios structure)
- `src/dominios/<domain>/` - Business logic for a domain
- `db/migrations/` - Schema migrations
- `db/semear/` - Seed data
- `.tmp-<purpose>/` - Temporary build artifacts (git-ignored)

**Variables & Functions:**

- `esquema<Operacao>` - Zod schema for validation (e.g., `esquemaCriacaoBeneficio`)
- `<Operacao>` - Service function (e.g., `efetivarAdesao()`)
- `buscar<Recurso>` - Repository function that fetches data (e.g., `buscarAdesaoResumo()`)
- `inserir<Recurso>` - Repository function that creates data
- `atualizar<Recurso>` - Repository function that modifies data
- `encerrar<Recurso>` - Repository function that soft-deletes or deactivates
- `consultar()` - Read-only database query (from `src/lib/banco.ts`)
- `comTransacao()` - Write transaction wrapper (from `src/lib/banco.ts`)
- `GET`, `POST`, `PUT`, `DELETE` - HTTP method handlers in route files

**Types:**

- `<NomeRecurso>` - Concrete type (e.g., `Adesao`, `Beneficio`, `Colaborador`)
- `<Operacao><Recurso>` - Input type for operation (e.g., `CriacaoBeneficio`, `AtualizacaoBeneficio`)
- `<Recurso>Resumo` - Summary/view type with fewer fields
- `<Recurso>Completo` - Full type with all fields
- `Payload<Contexto>` - JWT/session payload (e.g., `PayloadSessao`)

## Where to Add New Code

**New Feature (within existing domain):**
- **Business logic**: `src/dominios/<domain>/servico.ts` - Add `async function nomeDaOperacao(...)`
- **Database queries**: `src/dominios/<domain>/repositorio.ts` - Add `async function buscarOu inserirOu...(...)`
- **Types/validation**: `src/dominios/<domain>/esquemas.ts` - Add `z.object({...})`
- **API endpoint**: `src/app/api/<domain>/<operation>/route.ts` - Add `export async function POST(request) { ... }`
- **UI page**: `src/app/<domain>/nova-pagina.tsx` - React component or `nova-pagina/page.tsx`

**New Domain (if required):**
1. Create directory: `src/dominios/<novo-dominio>/`
2. Create three files:
   - `esquemas.ts` - Types and Zod validation
   - `servico.ts` - Business operations
   - `repositorio.ts` - SQL queries
3. Create API routes: `src/app/api/<novo-dominio>/*.ts`
4. Create pages: `src/app/<novo-dominio>/page.tsx`
5. Create database migration: `db/migrations/NNNN_<novo-dominio>.sql`
6. Update AGENTS.md axis list if new business rule applies
7. Add domain to tests if business logic is complex

**Shared Utility (cross-domain):**
- **Database helpers**: `src/lib/banco.ts` (connection, transactions)
- **Session/auth**: `src/lib/sessao.ts` (JWT, cookies)
- **Error handling**: `src/lib/http.ts` (error classes, serialization)
- **Validation**: Add to relevant `esquemas.ts` if domain-specific; add to `src/lib/banco.ts` if generic SQL helper
- **Computation**: Rare in `src/lib/`. Prefer domain-specific helper in `<domain>/servico.ts` if possible.

**Test:**
- **Location**: `tests/<domain>.test.ts` or `tests/<domain>/<feature>.test.ts`
- **Naming**: One describe block per exported service function; nested it blocks per case
- **Run**: `npm test` compiles and executes

**Migration:**
- **Location**: `db/migrations/NNNN_description.sql`
- **Allocation**: Use `node db/migracoes.js nova <description>` to allocate next number
- **Immutability**: Never modify applied migrations; hash verified on subsequent runs

## Special Directories

**`.claude/`:**
- Purpose: Agent workspace (worktrees, hooks, configuration)
- Generated: Yes (by Claude Code harness)
- Committed: No (git-ignored)

**`.tmp-testes/`:**
- Purpose: TypeScript → JavaScript compiled test code
- Generated: Yes (by `npm test`)
- Committed: No (git-ignored)

**`.next/`:**
- Purpose: Next.js build output (optimized JS, server code)
- Generated: Yes (by `npm build`)
- Committed: No (git-ignored)

**`db/semear/`:**
- Purpose: Seed data files (fixture databases, reference lists)
- Generated: No
- Committed: Yes (part of repository)

**`provas/`:**
- Purpose: Wave completion evidence (screenshots, metrics, test results)
- Generated: Yes (manually created during phase execution)
- Committed: Yes (proof of work)

---

*Structure analysis: 2026-08-10*
