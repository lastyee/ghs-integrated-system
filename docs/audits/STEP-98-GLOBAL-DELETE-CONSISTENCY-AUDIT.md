# STEP 98 — Global Delete Consistency & Data Lifecycle Audit

**Date:** 2026-09-28  
**Scope:** Read-only repository, local database, and test-cleanup audit.  
**Policy basis:** Supplied Step 89–97 expectations and the Step 93 `SYSTEM_POLICY`; this report does not represent official GHS approval.

## 1. Executive Summary

The application has eight active record DELETE endpoints: Employer, Vacancy, Program, Subject, Assessment, Batch, Instructor, and Document. Each uses authenticated server-side permission checks, server-side dependency/status checks, and records a success audit in the same database transaction as its record deletion. The seven non-Document routes use Serializable transactions; Document additionally locks its database row while deleting the external object and preserves a retryable row if database deletion fails. No AssessmentScore DELETE is active.

The audit found two reasons the overall verdict is **BLOCKED**:

1. The local database is missing all four permission records required by the Phase 2 endpoints (`assessment:delete`, `batch:delete`, `instructor:delete`, and `document:delete`). `requirePermission` checks the database, so those endpoints currently return 403 even for roles intended to be allowed, and their UI capabilities resolve false. The permission definitions and assignments exist in `prisma/seed.js`, but the database was not seeded because it contains manual records and this audit must not seed or mutate it.
2. `scripts/clean-db.mjs` contains unscoped table-wide `deleteMany()` calls. `scripts/test-step82-realistic-e2e.mjs` and several older test scripts also contain cleanup predicates based on non-unique substrings. These scripts are unsafe to run against a shared/manual database and were not executed.

Additional warnings: User/Student soft-delete policy is not implemented as an application delete lifecycle; the Step 90 routes use a generic audit action `DELETE`; live Supabase Storage was not exercised. No database data was changed, no test/regression suite was executed, and no schema or migration changes were made.

## 2. Delete Inventory

### 2.1 HTTP DELETE handlers

There are 32 explicit `DELETE` handlers under `app/api`: eight active record-delete endpoints below, plus 24 handlers that explicitly return 405. No other active application Prisma record-delete route or server action was found.

| Module / entity | Endpoint | Authorization | Dependency / lifecycle guard | Audit on success | UI / tests | Result |
|---|---|---|---|---|---|---|
| Employer | `DELETE /api/employers/[id]` — [route](../../app/api/employers/%5Bid%5D/route.ts) | `employer:delete`; permission is resolved from the authenticated session user's DB role | Blocks on Vacancy or Placement | Transactional; action `DELETE`, entity `Employer` | List/detail Delete actions; Step 90 tests | PASS with audit-action naming warning |
| Vacancy | `DELETE /api/vacancies/[id]` — [route](../../app/api/vacancies/%5Bid%5D/route.ts) | `vacancy:delete`; DB permission | Blocks on Application or Placement | Transactional; action `DELETE`, entity `Vacancy` | List/detail Delete actions; Step 90 tests | PASS with audit-action naming warning |
| Program | `DELETE /api/programs/[id]` — [route](../../app/api/programs/%5Bid%5D/route.ts) | `program:delete`; DB permission | Blocks on Batch, Certificate, or ProgramSubject | Transactional; action `DELETE`, entity `Program` | List/detail Delete actions; Step 90 tests | PASS with audit-action naming warning |
| Subject | `DELETE /api/subjects/[id]` — [route](../../app/api/subjects/%5Bid%5D/route.ts) | `subject:delete`; DB permission | Blocks on ProgramSubject, Schedule, or Assessment | Transactional; action `DELETE`, entity `Subject` | List/detail Delete actions; Step 90 tests | PASS with audit-action naming warning |
| Assessment | `DELETE /api/assessments/[id]` — [route](../../app/api/assessments/%5Bid%5D/route.ts) | `assessment:delete`; DB permission plus role allowlist | Only OPEN and zero AssessmentScore; otherwise 409 | Transactional `ASSESSMENT_DELETE` | List/detail actions; Step 94 tests | BLOCKED in current DB: permission row absent |
| Batch | `DELETE /api/batches/[id]` — [route](../../app/api/batches/%5Bid%5D/route.ts) | `batch:delete`; DB permission plus role allowlist | Blocks on Enrollment, Class, Schedule, or Certificate | Transactional `BATCH_DELETE` | List action; Step 95 tests | BLOCKED in current DB: permission row absent |
| Instructor | `DELETE /api/instructors/[id]` — [route](../../app/api/instructors/%5Bid%5D/route.ts) | `instructor:delete`; DB permission plus role allowlist | Blocks on Class, Schedule, or linked User | Transactional `INSTRUCTOR_DELETE` | List action; Step 96 tests | BLOCKED in current DB: permission row absent |
| Document | `DELETE /api/documents/[id]` — [route](../../app/api/documents/%5Bid%5D/route.ts) | `document:delete`; DB permission plus role allowlist | PENDING/REJECTED/EXPIRED eligible; VERIFIED returns 409 | Transactional `DOCUMENT_DELETE`; after storage cleanup | List action; Step 97 tests | BLOCKED in current DB: permission row absent |

