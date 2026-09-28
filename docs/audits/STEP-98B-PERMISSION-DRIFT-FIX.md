# STEP 98B — Delete Permission Drift Fix

**Date:** 2026-09-28  
**Target:** Local development database `ghs_integrated` on `localhost`  
**Policy reference:** Step 93 `SYSTEM_POLICY` and Step 94–97 implementation requirements; not a new or official GHS business rule.

## 1. Root Cause

Step 98 found that the live local database did not contain four Phase 2 delete permissions. The authorization helper correctly requires a database-backed `RolePermission`; the API routes were not bypassing authorization.

The intended definitions and mappings were already present in `prisma/seed.js`. The full seed is not a safe synchronization path for this database: after upserting permissions/roles, it also upserts demo users and program/student records and may create enrollments. It was therefore not run.

The Phase 94–97 test harnesses also treated missing application permissions as disposable test fixtures: they created the permission and role links when absent, then deleted those rows during cleanup. That makes running a harness on an unsynchronized database capable of reintroducing the drift. Those harnesses are now verification-only for permission configuration: they require the canonical definition and exact role mapping to exist and never create or delete permission configuration.

The repository does not define these four permissions in migration history; they are RBAC seed data, not schema. `scripts/bootstrap-superadmin.mjs` only provisions or updates the SUPER_ADMIN user and is not a permission source. `lib/authorization.ts` is the runtime database-backed checker, not a permission registry.

## 2. Source-of-Truth Audit

| Source | Finding |
|---|---|
| `prisma/seed.js` | Canonical permission definitions and `rolePermissionNames`; all four definitions and expected assignments already exist. Permission and role-link upserts are idempotent. |
| `scripts/bootstrap-superadmin.mjs` | Does not create permissions or role-permission links. It mutates a user account, so it is not an appropriate permission sync tool. |
| `lib/authorization.ts` | `requirePermission` reads the authenticated session user, then queries that user's current database role and permission assignment. Missing DB rows correctly yield 403. |
| Existing permission constants/registry | No separate permission registry was found. |
| Migration history | Four existing migrations; no permission data migration/source found or added. |
| Step 94–97 routes | Continue to call their server-side `requirePermission(...)`; no endpoint or business-rule changes were made. |

## 3. Permission Fix

Added `scripts/sync-delete-permissions.mjs`, a narrowly scoped synchronization utility. It:

- Requires explicit `DELETE_PERMISSION_SYNC_ALLOW_LOCAL_MUTATION=YES`.
- Refuses `NODE_ENV=production`, non-local hosts, and databases other than `ghs_integrated`.
- Requires all seven expected role records to exist.
- Creates only the four named Permission records if missing and adds only their allowed RolePermission links.
- Does not update existing Permission attributes, delete Permission records, alter unrelated roles/permissions, or touch Users/Students/academic records.
- Verifies the exact role set after synchronization; any unexpected assignment causes a transaction failure.
- Uses idempotent upserts and can be run repeatedly.

The full `prisma/seed.js` was deliberately not executed. No endpoint, authorization helper, schema, or migration was changed.

The Phase 94–97 harnesses were hardened to assert the permission definition and exact role assignments are already synchronized before creating their unique test Users. Permission and RolePermission rows are no longer created or removed by those tests. Their other fixture cleanup remains constrained to IDs tracked by that run.

## 4. Role Assignment Matrix

Queried directly from the local database after synchronization and after all targeted tests:

| Permission | Roles |
|---|---|
| `assessment:delete` | SUPER_ADMIN, ADMIN, ACADEMIC_STAFF |
| `batch:delete` | SUPER_ADMIN, ADMIN, ACADEMIC_STAFF |
| `instructor:delete` | SUPER_ADMIN, ADMIN, ACADEMIC_STAFF |
| `document:delete` | SUPER_ADMIN, ADMIN, ACADEMIC_STAFF, PLACEMENT_STAFF |
| `employer:delete` | SUPER_ADMIN, ADMIN |
| `vacancy:delete` | SUPER_ADMIN, ADMIN |
| `program:delete` | SUPER_ADMIN, ADMIN |
| `subject:delete` | SUPER_ADMIN, ADMIN |

No DELETE permission in this matrix is assigned to STUDENT, INSTRUCTOR, or MANAGEMENT.

## 5. Database Sync

The utility ran against the validated local database and added exactly four Permission records and thirteen RolePermission assignments:

- Permission count: 58 → 62.
- RolePermission count: 199 → 212.
- Role count: remained 7.
- All eight delete permissions and assignments matched the matrix above.

Only the four missing definitions and their expected links were synchronized. The idempotent implementation preserves any existing matching Permission metadata and RolePermission link. No database reset, broad seed, migration, or global cleanup ran.

## 6. Manual Data Integrity

Read-only snapshot was captured immediately before synchronization and repeated after all five tests. The required records remained present with the same IDs and checked attributes:

| Record | Before | After |
|---|---|---|
| Batch `GHI-09` | `cmukmu1f9002bkdmm928uf9r6`; Program `cmuf0q4xo001viluaaszer1qz`; 1 Enrollment | Same ID, Program, dates, and Enrollment |
| Student NIM `269067460` | `cmukmxyiw002fkdmmsxmph01v`; `MUHAMAD RIVQI`; `deletedAt=null`; 1 Enrollment | Same ID, name, state, and Enrollment |
| Employer `bounty` | `cmukmgv1e000ikdmm3wab04eg` | Same ID and name |
| Vacancy `KITCHEN` | `cmuknh1cr0035kdmm9o2paobc` | Same ID/title and linked to `bounty` |
| Related Placement | `cmuknm8ns003dkdmmbx0zixoc`; linked to Vacancy `cmuknh1cr0035kdmm9o2paobc` | Same ID and relationship |
| KTP Document | `doc_4aefd49e8447405c9984192c6155f63e`; `PENDING`; `Screenshot__540_.png`; 180,918 bytes | Same ID, status, filename, size, and storage path |

Business table counts were unchanged across synchronization and tests: User 1, Instructor 6, Program 1, Batch 3, Student 22, Enrollment 22, Subject 6, Class 12, Schedule 10, Employer 1, Vacancy 1, Application 0, Interview 0, Placement 1, Document 1, Certificate 0. The final read-only verification counted 1,023 AuditLogs and retained the append-only audit history. Permission and RolePermission totals were 62 and 212. All test fixture checks reported zero remaining fixtures.

## 7. Targeted Test Results

Before execution, each test's target guard, unique fixture creation, cleanup ordering, and delete predicates were audited. Tests require explicit mutation opt-in and restrict the database/app target to local `ghs_integrated`/localhost. Phase 90–97 cleanup uses per-run exact IDs; no legacy regression suite or broad cleanup was run.

| Test | Result |
|---|---|
| `scripts/test-step90-delete-phase1.mjs` | PASS — 51/51; Phase 1 behavior, audit, RBAC, race, and manual records |
| `scripts/test-step94-assessment-delete.mjs` | PASS — allowed/forbidden roles, status/score dependencies, audit, concurrency, cleanup |
| `scripts/test-step95-batch-delete.mjs` | PASS — allowed/forbidden roles, Enrollment/Class/Schedule/Certificate dependencies, concurrency, cleanup |
| `scripts/test-step96-instructor-delete.mjs` | PASS — allowed/forbidden roles, Class/Schedule/User dependencies, concurrency, cleanup |
| `scripts/test-step97-document-delete.mjs` | PASS — eligible/VERIFIED status, retry/failure handling, RBAC, fixture cleanup |

Step 97 ran against the already-running local Next development server. Before tests, a temporary local probe account authenticated to the non-production storage-status endpoint and confirmed `MockStorageProvider` with zero initial object keys. The probe account was deleted by its exact ID. No Supabase production credentials or storage mutations were used.

## 8. Authorization Verification

All four Phase 2 handlers still call their corresponding `requirePermission(...)`, which verifies permission through the authenticated session user's database role. Existing role allowlists remain unchanged. Targeted tests verified eligible roles succeed and STUDENT/INSTRUCTOR/MANAGEMENT and other disallowed roles receive 403 as applicable. UI capability checks continue to use the existing server-side `userHasPermission` helper.

No client role/permission trust, bypass, fallback allow, or role hardcoding change was made.

## 9. Schema / Migration Verification

- `npx prisma validate`: PASS.
- `npx prisma migrate status`: PASS; database schema up-to-date, four migrations found.
- `git diff --name-only -- prisma/schema.prisma prisma/migrations`: empty.
- No migration, schema change, reset, or migration command that mutates data was performed.

## 10. Quality Gates

| Gate | Result |
|---|---|
| `node --check` on sync utility and five targeted test scripts | PASS |
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS; only existing line-ending warnings |
| Schema/migration diff | None |

## 11. Remaining Warnings / TBD

- Real Supabase Storage integration was not exercised. Step 97 used Mock storage and mocked Supabase provider contract responses; production storage was neither accessed nor mutated.
- Node emits a non-blocking `MODULE_TYPELESS_PACKAGE_JSON` warning when Step 97 imports `lib/storage.ts` directly from the test script.
- Official GHS policy approval remains outside this technical permission synchronization.

## 12. Final Verdict

**PASS_WITH_WARNING**

All four Phase 2 permissions are present with the required exact role assignments; all eight DELETE permission mappings match policy; the API authorization paths are unchanged; five targeted suites pass; manual records remain unchanged; all quality gates pass; and no schema or migration changed. The only remaining warning is the intentionally untested live Supabase integration (plus the non-blocking Node module-type warning).
