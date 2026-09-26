# GHS Integrated System — Production Deployment Runbook

> **PRE-DEPLOYMENT PLANNING & RUNBOOK ONLY**  
> **Status:** PREPARATION & HARDENING COMPLETE (NOT YET DEPLOYED)  
> **Target Architecture:** Next.js (App Router) on Vercel + Hosted PostgreSQL + Supabase Storage

---

## 1. Prerequisites

Before initiating any production deployment, ensure the following prerequisites are met:

1. **Git Repository**: Clean repository state on the `main` or release branch with all CI checks passing (`tsc`, `lint`, `build`, and regression suites).
2. **Vercel Account & CLI/Dashboard Access**: Organization or team account configured with permissions to link repository and set environment variables.
3. **Hosted PostgreSQL Database**:
   - PostgreSQL instance (v14, v15, or v16) provisioned on a managed provider (e.g., Supabase Postgres, Neon, AWS RDS, or Railway).
   - Connection pooler recommended for serverless execution (e.g., PgBouncer / Transaction pooler mode).
   - Direct connection string available for running database migrations.
4. **Supabase Project for Object Storage**:
   - Active Supabase project with Storage enabled.
   - Project URL and Service Role API Key retrieved securely.
5. **Domain & DNS**:
   - Custom domain configured with SSL/TLS termination at Vercel edge.
6. **Zero Migration Blockers**:
   - `npx prisma migrate status` must confirm all migrations are applied and schema matches migrations.

---

## 2. Environment Variables & Configuration Matrix

Only environment variables genuinely consumed by the application are listed. Never commit real credentials to source control.

| Variable Name | Purpose | Visibility | Required / Optional | Target Environments |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string for Prisma ORM | Server-only | **Required** | Development, Staging, Production |
| `AUTH_SECRET` | 32+ byte cryptographic secret for Auth.js (NextAuth v5) session encryption & CSRF | Server-only | **Required** | Development, Staging, Production |
| `AUTH_URL` / `NEXTAUTH_URL` | Canonical origin URL (e.g., `https://system.ghs.ac.id`) for Auth.js callbacks and redirect security | Server-only | **Required in Prod** | Staging, Production |
| `AUTH_TRUST_HOST` | Set to `true` if behind a proxy/CDN (or when deployed on Vercel) so Auth.js trusts forwarded host headers | Server-only | **Required in Prod** (or `true`) | Staging, Production |
| `STORAGE_PROVIDER` | Document storage engine (`"supabase"`, `"mock"`, or `"local"`). Production **must** be `"supabase"`. | Server-only | **Required in Prod** | Development (`mock`), Staging/Prod (`supabase`) |
| `SUPABASE_URL` | HTTPS endpoint for Supabase project (e.g., `https://[project-ref].supabase.co`) | Server-only | **Required in Prod** | Staging, Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key with storage administration rights (used exclusively on server) | Server-only | **Required in Prod** | Staging, Production |
| `SUPABASE_STORAGE_BUCKET` | Dedicated Supabase Storage bucket for student & verification documents (defaults to `"documents"`) | Server-only | Optional (default: `"documents"`) | Staging, Production |
| `SUPABASE_CERTIFICATES_BUCKET` | Dedicated Supabase Storage bucket for certificates (defaults to `"certificates"`) | Server-only | Optional (default: `"certificates"`) | Staging, Production |
| `NODE_ENV` | Runtime environment flag (`"production"`, `"development"`, `"test"`) | Node / Bundler | Provided by platform | Development, Staging, Production |

---

## 3. Configuring Vercel Environment Variables

When creating or configuring the Vercel project:

1. Navigate to **Project Settings > Environment Variables** in the Vercel Dashboard.
2. Add variables separately for **Production**, **Preview** (Staging), and **Development**.
3. **Sensitive Keys**: Mark `DATABASE_URL`, `AUTH_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` as **Sensitive** in Vercel to restrict decryption in logs and non-admin team members.
4. **Generate `AUTH_SECRET`**:
   ```bash
   npx auth secret
   # Or using OpenSSL:
   openssl rand -base64 33
   ```