Phase 1 UI permission gates are role-based (`SUPER_ADMIN`/`ADMIN`) and match the current database assignments for Phase 1 permissions. The Phase 2 pages use the server-side `userHasPermission` lookup. API authorization remains the security boundary in every active route.

### 2.2 Explicitly rejected HTTP DELETE methods

These handlers do not delete records and return 405:

| Module / endpoint(s) | Behavior |
|---|---|
| Application — `/api/applications`, `/api/applications/[id]` | 405; no delete |
| Assessment collection — `/api/assessments` | 405; Assessment deletion only has its guarded item endpoint |
| AssessmentScore — `/api/assessments/[id]/scores`, `/api/assessments/[id]/scores/[scoreId]` | 405; PATCH-only corrections, no score deletion |
| Attendance — `/api/attendances`, `/api/attendances/[id]` | 405 |
| Certificate — `/api/certificates`, `/api/certificates/[id]` | 405; lifecycle operation is revoke |
| Class — `/api/classes`, `/api/classes/[id]` | 405 |
| Document collection — `/api/documents` | 405; deletion only on the guarded item endpoint |
| Vacancy collection — `/api/vacancies` | 405; deletion only on the guarded item endpoint |
| Student — `/api/students`, `/api/students/[id]` | 405 |
| Schedule — `/api/schedules`, `/api/schedules/[id]` | 405 |
| Interview — `/api/interviews`, `/api/interviews/[id]` | 405 |
| Enrollment — `/api/enrollments`, `/api/enrollments/[id]` | 405 |
| Employer collection — `/api/employers` | 405; deletion only on the guarded item endpoint |
| Placement — `/api/placements`, `/api/placements/[id]` | 405 |

There is no Users DELETE endpoint. Routes without an exported DELETE handler are not additional delete endpoints.

### 2.3 Non-record deletion operations

- `app/api/documents/route.ts` calls storage `delete` only to compensate for a failed upload/database operation, using the just-uploaded server-generated path; it does not delete a Document row.
- `lib/storage.ts` deletes objects from the in-memory Mock provider or Supabase bucket.
- `lib/rate-limit.ts` calls `Map.delete` for expired in-memory rate-limit entries.
- No SQL `DELETE FROM`, `TRUNCATE`, nested Prisma delete, or application server action deleting business records was found.

## 3. Policy Compliance Matrix

