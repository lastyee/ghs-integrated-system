# STEP 99 — Test Harness & Cleanup Safety Audit

**Date:** 2026-09-28  
**Repository:** `C:\ghs-integrated-system`  
**Scope:** Test and cleanup scripts only. No application business logic, schema, migration, deployment, or production database changes.

## 1. Executive Summary

**Final verdict: PASS_WITH_WARNING**

The highest-risk cleanup paths were hardened:

- `clean-db.mjs`, demo/test fixture provisioning, and the all-regressions runner now require an explicit mutation flag, an exact database-name confirmation, and a local disposable database named `ghs_integrated_test`. They refuse production runtime configuration and remote database/application hosts.
- The former substring cleanup in Step 82 was removed. Its cleanup now uses only fixture IDs recorded by that invocation. It is guarded to the disposable test database.
- Four older suites that had pre-test substring cleanup were changed to remove those broad deletes and require an isolated-test-database confirmation.
- Broad Step 80/81 AuditLog cleanup predicates were removed. The runner no longer runs a raw query to terminate idle database connections.
- The five required delete suites passed. The before/after snapshots show all protected manual records and business counts unchanged. AuditLogs increased only from test activity and were retained.

Warning: the repository still contains older direct-invocation test scripts that have not yet adopted the shared target guard, and some remove AuditLogs by exact fixture IDs. Those legacy suites were not run. They remain technical debt and must not be run against a development/manual-data or production database.

## 2. Cleanup Inventory

The audit searched the 58 existing `scripts/*.mjs` files and the Prisma seed for `deleteMany`, `delete`, `updateMany`, raw SQL deletion/truncation, broad string predicates, audit cleanup, and fixture provisioning.

| Script / source | Observed behavior | Disposition |
|---|---|---|
| `scripts/clean-db.mjs` | Deletes rows across assessment scores, assessments, attendance, certificates, placements, interviews, applications, vacancies, employers, and documents. It also targets Schedule/Class/User by a `contains` predicate. | Intentionally destructive; now fails closed unless local `ghs_integrated_test`, `CLEAN_DB_ALLOW_DESTRUCTIVE=YES`, and `CLEAN_DB_CONFIRM_DATABASE=ghs_integrated_test` are supplied. Not run. Disposable-test-database utility only. |
| `scripts/cleanup-demo-users.mjs` | Looks up only the exact `admin.demo@ghs.local` and `student.demo@ghs.local` identities. Unlinks the Student from the student User before deleting that User; does not delete Student or Enrollment. Sets `userId=null` only on AuditLogs for the exact admin User ID, preserving the log rows. | Guarded to the local disposable test database with explicit opt-in and target confirmation. Not run. |
| `scripts/cleanup-test-fixtures.mjs` | Same two exact email identities; unlinks the Student relation and updates only AuditLogs associated with the exact admin User ID. No Student, Enrollment, or AuditLog deletion. | Guarded to the local disposable test database with explicit opt-in and target confirmation. Not run. |
| `scripts/provision-test-fixtures.mjs` | Upserts two fixed demo identities, can update their passwords/roles, and links Tiara’s Student record only when currently unlinked. | Guarded to the local disposable test database with explicit opt-in and target confirmation. Not run. |
| `scripts/test-step82-realistic-e2e.mjs` | Previously cleaned by `contains` on `"82"`, `"Grand Hyatt"`, and `".test82@ghs.local"`. Those broad cleanup calls are removed; cleanup uses recorded IDs only. It does not delete AuditLogs. | Guarded to `ghs_integrated_test`. Not run: its hard-coded baseline and demo-user assumptions do not match the current local database. |
| `scripts/run-all-regressions.mjs` | Runs a legacy suite list. Previously used raw SQL to terminate idle PostgreSQL sessions between suites. | Now requires explicit opt-in and confirmation of local `ghs_integrated_test`; session termination query removed. Not run. |
| Steps 67C, 69B, 70B, 71B, 80, and 81 | Had broad pre-cleanup or AuditLog predicates that were not tied to the current test’s fixture IDs. | Broad predicates removed; guards restrict these suites to local `ghs_integrated_test` with explicit opt-in. Not run. Step 67C exact-path MockStorage cleanup remains to be verified after removal of its former global clear. |
| `prisma/seed.js` | Uses upserts and creates demo/academic records, including users, batches, students, enrollments, classes, and schedules. No delete/truncate operation was found, but the seed can update existing records and create data. | Not executed; not a safe cleanup or repair mechanism for a manual-data database. |
| `scripts/bootstrap-superadmin.mjs` | Creates or updates the single user identified by `SUPERADMIN_EMAIL`, including password hash and SUPER_ADMIN role. No broad deletion was found. | Not executed. It is an administrative provisioning tool, not a test cleanup script; it does not yet use the shared mutation guard. |