5. Ensure `STORAGE_PROVIDER=supabase` is set for Production and Preview environments.

---

## 4. PostgreSQL Database Preparation

1. **Provisioning**: Create a fresh, empty PostgreSQL database on your managed hosting platform.
2. **Connection Pooling**:
   - Serverless Next.js functions create short-lived connections. If using PgBouncer/Supabase Pooler, ensure `?pgbouncer=true` or pool mode parameters are set on `DATABASE_URL` if required by the provider.
   - If using a pooled connection, set a separate `DIRECT_URL` in `schema.prisma` if Prisma migrations require direct session mode (standard Prisma best practice).
3. **Network Access**: Configure firewall/allowlist rules allowing Vercel IP ranges or enable SSL mode (`sslmode=require`).

---

## 5. Prisma Migration Execution (Production Safe)

> **CRITICAL RULE**: In production, **NEVER** run `prisma migrate dev` or `prisma db push`. Always use `prisma migrate deploy`.

### Step 1: Verify Migration Integrity Locally
```bash
npx prisma validate
npx prisma migrate status
```

### Step 2: Apply Migrations to Production Database
Run migration deployment from a secure CI/CD pipeline or secure administrative CLI with access to production `DATABASE_URL`:
```bash
npx prisma migrate deploy
```
*`prisma migrate deploy` only executes pending, versioned migration files in `prisma/migrations/`. It never prompts interactively and will fail safely if a migration drift or conflict occurs.*

---

## 6. Storage Bucket Preparation in Supabase

1. Open Supabase Dashboard > **Storage**.
2. Create Bucket 1:
   - **Name**: `documents` (or value matching `SUPABASE_STORAGE_BUCKET`)
   - **Public Access**: **Disabled (Private)**. Documents contain sensitive student records, identity cards, and academic transcripts.
3. Create Bucket 2:
   - **Name**: `certificates` (or value matching `SUPABASE_CERTIFICATES_BUCKET`)
   - **Public Access**: **Disabled (Private)**.
4. **Access Control & Policies**:
   - Storage operations in this application run exclusively server-side via `SUPABASE_SERVICE_ROLE_KEY`.
   - Access to documents is authorized via application API routes and signed download URLs.
   - Do not allow public anonymous read or write on storage buckets.

---

## 7. Supabase Storage Configuration & Verification

1. Verify environment configuration:
   - `STORAGE_PROVIDER="supabase"`
   - `SUPABASE_URL="https://[project].supabase.co"`
   - `SUPABASE_SERVICE_ROLE_KEY="[service-role-secret]"`
2. Verify signed URL expiration time in `lib/storage.ts` (configured securely for short-lived access).
3. Ensure mock storage is completely disabled in production.

---

## 8. Auth.js (NextAuth v5) Production Configuration

1. In `lib/auth.ts`:
   - Production mode activates strict origin checks.
   - Ensure `AUTH_SECRET` is defined; if missing, Auth.js will fail startup to protect session integrity.
   - Set `AUTH_URL=https://[your-production-domain]` in environment variables.
   - If behind Vercel edge reverse proxy, verify `AUTH_TRUST_HOST=true` or ensure `trustHost: true` handles forwarded headers appropriately.
2. Verify session cookies:
   - Auth.js automatically configures `__Secure-` cookie prefixes when HTTPS is enabled.

---

## 9. Production URL Configuration & DNS

1. Add custom domain (e.g., `system.ghs.ac.id`) in Vercel project domains.
2. Configure DNS CNAME / A records as instructed by Vercel.
3. Wait for Vercel automatic Let's Encrypt SSL/TLS issuance.
4. Verify HTTPS redirect is enforced globally.

---

## 10. Build Command & Build Configuration

In Vercel Project Settings > **Build & Development Settings**:

- **Framework Preset**: `Next.js`
- **Build Command**:
  ```bash
  prisma generate && next build
  ```
  *(Or `npm run build` where `package.json` includes `prisma generate`)*
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install` (or `npm ci`)

---

## 11. Start & Runtime Expectations

1. **Serverless Execution**: API routes and Server Components execute as Vercel Serverless Functions (Node.js runtime).
2. **Cold Starts**: Database connection reuse is managed via the global PrismaClient singleton in `lib/auth.ts` / server modules.
3. **Stateless Instances**: No local filesystem persistence exists in serverless runtime. All file uploads must flow to Supabase Storage.
4. **Demo Credentials**: In production (`NODE_ENV=production`), quick test login shortcuts and demo credentials in `app/login/page.tsx` are completely removed from the DOM and client JavaScript bundles via compile-time dead code elimination.

---

## 12. Post-Deployment Verification Checklist

Execute immediately following a production deployment:

1. **Security Headers**:
   ```bash
   curl -I https://[your-domain]/login
   ```
   Confirm presence of:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
2. **Login Page Inspection**:
   - Open `https://[your-domain]/login` in browser.
   - Inspect page source: confirm **NO** demo credentials, test passwords, or pre-filled shortcuts exist.
3. **Superadmin Login**:
   - Authenticate with the initial superadmin credential.
   - Verify dashboard loads with correct role badge.
4. **Student Activation**:
   - Verify `/aktivasi` route works for student account initialization.
5. **Document Upload & Retrieval**:
   - Upload a test verification document.
   - Verify file persists to Supabase Storage `documents` bucket.
   - Verify signed download link functions and expires.

---

## 13. Database Backup Considerations

1. **Automated Snapshots**: Ensure automated daily backups are enabled in the hosted PostgreSQL provider with at least 7–14 days point-in-time recovery (PITR).
2. **Pre-Migration Backups**: Take a manual snapshot before executing any future `npx prisma migrate deploy`.
3. **Logical Dumps**: Test `pg_dump` recovery periodically:
   ```bash
   pg_dump -Fc --no-acl --no-owner -h [host] -U [user] -d [dbname] > backup.dump
   ```

---

## 14. Rollback Considerations

1. **Application Rollback**: Vercel supports instant one-click rollback to any previously successful deployment artifact.
2. **Database Schema Rollback**:
   - Prisma migrations cannot automatically unapply down-migrations.
   - Any schema change must follow **Expand and Contract** patterns (backward-compatible changes first).
   - If rollback requires schema reversion, apply a corrective forward migration (`npx prisma migrate deploy`).

---

## 15. Rate Limiting Deployment Consideration

- **Current Implementation**: In-memory rate limiting (`lib/rate-limit.ts` and `app/api/auth/activate/route.ts`).
  - Limits: 30 requests/minute per IP, 8 attempts/minute per NIM.
- **Serverless Reality**:
  - In a multi-instance serverless deployment (Vercel), in-memory state is local to each serverless container instance.
  - While this provides baseline defense against burst attacks on a single warm container, it does not share state across distributed lambdas.
- **Deployment Requirement**:
  - **Status: DEPLOYMENT CONFIGURATION REQUIRED**
  - Before high-traffic production launch, evaluate moving the rate-limit store to a shared distributed cache (e.g., Upstash Redis or Vercel KV) with zero changes to business logic or route thresholds.

---

## 16. Trusted Proxy & Client IP Review

- **Current Implementation**:
  - Client IP in `app/api/auth/activate/route.ts` is obtained via `x-forwarded-for` header with fallback to `"127.0.0.1"`.
- **Platform Verification Needed**:
  - On Vercel, `x-forwarded-for` contains a comma-separated list of client and proxy IPs, or `x-real-ip` / `x-vercel-forwarded-for` is injected by the trusted Vercel Edge.
  - To prevent client-spoofed headers when behind Vercel, the IP parser should read the leftmost IP from `x-forwarded-for` or the platform-trusted `x-real-ip`.
- **Deployment Requirement**:
  - **Status: DEPLOYMENT CONFIGURATION REQUIRED**
  - Verify Vercel edge IP header behavior during staging deployment testing.