| Entity | Expected policy | Observed implementation | Status |
|---|---|---|---|
| Employer | Hard delete only without Vacancy/Placement | Server count checks, Serializable transaction, FK protection | PASS |
| Vacancy | Hard delete only without Application/Placement | Server count checks, Serializable transaction, FK protection | PASS |
| Program | Hard delete only without Batch/Certificate/ProgramSubject | Server count checks, Serializable transaction; dependent junction is checked | PASS |
| Subject | Hard delete only without ProgramSubject/Schedule/Assessment | Server count checks, Serializable transaction | PASS |
| Assessment | OPEN and zero scores only | Server status/count guard, Serializable transaction; conflicts map to 409 | PASS in code; unavailable until DB permission is provisioned |
| Batch | Zero Enrollment/Class/Schedule/Certificate | All four dependencies checked server-side in Serializable transaction | PASS in code; unavailable until DB permission is provisioned |
| Instructor | Zero Class/Schedule and `userId` null | All conditions checked server-side in Serializable transaction; User is not deleted | PASS in code; unavailable until DB permission is provisioned |
| Document | PENDING/REJECTED/EXPIRED eligible; VERIFIED blocked | VERIFIED guard; DB-stored path; retryable storage-first flow; success audit only | PASS in code; unavailable until DB permission is provisioned; live storage warning remains |
| AssessmentScore | PATCH only, never delete | Item and collection DELETE return 405 | PASS |
| Application, Interview, Placement, Certificate, Enrollment, Attendance, Class, Schedule | Lifecycle/status only; no hard delete | DELETE methods return 405; PATCH/revoke/status flows remain | PASS for delete prohibition; individual business status-transition policy may still require GHS confirmation |
| User, Student | Soft delete expected; preserve history | `deletedAt` columns exist, but no application soft-delete endpoint/action was found. Student `deletedAt` is checked by enrollment/attendance/score creation and excluded from an academic report count. User authorization does not check `deletedAt`. | TBD / policy implementation gap |
| AuditLog, Role, Permission, Reports | Never delete in application | No application endpoint deletes them; RolePermission junction cascades are defined below. Tests/scripts may delete fixture audit rows or fixture access rows. | PASS for application; test cleanup risk documented |

## 4. Authorization Matrix

Authorization uses `requirePermission`, which obtains the authenticated session user ID and re-reads the user's role and permission assignments from the database. The active Phase 2 endpoints additionally enforce their intended role allowlist. No active DELETE handler trusts client role, permission, status, student ID, or a client-supplied Document storage path.

| Permission | Intended roles | Seed mapping | Current local DB mapping |
|---|---|---|---|
| `employer:delete` | SUPER_ADMIN, ADMIN | all permissions for both | Present; assigned to both |
| `vacancy:delete` | SUPER_ADMIN, ADMIN | all permissions for both | Present; assigned to both |
| `program:delete` | SUPER_ADMIN, ADMIN | all permissions for both | Present; assigned to both |
| `subject:delete` | SUPER_ADMIN, ADMIN | all permissions for both | Present; assigned to both |
| `assessment:delete` | SUPER_ADMIN, ADMIN, ACADEMIC_STAFF | Seed assigns to these roles | **Permission definition absent** |
| `batch:delete` | SUPER_ADMIN, ADMIN, ACADEMIC_STAFF | Seed assigns to these roles | **Permission definition absent** |
| `instructor:delete` | SUPER_ADMIN, ADMIN, ACADEMIC_STAFF | Seed assigns to these roles | **Permission definition absent** |
| `document:delete` | SUPER_ADMIN, ADMIN, ACADEMIC_STAFF, PLACEMENT_STAFF | Seed assigns to these roles | **Permission definition absent** |

Missing permission rows are a functional authorization blocker, not a reason to bypass the permission check. This audit did not run the seed or write permission records to the manual-data database.

## 5. HTTP Response Consistency

- Active delete handlers return 401 for an unauthenticated request and 403 for a signed-in user without the permission.
- Missing target records map to 404; dependency/status conflicts map to 409.
- Assessment, Batch, Instructor, and Document reject blank IDs with 400. Phase 1 routes query the supplied string ID directly; a blank or nonexistent value resolves to 404.
- All active mutations return success only after the transactional record delete and audit complete. Document returns non-success when storage or DB work does not complete.
- Errors do not include stack traces, SQL, filesystem paths, or storage credentials. Some conflict responses include entity names and dependency counts for user context.
- No active handler reports a success response for a known failed deletion.

## 6. Audit Log Verification

- All eight active hard-delete implementations create an audit entry in the same DB transaction as the row deletion. Document couples its DB deletion and audit in one transaction after storage cleanup.
- A rollback therefore rolls back both the record deletion and its success audit. Failed/unauthorized/conflicting operations do not create success audit entries.
- Assessment, Batch, Instructor, and Document use module-specific action names.
- Employer, Vacancy, Program, and Subject use `action: "DELETE"` with the corresponding `entity` field and dependency/record metadata. The event is identifiable by the pair, but action-name consistency is weaker than the later Phase 2 convention. No event data was rewritten.
- AuditLog's User relation uses `onDelete: SetNull`. This preserves audit rows if a User is physically deleted, but removes the direct actor FK; this is relevant to cleanup scripts that hard-delete users.