No `TRUNCATE`, raw `DELETE FROM`, or `$executeRaw` deletion was found in the reviewed scripts/seed. Existing `$queryRaw` uses in the required suites are read-only integrity/orphan checks.

## 3. Unsafe Scripts

### Hardened, but deliberately not executed

- `clean-db.mjs` remains destructive by design inside a dedicated disposable database. It must not be pointed at `ghs_integrated` or any database containing manual/development records.
- `cleanup-demo-users.mjs`, `cleanup-test-fixtures.mjs`, and `provision-test-fixtures.mjs` target fixed demo identities; the database restriction is therefore essential. No cleanup/provisioning utility was run during this step.
- Step 82 is now exact-ID-cleaned, but still assumes baseline counts that differ from this database and requires demo actor accounts. Pre-run local counts included Users 1 (suite expects 3), Batches 3 (expects 2), Students 22 (expects 21), Enrollments 22 (expects 21), and Classes 12 (expects 10). It was skipped and made no changes.
- The all-regressions runner remains unsuitable for this populated development database. Its new guard requires the separate `ghs_integrated_test` target.

### Remaining legacy debt

Several older suites still lack a per-script explicit mutation flag/database guard, or contain cleanup/audit patterns that have not been fully migrated to the shared contract. Examples include `test-audit-pilot.mjs`, `test-enrollments.mjs`, Steps 65B, 66B/66C, 67B, 68B/68C, 69C, 70C, 71C, 73B–73D, 74B–74D, 76–78, and `test-subject-create.mjs`. Some use exact recorded fixture IDs, but that alone does not satisfy the complete opt-in/database-target contract.

These suites were not run. Do not invoke them against the development database until each has an explicit guard and its cleanup has been reviewed. The remaining work is legacy test-infrastructure debt; it does not alter production application code.

## 4. Safe Scripts

The required suites were reviewed for fixture tracking and cleanup before execution:

| Suite | Cleanup scope and relevant result |
|---|---|
| Step 90 | Uses per-run recorded IDs, including exact relation keys for junction cleanup. It does not delete AuditLogs. Database baselines returned to their pre-test values. |
| Step 94 | Uses per-run exact IDs and verifies the permission configuration rather than creating/deleting permissions. AuditLogs are retained. |
| Step 95 | Uses per-run exact IDs. Fixture-count checks report zero remaining fixtures; orphan Enrollment/Class/Schedule/Certificate checks report zero. |
| Step 96 | Uses per-run exact IDs. Fixture-count checks report zero remaining fixtures; orphan checks report zero. |
| Step 97 | Tracks exact document/student/user IDs; the absent-object fixture now has a dedicated tracked ID rather than selecting it by prefix. Mock storage reports 12/12 temporary objects removed. Audit history is retained. |

All five use `assertSafeMutationTarget` and require their individual `STEP90/94/95/96/97_TEST_ALLOW_MUTATIONS=YES` flag. They reject production runtime configuration, remote hosts, unexpected database names, and non-local application URLs.

## 5. Database Target Guards

Added `scripts/lib/test-safety.mjs`, a shared fail-closed guard. It:

- Requires a named explicit opt-in flag.
- Requires PostgreSQL and a local hostname.
- Requires the exact expected database name.
- Rejects `NODE_ENV=production` and `VERCEL_ENV=production`.
- Requires an exact confirmation variable for destructive/disposable-database tools.
- Requires local application URLs for HTTP-based suites.
- Prints the local database target without printing credentials.

The reusable unit check passed for missing opt-in, incorrect database confirmation, production configuration, remote host, and valid local disposable target.

The high-risk broad cleanup tools and legacy suites that received new guards require the exact disposable database `ghs_integrated_test`; none of them were run. The five required delete tests remain explicitly scoped to the verified local development database `ghs_integrated`.

## 6. Fixture Strategy

- Step 90 and Steps 94–97 use random per-run suffixes and track each created row ID.
- Cleanup in those suites is restricted to the tracked ID arrays or exact fixture relation IDs.
- Step 97 no longer discovers a cleanup row using `startsWith`; the missing-object fixture ID is recorded at creation.
- Step 82’s broad name-based cleanup was removed; its cleanup uses the IDs accumulated during the run. It remains skipped due stale baseline/demo-identity dependencies.
- Legacy fixed-identity provisioners are constrained to a separate disposable database. They were not executed.

## 7. AuditLog Safety

- The required Step 90 and Steps 94–97 tests do not delete AuditLogs. Their test audit records remain in the database.
- Step 80’s broad `ACTIVATE_ACCOUNT` cleanup and JSON-content cleanup were removed.
- Step 81’s broad JSON-content cleanup was removed.
- Older suites still contain exact-fixture-scoped AuditLog deletion (`entityId`/`userId` tied to tracked test IDs); these were not run and remain legacy cleanup debt. No cleanup run deleted the AuditLog table or used an unrestricted AuditLog `deleteMany`.
- `cleanup-demo-users.mjs` only nulls `userId` for logs associated with one exact admin User ID; it does not delete those logs.

## 8. Changes Applied

- Added shared fail-closed `scripts/lib/test-safety.mjs`.
- Added test-database guards to `clean-db.mjs`, demo/test fixture cleanup/provisioning, the all-regressions runner, Step 82, and selected older suites with known broad cleanup patterns.
- Removed the broad substring pre-cleanups from Steps 67C, 69B, 70B, and 71B.
- Removed broad AuditLog predicates from Steps 80 and 81.
- Removed Step 67C’s request to clear all MockStorage objects; exact-path object cleanup remains unverified and is recorded as technical debt.
- Removed the regression runner’s raw idle-session termination query.
- Updated Step 90 and Steps 94–97 to call the shared guard; Step 97 now tracks its missing-object document ID explicitly.
- No application business logic, Prisma schema, or migration was changed.

## 9. Tests Executed

| Test | Result |
|---|---|
| `scripts/test-step90-delete-phase1.mjs` | PASS — 51/51; baseline business-record counts restored. |
| `scripts/test-step94-assessment-delete.mjs` | PASS — all assertions passed; manual rows unchanged; fixture cleanup passed. |
| `scripts/test-step95-batch-delete.mjs` | PASS — all assertions passed; zero remaining fixtures and zero checked orphans. |
| `scripts/test-step96-instructor-delete.mjs` | PASS — all assertions passed; zero remaining fixtures and zero checked orphans. |
| `scripts/test-step97-document-delete.mjs` | PASS — all assertions passed; Mock-storage cleanup 12/12; no document/student orphans. |
| Mutation-guard unit checks | PASS — missing opt-in, wrong confirmation, production environment, and remote host rejected; valid isolated target accepted. |

The older regression suite and cleanup/provisioning scripts were not executed.

## 10. Tests Skipped

