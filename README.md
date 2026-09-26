# GHS Integrated Training & Career Information System

An integrated management information system tailored for **Global Hospitality Sukabumi (GHS)** to streamline and govern academic training, student verification, and international career placement workflows.

---

## Overview

The GHS Integrated System is a comprehensive platform engineered to manage the entire vocational lifecycle of hospitality students—from admission and academic training through evaluation, certification, employer partnerships, job applications, interview scheduling, and global placement tracking.

---

## Main Capabilities

- **Authentication & RBAC**: Secure multi-role authentication with strict server-side permission gating via Auth.js (NextAuth v5) and bcrypt password encryption.
- **Student Management**: Full profile administration, automated registration, self-service account activation, and identity verification.
- **Academic & Training Management**: Comprehensive management of educational programs, cohort batches, subjects, classes, and schedules.
- **Attendance**: Session-based attendance tracking with validation, status transitions (PRESENT, LATE, ABSENT, EXCUSED), and cross-batch boundary enforcement.
- **Assessment**: Multi-component grading system (assignments, practical exams, midterms, finals) with score validation and audit logging.
- **Documents**: Secure document upload, verification, and retrieval supporting local and cloud object storage (Supabase Storage).
- **Employer & Vacancy Management**: Partner hospitality employer management and international job opening catalogs.
- **Applications**: Student job application workflows with deterministic state transitions (APPLIED, SCREENING, INTERVIEW, SELECTED, REJECTED, WITHDRAWN).
- **Interviews**: Complete interview lifecycle management (PENDING, RESCHEDULED, PASSED, FAILED) linked directly to vacancies and candidate applications.
- **Placement**: Structured career placement tracking (PREPARATION, READY, DEPARTED, PLACED, CANCELLED) with departure and visa readiness management.
- **Certificates**: Academic and training certificate generation, tracking, serial number uniqueness enforcement, and revocation workflows.
- **Reports**: Role-filtered reporting dashboards covering academic performance, attendance metrics, and placement conversion rates.
- **Audit Logs**: Immutable audit log capture for high-consequence business mutations across all modules.

---

## User Roles

The system strictly enforces seven granular role definitions:

1. **Super Admin**: Full administrative authority, user account creation, role assignment, and platform configuration.
2. **Admin**: Operational management of academic entities, student master records, and institutional data.
3. **Academic Staff**: Creation and scheduling of classes, timetables, and academic rosters.
4. **Instructor**: Attendance logging, session notes, and student assessment scoring for assigned subjects.
5. **Placement Staff**: Partner employer management, vacancy publishing, interview tracking, and student placement coordination.
6. **Management**: Executive read-only oversight across organizational dashboards, performance metrics, and reports.
7. **Student**: Self-activation, personal profile management, schedule viewing, grades inspection, vacancy browsing, and application tracking.

---

## Core Business Flow

```
Student Registration
  ↓
Batch Enrollment
  ↓
Academic Training (Classes & Schedules)
  ↓
Daily Attendance Tracking
  ↓
Assessment & Grading
  ↓
Career Vacancy Application
  ↓
Interview Screening & Selection
  ↓
Global Placement Tracking
  ↓
Certificate Issuance
```

---

## Tech Stack