## 7. Transaction and Race-Condition Audit

- All eight active database delete handlers use Serializable Prisma transactions.
- Parent/dependency checks and parent deletes occur inside those transactions. PostgreSQL foreign keys provide a second integrity boundary; required relations have no cascade configured, so a concurrent dependent insert cannot create an orphan.
- The handlers map recognized `P2003`/`P2034` conflicts to 409 where applicable. There is no evidence that these routes delete dependent business rows to make a parent deletion succeed.
- No race-concurrency integration test is run in this audit. Existing Step 90–97 tests exercise dependency blocks but were not run because the local database has missing permissions and this is an audit-only step.
- Document holds a row lock while calling external storage. Database and storage cannot share an atomic transaction; the implementation preserves a DB row after storage failure and supports retry after storage succeeds but DB deletion fails. This is a deliberate consistency tradeoff, not production-provider verification.

## 8. Database FK / Cascade Audit

The only schema `onDelete` declarations found are:

| Relation | Behavior | Assessment |
|---|---|---|
| RolePermission → Role | Cascade | Deletes only junction/access assignments with their parent Role |
| RolePermission → Permission | Cascade | Deletes only junction/access assignments with their parent Permission |
| ProgramSubject → Program | Cascade | Deletes only junction rows; Program API checks this relation and does not intentionally cascade it |
| ProgramSubject → Subject | Cascade | Deletes only junction rows; Subject API checks this relation and does not intentionally cascade it |
| AuditLog → User | SetNull | Preserves audit events but clears actor relation on User deletion |

No academic/career record relation has `onDelete: Cascade`. Other required foreign keys use Prisma/PostgreSQL's non-cascading default behavior. No schema edits or migration were made.

## 9. UI Delete Audit

- Active Delete actions exist for the eight approved hard-delete candidates only. The candidate UIs use confirmation dialogs, pending/error handling, and refresh or remove a row only after server success.
- Phase 2 page capabilities are server-resolved from DB permissions. Phase 1 UI currently gates by `SUPER_ADMIN`/`ADMIN`, matching the live Phase 1 permission assignments; the backend independently enforces DB permissions.
- Document UI disables Delete for VERIFIED rows and reports a server-side conflict/failure without removing the row.
- No Delete action was found for AssessmentScore, Application, Interview, Placement, Certificate, Attendance, Enrollment, Class, or Schedule. The Certificate lifecycle action is revoke, not delete.
- UI access does not replace backend enforcement.

## 10. User / Student Safety

- No application User or Student DELETE endpoint or soft-delete action was found. Both models have a nullable `deletedAt` field.
- Student references to Enrollment, Attendance, AssessmentScore, Document, Application, Placement, and Certificate are not cascaded. The Student `user` relation has no cascade either.
- User has no cascade to Student or Instructor. AuditLog actor references are nulled as described above.
- Student soft-deletion is partially honored by enrollment, attendance, and score-creation flows, but no application path sets the field. User `deletedAt` is not checked by `requirePermission` or an observed auth path.
- `cleanup-demo-users.mjs` and `cleanup-test-fixtures.mjs` physically delete two fixed demo User accounts by exact email after unlinking the Student or nulling AuditLog actor references. They do not delete Student history, but they are not soft delete and have no local-database safety guard. They were not run.
- User/Student archival, account deactivation, and any eventual purge criteria remain TBD; this report does not define them.

## 11. Test and Cleanup Safety Audit

No test or cleanup script was executed. All 42 `scripts/*.mjs` files containing `.delete()`/`.deleteMany()` were syntax-checked only with `node --check`.

### Unsafe: do not run against any shared/manual database