- `scripts/clean-db.mjs` — SKIPPED; destructive by design, even though now fail-closed to the disposable test database.
- `scripts/cleanup-demo-users.mjs`, `scripts/cleanup-test-fixtures.mjs`, `scripts/provision-test-fixtures.mjs` — SKIPPED; not needed for required tests and mutate fixture identities.
- `scripts/run-all-regressions.mjs` — SKIPPED; includes legacy suites, and is now restricted to the separate disposable database.
- `scripts/test-step82-realistic-e2e.mjs` — SKIPPED; stale baseline and missing expected demo actors. No cleanup script was run.
- Other legacy regression tests with unresolved guard/cleanup debt — SKIPPED; no unsafe suite was run to “see what happens.”

## 11. Manual Data Integrity

Read-only snapshots were taken immediately before and after the five required suites on local `ghs_integrated`.

| Record | Before | After |
|---|---|---|
| Batch `GHI-09` | ID `cmukmu1f9002bkdmm928uf9r6`; Program `cmuf0q4xo001viluaaszer1qz`; 1 Enrollment; 0 Classes; 0 Certificates | Same ID, Program, dates, Enrollment and related Student; 0 Classes and Certificates |
| Student NIM `269067460` | ID `cmukmxyiw002fkdmmsxmph01v`; name `MUHAMAD RIVQI`; `deletedAt=null`; Enrollment `cmukn0ca4002kkdmmnhr9embf` | Same ID, name, active state, and Enrollment/Batch relationship |
| Employer `bounty` | ID `cmukmgv1e000ikdmm3wab04eg` | Same ID and name |
| Vacancy `KITCHEN` | ID `cmuknh1cr0035kdmm9o2paobc`; linked to `bounty`; related Placement `cmuknm8ns003dkdmmbx0zixoc` | Same ID, employer link, Placement ID and links; Placement status remains `PREPARATION` |
| KTP Document | ID `doc_4aefd49e8447405c9984192c6155f63e`; Student `cmuf0q4z80029iluaxnkd2ke4`; status `PENDING`; `Screenshot__540_.png`; 180,918 bytes | Same ID, Student, status, filename, size, file type and storage path |

Business counts were unchanged: User 1, Instructor 6, Program 1, Batch 3, Student 22, Enrollment 22, Subject 6, Class 12, Schedule 10, Employer 1, Vacancy 1, Application 0, Interview 0, Placement 1, Document 1, Certificate 0. AuditLogs increased from 1,023 to 1,071 (+48 test-generated events); no AuditLog cleanup was performed by the required suites.

## 12. Remaining Technical Debt

- Finish inventorying and applying per-script explicit opt-in and database guards to older direct-invocation test scripts listed above.
- Convert all legacy test fixtures to unique per-run identifiers and exact tracked IDs; do not rely on fixed emails, names, or a prior test’s leftovers.
- Review exact-fixture AuditLog deletion in older tests and prefer retaining historical events or using a disposable isolated database.
- Add and verify exact-path MockStorage cleanup for Step 67C fixtures; the former global clear was removed and the suite was not run.
- `test-step82-realistic-e2e.mjs` needs a dedicated fixture setup and updated baseline assertions before it is eligible to run.
- `bootstrap-superadmin.mjs` is an exact-identity administrative updater but lacks the shared target confirmation; it was not run.
- `clean-db.mjs` is safe only when deliberately directed to a disposable `ghs_integrated_test`; its broad deletes remain intentional within that isolated database.

## 13. Quality Gates

| Gate | Result |
|---|---|
| `node --check` for all 18 changed/added `.mjs` scripts | PASS |
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS — four migrations found; database up to date |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS; Git emitted only existing LF/CRLF working-copy warnings |
| `git diff --name-only -- prisma/schema.prisma prisma/migrations` | Empty |

## 14. Final Verdict

**PASS_WITH_WARNING**

High-risk cleanup and fixture provisioning now fail closed to a separately confirmed disposable local database; Step 82 no longer uses broad cleanup; required delete suites pass; and protected manual data is unchanged. Warning remains for unguarded legacy direct-invocation test scripts and older exact-ID AuditLog cleanup patterns. Those suites were skipped and must be hardened before use against any populated database.