- **Core Framework**: [Next.js](https://nextjs.org/) 16 (App Router with Turbopack)
- **Language**: [TypeScript](https://www.typescriptlang.org/) 5
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4 & [shadcn/ui](https://ui.shadcn.com/)
- **Database & ORM**: [PostgreSQL](https://www.postgresql.org/) with [Prisma ORM](https://www.prisma.io/) v5
- **Authentication**: [Auth.js](https://authjs.dev/) (NextAuth v5 beta) with `bcryptjs`
- **Validation**: [Zod](https://zod.dev/) v4
- **Object Storage**: [Supabase Storage](https://supabase.com/storage) (Production) / Mock Storage (Local Development)
- **Icons & UI Utilities**: `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`
- **Target Deployment Platform**: [Vercel](https://vercel.com/) *(Deployment planned; currently local only)*

---

## Architecture

The application adopts a **Modular Monolith** architecture:
- **Next.js App Router**: Co-locates Server Components, Client Components, and Route Handlers for high performance and clean domain isolation.
- **Server-Side Authorization Layer**: Gated API routes (`lib/authorization.ts`, `lib/student-ownership.ts`) ensure that all mutations and data access queries validate permissions and identity server-side.
- **Database Layer**: Single PostgreSQL relational database with Prisma schema enforcing relational integrity, foreign keys, cascade safety, and unique constraints.
- **Edge Middleware**: Edge authentication proxy (`proxy.ts`) enforcing authenticated route protection before request execution.

---

## Project Structure

```
ghs-integrated-system/
├── app/                  # Next.js App Router pages, layouts, and API route handlers
├── components/           # Domain-driven UI components and reusable shadcn/ui components
├── docs/                 # Project documentation, requirements, business rules, and audits
├── lib/                  # Shared utilities: auth, storage, rate limiting, audit logging
├── prisma/               # Database schema, migration history, and initial seeders
├── public/               # Static web assets: institutional logos and campus visuals
├── schemas/              # Zod validation schemas matching database and API entities
├── scripts/              # Automated regression test suites, verification, and utilities
├── server/               # Server-only utilities such as bcrypt password verification
├── types/                # TypeScript type declarations and session augmentations
├── proxy.ts              # Edge authentication middleware
├── next.config.ts        # Next.js configuration and HTTP security headers
└── DEPLOYMENT.md         # Production deployment runbook
```

---

## Getting Started

### Prerequisites

- Node.js 20+ installed
- PostgreSQL 14+ running locally or accessible via network

### Local Setup

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to configure your PostgreSQL connection string and session secret:
   ```env
   DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/ghs_integrated?schema=public"
   AUTH_SECRET="your-generated-random-32-byte-secret"
   STORAGE_PROVIDER="mock"
   ```

3. **Run database migrations:**
   ```bash
   npx prisma migrate dev
   ```

4. **Seed initial development data:**
   ```bash
   npm run prisma:seed
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Database

- **Engine**: PostgreSQL is required. SQLite is **not** supported due to specific relational and enum requirements.
- **Migrations**: Database schema changes are tracked via Prisma migrations in `prisma/migrations/`.
  - In development: `npx prisma migrate dev`
  - In production: `npx prisma migrate deploy` (Never use `migrate dev` or `db push` in production)
- **Destructive Tools Warning**: `scripts/clean-db.mjs` is for local test resetting only. It executes table truncations and **MUST NEVER** be run in a production environment.

---

## Testing & Quality Gates

The system includes an extensive automated regression test suite covering academic integrity, state lifecycles, role permissions, and IDOR protection:

- **Run Full Regression Suite (22 test suites):**
  ```bash
  npm run test:regression
  ```
- **Type Checking:**
  ```bash
  npx tsc --noEmit
  ```
- **Linting:**
  ```bash
  npm run lint
  ```
- **Production Build Validation:**
  ```bash
  npm run build
  ```

---

## Documentation

Comprehensive project documentation is maintained in the repository:

- [Production Deployment Runbook](file:///c:/ghs-integrated-system/DEPLOYMENT.md) — 20-point guide for hosting on Vercel + Hosted PostgreSQL + Supabase Storage
- [Product Requirements Document (PRD)](file:///c:/ghs-integrated-system/docs/requirements/PRD.md) — Core functional specification and initial scope
- [Business Rules & Validation](file:///c:/ghs-integrated-system/docs/business-rules/attendance/) — Operational attendance and academic business rules
- [System Audit Reports](file:///c:/ghs-integrated-system/docs/audits/) — Historical audit verification records (Steps 81, 82, 83, 84, and 84C)

---

## Current Status

- **Core System**: Complete and hardened across all modules.
- **Quality Gates**: All 22 automated test suites passing (0 failures).
- **Security**: Security headers configured; demo credentials stripped from production bundles; rate limiting active.
- **Production Deployment**: **STRICTLY NOT STARTED** (Awaiting cloud infrastructure provisioning and administrative decision).
