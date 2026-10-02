# Global Soft Delete — Phase 2

**Canonical project:** `C:\ghs-integrated-system`  
**Branch:** `main`  
**Phase 2 status:** **PASS_WITH_WARNING** — implementation, migration, build, and static checks completed; delete-flow functional tests were not run against an isolated disposable database.  
**Overall global soft-delete status:** **BLOCKED** — global verification is incomplete, Phase 1 remains BLOCKED, and Certificate lifecycle remains outside this phase.

## Scope and implementation

Phase 2 covers Student, Enrollment, Class, Schedule, Attendance, AssessmentScore, Application, Interview, and Placement. It preserves linked rows: each DELETE handler updates only the target row's `deletedAt`, records an `AuditLog` entry in the same transaction, and does not cascade soft deletes or physically delete related records.

An additive migration, `20260930125300_global_soft_delete_phase2`, added nullable `deletedAt` fields to Enrollment, Class, Schedule, Attendance, AssessmentScore, Application, Interview, and Placement. Student already had the field. The migration was applied with `prisma migrate deploy`; it adds the eight fields and the Phase 2 permissions/grants, without resetting or seeding the database.

The routes use individual-record DELETE operations. Collection DELETE handlers continue to return 405 where appropriate. Active GET/list/detail queries and the reviewed dashboard/report aggregates filter deleted records. Student-profile deletion also blocks the corresponding Student account's authentication/authorization; it does not delete the linked User.

## Entity verification matrix

“Implemented” below describes code/schema review; it does not mean that the corresponding live DELETE scenario was exercised.

| Entity | Schema `deletedAt` | Active GET/list/detail filters | DELETE API | UI and two-stage confirmation | RBAC and AuditLog | Functional test/status |
|---|---|---|---|---|---|---|
| Student | Existing field | Implemented | Updates only Student; preserves User and history | Student list desktop/mobile; shared two-stage action, toast, refresh | `student:delete`, Admin/Super Admin only; transactional `Student` DELETE log | Not run; implementation reviewed |
| Enrollment | Added | Implemented | Updates only Enrollment | Enrollment list; shared two-stage action, toast, refresh | `enrollment:delete`, Admin/Super Admin only; transactional `Enrollment` DELETE log | Not run; implementation reviewed |
| Class | Added | Implemented | Updates only Class | Class list; shared two-stage action, toast, refresh | `class:delete`, Admin/Super Admin only; transactional `Class` DELETE log | Not run; implementation reviewed |
| Schedule | Added | Implemented | Updates only Schedule | Schedule list; shared two-stage action, toast, refresh | `schedule:delete`, Admin/Super Admin only; transactional `Schedule` DELETE log | Not run; implementation reviewed |
| Attendance | Added | Implemented | Updates only Attendance | Attendance session participant list; shared two-stage action, toast, removes active row | `attendance:delete`, Admin/Super Admin only; transactional `Attendance` DELETE log; user-authorized override documented | Not run; implementation reviewed |
| AssessmentScore | Added | Implemented for score reads and aggregates | Updates only score | Assessment detail score list; shared two-stage action, toast, reload | `assessment-score:delete`, Admin/Super Admin only; transactional `AssessmentScore` DELETE log | Not run; implementation reviewed |
| Application | Added | Implemented | Updates only Application | Application list; shared two-stage action, toast, refresh | `application:delete`, Admin/Super Admin only; transactional `Application` DELETE log | Not run; implementation reviewed |
| Interview | Added | Implemented | Updates only Interview | Interview list; shared two-stage action, toast, refresh | `interview:delete`, Admin/Super Admin only; transactional `Interview` DELETE log | Not run; implementation reviewed |
| Placement | Added | Implemented | Updates only Placement | Placement list desktop/mobile; shared two-stage action, toast, refresh | `placement:delete`, Admin/Super Admin only; transactional `Placement` DELETE log | Not run; implementation reviewed |

All delete actions use the shared confirmation dialog. Stage one says “Apakah yakin kamu ingin menghapus data ini?” and offers “Batal” / “Lanjutkan”. Stage two identifies the record, explains that it remains stored but is hidden from active data, and offers “Batal” / “Ya, Hapus”. The request is sent only from stage two. Pending state disables dialog buttons, guards repeated submissions, displays API errors, and shows a transient success toast before refreshing/removing the active list row.

Authorization is enforced in the API, not trusted to the client visibility gate. The Phase 2 permissions were assigned only to the existing `ADMIN` and `SUPER_ADMIN` roles; no role was created and no delete permission was granted to Student. Attendance's former Step 61 no-delete baseline was updated in its business-rule documents to record the explicit user authorization for Admin/Super Admin soft delete only.

## API and history safety