---

## 17. Security Headers Verification Matrix

The application configures the following headers in `next.config.ts`:

| Header | Production Value | Verification Scope | Status |
| :--- | :--- | :--- | :--- |
| `X-Content-Type-Options` | `nosniff` | All routes (`/(.*)`) | Verified PASS |
| `X-Frame-Options` | `DENY` | All routes (`/(.*)`) | Verified PASS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | All routes (`/(.*)`) | Verified PASS |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | All routes (`/(.*)`) | Verified PASS |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | All routes (`/(.*)`) | Verified PASS |
| `Content-Security-Policy` | *Deferred to staging validation* | - | Documented future hardening |

*Note: Content-Security-Policy (CSP) is deliberately deferred to avoid breaking Next.js runtime script hashes, Auth.js redirects, or Supabase signed storage URLs without staging-environment validation.*

---

## 18. Secret Management Best Practices

1. **No Hardcoded Secrets**: Secrets must never be committed to Git.
2. **Access Control**: Production database passwords and Supabase service role keys must be known only to designated administrators.
3. **Rotation Plan**: Establish a 90-day rotation procedure for `AUTH_SECRET` and database service credentials.
4. **Audit Logs**: Periodically inspect Vercel environment variable change history.

---

## 19. Monitoring, Observability & Error Logging

1. **Vercel Analytics & Speed Insights**: Enable for tracking Core Web Vitals and edge latency.
2. **Serverless Function Logs**: Review runtime exceptions via Vercel Runtime Logs.
3. **Database Telemetry**: Monitor active connections, CPU utilization, and slow queries in PostgreSQL provider console.
4. **Storage Metrics**: Monitor bucket usage, egress bandwidth, and 4xx/5xx API rates in Supabase console.

---

## 20. What MUST NOT Be Run in Production

> ⛔ **STRICT PROHIBITIONS FOR PRODUCTION ENVIRONMENTS**

1. ❌ **NEVER run `scripts/clean-db.mjs`**:
   `scripts/clean-db.mjs` executes destructive `TRUNCATE ... CASCADE` across all business tables and resets sequences. Running this against a production database will result in **IRRECOVERABLE DATA LOSS**.
2. ❌ **NEVER run `prisma migrate reset`**:
   Drops the entire database and re-runs migrations from scratch.
3. ❌ **NEVER run `prisma db push`**:
   Bypasses versioned migrations and can silently drop tables or columns with schema drifts.
4. ❌ **NEVER run development seeders without verification**:
   `prisma/seed.ts` or local test setup scripts contain development fixtures. Production initial seeding must only be done through official superadmin provisioning.
5. ❌ **NEVER expose demo or test bypass endpoints in production**:
   Ensure all test routes (such as `/api/authz-test`) are restricted or removed before public launch.

---

## Environment Separation Summary

| Dimension | DEVELOPMENT | TEST / STAGING | PRODUCTION |
| :--- | :--- | :--- | :--- |
| **Database** | Local PostgreSQL (`localhost:5432`) | Staging Hosted PostgreSQL | High-Availability Managed PostgreSQL |
| **Storage** | Mock Storage (`STORAGE_PROVIDER=mock`) | Supabase Staging Project | Supabase Production Project (Private Buckets) |
| **Auth Secret** | Local development secret | Staging generated secret (32 bytes) | Production cryptographically secure secret |
| **Auth Host Trust** | `trustHost: true` (automatic in dev) | `AUTH_TRUST_HOST=true` | `AUTH_TRUST_HOST=true` + `AUTH_URL` |
| **Demo Login UI** | Rendered for testing convenience | **Hidden** | **Hidden** (Dead-code eliminated) |
| **Migrations** | `prisma migrate dev` | `prisma migrate deploy` | `prisma migrate deploy` (only via pipeline) |
| **Reset Tools** | Permitted (`scripts/clean-db.mjs`) | Restricted with caution | ⛔ **STRICTLY PROHIBITED** |
