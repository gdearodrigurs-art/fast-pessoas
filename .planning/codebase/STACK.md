# Technology Stack

**Analysis Date:** 2026-08-10

## Languages

**Primary:**
- TypeScript 5 - Application code, API routes, services, utilities in `src/`
- JavaScript (ES modules & CommonJS) - Next.js config, ESLint configuration
- JavaScript (CommonJS) - Database tools and migrations in `db/`
- SQL (PostgreSQL) - 56 migration files defining schema, stored procedures, RLS

**Secondary:**
- SQL/PLPGSQL - Database functions in schema (identity, permissions, business logic)

## Runtime

**Environment:**
- Node.js 24 (specified in project context)

**Package Manager:**
- npm with lockfile (`package-lock.json`)

## Frameworks

**Core:**
- Next.js 16.2.12 - Full-stack React framework with App Router, API routes, middleware (`src/app/`)
- React 19.2.4 - UI library for client components

**Authentication & Security:**
- jose 6.2.4 - JWT creation and verification (HS256 algorithm)
- bcryptjs 3.0.3 - Password hashing
- otpauth 9.5.1 - TOTP (Time-based One-Time Password) generation for 2FA

**Validation & Data:**
- zod 4.4.3 - Schema validation for request/response payloads

**File Handling:**
- qrcode 1.5.4 - QR code generation (for TOTP setup)
- @types/qrcode 1.5.6 - TypeScript types

**Database:**
- pg 8.22.0 - PostgreSQL client library
- @types/pg 8.20.0 - TypeScript types for pg

**Testing:**
- Node.js built-in `--test` flag - Test runner
- No external test framework (uses native Node.js testing)

**Development/Build:**
- ESLint 9 - Code linting with custom rules in `eslint.config.mjs`
- eslint-config-next 16.2.12 - Next.js ESLint configuration
- TypeScript 5 - Type checking compiler (`tsc`)

## Configuration

**Environment:**
- `.env.local-db` - Local PostgreSQL connection (host, credentials, database selection)
- `.env` - Supabase connection (presentation-only, writes guarded by hooks)
- `DATABASE_URL` - Required environment variable pointing to PostgreSQL instance
- `SESSAO_SEGREDO` - JWT signing key (32+ characters for HS256)
- `CHAVE_CIFRA_SAUDE` - AES-256-GCM encryption key for health data (32 bytes in base64url)
- `NODE_ENV` - Affects cookie security settings (`production` enables secure flag)

**Build Configuration:**
- `next.config.ts` - Minimal Next.js configuration (using defaults)
- `tsconfig.json` - Target ES2017, JSX as react-jsx, path alias `@/*` → `./src/*`
- `tsconfig.testes.json` - Separate config for tests with ES2023 target
- `eslint.config.mjs` - ESLint v9 flat config with custom Fast Pessoas rules

**Database Migrations:**
- `db/migracoes.js` - Migration version tracking and application
- `db/migrations/` - 57 immutable SQL migration files (0001_fundacao.sql through 0057_pedido_de_revisao_de_valor.sql)
- Migration hash validation prevents modification of applied migrations (SHA-256)

## Platform Requirements

**Development:**
- Node.js 24
- PostgreSQL 12+ (local instance via Docker or native)
- Environment files (`.env.local-db` for local dev)
- npm/npx for package management

**Production:**
- Node.js 24 runtime
- PostgreSQL 12+ instance (credential via `DATABASE_URL`)
- Supabase instance (optional, for presentation/read-only queries)
- HTTPS required (secure cookies in production)

## Scripts & Tools

**Development:**
- `npm run dev` - Next.js dev server on port 3000
- `npm run dev:local` - Dev server pointing to local PostgreSQL via `node db/servidor.js`
- `npm run build` - Next.js production build
- `npm run start` - Production server
- `npm run demo` - Demo server on port 3001
- `npm run lint` - ESLint check (must exit 0 to pass gates)
- `npm test` - TypeScript compile + Node.js test runner on `tests/**/*.test.js`

**Database Tools:**
- `npm run db:migrar` - Apply pending migrations (points to Supabase via `.env`)
- Database CLI tools in `db/`: consultar.js, migracoes.js, logar-como.js, mapa.js, exportar-baterias.js, etc.
- All tools use `--env-file=<ambiente> db/<tool>.js --banco <name>` pattern

## Lock & Dependencies

**Dependency Policy:**
- Direct dependencies: 9 packages (react, next, pg, bcryptjs, jose, otpauth, qrcode, zod)
- DevDependencies: 7 packages (TypeScript, ESLint, TypeScript types)
- Minimal surface area by design
- No transitive external API clients (no axios, node-fetch, etc.)

---

*Stack analysis: 2026-08-10*