- Reviewed scoped DELETE handlers authenticate, check the entity permission and Admin/Super Admin role, locate an active record, then update only `deletedAt` and write an audit event transactionally.
- Missing/inactive IDs return 404. Sequential repeat deletion cannot find an active record and returns 404.
- Audit entries use `action = DELETE`, the model entity name, record ID, and `deletedAt` before/after values. They do not include sensitive record contents.
- The scoped application API scan found no Prisma hard-delete call or raw SQL `DELETE FROM` in runtime API routes for these entities. Collection DELETE endpoints are deliberate 405 responses.
- Related history remains in place. Soft deletion can make records unavailable through active views without removing their database relations.
- Dashboard and report query filters were updated for the scoped deleted entities. These surfaces are read-only aggregations and do not expose a synthetic DELETE operation.

## UI and notification work

The reusable `SoftDeleteAction` is connected to the scoped Student, Enrollment, Class, Schedule, Attendance, AssessmentScore, Application, Interview, and Placement views. A shared `ToastProvider` is mounted in the app layout. UI behavior was verified by code inspection and production build, not by browser interaction testing.

## Database integrity

Counts were read before and after migration. No entity or AuditLog row count decreased; no fixture or existing business record was created, updated, or deleted during this phase. The only database writes were the additive migration's schema and RBAC rows.

| Model | Before | After |
|---|---:|---:|
| User | 3 | 3 |
| Student | 21 | 21 |
| Program | 1 | 1 |
| Subject | 6 | 6 |
| Batch | 2 | 2 |
| Enrollment | 21 | 21 |
| Class | 10 | 10 |
| Schedule | 10 | 10 |
| Attendance | 9 | 9 |
| Assessment | 0 | 0 |
| AssessmentScore | 0 | 0 |
| Instructor | 6 | 6 |
| Document | 0 | 0 |
| Certificate | 0 | 0 |
| Employer | 0 | 0 |
| Vacancy | 0 | 0 |
| Application | 0 | 0 |
| Interview | 0 | 0 |
| Placement | 0 | 0 |
| AuditLog | 20 | 20 |

There were 2 active Super Admin accounts both before and after. All 9 Phase 2 delete permission rows exist after migration and are assigned only to Admin/Super Admin (18 role-permission grants total). A read-only check of all 35 declared foreign-key relationships found zero orphan references.

These checks establish that the migration itself preserved current row counts and referential integrity. They do **not** prove the DELETE handlers preserve relations under a live request or that the deleted-state filters behave correctly at runtime.

## Tests and quality gates

| Check | Result | Notes |
|---|---|---|
| Exact-fixture authorized/unauthorized/anonymous/nonexistent/double-delete API tests | **NOT RUN** | No isolated disposable database was available. The configured local `ghs_integrated` database contains existing records; no mutation tests were run against it. |
| `npm run lint` | **PASS** | Completed with exit code 0. |
| `npx tsc --noEmit` | **PASS** | Completed with exit code 0. |
| `npx prisma validate` | **PASS** | Schema valid. |
| `npx prisma migrate status` | **PASS** | Database reports schema up to date after applying Phase 2 migration. |
| `npm run build` | **PASS** | Production build and its TypeScript phase completed. |
| `git diff --check` | **PASS** | No whitespace errors. Git emitted line-ending normalization notices. |
| `node --check` on the two edited fixture scripts | **PASS** | Syntax only; scripts were not executed. |

The shared database was not used for fixture deletion tests. Existing Super Admin, Student, academic, and AuditLog data were not removed. No reset, seed, commit, push, deployment, or worktree removal occurred.

## Hard-delete and test-cleanup scan

The scoped runtime API scan found no physical database DELETE for the nine Phase 2 entities. A repository scan also found legacy `scripts/test-*` cleanup routines that physically remove exact test-fixture rows; those scripts were not run. Several legacy test scripts still call `auditLog.deleteMany` for their own fixtures (including `scripts/test-step80-academic-integrity.mjs`, `scripts/test-step81-workflow-lifecycle.mjs`, and older Phase 1 scripts). Those cleanup calls violate the no-AuditLog-deletion rule and must not be run until corrected. The two basic scripts `scripts/test-enrollments.mjs` and `scripts/test-audit-pilot.mjs` were adjusted in this phase to retain AuditLog rows. Destructive maintenance utilities were not run.

## Remaining blockers and scope boundaries

1. The nine delete workflows still need functional verification against an isolated disposable database, including 401/403/404/200 responses, audit row creation, row retention, active GET omission, history preservation, and repeat deletion.
2. Browser-level confirmation, loading/disabled behavior, toast display, and refresh behavior have not been exercised.
3. Legacy test cleanup scripts still delete AuditLog fixtures; do not run them before that cleanup behavior is made compliant.
4. Certificate remains out of Phase 2. Its `ACTIVE` / `REVOKED` business lifecycle requires a separate policy decision; this phase did not map revocation to `deletedAt`.
5. Phase 1 work and its report remain unchanged. Phase 1's existing BLOCKED status and any other global entity gaps prevent an overall global PASS.
6. Dashboards and generated reports are read-only aggregates, not deletable entities. No DELETE endpoint was added for them.

**Final:** Phase 2 is **PASS_WITH_WARNING** for implementation and static/quality verification only. Functional DELETE behavior remains **NOT VERIFIED**; overall Global Soft Delete remains **BLOCKED**.
