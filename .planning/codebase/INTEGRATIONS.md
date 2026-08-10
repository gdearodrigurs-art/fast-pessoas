# External Integrations

**Analysis Date:** 2026-08-10

## APIs & External Services

**None detected.** This system is self-contained. No third-party APIs are integrated for payments, messaging, workforce management, or external data services. The application is designed to operate independently.

## Data Storage

**Databases:**
- PostgreSQL (primary)
  - Connection: `DATABASE_URL` environment variable
  - Client: `pg` package (Node.js PostgreSQL client)
  - Schemas: `sistema` (identity/permissions), `rh` (people domains), `rh_clima` (check-in), `rh_folha` (payroll), `fiscal` (e-Social/FGTS), `audit` (append-only trails)
  - Environments: 
    - Development: Local PostgreSQL via `.env.local-db`
    - Presentation/Demo: Supabase via `.env` (read-only, writes guarded by deployment hooks)
  - Location: `src/lib/banco.ts` — connection pooling, transaction management, consultar helpers

- Supabase (presentation-only)
  - Role: Read-only demonstration database
  - Connection: `DATABASE_URL` in `.env` file pointing to `supabase.com`
  - Write Protection: Git hooks prevent `node --env-file=.env db/migrar.js` (writes are rejected)
  - Note: Same pg client used; only connection string differs

**File Storage:**
- Current Implementation: BYTEA in database (PostgreSQL binary column)
  - Location: `src/dominios/documentos/armazenamento.ts` — `armazenamentoBytea` implementation
  - Limit: 10 MB per document (enforced by CHECK constraint)
  - Stored in: `rh.documento.conteudo` column
  
- Planned Migration: Object storage (S3 or Supabase Storage)
  - Interface: `ArmazenamentoDocumentos` abstraction ready
  - Approach: Metadata stays in database; binary content moves to bucket
  - Migration: Can swap implementations without changing service layer

**Caching:**
- None. No Redis, Memcached, or other caching layer detected.

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based sessions (no third-party auth service)
  - Implementation: `src/lib/sessao.ts`
  - Algorithm: HS256 (HMAC SHA-256)
  - Signing Key: `SESSAO_SEGREDO` environment variable
  - Payload: `usuario_id`, `papel`, `nome`, `pendente_2fa` (claim for 2FA state)
  - Duration: 8 hours
  - Storage: HttpOnly, Secure, SameSite=Lax cookie named `fp_sessao`

**Two-Factor Authentication:**
- TOTP (Time-based One-Time Password)
  - Library: `otpauth` 9.5.1
  - QR Code: `qrcode` 1.5.4 (for user setup)
  - Implementation: `src/dominios/identidade/` services
  - Enforcement: Required for `rh`, `dp`, `diretoria`, `admin` roles (application-level check)
  - 2FA State: JWT claim `pendente_2fa` tracks incomplete setup
  - Validation: TOTP window enforced during login

**Middleware/Proxy:**
- Proxy Handler: `src/proxy.ts` (Next.js middleware, NOT named `middleware.ts`)
  - Guards: Session validation, 2FA enforcement at request edge
  - Routes: Free routes `/entrar`, `/api/identidade/entrar`
  - Pending 2FA: Access limited to `/configurar-2fa` and specific identity APIs

**Password Security:**
- Hashing: bcryptjs 3.0.3
- Process: Application-level hashing before database storage
- Location: `src/dominios/identidade/servico.ts` — authentication logic

## Data Encryption

**Health Data (LGPD Compliance):**
- Algorithm: AES-256-GCM (Galois/Counter Mode)
- Key: `CHAVE_CIFRA_SAUDE` environment variable (32 bytes in base64url)
- Implementation: `src/lib/cifra.ts`
- Scope: Medical/health-related data only (LGPD Article 11)
- Format: `iv:tag:cifrado` (each part in base64, concatenated with colons)
  - iv: 12 bytes (GCM recommended)
  - tag: Authentication tag (14-16 bytes)
  - cifrado: Encrypted text (base64)
- Plaintext: Never stored in database, logs, or audit trail
- Decryption: Application-layer only; no pgcrypto

## Monitoring & Observability

**Error Tracking:**
- None detected. No Sentry, DataDog, or similar service.

**Logs:**
- Standard: `console.error()` in error handlers
- Location: Application stderr
- Sensitive Data: Errors logged include structure but shield specific values (see `src/lib/http.ts`)
- Audit Trail: `audit.alteracao` and `audit.leitura_sensivel` tables (database-level)

## CI/CD & Deployment

**Hosting:**
- Self-hosted or cloud VM (not detected; deployment infrastructure not in codebase)
- Entry Points: `npm run start` (production Next.js server) or `npm run start:local` (local server)

**CI Pipeline:**
- Git Hooks: Pre-commit gates
  - No overwrites to git history (prevent rebase, reset, cherry-pick)
  - No write to Supabase (prevent migrations against demo DB)
  - No delete of migrations or proofs
  - Lint must pass (`npm run lint`)
  - Tests must pass (`npm test`)
- Build: `npm run build` produces `.next/` output

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string (host, user, password, port, database name)
- `SESSAO_SEGREDO` - JWT signing key for session cookies (32+ characters)
- `CHAVE_CIFRA_SAUDE` - AES-256 key for health data encryption (32 bytes in base64url)
- `NODE_ENV` - Set to `production` in production (affects cookie security)

**Secrets location:**
- `.env` - Supabase connection (presentation demo, shared in repo with read-only credentials)
- `.env.local-db` - Local PostgreSQL connection (development, not committed, local machine only)
- `.env.example` - Template (shows required variables, no secrets)

**No Hardcoded Secrets:**
- Database credentials: Loaded from `DATABASE_URL`
- Encryption keys: Loaded from environment variables
- JWT secrets: Loaded from `SESSAO_SEGREDO`
- No secrets in code, comments, or version control

## Webhooks & Callbacks

**Incoming:**
- None detected. System does not expose webhooks for external systems to call.

**Outgoing:**
- None detected. System does not call external services or invoke webhooks on other systems.

## Database Schema Dependencies

**Services Domain:**
- `rh.usuario` — User accounts, roles, TOTP secrets
- `rh.colaborador` — Employee/collaborator records
- `rh.evento_colaborador` — Append-only timeline of employee events
- `sistema.permissao` — Permission registry (keys)
- `sistema.papel_permissao` — Role-to-permission mapping
- `audit.alteracao` — Write audit trail
- `audit.leitura_sensivel` — Sensitive data access audit trail

**Access Control:**
- Database-level: Row-level security (RLS) policies (if configured in migrations)
- Application-level: Permission keys checked via `sistema.tem_permissao()` function
- `app.usuario_id` session context set per transaction (see `src/lib/banco.ts` — `comTransacao`)

---

*Integration audit: 2026-08-10*