| Script | Destructive operation / target | Risk | Safe to run? |
|---|---|---|---|
| `scripts/clean-db.mjs` | Nine unfiltered `deleteMany()` calls across assessment scores, assessments, attendance, certificates, placements, interviews, applications, vacancies, employers, and documents; additional name/email substring deletes | Can erase nearly all data in those tables. Despite its name/output, this is not a read-only baseline check. | **NO** |
| `scripts/test-step82-realistic-e2e.mjs` | Cleanup deletes records matching class/certificate/document names containing `"82"`, employer `"Grand Hyatt"` substring and all related career rows, and email containing `.test82@ghs.local`; cleanup catches and ignores errors | Substring matches can include manual records; cleanup applies independently of the test's tracked ID arrays. | **NO** |
| `scripts/test-step67c-documents-hardening.mjs` | Startup `user.deleteMany` where email contains `"67c"` | Deletes matching users before fixture tracking; partial email match is not unique. | **NO** |
| `scripts/test-step69b-applications.mjs` | Startup user email contains `"69b"` and Employer name contains `"69B"` | Deletes matching records without exact fixture IDs. | **NO** |
| `scripts/test-step70b-interviews.mjs` | Startup user email contains `"70b"`; deletes Role and RolePermission rows by fixed test role name | Can delete a pre-existing account/access role sharing these identifiers. | **NO** |
| `scripts/test-step71b-placements.mjs` | Startup user email contains `"71b"` and Employer contact email contains `"grandsukabumi.test"` | Broad substring cleanup can match non-fixture records. | **NO** |
| `scripts/cleanup-demo-users.mjs` | Hard-deletes Users identified by fixed demo emails | Exact identities, but no local database guard; on a database where these accounts are real, deletes them. | **NO** against shared/manual DB |
| `scripts/cleanup-test-fixtures.mjs` | Hard-deletes Users identified by fixed demo emails; updates linked Student/AuditLog relations first | Exact identities, but no local database guard; not a general-purpose safe cleanup against manual data. | **NO** against shared/manual DB |

### Exact-ID or test-scoped cleanup patterns found

The remaining test scripts generally track created row IDs/arrays and delete by those exact IDs. This is narrower than substring cleanup, but does not establish they are safe against a production database: not all have a common target guard, some delete test AuditLog rows, and individual setup/cleanup paths still require review before execution. The complete list below includes scripts already flagged unsafe above; those entries are not reclassified as safe.

Files with cleanup statements found by the repository search:

`test-academic-read.mjs`, `test-audit-pilot.mjs`, `test-batch-create.mjs`, `test-class-create.mjs`, `test-class-read.mjs`, `test-enrollments.mjs`, `test-program-create.mjs`, `test-schedule-create.mjs`, `test-schedule-read.mjs`, `test-step65b-attendance.mjs`, `test-step66b-assessment.mjs`, `test-step66c-assessment-hardening.mjs`, `test-step67b-documents.mjs`, `test-step68b-employers-vacancies.mjs`, `test-step68c-employers-vacancies-frontend.mjs`, `test-step69b-applications.mjs`, `test-step69c-applications-frontend.mjs`, `test-step70b-interviews.mjs`, `test-step70c-interviews-frontend.mjs`, `test-step71b-placements.mjs`, `test-step71c-placements-frontend.mjs`, `test-step73b-academic-core.mjs`, `test-step73c-academic-core-frontend.mjs`, `test-step73d-academic-core-e2e.mjs`, `test-step74b-certificates-reports.mjs`, `test-step74c-certificates-reports-frontend.mjs`, `test-step74d-certificates-reports-e2e.mjs`, `test-step76-user-profile-ui.mjs`, `test-step77-final-hardening.mjs`, `test-step80-academic-integrity.mjs`, `test-step81-workflow-lifecycle.mjs`, `test-step82-realistic-e2e.mjs`, `test-step90-delete-phase1.mjs`, `test-step94-assessment-delete.mjs`, `test-step95-batch-delete.mjs`, `test-step96-instructor-delete.mjs`, `test-step97-document-delete.mjs`, and `test-subject-create.mjs`.

The Step 90 and Step 94–97 delete-specific harnesses use unique suffixes, exact tracked IDs, explicit mutation opt-in, and local `ghs_integrated` target checks. They were syntax-checked but not run. The Step 97 provider tests use mocks; no live Supabase storage mutation is permitted. The non-production `GET /api/documents?testStorageStatus=true&clear=true` hook globally clears the in-memory Mock storage; it does not delete database records or call Supabase, but should not be used as fixture-specific cleanup.

## 12. Manual Data Integrity

The application database was queried read-only. No tests, seeds, cleanup scripts, endpoint mutations, INSERT, UPDATE, or DELETE statements were run as part of this audit. The post-Step-97 snapshot (AuditLogs 927) and the read-only post-audit snapshot show the same required manual record identities/details; no audit-induced database change occurred. Required manual records were present:

- Batch `GHI-09` — `cmukmu1f9002bkdmm928uf9r6`.
- Student NIM `269067460` — `MUHAMAD RIVQI`, `cmukmxyiw002fkdmmsxmph01v`.
- Employer `bounty` — `cmukmgv1e000ikdmm3wab04eg`.
- Vacancy `KITCHEN` — `cmuknh1cr0035kdmm9o2paobc`.
- Related Placement — `cmuknm8ns003dkdmmbx0zixoc`, linked to that Vacancy.
- KTP Document — `doc_4aefd49e8447405c9984192c6155f63e`, status PENDING.

Read-only model counts at the end of the audit:

| Model | Count |
|---|---:|
| Users | 1 |
| Instructors | 6 |
| Programs | 1 |
| Batches | 3 |
| Students | 22 |
| Enrollments | 22 |
| Subjects | 6 |
| Classes | 12 |
| Schedules | 10 |
| Employers | 1 |
| Vacancies | 1 |
| Applications | 0 |
| Interviews | 0 |
| Placements | 1 |
| Documents | 1 |
| Certificates | 0 |
| AuditLogs | 927 |

Because this audit executed no database mutation, these checks do not indicate any audit-induced data change. No historical before-Step-89 comparison was attempted.

## 13. Step 97 Storage Warning

The Step 97 implementation and local provider contract harness cover Mock storage and mocked Supabase HTTP response shapes. Real Supabase Storage integration was not validated; no production credentials or production storage mutation was used. Mock results must not be interpreted as production-provider verification.

## 14. Issues Found

1. **BLOCKER — Four Phase 2 permission records are absent from the current database.** Assessment, Batch, Instructor, and Document DELETE endpoints all require those permissions via live DB lookup. Thus intended roles currently receive 403, and server-rendered UI capabilities are false. Fixing this requires a separately approved permission synchronization/seed against the target database; it was deliberately not run here.
2. **HIGH — `scripts/clean-db.mjs` performs broad unfiltered deletion.** Do not execute it against any database containing useful data.
3. **HIGH — `scripts/test-step82-realistic-e2e.mjs` includes broad substring cleanup for academic and career data.** Do not run it against shared/manual data.
4. **WARNING — Four older regression scripts perform startup cleanup by substring** (`test-step67c-documents-hardening.mjs`, `test-step69b-applications.mjs`, `test-step70b-interviews.mjs`, `test-step71b-placements.mjs`). Do not run them against shared/manual data.
5. **WARNING — User/Student soft-delete is not an implemented lifecycle.** Fields exist, but no application soft-delete action exists; User authorization ignores `deletedAt`. Purge/deactivation rules remain TBD.
6. **WARNING — Phase 1 audit action names are generic.** Entity identifies the target, but the action name is `DELETE` instead of module-specific action values.
7. **WARNING — Real Supabase Storage behavior remains unverified.**

## 15. Fixes Applied

No application, script, schema, migration, or database changes were applied. This was a read-only audit; unsafe cleanup scripts were not run, modified, or silently assumed safe.

## 16. Remaining TBD

- How/when to synchronize the four missing Phase 2 permission records in the manual database, without running a broad seed that may alter unrelated data.
- Official GHS decision for User/Student disablement, soft deletion, account ownership unlinking, and any eventual purge.
- Whether Phase 1 audit consumers require module-specific action names rather than the existing `DELETE` + entity pairing.
- Real Supabase integration verification in a separately approved non-production environment.
- Race behavior is supported by Serializable transactions/FKs, but no dedicated concurrent delete-vs-insert integration test was run in this audit.

## 17. Quality Gates

| Command | Result |
|---|---|
| `node --check` for all `scripts/*.mjs` | PASS — syntax only; scripts were not executed |
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS — database schema up-to-date; 4 migrations found |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS — existing line-ending warnings only |
| Schema/migration changes | None |
| Test/regression suite execution | None |
| Database mutation | None |

## 18. Final Verdict

**BLOCKED**

The repository's guarded delete implementations and quality gates pass static review, and required manual data is present. However, the current database cannot authorize any Phase 2 delete endpoint because its permission definitions are absent. Broad cleanup scripts also make the legacy suite unsafe to execute against manual data. No seed, data repair, schema change, migration, commit, push, or deployment was performed.
